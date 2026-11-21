# syntax=docker/dockerfile:1

FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install -r requirements.txt


FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    FLASK_APP=run:app \
    FLASK_ENV=production

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system polosanca \
    && useradd --system --gid polosanca --home /app polosanca

COPY --from=builder /opt/venv /opt/venv
COPY --chown=polosanca:polosanca app ./app
COPY --chown=polosanca:polosanca migrations ./migrations
COPY --chown=polosanca:polosanca config.py run.py celery_worker.py init_db.py ./

USER polosanca

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:5000/health || exit 1

CMD ["gunicorn", "--worker-class", "gevent", "--workers", "2", "--worker-connections", "200", "--bind", "0.0.0.0:5000", "--timeout", "60", "--access-logfile", "-", "--error-logfile", "-", "run:app"]
