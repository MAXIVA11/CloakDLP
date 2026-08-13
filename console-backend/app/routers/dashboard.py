from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Action, Agent, Channel, Incident, IncidentStatus, Policy
from app.routers.agents import ONLINE_THRESHOLD
from app.schemas import ChannelBreakdown, DashboardStats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(get_current_user)])


@router.get("/stats", response_model=DashboardStats)
def stats(db: Session = Depends(get_db)):
    today_start = datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)

    def count_today(action: Action) -> int:
        return (
            db.query(func.count(Incident.id))
            .filter(Incident.action_taken == action, Incident.timestamp >= today_start)
            .scalar()
            or 0
        )

    active_policies = db.query(func.count(Policy.id)).filter(Policy.enabled.is_(True)).scalar() or 0
    online_cutoff = datetime.now(timezone.utc) - ONLINE_THRESHOLD
    agents_online = (
        db.query(func.count(Agent.id)).filter(Agent.last_heartbeat.isnot(None), Agent.last_heartbeat >= online_cutoff).scalar()
        or 0
    )
    agents_total = db.query(func.count(Agent.id)).scalar() or 0

    total_incidents = db.query(func.count(Incident.id)).scalar() or 0
    false_positives = (
        db.query(func.count(Incident.id)).filter(Incident.status == IncidentStatus.false_positive).scalar() or 0
    )
    fp_rate = (false_positives / total_incidents) if total_incidents else 0.0

    breakdown_rows = (
        db.query(Incident.channel, func.count(Incident.id)).group_by(Incident.channel).all()
    )
    breakdown_map = {channel: count for channel, count in breakdown_rows}
    channel_breakdown = [
        ChannelBreakdown(channel=channel, count=breakdown_map.get(channel, 0)) for channel in Channel
    ]

    return DashboardStats(
        blocked_today=count_today(Action.block),
        logged_today=count_today(Action.log),
        active_policies=active_policies,
        agents_online=agents_online,
        agents_total=agents_total,
        false_positive_rate=round(fp_rate, 4),
        channel_breakdown=channel_breakdown,
    )
