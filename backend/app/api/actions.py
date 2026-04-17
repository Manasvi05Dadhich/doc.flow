from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.schemas.job import RetryJobResponse
from app.schemas.result import FinalizeResultRequest, ResultRead, ResultUpdate
from app.services.document_svc import DocumentService
from app.services.export_svc import ExportService
from app.services.storage import LocalStorageBackend
from app.workers.tasks import process_document


router = APIRouter(prefix="/actions", tags=["actions"])


def _service(db: Session) -> DocumentService:
    return DocumentService(db, LocalStorageBackend(get_settings().upload_dir))


@router.post("/{job_id}/retry", response_model=RetryJobResponse)
def retry_job(job_id: str, db: Session = Depends(get_db)):
    service = _service(db)
    job = service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = "queued"
    job.progress = 0
    job.current_stage = "document_received"
    job.error_message = None
    db.add(job)
    db.commit()
    db.refresh(job)

    celery_task = process_document.delay(job.id)
    job.celery_task_id = celery_task.id
    db.add(job)
    db.commit()
    db.refresh(job)
    return RetryJobResponse(job_id=job.id, status=job.status, celery_task_id=job.celery_task_id)


@router.patch("/{job_id}/result", response_model=ResultRead)
def update_result(job_id: str, payload: ResultUpdate, db: Session = Depends(get_db)):
    service = _service(db)
    job = service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    result = service.ensure_result(job)
    if payload.title is not None:
        result.title = payload.title
    if payload.category is not None:
        result.category = payload.category
    if payload.summary is not None:
        result.summary = payload.summary
    if payload.keywords is not None:
        result.keywords = payload.keywords

    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@router.post("/{job_id}/finalize", response_model=ResultRead)
def finalize_result(job_id: str, payload: FinalizeResultRequest, db: Session = Depends(get_db)):
    service = _service(db)
    job = service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    result = service.ensure_result(job)
    result.finalized = payload.finalized
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@router.get("/{job_id}/export/json", response_class=PlainTextResponse)
def export_json(job_id: str, db: Session = Depends(get_db)):
    job = _service(db).get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return PlainTextResponse(ExportService.build_json(job), media_type="application/json")


@router.get("/{job_id}/export/csv", response_class=PlainTextResponse)
def export_csv(job_id: str, db: Session = Depends(get_db)):
    job = _service(db).get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return PlainTextResponse(ExportService.build_csv(job), media_type="text/csv")
