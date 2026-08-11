import asyncio
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.deps import get_current_agent, get_current_user
from app.models import Agent, Incident
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


@router.post("", response_model=IncidentOut, status_code=201)
async def create_incident(
    payload: IncidentCreate,
    background_tasks: BackgroundTasks,
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    incident = Incident(agent_id=agent.id, **payload.model_dump())
    db.add(incident)
    db.commit()
    db.refresh(incident)

    if incident.channel.value == "network":
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
