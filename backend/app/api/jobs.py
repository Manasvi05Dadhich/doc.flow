from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.schemas.job import JobDetail, JobListItem, RetryJobResponse
from app.schemas.result import FinalizeResultResponse, ResultRead, ReviewResultRequest
from app.services.document_svc import DocumentService
from app.services.export_svc import ExportService
from app.services.job_svc import JobService
from app.services.result_svc import ResultService
from app.services.storage import LocalStorageBackend
from app.workers.tasks import process_document


router = APIRouter(prefix="/jobs", tags=["jobs"])


def _service(db: Session) -> DocumentService:
    return DocumentService(db, LocalStorageBackend(get_settings().upload_dir))


@router.get("", response_model=list[JobListItem])
def list_jobs(
    status: str | None = None,
    search: str | None = None,
    sort: str = "uploaded_at",
    db: Session = Depends(get_db),
):
    return _service(db).list_jobs(status=status, search=search, sort=sort)


@router.get("/{job_id}", response_model=JobDetail)
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = _service(db).get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/{job_id}/export")
def export_job(job_id: str, format: str = Query(default="json"), db: Session = Depends(get_db)) -> Response:
    job = _service(db).get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.result is None or not job.result.is_finalized:
        raise HTTPException(status_code=400, detail="Finalize before exporting")

    export_format = format.lower()
    if export_format == "json":
        return ExportService.export_json(job)
    if export_format == "csv":
        return ExportService.export_csv(job)
    raise HTTPException(status_code=400, detail="Unsupported export format")


@router.put("/{job_id}/review", response_model=ResultRead)
def review_job(job_id: str, payload: ReviewResultRequest, db: Session = Depends(get_db)):
    job = _service(db).get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.result and job.result.is_finalized:
        raise HTTPException(status_code=400, detail="Finalized results are read-only")
    return ResultService(db).update_review(job_id, payload)


@router.patch("/{job_id}/finalize", response_model=FinalizeResultResponse)
def finalize_job(job_id: str, db: Session = Depends(get_db)):
    job = _service(db).get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.result is None:
        raise HTTPException(status_code=400, detail="No result available to finalize")
    if job.result.is_finalized:
        raise HTTPException(status_code=400, detail="Job result is already finalized")

    result = ResultService(db).finalize(job_id)
    return FinalizeResultResponse(status="finalized", is_finalized=result.is_finalized, finalized_at=result.finalized_at)


@router.post("/{job_id}/retry", response_model=RetryJobResponse)
def retry_job(job_id: str, db: Session = Depends(get_db)):
    job_service = JobService(db)
    job = job_service.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "failed":
        raise HTTPException(status_code=400, detail="Job is not failed")
    if job.retry_count >= 3:
        raise HTTPException(status_code=400, detail="Max retries reached")

    task = process_document.apply_async(
        args=[job_id],
        task_id=f"retry-{job_id}-{job.retry_count + 1}",
    )
    refreshed = job_service.reset_for_retry(job_id, task.id)
    return RetryJobResponse(job_id=refreshed.id, status=refreshed.status, celery_task_id=refreshed.celery_task_id)
