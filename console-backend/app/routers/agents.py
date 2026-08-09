from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_agent, get_current_user
from app.models import Agent, AgentStatus
from app.schemas import AgentHeartbeat, AgentOut, AgentRegister, AgentRegisterOut
from app.security import generate_agent_api_key, hash_api_key

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=list[AgentOut], dependencies=[Depends(get_current_user)])
def list_agents(db: Session = Depends(get_db)):
    return db.query(Agent).order_by(Agent.hostname).all()


@router.post("/register", response_model=AgentRegisterOut, dependencies=[Depends(get_current_user)])
def register_agent(payload: AgentRegister, db: Session = Depends(get_db)):
    existing = db.query(Agent).filter(Agent.hostname == payload.hostname).first()
    if existing:
        raise HTTPException(status_code=400, detail="Agent with this hostname already registered")
    api_key = generate_agent_api_key()
    agent = Agent(hostname=payload.hostname, api_key_hash=hash_api_key(api_key), status=AgentStatus.offline)
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return AgentRegisterOut(id=agent.id, hostname=agent.hostname, api_key=api_key)


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
