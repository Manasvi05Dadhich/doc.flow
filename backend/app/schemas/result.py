from datetime import datetime

from pydantic import BaseModel, Field


class ResultRead(BaseModel):
    id: str
    job_id: str
    title: str | None = None
    category: str | None = None
    summary: str | None = None
    keywords: list[str] = Field(default_factory=list)
    raw_output: dict = Field(default_factory=dict)
    finalized: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ResultUpdate(BaseModel):
    title: str | None = None
    category: str | None = None
    summary: str | None = None
    keywords: list[str] | None = None


class FinalizeResultRequest(BaseModel):
    finalized: bool = True
