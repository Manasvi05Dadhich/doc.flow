from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.schemas.job import JobDetail, JobRead
from app.services.document_svc import DocumentService
from app.services.storage import LocalStorageBackend


router = APIRouter(prefix="/jobs", tags=["jobs"])


def _service(db: Session) -> DocumentService:
    return DocumentService(db, LocalStorageBackend(get_settings().upload_dir))


@router.get("", response_model=list[JobRead])
def list_jobs(db: Session = Depends(get_db)):
    return _service(db).list_jobs()


@router.get("/{job_id}", response_model=JobDetail)
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = _service(db).get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
