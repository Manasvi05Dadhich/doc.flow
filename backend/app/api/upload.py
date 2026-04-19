from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.schemas.document import UploadAcceptedResponse
from app.services.document_svc import DocumentService
from app.services.storage import LocalStorageBackend
from app.workers.tasks import process_document


router = APIRouter(tags=["upload"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


def _file_size(upload_file: UploadFile) -> int:
    current_position = upload_file.file.tell()
    upload_file.file.seek(0, 2)
    size = upload_file.file.tell()
    upload_file.file.seek(current_position)
    return size


def _file_extension(upload_file: UploadFile) -> str:
    return Path(upload_file.filename or "").suffix.lower()


@router.post("/upload", response_model=UploadAcceptedResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    settings = get_settings()
    storage = LocalStorageBackend(settings.upload_dir)
    service = DocumentService(db, storage)

    extension = _file_extension(file)
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported Media Type. Allowed types: PDF, DOCX, TXT.")

    size_in_bytes = _file_size(file)
    if size_in_bytes == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if size_in_bytes > settings.max_file_size_mb * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {settings.max_file_size_mb} MB.",
        )

    storage_path = await storage.save(file)
    document = service.create_document(
        upload_file=file,
        storage_path=str(storage_path),
        file_size=size_in_bytes,
        file_type=extension.lstrip("."),
    )
    job = service.create_job(document.id)

    task = process_document.delay(str(job.id))
    service.set_task_id(job.id, task.id)

    return UploadAcceptedResponse(
        job_id=job.id,
        document_id=document.id,
        status="queued",
    )
