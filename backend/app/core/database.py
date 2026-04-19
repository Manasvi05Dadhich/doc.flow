from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    # Import models here so SQLAlchemy metadata is fully registered before create_all.
    from app.models.audit_log import AuditLog  # noqa: F401
    from app.models.document import Document  # noqa: F401
    from app.models.job import Job  # noqa: F401
    from app.models.result import Result  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_runtime_columns()


def _ensure_runtime_columns() -> None:
    inspector = inspect(engine)

    job_columns = {column["name"] for column in inspector.get_columns("jobs")}
    result_columns = {column["name"] for column in inspector.get_columns("results")}

    statements: list[str] = []
    if "retry_count" not in job_columns:
        statements.append("ALTER TABLE jobs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0")
    if "reviewed_json" not in result_columns:
        statements.append("ALTER TABLE results ADD COLUMN reviewed_json JSON NOT NULL DEFAULT '{}'::json")
    if "is_finalized" not in result_columns:
        statements.append("ALTER TABLE results ADD COLUMN is_finalized BOOLEAN NOT NULL DEFAULT FALSE")
    if "finalized_at" not in result_columns:
        statements.append("ALTER TABLE results ADD COLUMN finalized_at TIMESTAMP NULL")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
