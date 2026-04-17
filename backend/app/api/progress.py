import asyncio

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.config import get_settings
from app.core.redis import get_redis_client


router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/{job_id}")
async def stream_progress(job_id: str):
    settings = get_settings()
    client = get_redis_client()
    pubsub = client.pubsub()
    pubsub.subscribe(f"{settings.progress_channel_prefix}:{job_id}")

    async def event_generator():
        try:
            while True:
                message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message.get("data"):
                    yield f"data: {message['data']}\n\n"
                await asyncio.sleep(0.25)
        finally:
            pubsub.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")
