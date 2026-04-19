# DocFlow

Async document processing workflow system built with FastAPI, Celery, Redis, PostgreSQL, and React.

## Notes

Storage is behind an interface - S3 swap requires only a new implementation.
Would add integration tests for the full upload->process->export flow with a test DB.
