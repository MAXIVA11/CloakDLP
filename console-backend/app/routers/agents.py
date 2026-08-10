from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.bootstrap import DEFAULT_POLICY_NAME
from app.config import settings
from app.database import get_db
from app.deps import get_current_agent, get_current_user, require_loopback
from app.models import Agent, AgentKind, AgentStatus, DataType, Policy
from app.schemas import AgentHeartbeat, AgentOut, AgentRegister, AgentRegisterOut, ExtensionStatus
from app.security import generate_agent_api_key, hash_api_key

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _default_credit_card_policy_id(db: Session) -> str | None:
    policy = (
        db.query(Policy)
        .filter(Policy.data_type == DataType.credit_card, Policy.enabled.is_(True))
        .order_by((Policy.name != DEFAULT_POLICY_NAME).asc(), Policy.created_at.asc())
        .first()
    )
    return policy.id if policy else None


@router.get("", response_model=list[AgentOut], dependencies=[Depends(get_current_user)])
def list_agents(db: Session = Depends(get_db)):
    return db.query(Agent).order_by(Agent.hostname).all()


@router.post("/register", response_model=AgentRegisterOut, dependencies=[Depends(get_current_user)])
def register_agent(payload: AgentRegister, db: Session = Depends(get_db)):
    existing = db.query(Agent).filter(Agent.hostname == payload.hostname).first()
    if existing:
        raise HTTPException(status_code=400, detail="Agent with this hostname already registered")
    api_key = generate_agent_api_key()
    agent = Agent(hostname=payload.hostname, api_key_hash=hash_api_key(api_key), status=AgentStatus.offline, kind=payload.kind)
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return AgentRegisterOut(
        id=agent.id,
        hostname=agent.hostname,
        api_key=api_key,
        default_credit_card_policy_id=_default_credit_card_policy_id(db),
    )


@router.get("/extension-status", response_model=ExtensionStatus, dependencies=[Depends(get_current_user)])
def extension_status(db: Session = Depends(get_db)):
    installed = db.query(Agent).filter(Agent.kind == AgentKind.browser_extension).first() is not None
    return ExtensionStatus(installed=installed, store_url=settings.extension_store_url)


@router.post("/self-register", response_model=AgentRegisterOut, dependencies=[Depends(require_loopback)])
def self_register_agent(payload: AgentRegister, db: Session = Depends(get_db)):
    """Zero-config pairing: the agent calls this on first startup instead of requiring an
    operator to register it from the console and paste an API key into a config file. Loopback
    only — only the agent running on this same machine can reach it. Idempotent by hostname:
    if this host already has an agent record (e.g. credentials were lost after a reinstall),
    issues a fresh API key for it rather than erroring, since we can't recover the old one from
    its stored hash anyway."""
    agent = db.query(Agent).filter(Agent.hostname == payload.hostname).first()
    api_key = generate_agent_api_key()
    if agent is None:
        agent = Agent(hostname=payload.hostname, api_key_hash=hash_api_key(api_key), status=AgentStatus.offline, kind=payload.kind)
        db.add(agent)
    else:
        agent.api_key_hash = hash_api_key(api_key)
        agent.kind = payload.kind
    db.commit()
    db.refresh(agent)
    return AgentRegisterOut(
        id=agent.id,
        hostname=agent.hostname,
        api_key=api_key,
        default_credit_card_policy_id=_default_credit_card_policy_id(db),
    )


@router.post("/heartbeat", response_model=AgentOut)
def heartbeat(
    payload: AgentHeartbeat,
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    agent.status = AgentStatus.online
    agent.last_heartbeat = datetime.now(timezone.utc)
    if payload.policy_version:
        agent.policy_version = payload.policy_version
    db.commit()
    db.refresh(agent)
    return agent
