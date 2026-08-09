from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_agent, get_current_user
from app.models import Agent, Incident
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


@router.post("", response_model=IncidentOut, status_code=201)
async def create_incident(
    payload: IncidentCreate,
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    incident = Incident(agent_id=agent.id, **payload.model_dump())
    db.add(incident)
    db.commit()
    db.refresh(incident)

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
