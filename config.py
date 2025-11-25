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
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-please-change-in-production'
    DEBUG = False
    TESTING = False

    # Database
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'postgresql://user:password@localhost:5432/polosanca'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
    }

    # JWT
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or SECRET_KEY
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    JWT_TOKEN_LOCATION = ['headers']
    JWT_HEADER_NAME = 'Authorization'
    JWT_HEADER_TYPE = 'Bearer'

    # CORS
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*').split(',')

    # Redis (for Celery and caching)
    REDIS_URL = os.environ.get('REDIS_URL') or 'redis://localhost:6379/0'

    # Celery
    CELERY_BROKER_URL = REDIS_URL
    CELERY_RESULT_BACKEND = REDIS_URL
    CELERY_TASK_SERIALIZER = 'json'
    CELERY_RESULT_SERIALIZER = 'json'
    CELERY_ACCEPT_CONTENT = ['json']
    CELERY_TIMEZONE = 'UTC'
    CELERY_ENABLE_UTC = True

    # SocketIO
    SOCKETIO_MESSAGE_QUEUE = REDIS_URL
    SOCKETIO_ASYNC_MODE = 'gevent'

    # Pagination
    DEFAULT_PAGE_SIZE = 20
    MAX_PAGE_SIZE = 100
    TELEMETRY_DEFAULT_PAGE_SIZE = 100
    TELEMETRY_MAX_PAGE_SIZE = 1000

    # Alert Evaluation
    ALERT_EVALUATION_INTERVAL = 60  # seconds

    # File Upload
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size


class DevelopmentConfig(Config):
    """Development environment configuration"""
    DEBUG = True
    SQLALCHEMY_ECHO = True  # Log all SQL queries


class TestingConfig(Config):
    """Testing environment configuration"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('TEST_DATABASE_URL') or \
        'postgresql://user:password@localhost:5432/polosanca_test'
    # Use shorter token expiry for tests
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)


class ProductionConfig(Config):
    """Production environment configuration"""
    # Ensure critical settings are from environment variables
    SECRET_KEY = os.environ.get('SECRET_KEY')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY')

    if not SECRET_KEY or not JWT_SECRET_KEY:
        raise ValueError(
            "SECRET_KEY and JWT_SECRET_KEY must be set in production environment"
        )

    # Stricter CORS in production
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '').split(',')

    # Performance optimizations
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 20,
        'max_overflow': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
    }


# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}


def get_config():
    """Get configuration based on FLASK_ENV environment variable"""
    env = os.environ.get('FLASK_ENV', 'development')
    return config.get(env, config['default'])
