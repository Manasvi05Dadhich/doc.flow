from fastapi import FastAPI

from app.api.actions import router as actions_router
from app.api.jobs import router as jobs_router
from app.api.progress import router as progress_router
from app.api.upload import router as upload_router
from app.core.config import get_settings


settings = get_settings()

app = FastAPI(title=settings.app_name)

app.include_router(upload_router, prefix=settings.api_prefix)
app.include_router(jobs_router, prefix=settings.api_prefix)
app.include_router(progress_router, prefix=settings.api_prefix)
app.include_router(actions_router, prefix=settings.api_prefix)


@app.get("/health")
def health_check():
    return {"status": "ok"}
