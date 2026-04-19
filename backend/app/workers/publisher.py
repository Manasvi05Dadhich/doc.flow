import json

from app.core.database import SessionLocal
from app.core.redis import get_redis
from app.models.audit_log import AuditLog


def publish_event(job_id: str, event: str, progress: int, message: str = "", extra: dict | None = None) -> None:
    envelope = {
        "event": event,
        "progress": progress,
        "message": message,
        "job_id": job_id,
    }
    if extra:
        envelope["extra"] = extra

    payload = json.dumps(envelope)
    redis_client = get_redis()
    redis_client.publish(f"job:{job_id}", payload)

    db = SessionLocal()
    try:
        db.add(
            AuditLog(
                job_id=job_id,
                event=event,
                progress=progress,
                message=message,
                payload_json=payload,
            )
        )
        db.commit()
    finally:
        db.close()


def publish_progress(job_id: str, event: str, progress: int, stage: str, payload: dict | None = None) -> None:
    publish_event(job_id=job_id, event=event, progress=progress, message=stage, extra=payload)
