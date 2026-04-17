from datetime import datetime

from pydantic import BaseModel

from app.schemas.document import DocumentRead


class JobRead(BaseModel):
    id: str
    document_id: str
    status: str
    progress: int
    current_stage: str | None
    error_message: str | None
    celery_task_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobDetail(JobRead):
    document: DocumentRead | None = None


class RetryJobResponse(BaseModel):
    job_id: str
    status: str
    celery_task_id: str | None
