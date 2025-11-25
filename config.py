"""
Application Configuration
Supports multiple environments: development, testing, production
"""

import os
from datetime import timedelta

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Base configuration class"""

    # Flask
    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-secret-key-please-change-in-production"
    DEBUG = False
    TESTING = False

    # Database
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL") or "postgresql://user:password@localhost:5432/polosanca"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": 10,
        "pool_recycle": 3600,
        "pool_pre_ping": True,
    }

    # JWT
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY") or SECRET_KEY
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"

    # CORS (explicit origins by default; never default to "*")
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if origin.strip()
    ]

    # Trusted reverse-proxy hop count for Werkzeug ProxyFix (0 = direct client connection)
    TRUSTED_PROXY_HOPS = int(os.environ.get("TRUSTED_PROXY_HOPS", 0))

    # Redis (for Celery and caching)
    REDIS_URL = os.environ.get("REDIS_URL") or "redis://localhost:6379/0"

    # Celery
    CELERY_BROKER_URL = REDIS_URL
    CELERY_RESULT_BACKEND = REDIS_URL
    CELERY_TASK_SERIALIZER = "json"
    CELERY_RESULT_SERIALIZER = "json"
    CELERY_ACCEPT_CONTENT = ["json"]
    CELERY_TIMEZONE = "UTC"
    CELERY_ENABLE_UTC = True
    CELERY_TASK_ALWAYS_EAGER = False
    CELERY_TASK_EAGER_PROPAGATES = False

    # Rate Limiting (Flask-Limiter backed by Redis in dev/prod, memory in tests)
    RATELIMIT_STORAGE_URI = REDIS_URL
    RATELIMIT_HEADERS_ENABLED = True

    # Pagination
    DEFAULT_PAGE_SIZE = 20
    MAX_PAGE_SIZE = 100
    TELEMETRY_DEFAULT_PAGE_SIZE = 100
    TELEMETRY_MAX_PAGE_SIZE = 1000

    # Alert Evaluation
    ALERT_EVALUATION_INTERVAL = 60  # seconds

    # File Upload
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size

    # Email Configuration
    MAIL_SERVER = os.environ.get("MAIL_SERVER")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "true").lower() in ["true", "1", "yes"]
    MAIL_USE_SSL = os.environ.get("MAIL_USE_SSL", "false").lower() in ["true", "1", "yes"]
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", "noreply@polosanca.com")

    # Frontend URL for invitation links
    FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


class DevelopmentConfig(Config):
    """Development environment configuration"""

    DEBUG = True
    SQLALCHEMY_ECHO = True  # Log all SQL queries


class TestingConfig(Config):
    """Testing environment configuration"""

    TESTING = True
    SQLALCHEMY_DATABASE_URI = (
        os.environ.get("TEST_DATABASE_URL") or "postgresql://user:password@localhost:5432/polosanca_test"
    )
    # Use shorter token expiry, in-memory rate-limit storage, and eager Celery execution for tests
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)
    RATELIMIT_STORAGE_URI = "memory://"
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True


class ProductionConfig(Config):
    """Production environment configuration"""

    # Ensure critical settings are from environment variables
    _prod_secret_key = os.environ.get("SECRET_KEY")
    _prod_jwt_secret_key = os.environ.get("JWT_SECRET_KEY")

    if not _prod_secret_key or not _prod_jwt_secret_key:
        raise ValueError("SECRET_KEY and JWT_SECRET_KEY must be set in production environment")

    SECRET_KEY: str = _prod_secret_key
    JWT_SECRET_KEY: str = _prod_jwt_secret_key

    # Stricter CORS in production
    CORS_ORIGINS = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip()]
    TRUSTED_PROXY_HOPS = int(os.environ.get("TRUSTED_PROXY_HOPS", 1))

    # Performance optimizations
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": 20,
        "max_overflow": 10,
        "pool_recycle": 3600,
        "pool_pre_ping": True,
    }


# Configuration dictionary
config: dict[str, type[Config]] = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}


def get_config() -> type[Config]:
    """Get configuration based on FLASK_ENV environment variable"""
    env = os.environ.get("FLASK_ENV", "development")
    return config.get(env, config["default"])
