from datetime import datetime

from sqlalchemy.orm import Session

from app.models.result import Result
from app.schemas.result import ReviewResultRequest


class ResultService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_or_update(self, job_id: str, fields: dict) -> Result:
        result = self.db.query(Result).filter(Result.job_id == job_id).first()
        if result is None:
            result = Result(job_id=job_id)

        result.title = fields.get("title")
        result.category = fields.get("category")
        result.summary = fields.get("summary")
        result.keywords = fields.get("keywords", [])
        result.raw_output = fields
        if not result.reviewed_json:
            result.reviewed_json = fields
        result.finalized = result.is_finalized
        self.db.add(result)
        self.db.commit()
        self.db.refresh(result)
        return result

    def update_review(self, job_id: str, payload: ReviewResultRequest) -> Result:
        result = self.db.query(Result).filter(Result.job_id == job_id).first()
        if result is None:
            result = Result(job_id=job_id)

        reviewed_json = {
            "title": payload.title,
            "category": payload.category,
            "summary": payload.summary,
            "keywords": payload.keywords,
        }
        result.reviewed_json = reviewed_json
        result.title = payload.title
        result.category = payload.category
        result.summary = payload.summary
        result.keywords = payload.keywords
        result.finalized = result.is_finalized
        self.db.add(result)
        self.db.commit()
        self.db.refresh(result)
        return result

    def finalize(self, job_id: str) -> Result:
        result = self.db.query(Result).filter(Result.job_id == job_id).first()
        if result is None:
            result = Result(job_id=job_id)

        result.is_finalized = True
        result.finalized = True
        result.finalized_at = datetime.utcnow()
        self.db.add(result)
        self.db.commit()
        self.db.refresh(result)
        return result
