import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Incident, Policy
from app.reports_pdf import build_incident_report_pdf

router = APIRouter(prefix="/api/reports", tags=["reports"], dependencies=[Depends(get_current_user)])


def _filtered_incidents(
    db: Session, channel: str | None, status_filter: str | None
) -> tuple[list[Incident], dict[str, str]]:
    q = db.query(Incident)
    if channel:
        q = q.filter(Incident.channel == channel)
    if status_filter:
        q = q.filter(Incident.status == status_filter)
    incidents = q.order_by(Incident.timestamp.desc()).all()

    # A plain dict lookup rather than a join - the incident count on a personal install is small
    # enough that this is simpler and just as fast as teaching the query about the relationship.
    policy_names = {p.id: p.name for p in db.query(Policy).all()}
    return incidents, policy_names


_STATUS_LABELS = {"open": "Open", "false_positive": "False positive", "resolved": "Resolved"}


@router.get("/incidents.csv")
def export_incidents_csv(
    db: Session = Depends(get_db),
    channel: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
):
    incidents, policy_names = _filtered_incidents(db, channel, status_filter)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["Date", "Time", "Policy", "Channel", "Action", "Rule ID", "Details", "Source", "Domain", "Risk Level", "Status"]
    )
    for incident in incidents:
        ts = incident.timestamp
        writer.writerow(
            [
                ts.strftime("%Y-%m-%d"),
                ts.strftime("%H:%M:%S"),
                policy_names.get(incident.policy_id, "Unknown policy"),
                incident.channel.value.title(),
                "Blocked" if incident.blocked else "Logged",
                incident.rule_id,
                incident.redacted_snippet,
                incident.source_identifier,
                incident.extra.get("domain", ""),
                str(incident.extra.get("risk_level", "")).title(),
                _STATUS_LABELS.get(incident.status.value, incident.status.value),
            ]
        )

    filename = f"cloakdlp-incidents-{datetime.now(timezone.utc):%Y-%m-%d}.csv"
    return Response(
        # utf-8-sig prepends a BOM so Excel (which otherwise guesses ANSI) renders this as UTF-8
        # instead of mangling anything outside plain ASCII.
        content=buffer.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/incidents.pdf")
def export_incidents_pdf(
    db: Session = Depends(get_db),
    channel: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
):
    incidents, policy_names = _filtered_incidents(db, channel, status_filter)
    pdf_bytes = build_incident_report_pdf(incidents, policy_names)

    filename = f"cloakdlp-incidents-{datetime.now(timezone.utc):%Y-%m-%d}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
