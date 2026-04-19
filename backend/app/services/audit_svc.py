from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


class AuditService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_logs(self, job_id: str) -> list[AuditLog]:
        return (
            self.db.query(AuditLog)
            .filter(AuditLog.job_id == job_id)
            .order_by(AuditLog.created_at.asc())
            .all()
        )
