from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.retention import get_settings, purge_expired_incidents
from app.schemas import AppSettingsOut, AppSettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=AppSettingsOut)
def read_settings(db: Session = Depends(get_db)):
    return get_settings(db)


@router.patch("", response_model=AppSettingsOut)
def update_settings(payload: AppSettingsUpdate, db: Session = Depends(get_db)):
    settings = get_settings(db)
    settings.incident_retention_days = payload.incident_retention_days
    db.commit()
    db.refresh(settings)
    # Applied immediately rather than waiting for the next periodic sweep, so choosing a shorter
    # window (e.g. "30 days") is reflected on Incidents/Reports right away instead of up to
    # SWEEP_INTERVAL_SECONDS later.
    purge_expired_incidents(db)
    return settings
