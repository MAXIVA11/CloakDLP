from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.ctph import hash_bytes
from app.database import get_db
from app.deps import get_current_agent, get_current_user
from app.models import Agent, FingerprintDataset
from app.schemas import FingerprintDatasetOut, FingerprintDetectionSet

router = APIRouter(prefix="/api/fingerprints", tags=["fingerprints"])


@router.post("", response_model=FingerprintDatasetOut, status_code=201, dependencies=[Depends(get_current_user)])
async def create_fingerprint(
    name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    ctph = hash_bytes(content)
    del content  # discarded immediately after hashing — never stored or logged

    dataset = FingerprintDataset(name=name, ctph_hash=ctph, source_filename=file.filename or "")
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


@router.get("", response_model=list[FingerprintDatasetOut], dependencies=[Depends(get_current_user)])
def list_fingerprints(db: Session = Depends(get_db)):
    return db.query(FingerprintDataset).order_by(FingerprintDataset.created_at.desc()).all()


@router.delete("/{dataset_id}", status_code=204, dependencies=[Depends(get_current_user)])
def delete_fingerprint(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.get(FingerprintDataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Fingerprint not found")
    db.delete(dataset)
    db.commit()


@router.get("/{dataset_id}/detection-set", response_model=FingerprintDetectionSet)
def get_detection_set(dataset_id: str, db: Session = Depends(get_db), agent: Agent = Depends(get_current_agent)):
    dataset = db.get(FingerprintDataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Fingerprint not found")
    return FingerprintDetectionSet(id=dataset.id, name=dataset.name, ctph_hash=dataset.ctph_hash)
