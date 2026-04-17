from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    upload_dir: str = "/app/uploads"
    max_file_size_mb: int = 10
    app_name: str = "DocFlow API"
    api_prefix: str = "/api"
    progress_channel_prefix: str = "docflow:job"

    class Config:
        env_file = ".env"


settings = Settings()


@lru_cache
def get_settings() -> Settings:
    return settings
