from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.services.document_svc import DocumentService
from app.services.storage import LocalStorageBackend


router = APIRouter(prefix="/actions", tags=["actions"])


def _service(db: Session) -> DocumentService:
    return DocumentService(db, LocalStorageBackend(get_settings().upload_dir))
