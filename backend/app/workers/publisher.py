import json

from app.core.config import get_settings
from app.core.redis import get_redis_client


settings = get_settings()


def publish_progress(job_id: str, event: str, progress: int, stage: str, payload: dict | None = None) -> None:
    client = get_redis_client()
    message = {
        "job_id": job_id,
        "event": event,
        "progress": progress,
        "stage": stage,
        "payload": payload or {},
    }
    channel = f"{settings.progress_channel_prefix}:{job_id}"
    client.publish(channel, json.dumps(message))
