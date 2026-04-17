from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.job import Job
from app.models.result import Result
from app.workers.celery_app import celery_app
from app.workers.publisher import publish_progress


def _update_job(db: Session, job: Job, *, status: str, progress: int, stage: str, error_message: str | None = None) -> None:
    job.status = status
    job.progress = progress
    job.current_stage = stage
    job.error_message = error_message
    db.add(job)
    db.commit()
    db.refresh(job)


@celery_app.task(name="process_document")
def process_document(job_id: str) -> dict:
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job is None:
            return {"job_id": job_id, "status": "missing"}

        stages = [
            ("job_started", "processing", 10, "document_received"),
            ("document_parsing_started", "processing", 25, "parsing_started"),
            ("document_parsing_completed", "processing", 45, "parsing_completed"),
            ("field_extraction_started", "processing", 60, "extraction_started"),
            ("field_extraction_completed", "processing", 80, "extraction_completed"),
            ("result_stored", "processing", 95, "result_stored"),
        ]

        for event, status, progress, stage in stages:
            _update_job(db, job, status=status, progress=progress, stage=stage)
            publish_progress(job.id, event, progress, stage)

        result = job.result or Result(job_id=job.id)
        result.title = None
        result.category = None
        result.summary = None
        result.keywords = []
        result.raw_output = {}
        db.add(result)
        db.commit()

        _update_job(db, job, status="completed", progress=100, stage="job_completed")
        publish_progress(job.id, "job_completed", 100, "job_completed")
        return {"job_id": job.id, "status": "completed"}
    except Exception as exc:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job is not None:
            _update_job(db, job, status="failed", progress=0, stage="job_failed", error_message=str(exc))
            publish_progress(job.id, "job_failed", 0, "job_failed", {"error": str(exc)})
        raise
    finally:
        db.close()
