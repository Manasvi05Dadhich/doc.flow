import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.redis import get_redis
from app.services.audit_svc import AuditService
from app.services.job_svc import JobService


router = APIRouter(tags=["progress"])


@router.get("/jobs/{job_id}/progress")
async def stream_progress(job_id: str, db: Session = Depends(get_db)):
    audit_service = AuditService(db)
    job_service = JobService(db)

    async def event_generator():
        redis_client = get_redis()
        pubsub = redis_client.pubsub()
        channel = f"job:{job_id}"
        try:
            logs = audit_service.get_logs(job_id)
            for log in logs:
                yield f"data: {log.payload_json}\n\n"

            job = job_service.get(job_id)
            if job is None:
                return

            if job.status in ("completed", "failed"):
                return

            pubsub.subscribe(channel)
            while True:
                message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message.get("data"):
                    payload = message["data"]
                    yield f"data: {payload}\n\n"

                    data = json.loads(payload)
                    if data["event"] in ("job_completed", "job_failed"):
                        break

                await asyncio.sleep(0.25)
        finally:
            pubsub.unsubscribe(channel)
            pubsub.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")
