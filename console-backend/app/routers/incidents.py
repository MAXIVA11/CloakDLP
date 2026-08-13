import asyncio
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.deps import get_current_agent, get_current_user
from app.models import Action, Agent, Incident, Policy
from app.risk_scoring import score_domain
from app.schemas import IncidentCreate, IncidentOut, IncidentStatusUpdate
from app.websocket_manager import incident_manager

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("", response_model=list[IncidentOut], dependencies=[Depends(get_current_user)])
def list_incidents(
    db: Session = Depends(get_db),
    channel: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, le=500),
):
    q = db.query(Incident)
    if channel:
        q = q.filter(Incident.channel == channel)
    if status_filter:
        q = q.filter(Incident.status == status_filter)
    return q.order_by(Incident.timestamp.desc()).limit(limit).all()


def _extract_domain(source_identifier: str) -> str | None:
    parsed = urlparse(source_identifier)
    return parsed.hostname


async def _score_domain_and_update(incident_id: str, domain: str) -> None:
    # Runs after the response is already sent; a WHOIS lookup can take a few seconds, and the
    # agent reporting this incident is often mid-request itself (the network proxy forwards the
    # user's actual checkout request right after reporting), so incident creation must never
    # block on this. score_domain does blocking socket I/O, so it's offloaded to a thread rather
    # than awaited directly; otherwise it would stall the whole event loop, not just this task.
    result = await asyncio.to_thread(score_domain, domain)

    db = SessionLocal()
    try:
        incident = db.get(Incident, incident_id)
        if incident is None:
            return
        incident.extra = {
            **incident.extra,
            "domain": domain,
            "risk_score": result.score,
            "risk_level": result.level,
            "risk_reason": result.reason,
        }
        db.commit()
        db.refresh(incident)
        out = IncidentOut.model_validate(incident)
    finally:
        db.close()

    await incident_manager.broadcast_json({"type": "incident.updated", "incident": out.model_dump()})


_RISK_RANK = {"low": 1, "medium": 2, "high": 3}  # "unknown" is deliberately absent - see below


async def _effective_action(policy: Policy | None, source_identifier: str) -> tuple[Action, dict]:
    """The channels (browser extension, desktop agent) don't know a policy's configured action or
    risk_threshold - they only carry a policy_id, matching how EDM/fingerprint bindings work.
    Trusting a client-supplied action_taken would mean the client itself decides what happened,
    which is both meaningless (every channel just hardcodes "log") and the wrong place to decide
    it: policy config can change without every client's cached copy noticing. This is the single
    source of truth, computed fresh on every incident.

    Returns (action_taken, extra) - extra carries the risk score/level/reason when a risk lookup
    happened here, so the caller can store it immediately instead of waiting on the background
    task in _score_domain_and_update to fill it in later (and so that task can be skipped - no
    point re-running the same WHOIS lookup a second time).
    """
    if policy is None:
        return Action.log, {}
    if policy.action != Action.block:
        return policy.action, {}
    if policy.risk_threshold is None:
        return Action.block, {}  # unconditional block, the original meaning of this action

    domain = _extract_domain(source_identifier)
    if domain is None:
        # A risk_threshold can only ever be evaluated against a domain (network-channel traffic,
        # including the browser extension, which also reports channel="network"); a match with
        # no domain to score - clipboard, print, a plain file path - can't satisfy the condition,
        # so this fails open to a log rather than blocking blind.
        return Action.log, {}

    # Deliberately awaited here, not backgrounded: a block decision has to be known before this
    # request returns, so the channel can act on it in the same round trip. This does add real
    # latency (a WHOIS lookup can take a couple of seconds) to any incident a risk-based block
    # policy applies to - but score_domain() caches per-domain for 24h, so that cost is paid once
    # per domain, not on every repeat visit to the same checkout page.
    result = await asyncio.to_thread(score_domain, domain)
    extra = {"domain": domain, "risk_score": result.score, "risk_level": result.level, "risk_reason": result.reason}

    # result.level can be "unknown" (WHOIS failed/unsupported) - absent from _RISK_RANK, so
    # .get(..., 0) always ranks below every real threshold and this never blocks on an uncertain
    # score, matching the fail-open posture used everywhere else a lookup might not have an
    # answer.
    if _RISK_RANK.get(result.level, 0) >= _RISK_RANK[policy.risk_threshold.value]:
        return Action.block, extra
    return Action.log, extra


@router.post("", response_model=IncidentOut, status_code=201)
async def create_incident(
    payload: IncidentCreate,
    background_tasks: BackgroundTasks,
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    policy = db.get(Policy, payload.policy_id)
    action_taken, risk_extra = await _effective_action(policy, payload.source_identifier)

    data = payload.model_dump()
    data["action_taken"] = action_taken
    if risk_extra:
        data["extra"] = {**data.get("extra", {}), **risk_extra}
    incident = Incident(agent_id=agent.id, **data)
    db.add(incident)
    db.commit()
    db.refresh(incident)

    # Only when a risk-based block policy didn't already score this domain above - that already
    # covers the same job (the risk badge shown in the UI), so this would just be a second,
    # redundant WHOIS lookup for the same domain.
    if incident.channel.value == "network" and not risk_extra:
        domain = _extract_domain(incident.source_identifier)
        if domain:
            background_tasks.add_task(_score_domain_and_update, incident.id, domain)

    out = IncidentOut.model_validate(incident)
    await incident_manager.broadcast_json({"type": "incident.created", "incident": out.model_dump()})
    return incident


@router.patch("/{incident_id}/status", response_model=IncidentOut, dependencies=[Depends(get_current_user)])
async def update_incident_status(incident_id: str, payload: IncidentStatusUpdate, db: Session = Depends(get_db)):
    incident = db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident.status = payload.status
    db.commit()
    db.refresh(incident)

    out = IncidentOut.model_validate(incident)
    await incident_manager.broadcast_json({"type": "incident.updated", "incident": out.model_dump()})
    return incident
