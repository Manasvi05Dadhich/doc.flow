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
    reviewed_json: dict = Field(default_factory=dict)
    is_finalized: bool
    finalized_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReviewResultRequest(BaseModel):
    title: str | None = None
    category: str | None = None
    summary: str | None = None
    keywords: list[str] = Field(default_factory=list)


class FinalizeResultResponse(BaseModel):
    status: str
    is_finalized: bool
    finalized_at: datetime | None = None
