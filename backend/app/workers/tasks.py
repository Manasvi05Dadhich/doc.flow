import time
from pathlib import Path

from app.core.database import SessionLocal
from app.models import AuditLog, Document, Job, Result  # noqa: F401
from app.services.job_svc import JobService
from app.services.result_svc import ResultService
from app.workers.celery_app import celery_app
from app.workers.publisher import publish_event


def parse_document(storage_path: str) -> dict:
    path = Path(storage_path)
    content = path.read_bytes()
    decoded_text = content[:4000].decode("utf-8", errors="ignore").strip()
    if not decoded_text:
        decoded_text = f"Document {path.name} uploaded for asynchronous processing."

    return {
        "filename": path.name,
        "file_type": path.suffix.lstrip(".").lower() or "unknown",
        "file_size": len(content),
        "text": decoded_text,
    }


def extract_fields(parsed: dict, document: Document | None) -> dict:
    filename = parsed["filename"]
    stem_words = [part for part in Path(filename).stem.replace("-", " ").replace("_", " ").split() if part]
    title = " ".join(word.capitalize() for word in stem_words) or filename
    category = "PDF Document" if parsed["file_type"] == "pdf" else f"{parsed['file_type'].upper()} Document"
    raw_text = " ".join(parsed["text"].split())
    text_summary = raw_text[:220].strip()
    summary = text_summary or (
        f"{title} is a {parsed['file_type']} file sized {parsed['file_size']} bytes. "
        f"It was processed from {document.storage_path if document else 'storage'}."
    )
    if len(summary) > 300:
        summary = f"{summary[:297].rstrip()}..."
    keyword_pool = stem_words[:4] + [parsed["file_type"], "document", "processed"]
    keywords = list(dict.fromkeys(keyword_pool))

    return {
        "title": title,
        "category": category,
        "summary": summary,
        "keywords": keywords,
        "parsed_text_preview": parsed["text"][:500],
        "metadata": {
            "filename": parsed["filename"],
            "file_type": parsed["file_type"],
            "file_size": parsed["file_size"],
        },
    }


@celery_app.task(bind=True, max_retries=0, name="process_document")
def process_document(self, job_id: str) -> dict:
    print(f"[worker] process_document started for job_id={job_id}")
    db = SessionLocal()
    job_service = JobService(db)
    result_service = ResultService(db)
    try:
        job = job_service.set_processing(job_id, progress=5, stage="job_started")
        if job is None:
            return {"job_id": job_id, "status": "missing"}

        publish_event(job_id, "job_started", 5, "Job moved to processing")

        job = job_service.set_progress(job_id, progress=10, stage="parsing_started")
        publish_event(job_id, "parsing_started", 10, "Parsing started")
        parsed = parse_document(job.document.storage_path)

        job = job_service.set_progress(job_id, progress=35, stage="parsing_completed")
        publish_event(job_id, "parsing_completed", 35, "Parsing completed")
        time.sleep(1)

        job = job_service.set_progress(job_id, progress=50, stage="extraction_started")
        publish_event(job_id, "extraction_started", 50, "Extraction started")
        fields = extract_fields(parsed, job.document)

        job = job_service.set_progress(job_id, progress=75, stage="extraction_completed")
        publish_event(job_id, "extraction_completed", 75, "Extraction completed")
        time.sleep(1)

        job_service.set_progress(job_id, progress=90, stage="storing_result")
        publish_event(job_id, "storing_result", 90, "Storing result")
        result_service.create_or_update(job_id, fields)

        job_service.set_completed(job_id)
        publish_event(job_id, "job_completed", 100, "Job completed")
        return {"job_id": job.id, "status": "completed"}
    except Exception as exc:
        db.rollback()
        job_service.set_failed(job_id, str(exc))
        publish_event(job_id, "job_failed", 0, str(exc))
        raise
    finally:
        db.close()
