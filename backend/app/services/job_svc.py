from sqlalchemy.orm import Session

from app.models.job import Job


class JobService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, job_id: str) -> Job | None:
        return self.db.query(Job).filter(Job.id == job_id).first()

    def set_processing(self, job_id: str, *, progress: int = 0, stage: str = "processing_started") -> Job:
        job = self.get(job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        job.status = "processing"
        job.progress = progress
        job.current_stage = stage
        job.error_message = None
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def set_progress(self, job_id: str, *, progress: int, stage: str) -> Job:
        job = self.get(job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        job.progress = progress
        job.current_stage = stage
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def set_completed(self, job_id: str) -> Job:
        job = self.get(job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        job.status = "completed"
        job.progress = 100
        job.current_stage = "job_completed"
        job.error_message = None
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def set_failed(self, job_id: str, error_message: str) -> Job | None:
        job = self.get(job_id)
        if job is None:
            return None

        job.status = "failed"
        job.progress = 0
        job.current_stage = "job_failed"
        job.error_message = error_message
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def reset_for_retry(self, job_id: str, task_id: str) -> Job:
        job = self.get(job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        job.status = "queued"
        job.progress = 0
        job.current_stage = "document_received"
        job.error_message = None
        job.celery_task_id = task_id
        job.retry_count += 1
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job
