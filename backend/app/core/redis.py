import ssl
from functools import lru_cache

import redis

from app.core.config import settings


@lru_cache
def get_redis_client() -> redis.Redis:
    kwargs: dict = {"decode_responses": True}
    # Upstash / TLS Redis (rediss://) needs cert verification disabled
    if settings.redis_url.startswith("rediss://"):
        kwargs["ssl_cert_reqs"] = None
    return redis.Redis.from_url(settings.redis_url, **kwargs)


def get_redis() -> redis.Redis:
    return get_redis_client()
