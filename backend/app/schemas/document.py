from datetime import datetime

from pydantic import BaseModel


class DocumentRead(BaseModel):
    id: str
    filename: str
    file_type: str
    file_size: int
    storage_path: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadAcceptedResponse(BaseModel):
    job_id: str
    document_id: str
    status: str
