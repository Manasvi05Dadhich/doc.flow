import ssl

from celery import Celery

from app.core.config import settings


celery_app = Celery(
    "docflow",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)

_conf = dict(
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
)

# Upstash / any TLS Redis uses rediss:// — Celery needs explicit SSL config
if settings.redis_url.startswith("rediss://"):
    _conf["broker_use_ssl"] = {"ssl_cert_reqs": ssl.CERT_NONE}
    _conf["redis_backend_use_ssl"] = {"ssl_cert_reqs": ssl.CERT_NONE}

celery_app.conf.update(**_conf)
