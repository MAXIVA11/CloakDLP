import hashlib
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_agent, get_current_user
from app.models import Agent, EdmDataset, EdmFieldType
from app.schemas import EdmDatasetCreate, EdmDatasetOut, EdmDetectionSet

router = APIRouter(prefix="/api/edm", tags=["edm"])


def normalize(value: str, field_type: EdmFieldType) -> str:
    if field_type == EdmFieldType.email:
        return value.strip().lower()
    return re.sub(r"\D", "", value)  # number: digits only


def hash_value(salt: str, normalized: str) -> str:
    return hashlib.sha256((salt + normalized).encode()).hexdigest()


@router.post("/datasets", response_model=EdmDatasetOut, status_code=201, dependencies=[Depends(get_current_user)])
def create_dataset(payload: EdmDatasetCreate, db: Session = Depends(get_db)):
    salt = secrets.token_hex(32)
    hashes = sorted(
        {
            hash_value(salt, normalized)
            for v in payload.values
            if (normalized := normalize(v, payload.field_type))
        }
    )

    dataset = EdmDataset(
        name=payload.name,
        field_type=payload.field_type,
        salt=salt,
        hashes=hashes,
        value_count=len(hashes),
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


@router.get("/datasets", response_model=list[EdmDatasetOut], dependencies=[Depends(get_current_user)])
def list_datasets(db: Session = Depends(get_db)):
    return db.query(EdmDataset).order_by(EdmDataset.created_at.desc()).all()


@router.delete("/datasets/{dataset_id}", status_code=204, dependencies=[Depends(get_current_user)])
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.get(EdmDataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    db.delete(dataset)
    db.commit()


@router.get("/datasets/{dataset_id}/detection-set", response_model=EdmDetectionSet)
def get_detection_set(dataset_id: str, db: Session = Depends(get_db), agent: Agent = Depends(get_current_agent)):
    dataset = db.get(EdmDataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return EdmDetectionSet(id=dataset.id, field_type=dataset.field_type, salt=dataset.salt, hashes=dataset.hashes)
