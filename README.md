# DocFlow

Async document processing workflow system built with FastAPI, Celery, Redis, PostgreSQL, and React.

## Notes

Storage is behind an interface - S3 swap requires only a new implementation.
Would add integration tests for the full upload->process->export flow with a test DB.

## Railway

Railway is a good fit for a reviewer-facing deployment if you use:

- one public `frontend` service
- one private `backend` service that runs both FastAPI and the Celery worker in the same container
- one Railway PostgreSQL service
- one Railway Redis service

This combined backend+worker Railway setup is a deployment convenience so both processes can share the same uploaded files on one service filesystem.

### Services to create

1. `backend`
   - root directory: `backend`
   - Dockerfile path: `backend/Dockerfile.railway`
   - private service
2. `frontend`
   - root directory: `frontend`
   - Dockerfile path: `frontend/Dockerfile.railway`
   - public service
3. PostgreSQL database
4. Redis database

### Railway variables

Backend service:

- `DATABASE_URL`
- `REDIS_URL`
- `UPLOAD_DIR=/app/uploads`

Frontend service:

- `BACKEND_UPSTREAM=backend.railway.internal:8000`

### Notes

- Railway private networking gives each service an internal DNS name under `railway.internal`:
  https://docs.railway.com/private-networking
- Railway builds Docker services from a Dockerfile, and you can set a custom Dockerfile path:
  https://docs.railway.com/deploy/dockerfiles
- Railway volumes attach to a single service, not multiple services, which is why the backend and worker are combined for this deployment path:
  https://docs.railway.com/guides/volumes
