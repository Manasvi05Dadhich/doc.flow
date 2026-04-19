import csv
import io
import json

from fastapi.responses import Response

from app.models.job import Job


class ExportService:
    @staticmethod
    def export_json(job: Job) -> Response:
        data = ExportService._export_payload(job)
        filename = ExportService._build_filename(job, "json")
        return Response(
            content=json.dumps(data, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @staticmethod
    def export_csv(job: Job) -> Response:
        data = ExportService._export_payload(job)
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=list(data.keys()))
        writer.writeheader()
        writer.writerow({key: ExportService._flatten_value(value) for key, value in data.items()})

        filename = ExportService._build_filename(job, "csv")
        return Response(
            content=buffer.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @staticmethod
    def _export_payload(job: Job) -> dict:
        if job.result is None:
            return {}

        payload = job.result.reviewed_json or job.result.raw_output or {}
        if isinstance(payload, dict):
            return payload
        return {}

    @staticmethod
    def _flatten_value(value: object) -> str:
        if isinstance(value, (dict, list)):
            return json.dumps(value)
        if value is None:
            return ""
        return str(value)

    @staticmethod
    def _build_filename(job: Job, extension: str) -> str:
        base_name = job.document.filename.rsplit(".", 1)[0] if job.document and job.document.filename else f"job-{job.id}"
        return f"{base_name}-result.{extension}"
