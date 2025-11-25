"""
Celery Worker & Beat Entrypoint

Usage:
  celery -A celery_worker.celery_app worker --beat --loglevel=info
"""
from app import create_app
from app.services.tasks import celery_app

flask_app = create_app()

__all__ = ['celery_app', 'flask_app']
