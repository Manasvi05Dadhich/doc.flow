from fastapi import UploadFile
from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.models.document import Document
from app.models.job import Job
from app.models.result import Result
from app.services.storage import StorageBackend


class DocumentService:
    def __init__(self, db: Session, storage: StorageBackend) -> None:
        self.db = db
        self.storage = storage

    def create_document(self, upload_file: UploadFile, storage_path: str, file_size: int, file_type: str) -> Document:
        document = Document(
            filename=upload_file.filename or "unknown",
            file_type=file_type,
            file_size=file_size,
            storage_path=storage_path,
        )
        self.db.add(document)
        self.db.commit()
        self.db.refresh(document)
        return document

    def create_job(self, document_id: str) -> Job:
        job = Job(
            document_id=document_id,
            status="queued",
            progress=0,
            current_stage="document_received",
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def set_task_id(self, job_id: str, task_id: str) -> Job | None:
        job = self.db.query(Job).filter(Job.id == job_id).first()
        if job is None:
            return None

        job.celery_task_id = task_id
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def list_jobs(self, *, status: str | None = None, search: str | None = None, sort: str = "uploaded_at") -> list[Job]:
        query = self.db.query(Job).join(Document).options(joinedload(Job.document), joinedload(Job.result))

        if status:
            query = query.filter(Job.status == status)

        if search:
            query = query.filter(Document.filename.ilike(f"%{search}%"))

        sort_mapping = {
            "uploaded_at": Document.created_at,
            "filename": Document.filename,
            "status": Job.status,
            "size": Document.file_size,
            "type": Document.file_type,
        }
        sort_column = sort_mapping.get(sort, Document.created_at)
        return query.order_by(desc(sort_column)).all()

    def get_job(self, job_id: str) -> Job | None:
        return self.db.query(Job).options(joinedload(Job.document), joinedload(Job.result)).filter(Job.id == job_id).first()

    def ensure_result(self, job: Job) -> Result:
        if job.result:
            return job.result

        result = Result(job_id=job.id)
        self.db.add(result)
        self.db.commit()
        self.db.refresh(result)
        return result
