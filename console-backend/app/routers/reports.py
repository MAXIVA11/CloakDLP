import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Incident, Policy

router = APIRouter(prefix="/api/reports", tags=["reports"], dependencies=[Depends(get_current_user)])


@router.get("/incidents.csv")
def export_incidents_csv(
    db: Session = Depends(get_db),
    channel: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
):
    q = db.query(Incident)
    if channel:
        q = q.filter(Incident.channel == channel)
    if status_filter:
        q = q.filter(Incident.status == status_filter)
    incidents = q.order_by(Incident.timestamp.desc()).all()

    # A plain dict lookup rather than a join - the incident count on a personal install is small
    # enough that this is simpler and just as fast as teaching the query about the relationship.
    policy_names = {p.id: p.name for p in db.query(Policy).all()}

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "timestamp",
            "policy",
            "channel",
            "action_taken",
            "blocked",
            "rule_id",
            "redacted_snippet",
            "source",
            "domain",
            "risk_level",
            "status",
        ]
    )
    for incident in incidents:
        writer.writerow(
            [
                incident.timestamp.isoformat(),
                policy_names.get(incident.policy_id, "Unknown policy"),
                incident.channel.value,
                incident.action_taken.value,
                incident.blocked,
                incident.rule_id,
                incident.redacted_snippet,
                incident.source_identifier,
                incident.extra.get("domain", ""),
                incident.extra.get("risk_level", ""),
                incident.status.value,
            ]
        )

    filename = f"cloakdlp-incidents-{datetime.now(timezone.utc):%Y-%m-%d}.csv"
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
