from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    upload_dir: str = "/app/uploads"
    max_file_size_mb: int = 10
    app_name: str = "DocFlow API"
    api_prefix: str = "/api"
    progress_channel_prefix: str = "docflow:job"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        if value.startswith("postgresql+psycopg://"):
            return value
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    class Config:
        env_file = ".env"


settings = Settings()


@lru_cache
def get_settings() -> Settings:
    return settings
