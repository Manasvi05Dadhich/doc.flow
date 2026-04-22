# DocFlow — Async Document Processing System

A production-style full-stack application for uploading documents, processing them asynchronously, tracking progress in real time, reviewing extracted output, and exporting finalized results.

---

## Table of contents

- [Quick start](#quick-start)
- [Architecture overview](#architecture-overview)
- [Design decisions](#design-decisions)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Database schema](#database-schema)
- [Processing workflow](#processing-workflow)
- [Progress tracking](#progress-tracking)
- [Assumptions](#assumptions)
- [Tradeoffs and limitations](#tradeoffs-and-limitations)
- [What I would do with more time](#what-i-would-do-with-more-time)
- [AI tools used](#ai-tools-used)

---

## Quick start

### Prerequisites

- Docker and Docker Compose v2+
- No other local dependencies required — everything runs in containers

### Run the application

```bash
# 1. Clone the repo
git clone https://github.com/your-username/docflow.git
cd docflow

# 2. Copy environment config
cp .env.example .env

# 3. Start all services
docker compose up --build

# 4. Run database migrations (first time only)
docker compose exec backend alembic upgrade head

# 5. Open the app
open http://localhost:3000
```

That's it. One command starts PostgreSQL, Redis, the FastAPI backend, the Celery worker, and the React frontend.

### Running tests

```bash
docker compose exec backend pytest tests/ -v
```

### Sample files for testing

Sample test files are included in `/samples/input/`:

| File | Type | Purpose |
|------|------|---------|
| `quarterly-report.pdf` | PDF | Normal processing flow |
| `meeting-notes.txt` | Plain text | Fast processing demo |
| `invalid.exe` | Binary | Demonstrates file type rejection |

Sample exported outputs are in `/samples/output/`.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────┐
│                React + TypeScript                    │
│   Upload │ Dashboard │ Progress │ Review │ Export    │
└──────────────────────┬──────────────────────────────┘
          HTTP REST    │    SSE (text/event-stream)
┌─────────────────────────────────────────────────────┐
│                  FastAPI backend                     │
│  /upload │ /jobs │ /progress │ /finalize │ /export  │
│                   Service layer                      │
└──────┬─────────────────────────────┬────────────────┘
       │ .delay()                    │ subscribe
       │                    ┌────────┴───────┐
┌──────▼──────────┐         │     Redis      │
│  Celery worker  │ publish │  Broker+PubSub │
│  Stage 1: parse │────────►│  job:{id}      │
│  Stage 2: extract         └────────────────┘
│  Stage 3: store │
└──────┬──────────┘
       │ write
┌──────▼──────────┐
│   PostgreSQL    │
│  documents      │
│  jobs           │
│  results        │
│  audit_log      │
└─────────────────┘
```

### Service responsibilities

**React frontend** — handles file upload, displays job dashboard with search/filter/sort, opens an `EventSource` connection per job for live progress, provides a review and edit interface, and triggers JSON/CSV export.

**FastAPI backend** — validates and accepts uploads, writes document and job records to PostgreSQL, dispatches Celery tasks, subscribes to Redis Pub/Sub to stream progress as SSE, and serves all CRUD and export endpoints. Crucially, the upload route returns `202 Accepted` before the Celery task does any work.

**Celery worker** — runs in a separate process, picks tasks off the Redis broker queue, processes documents through three sequential stages, publishes progress events to Redis Pub/Sub at each stage transition, and writes the final result to PostgreSQL.

**PostgreSQL** — source of truth for all persistent state — documents, jobs, extracted results, finalized output, and a full audit log of every progress event ever published.

**Redis** — serves two roles: task broker (Celery uses it as a queue) and Pub/Sub bus (workers publish events, the SSE endpoint subscribes and streams them to the browser).

---

## Design decisions

These are the decisions I made deliberately and the reasoning behind each one.

### SSE over WebSocket for progress streaming

Progress updates flow in one direction only: server to client. A WebSocket establishes a bidirectional channel, which adds handshake complexity and state management overhead with no benefit here — the browser never needs to send data during processing.

Server-Sent Events (`text/event-stream`) are the precise fit: native browser support via `EventSource`, automatic reconnection, and trivial implementation in FastAPI via `StreamingResponse`. Using WebSockets would have been over-engineering.

### One Celery task over a Celery chain

Celery supports chaining tasks (`chain(parse.s(), extract.s(), store.s())`) where each stage becomes an independent task. I chose a single task with internal stage progression instead, for two reasons:

1. **Retry semantics are clean.** When a job fails, retrying means re-running the whole job from the start, which is the correct behavior. With a chain, a failure in stage 2 would require re-running only stages 2–3, which complicates the retry endpoint and the status tracking logic.

2. **Independent stage scaling isn't required.** Chains pay off when parse-heavy and extract-heavy workloads need to scale independently across different worker pools. This system doesn't have that requirement.

### One Redis channel per job, not per stage

Each job gets an isolated Pub/Sub channel: `job:{job_id}`. The worker publishes all stage events (parsing_started, extraction_completed, etc.) to that single channel with different `event` fields in the payload.

The alternative — a channel per stage like `stage:parsing` — would mean the SSE endpoint receives events from every user's jobs on that channel, requiring client-side filtering and leaking cross-user event data. Per-job isolation is the correct model.

### StorageBackend abstraction

File storage is behind an abstract interface with two methods: `save(file) → path` and `read(path) → bytes`. The current implementation writes to local disk at `/app/uploads/{job_id}/{filename}`. Swapping to S3 requires only a new `S3Storage` class implementing the same interface — no changes to routes, services, or workers.

The backend and worker containers mount the same uploads directory as a shared Docker volume, which is the correct approach for local disk storage with multiple processes.

### audit_log table for event persistence

Redis Pub/Sub is fire-and-forget. If the browser is not connected when a worker publishes `parsing_started`, that event is permanently lost. To solve this, every `publish_event()` call also writes a row to the `audit_log` table.

When a browser opens the SSE endpoint for a job that is already mid-processing or completed, the endpoint first replays all `audit_log` rows for that job before subscribing to live events. This means progress history is always available regardless of when the browser connects.

---

## Project structure

```
docflow/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload.py        # POST /upload
│   │   │   ├── jobs.py          # GET /jobs, GET /jobs/{id}
│   │   │   ├── progress.py      # GET /jobs/{id}/progress (SSE)
│   │   │   └── actions.py       # retry, finalize, export
│   │   ├── services/
│   │   │   ├── document_svc.py  # document business logic
│   │   │   ├── job_svc.py       # job state transitions
│   │   │   ├── result_svc.py    # result creation and finalization
│   │   │   ├── export_svc.py    # JSON and CSV builders
│   │   │   └── storage.py       # StorageBackend interface + LocalStorage
│   │   ├── workers/
│   │   │   ├── celery_app.py    # Celery configuration
│   │   │   ├── tasks.py         # process_document task
│   │   │   └── publisher.py     # redis.publish wrapper + audit_log write
│   │   ├── models/
│   │   │   ├── document.py
│   │   │   ├── job.py
│   │   │   ├── result.py
│   │   │   └── audit_log.py
│   │   ├── schemas/             # Pydantic request/response DTOs
│   │   └── core/
│   │       ├── config.py        # pydantic-settings from .env
│   │       ├── database.py      # SQLAlchemy engine + session
│   │       └── redis.py         # Redis client singleton
│   ├── alembic/                 # Database migrations
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts        # typed fetch wrapper
│   │   │   └── types.ts         # shared TypeScript types
│   │   ├── pages/
│   │   │   ├── Upload.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── JobDetail.tsx
│   │   ├── components/
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── JobTable.tsx
│   │   │   └── ExportButton.tsx
│   │   └── hooks/
│   │       ├── useJobProgress.ts  # EventSource wrapper
│   │       └── useJobs.ts
│   └── Dockerfile
├── samples/
│   ├── input/                   # test files used during development
│   └── output/                  # sample exported JSON and CSV
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API reference

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `POST` | `/upload` | Upload one or more documents | `202` with `job_id` |
| `GET` | `/jobs` | List all jobs with search, filter, sort | `200` array |
| `GET` | `/jobs/{id}` | Get job + document + result detail | `200` object |
| `GET` | `/jobs/{id}/progress` | SSE stream of progress events | `text/event-stream` |
| `PUT` | `/jobs/{id}/review` | Save edited fields to reviewed_json | `200` |
| `PATCH` | `/jobs/{id}/finalize` | Mark result as finalized | `200` |
| `POST` | `/jobs/{id}/retry` | Retry a failed job | `202` |
| `GET` | `/jobs/{id}/export` | Export result as JSON or CSV | file download |
| `GET` | `/health` | Health check | `200` |

### Query parameters

`GET /jobs` accepts:
- `status` — filter by `queued`, `processing`, `completed`, `failed`
- `search` — filename substring search (case-insensitive)
- `sort` — sort field, default `uploaded_at`

`GET /jobs/{id}/export` accepts:
- `format` — `json` or `csv`

### Progress event shape

Every SSE message contains a JSON payload:

```json
{
  "event": "parsing_completed",
  "progress": 35,
  "message": "Text extracted from document",
  "job_id": "3f2a1b..."
}
```

Possible `event` values, in order: `job_queued`, `parsing_started`, `parsing_completed`, `extraction_started`, `extraction_completed`, `storing_result`, `job_completed`, `job_failed`.

---

## Database schema

```sql
documents
  id            UUID PRIMARY KEY
  filename      TEXT NOT NULL
  file_type     TEXT NOT NULL
  size_bytes    INTEGER NOT NULL
  storage_path  TEXT NOT NULL
  status        TEXT NOT NULL DEFAULT 'queued'
  uploaded_at   TIMESTAMP DEFAULT now()

jobs
  id              UUID PRIMARY KEY
  document_id     UUID REFERENCES documents(id)
  celery_task_id  TEXT
  status          TEXT NOT NULL DEFAULT 'queued'
  retry_count     INTEGER DEFAULT 0
  error_message   TEXT
  started_at      TIMESTAMP
  completed_at    TIMESTAMP

results
  id              UUID PRIMARY KEY
  job_id          UUID REFERENCES jobs(id)
  extracted_json  JSONB           -- raw output from worker
  reviewed_json   JSONB           -- user edits (null until edited)
  is_finalized    BOOLEAN DEFAULT false
  finalized_at    TIMESTAMP

audit_log
  id          UUID PRIMARY KEY
  job_id      UUID REFERENCES jobs(id)
  event       TEXT NOT NULL
  progress    INTEGER NOT NULL
  message     TEXT
  payload     JSONB
  created_at  TIMESTAMP DEFAULT now()
```

JSONB is used for `extracted_json` and `reviewed_json` because the extracted field schema is intentionally flexible — different document types can produce different field sets without requiring schema migrations.

---

## Processing workflow

Each uploaded document follows this pipeline inside the Celery worker:

```
[queued] → [processing]
              │
              ├─ Stage 1: Parse
              │    read file from storage
              │    extract text content
              │    capture filename, size, type metadata
              │    publish: parsing_started (10%) → parsing_completed (35%)
              │
              ├─ Stage 2: Extract fields
              │    derive title (first line or filename)
              │    classify category (keyword matching)
              │    generate summary (first 200 chars of text)
              │    extract keywords (top-5 by frequency)
              │    publish: extraction_started (50%) → extraction_completed (75%)
              │
              └─ Stage 3: Store result
                   write extracted_json to results table
                   update job.status → completed
                   publish: job_completed (100%)

On any exception → job.status = failed, publish: job_failed
```

Processing logic is intentionally simple — the system is designed to be evaluated on async architecture correctness, not AI extraction quality. The pipeline structure would remain identical if real OCR or LLM-based extraction were substituted for the current keyword logic.

---

## Progress tracking

Workers call `publish_event(job_id, event, progress)` at every stage transition. This function does two things atomically:

1. Publishes a JSON message to the Redis channel `job:{job_id}`
2. Writes the same payload as a row to the `audit_log` table

The SSE endpoint at `GET /jobs/{id}/progress`:

1. Reads all existing `audit_log` rows for the job and yields them immediately (history replay)
2. If the job is already completed or failed, closes the stream
3. Otherwise subscribes to `job:{job_id}` on Redis and yields each incoming message
4. Closes the stream when a terminal event (`job_completed` or `job_failed`) is received
5. Always unsubscribes from Redis in a `finally` block to prevent subscription leaks

The frontend uses the native `EventSource` API wrapped in a `useJobProgress` hook. On each message, it updates a progress bar and status badge. The connection closes automatically on terminal events.

---

## Assumptions

- **File types supported:** PDF and plain text (`.txt`). Other types are rejected with `415 Unsupported Media Type`.
- **Maximum file size:** 10MB per file, configurable via `MAX_FILE_SIZE_MB` in `.env`.
- **No authentication:** All endpoints are public. Job isolation is by `job_id` (UUID), not by user session.
- **Single worker:** The Celery worker runs as a single process with a concurrency of 4. Horizontal scaling would require a shared file storage backend (see limitations).
- **Processing is simulated:** A `time.sleep(1)` is added between stages to make progress visible in demos. This would be removed in production.
- **Retry limit:** Maximum 3 retries per job, enforced in the retry endpoint.

---

## Tradeoffs and limitations

### Local disk storage doesn't scale horizontally

The current `LocalStorage` implementation saves files to a Docker volume shared between the backend and worker containers. This works for a single-machine deployment but breaks if backend and worker are scaled to separate hosts. The `StorageBackend` interface is designed specifically for this — an `S3Storage` implementation would resolve it with no changes to the rest of the codebase.

### No authentication

Adding JWT authentication with FastAPI's dependency injection would be straightforward — `Depends(get_current_user)` on each route. Job access would then be scoped to the owning user's ID. This was intentionally omitted to keep scope focused on the async workflow, which is the primary evaluation criterion.

### Redis Pub/Sub has no message persistence

Redis Pub/Sub delivers messages only to currently-connected subscribers. The `audit_log` table mitigates this by persisting every event, allowing history replay on SSE connect. However, if the Postgres write fails inside `publish_event()`, the audit log and the Redis event can diverge. A production system would use Redis Streams instead of Pub/Sub, which provides durable, replayable message history natively.

### No chunked upload support

Files are uploaded in a single multipart request. Files over 10MB are rejected. Chunked upload (splitting large files into sequential parts) would require a more complex upload protocol and was out of scope for this assignment.

### SSE reconnection replays full history

When `EventSource` reconnects after a network drop, the browser sends the `Last-Event-ID` header. The current implementation ignores this and replays the full `audit_log` from the start. A production implementation would use `Last-Event-ID` to replay only the events the client missed.

---

## What I would do with more time

- **Redis Streams instead of Pub/Sub** — durable, replayable, supports consumer groups. Eliminates the need for the `audit_log` table as a workaround.
- **S3/MinIO storage** — implement `S3Storage` behind the existing interface. Workers would fetch files by key, enabling horizontal scaling.
- **Authentication** — JWT with FastAPI dependencies, scoping all job access to the authenticated user.
- **Integration tests** — full upload→process→finalize→export flow against a test database, not just unit tests on service functions.
- **Chunked upload** — for files over 10MB, using a multipart upload protocol with resumable chunks.
- **Cancellation support** — `celery.control.revoke(task_id, terminate=True)` can cancel in-flight tasks, though safe cancellation at an arbitrary stage requires additional coordination.
- **Proper task idempotency** — using a distributed lock (Redis SETNX) to guarantee a job is never processed twice, even under race conditions from concurrent retry requests.

---

## AI tools used

Claude was used during development to discuss system design tradeoffs, review architecture decisions.
