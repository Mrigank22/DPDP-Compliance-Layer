# services/workers/Dockerfile

FROM python:3.12-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

RUN addgroup --gid 10001 appgroup && \
    adduser  --uid 10001 --gid 10001 --disabled-password --gecos "" appuser

WORKDIR /app

# ── Dependencies ─────────────────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    python -m spacy download en_core_web_lg

# ── Application ───────────────────────────────────────────────────────────────
COPY app/ ./app/

RUN chown -R appuser:appgroup /app
USER appuser

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENV=production

# ── Health check (beat + workers both expose this) ────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD celery -A app.celery_app inspect ping --timeout 5 || exit 1

# Default: discovery worker. Override in docker-compose / Helm per queue.
CMD ["celery", "-A", "app.celery_app", "worker", \
     "--loglevel=info", "--queues=discovery", "--concurrency=4", \
     "--hostname=discovery@%h"]
