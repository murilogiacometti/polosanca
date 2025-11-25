# Polo Sanca - Refrigeration Equipment Monitoring System

A multi-tenant refrigeration equipment monitoring system built with Flask, PostgreSQL, and TimescaleDB.

## Features

- Multi-tenant architecture with company and branch management
- Role-based access control (Global Admins, Company Admins, Company Viewers)
- Branch-level access restrictions for viewers
- Equipment registration and monitoring
- Real-time telemetry data ingestion
- Configurable alert rules with threshold-based triggers
- Alert acknowledgment workflow
- Maintenance record tracking
- JWT-based authentication
- RESTful API with versioning
- Real-time updates via WebSockets (SocketIO)

## Tech Stack

- **Backend:** Flask 3.0, SQLAlchemy, Flask-JWT-Extended
- **Database:** PostgreSQL 14+ with TimescaleDB extension
- **Task Queue:** Celery with Redis
- **Real-time:** Flask-SocketIO with Redis message queue

## Project Structure

```
polosanca/
├── app/
│   ├── __init__.py          # Application factory
│   ├── models/              # SQLAlchemy models
│   │   └── __init__.py
│   ├── routes/              # API blueprints
│   │   ├── auth.py          # Authentication endpoints
│   │   ├── companies.py     # Company management
│   │   ├── branches.py      # Branch management
│   │   ├── users.py         # User management
│   │   ├── equipments.py    # Equipment management
│   │   ├── telemetry.py     # Telemetry data
│   │   ├── alerts.py        # Alert management
│   │   ├── alert_rules.py   # Alert rule configuration
│   │   └── maintenance.py   # Maintenance records
│   ├── services/            # Business logic (TODO)
│   └── utils/               # Helper functions (TODO)
├── migrations/              # Alembic database migrations
├── tests/                   # Test files (TODO)
├── config.py                # Configuration classes
├── run.py                   # Application entry point
├── requirements.txt         # Python dependencies
├── .env.example             # Environment variables template
├── schema.sql               # Database schema
├── openapi.yaml             # API specification
└── README.md                # This file
```

## Prerequisites

- Python 3.10+
- PostgreSQL 14+ with TimescaleDB extension
- Redis 6+

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd polosanca
```

### 2. Create virtual environment

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Install PostgreSQL and TimescaleDB

**macOS (using Homebrew):**
```bash
brew install postgresql@14
brew install timescaledb

# Initialize TimescaleDB
timescaledb-tune --quiet --yes
```

**Ubuntu/Debian:**
```bash
sudo apt install postgresql-14 postgresql-14-timescaledb

# Enable TimescaleDB
echo "shared_preload_libraries = 'timescaledb'" | sudo tee -a /etc/postgresql/14/main/postgresql.conf
sudo systemctl restart postgresql
```

### 5. Install and start Redis

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt install redis-server
sudo systemctl start redis
```

### 6. Create database

```bash
# Connect to PostgreSQL
psql postgres

# Create database and user
CREATE DATABASE polosanca;
CREATE USER polosanca_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE polosanca TO polosanca_user;

# Connect to the new database
\c polosanca

# Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

# Exit psql
\q
```

### 7. Apply database schema

```bash
psql -U polosanca_user -d polosanca -f schema.sql
```

### 8. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your configuration
```

Update `.env` with your settings:
```env
DATABASE_URL=postgresql://polosanca_user:your_password@localhost:5432/polosanca
SECRET_KEY=<generate-secure-key>
JWT_SECRET_KEY=<generate-secure-key>
```

Generate secure keys:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 9. Initialize database migrations (optional)

```bash
flask db init
flask db migrate -m "Initial migration"
flask db upgrade
```

## Running the Application

### Development Mode

```bash
python run.py
```

The API will be available at: `http://localhost:5000`

### Production Mode

```bash
# Set environment
export FLASK_ENV=production

# Run with Gunicorn
gunicorn -w 4 -k gevent --bind 0.0.0.0:5000 "app:create_app()"
```

### Running Celery Worker

In a separate terminal:
```bash
celery -A app.celery worker --loglevel=info
```

## API Documentation

The API follows RESTful conventions with `/v1/` prefix for all endpoints.

Full API documentation is available in `openapi.yaml` (OpenAPI 3.0 format).

To view the interactive API documentation:
```bash
python3 -m http.server 8000
# Open http://localhost:8000/api-docs.html in your browser
```

### Authentication

Most endpoints require JWT authentication. Include the token in the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

### Equipment Telemetry

Equipment uses API key authentication for telemetry submission:

```
X-API-Key: <equipment-api-key>
```

### Example Requests

**Login:**
```bash
curl -X POST http://localhost:5000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@polosanca.com", "password": "password"}'
```

**Submit Telemetry:**
```bash
curl -X POST http://localhost:5000/v1/equipments/telemetry \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <equipment-api-key>" \
  -d '{
    "serial": "EQ-001",
    "temperature": -18.5,
    "pressure": 150.2,
    "door": 0,
    "heater": 1,
    "compressor": 1,
    "fan": 1
  }'
```

**Get Alerts:**
```bash
curl -X GET "http://localhost:5000/v1/alerts?status=active" \
  -H "Authorization: Bearer <jwt-token>"
```

## Development

### Code Style

This project follows PEP 8 style guide. Use Black for formatting:

```bash
black .
```

### Testing

```bash
pytest
pytest --cov=app tests/
```

### Database Migrations

After modifying models:

```bash
flask db migrate -m "Description of changes"
flask db upgrade
```

## Project Status

**Current Status:** Backend API initialized

**Completed:**
- ✅ Database schema design
- ✅ SQLAlchemy models
- ✅ Flask application structure
- ✅ Authentication system
- ✅ Basic CRUD endpoints
- ✅ API documentation

**TODO:**
- ⏳ Alert evaluation service (Celery tasks)
- ⏳ WebSocket real-time updates
- ⏳ Input validation and error handling
- ⏳ Unit and integration tests
- ⏳ Frontend application (React + Ant Design)
- ⏳ Deployment configuration
- ⏳ CI/CD pipeline

## Architecture

### User Roles

1. **Global Admin** (Polo Sanca)
   - Manage all companies, branches, and users
   - Configure alert rules
   - Full system access

2. **Company Admin**
   - Manage their company's branches and users
   - View all equipment and alerts for their company
   - Configure branch-level permissions

3. **Company Viewer**
   - View equipment and alerts
   - Can be restricted to specific branches
   - Read-only access

### Alert System

Alert rules can be configured at three scopes:
- **Global:** Apply to all equipment
- **Company:** Apply to all equipment in a company
- **Equipment:** Apply to specific equipment

Rules are evaluated based on priority: Equipment > Company > Global

### Time-Series Data

Telemetry data is stored in a TimescaleDB hypertable with:
- Automatic partitioning by time (1-day chunks)
- Compression for data older than 7 days
- Retention policy (2 years)
- Continuous aggregates for hourly/daily statistics

## License

[Add your license here]

## Support

For questions or issues, please contact [support@polosanca.com](mailto:support@polosanca.com)
