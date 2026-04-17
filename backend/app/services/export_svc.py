import csv
import io
import json

from app.models.job import Job


class ExportService:
    @staticmethod
    def build_json(job: Job) -> str:
        payload = {
            "job_id": job.id,
            "status": job.status,
            "document": {
                "id": job.document.id if job.document else None,
                "filename": job.document.filename if job.document else None,
                "file_type": job.document.file_type if job.document else None,
                "file_size": job.document.file_size if job.document else None,
            },
            "result": {
                "title": job.result.title if job.result else None,
                "category": job.result.category if job.result else None,
                "summary": job.result.summary if job.result else None,
                "keywords": job.result.keywords if job.result else [],
                "finalized": job.result.finalized if job.result else False,
            },
        }
        return json.dumps(payload, indent=2)

    @staticmethod
    def build_csv(job: Job) -> str:
        buffer = io.StringIO()
        writer = csv.DictWriter(
            buffer,
            fieldnames=["job_id", "document_id", "filename", "status", "title", "category", "summary", "keywords", "finalized"],
        )
        writer.writeheader()
        writer.writerow(
            {
                "job_id": job.id,
                "document_id": job.document.id if job.document else "",
                "filename": job.document.filename if job.document else "",
                "status": job.status,
                "title": job.result.title if job.result else "",
                "category": job.result.category if job.result else "",
                "summary": job.result.summary if job.result else "",
                "keywords": "|".join(job.result.keywords) if job.result else "",
                "finalized": job.result.finalized if job.result else False,
            }
        )
        return buffer.getvalue()
