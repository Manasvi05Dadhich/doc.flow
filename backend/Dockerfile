FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

WORKDIR /app

COPY pyproject.toml /app/pyproject.toml
COPY app /app/app

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --prefer-binary .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
