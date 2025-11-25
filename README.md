# Polo Sanca — Refrigeration Equipment Monitoring System

Multi-tenant refrigeration equipment monitoring platform built with **Flask**, **PostgreSQL + TimescaleDB**, **Celery + Redis**, and **React 19 + Vite**.

## Documentation & Source-of-Truth Map

Each concern in this repository lives in **one canonical place** to prevent drift:

| Concern | Single Source of Truth | Purpose |
| :--- | :--- | :--- |
| **Product & Domain Rules** | [`PRD.md`](./PRD.md) | Roles/RBAC matrix, entity semantics, user flows, resolved v1 decisions, and Phase 2 roadmap |
| **API Wire Contract** | [`openapi.yaml`](./openapi.yaml) | Request/response schemas, query parameters, authentication headers, and HTTP status codes |
| **Database Schema** | [`app/models/`](./app/models/__init__.py) + [`migrations/`](./migrations) | SQLAlchemy models and Alembic migrations (including TimescaleDB hypertable & policies) |
| **Setup, Run & Testing** | [`README.md`](./README.md) | Local installation, backend/worker/frontend startup, Swagger UI, and `pytest` execution |
| **Active v1 Backlog** | [`TODO.md`](./TODO.md) | Prioritized engineering checklist for completing the v1 MVP |

## Tech Stack (v1 MVP)

- **Backend:** Python 3.10+, Flask 3.x, SQLAlchemy 2.x, Flask-Migrate (Alembic), Flask-JWT-Extended, Marshmallow, Flask-Limiter, Flask-Mail
- **Database:** PostgreSQL 14+ with TimescaleDB extension
- **Background Jobs & Cache:** Celery + Celery Beat + Redis (rule evaluation, 60s offline heartbeat sweep, async alert email dispatch, JWT JTI blocklist, rate limiting)
- **Frontend:** React 19, Vite, Ant Design (`antd` `pt-BR`), Recharts, Axios (30-second HTTP polling)

## Project Structure

```text
polosanca/
├── app/
│   ├── __init__.py          # Flask application factory
│   ├── models/              # SQLAlchemy models (single schema source)
│   ├── routes/              # REST API blueprints (/v1/*)
│   ├── services/            # Celery tasks & business logic
│   └── utils/               # Helpers (email, auth/RBAC, hashing)
├── frontend/                # React 19 + Vite SPA (pt-BR)
├── migrations/              # Alembic database migrations (+ TimescaleDB DDL)
├── tests/                   # End-to-end API flow tests (pytest)
├── api-docs.html            # Interactive Swagger UI viewer for openapi.yaml
├── config.py                # Environment configuration classes
├── init_db.py               # Local development seed script
├── openapi.yaml             # Canonical OpenAPI 3.0 contract
├── PRD.md                   # Product Requirements Document
├── requirements.txt         # Python dependencies
├── run.py                   # Flask development entry point
└── TODO.md                  # Active v1 implementation backlog
```

## Local Setup

### Prerequisites

- Python 3.10+
- Node.js 18+ & npm
- PostgreSQL 14+ with TimescaleDB extension
- Redis 6+

### 1. Database & Redis Setup

**macOS (Homebrew):**
```bash
brew install postgresql@14 timescaledb redis
timescaledb-tune --quiet --yes
brew services start postgresql@14
brew services start redis
```

Create the development and test databases with the TimescaleDB extension enabled:
```bash
psql postgres -c "CREATE DATABASE polosanca;"
psql postgres -c "CREATE DATABASE polosanca_test;"
psql polosanca -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
psql polosanca_test -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
```

### 2. Backend Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Configure `.env` with your local `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, and `JWT_SECRET_KEY`, then run migrations (and optional local seed data):
```bash
flask db upgrade
python init_db.py   # Optional: seeds demo company, branch, and test users
```

### 3. Frontend Setup

```bash
cd frontend
npm install
```

## Running the Application

Run the stack across separate terminals:

```bash
# 1. Flask API (http://localhost:5000)
source venv/bin/activate
python run.py

# 2. Celery Worker & Beat Scheduler
source venv/bin/activate
celery -A app.celery worker --beat --loglevel=info

# 3. React Frontend (http://localhost:5173)
cd frontend
npm run dev
```

**Production WSGI:**
```bash
gunicorn -w 4 --bind 0.0.0.0:5000 "app:create_app('production')"
```

## Interactive API Documentation

View [`openapi.yaml`](./openapi.yaml) in Swagger UI locally:
```bash
python3 -m http.server 8000
# Open http://localhost:8000/api-docs.html
```

## Running Tests

End-to-end API flow tests live in [`tests/`](./tests) and map directly to the user flows in [`PRD.md`](./PRD.md) Section 5 (`test_01_auth_flow.py`, `test_02_company_onboarding_flow.py`, `test_03_equipment_registration_flow.py`, `test_05_user_invitation_flow.py`, `test_06_branch_access_restriction_flow.py`, `test_09_equipment_data_ingestion_flow.py`, `test_10_branch_management_flow.py`).

Each test initializes a clean state in `TEST_DATABASE_URL` via [`tests/conftest.py`](./tests/conftest.py):

```bash
source venv/bin/activate
export TEST_DATABASE_URL="postgresql://localhost:5432/polosanca_test"

# Run full suite
pytest tests/

# Run with coverage
pytest --cov=app tests/

# Run a single flow file
pytest -v tests/test_09_equipment_data_ingestion_flow.py
```

## Code Formatting

```bash
black .
flake8
```
