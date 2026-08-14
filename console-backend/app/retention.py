"""Incident retention: an optional per-install setting (see AppSettings) that purges incidents
older than N days, so a personal install that's been running for months doesn't accumulate an
unbounded incident history. Off (None) by default - nothing is ever deleted unless the user
explicitly opts in via the Reports page.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import AppSettings, Incident

logger = logging.getLogger("cloakdlp.retention")

SETTINGS_ID = "default"

# How often the background sweep re-checks the retention window. Coarse on purpose - this is
# housekeeping, not something that needs to react within minutes of the setting changing (see
# routers/app_settings.py, which runs one purge pass synchronously on save for that).
SWEEP_INTERVAL_SECONDS = 6 * 60 * 60


def get_settings(db: Session) -> AppSettings:
    settings = db.get(AppSettings, SETTINGS_ID)
    if settings is None:
        settings = AppSettings(id=SETTINGS_ID, incident_retention_days=None)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def purge_expired_incidents(db: Session) -> int:
    settings = get_settings(db)
    if not settings.incident_retention_days:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.incident_retention_days)
    deleted = db.query(Incident).filter(Incident.timestamp < cutoff).delete(synchronize_session=False)
    db.commit()
    return deleted


async def run_retention_loop() -> None:
    while True:
        try:
            db = SessionLocal()
            try:
                deleted = await asyncio.to_thread(purge_expired_incidents, db)
                if deleted:
                    logger.info("Retention sweep purged %d incident(s) past the retention window", deleted)
            finally:
                db.close()
        except Exception:
            logger.exception("Retention sweep failed")
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
