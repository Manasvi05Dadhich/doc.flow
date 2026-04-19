from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.core.database import get_db
from app.main import app


client = TestClient(app)


def override_get_db():
    yield None


app.dependency_overrides[get_db] = override_get_db


def test_retry_endpoint_rejects_non_failed_jobs(monkeypatch):
    class FakeJobService:
        def __init__(self, db):
            self.db = db

        def get(self, job_id):
            return SimpleNamespace(id=job_id, status="completed", retry_count=0)

    monkeypatch.setattr("app.api.jobs.JobService", FakeJobService)

    response = client.post("/api/jobs/job-1/retry")

    assert response.status_code == 400
    assert response.json() == {"detail": "Job is not failed", "status_code": 400}


def test_finalize_prevents_double_finalization(monkeypatch):
    class FakeDocumentService:
        def get_job(self, job_id):
            return SimpleNamespace(
                id=job_id,
                result=SimpleNamespace(is_finalized=True),
            )

    monkeypatch.setattr("app.api.jobs._service", lambda db: FakeDocumentService())

    response = client.patch("/api/jobs/job-1/finalize")

    assert response.status_code == 400
    assert response.json() == {"detail": "Job result is already finalized", "status_code": 400}
