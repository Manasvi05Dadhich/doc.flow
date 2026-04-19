import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.api.actions import router as actions_router
from app.api.jobs import router as jobs_router
from app.api.progress import router as progress_router
from app.api.upload import router as upload_router
from app.core.database import init_db
from app.core.config import get_settings


settings = get_settings()
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)

app.include_router(upload_router, prefix=settings.api_prefix)
app.include_router(jobs_router, prefix=settings.api_prefix)
app.include_router(progress_router, prefix=settings.api_prefix)
app.include_router(actions_router, prefix=settings.api_prefix)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "status_code": exc.status_code},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(_: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "status_code": 500},
    )


@app.get("/health")
def health_check():
    return {"status": "ok"}
