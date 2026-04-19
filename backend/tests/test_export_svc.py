from types import SimpleNamespace

from app.services.export_svc import ExportService


def test_export_csv_uses_reviewed_json_and_has_headers():
    job = SimpleNamespace(
        id="job-123",
        document=SimpleNamespace(filename="result.pdf"),
        result=SimpleNamespace(
            reviewed_json={
                "title": "Reviewed Title",
                "category": "PDF Document",
                "keywords": ["alpha", "beta"],
            },
            raw_output={"title": "Raw Title"},
            is_finalized=True,
        ),
    )

    response = ExportService.export_csv(job)
    body = response.body.decode("utf-8")

    assert response.headers["content-disposition"] == 'attachment; filename="result-result.csv"'
    assert "title,category,keywords" in body
    assert "Reviewed Title" in body
    assert '["alpha", "beta"]' in body
