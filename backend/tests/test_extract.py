from types import SimpleNamespace

from app.workers.tasks import extract_fields


def mock_document():
    return SimpleNamespace(storage_path="/tmp/mock-document.pdf")


def test_extract_fields_returns_required_keys():
    parsed = {
        "filename": "quarterly_report.pdf",
        "file_type": "pdf",
        "file_size": 4096,
        "text": "Quarterly Report Revenue grew 20 percent year over year.",
    }

    result = extract_fields(parsed, mock_document())

    assert "title" in result
    assert "summary" in result
    assert "keywords" in result
    assert "category" in result
    assert isinstance(result["keywords"], list)


def test_extract_summary_truncates():
    parsed = {
        "filename": "very_long_report.txt",
        "file_type": "txt",
        "file_size": 2048,
        "text": "word " * 500,
    }

    result = extract_fields(parsed, mock_document())

    assert len(result["summary"]) <= 300
