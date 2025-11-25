"""
Celery Worker & Beat Tasks for Asynchronous Rule Evaluation, Offline Sweeps, and Alert Emails
"""

import logging
import uuid

from celery import Celery
from celery import Task as CeleryTask
from flask import Flask, has_app_context
from sqlalchemy.orm import joinedload

from app.models import Alert, Equipment
from app.services.alert_engine import (
    evaluate_all_active_equipment,
    evaluate_equipment_rules,
    get_alert_notification_recipients,
    sweep_offline_equipment,
)
from app.utils import parse_iso_datetime, send_alert_notification_email

logger = logging.getLogger(__name__)

celery_app = Celery("polosanca")


def init_celery(app: Flask) -> Celery:
    """Bind Celery configuration, Beat schedule, and Flask app context to `celery_app`."""
    interval = float(app.config.get("ALERT_EVALUATION_INTERVAL", 60))
    celery_app.conf.update(
        broker_url=app.config.get("CELERY_BROKER_URL"),
        result_backend=app.config.get("CELERY_RESULT_BACKEND"),
        task_serializer=app.config.get("CELERY_TASK_SERIALIZER", "json"),
        result_serializer=app.config.get("CELERY_RESULT_SERIALIZER", "json"),
        accept_content=app.config.get("CELERY_ACCEPT_CONTENT", ["json"]),
        timezone=app.config.get("CELERY_TIMEZONE", "UTC"),
        enable_utc=app.config.get("CELERY_ENABLE_UTC", True),
        task_always_eager=bool(app.config.get("CELERY_TASK_ALWAYS_EAGER", False)),
        task_eager_propagates=bool(app.config.get("CELERY_TASK_EAGER_PROPAGATES", False)),
        broker_connection_timeout=1,
        broker_connection_retry_on_startup=False,
        beat_schedule={
            "evaluate-active-equipment-every-60s": {
                "task": "polosanca.evaluate_all_active_equipment",
                "schedule": interval,
            },
            "sweep-offline-equipment-every-60s": {
                "task": "polosanca.sweep_offline_equipment",
                "schedule": interval,
            },
        },
    )

    class ContextTask(CeleryTask):
        abstract = True

        def __call__(self, *args: object, **kwargs: object) -> object:
            if has_app_context():
                return self.run(*args, **kwargs)
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app.Task = ContextTask
    return celery_app


@celery_app.task(
    bind=True,
    name="polosanca.send_alert_email",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=3,
)
def send_alert_email_task(self: CeleryTask, alert_id: str) -> dict[str, object]:
    """Dispatch a single email notification to active Company Admins and permitted Company Viewers."""
    alert = (
        Alert.query.options(joinedload(Alert.equipment).joinedload(Equipment.branch))
        .filter(Alert.id == alert_id)
        .first()
    )
    if not alert or not alert.equipment:
        return {"sent": False, "recipient_count": 0, "recipients": []}

    recipients = get_alert_notification_recipients(alert.equipment)
    emails = [u.email for u in recipients if u.email]
    if not emails:
        return {"sent": False, "recipient_count": 0, "recipients": []}

    branch_name = alert.equipment.branch.name if alert.equipment.branch else "Unknown Branch"
    sent = send_alert_notification_email(
        recipients=emails,
        alert_data={
            "alert_id": str(alert.id),
            "equipment_id": str(alert.equipment_id),
            "serial": alert.equipment.serial,
            "branch_name": branch_name,
            "severity": alert.severity.value,
            "rule_type": alert.type.value,
            "message": alert.message,
            "created_at": alert.created_at.isoformat() if alert.created_at else "",
        },
        raise_on_error=True,
    )
    return {"sent": sent, "recipient_count": len(emails), "recipients": emails}


def _dispatch_alert_email(alert_id: str) -> None:
    try:
        send_alert_email_task.delay(str(alert_id))
    except Exception as exc:
        logger.warning(f"Unable to enqueue send_alert_email_task for alert {alert_id}: {exc}")


@celery_app.task(name="polosanca.evaluate_equipment_rules")
def evaluate_equipment_rules_task(equipment_id: str, now_iso: str | None = None) -> dict[str, list[str]]:
    """Evaluate threshold/door rules and 60s hysteresis for one equipment unit."""
    ref_now = parse_iso_datetime(now_iso) if now_iso else None
    return evaluate_equipment_rules(
        equipment_id=equipment_id,
        now=ref_now,
        notify_callback=_dispatch_alert_email,
    )


@celery_app.task(name="polosanca.evaluate_all_active_equipment")
def evaluate_all_active_equipment_task(now_iso: str | None = None) -> dict[str, object]:
    """Periodic 60s Beat task evaluating threshold/door rules across all active equipment."""
    ref_now = parse_iso_datetime(now_iso) if now_iso else None
    return evaluate_all_active_equipment(
        now=ref_now,
        notify_callback=_dispatch_alert_email,
    )


@celery_app.task(name="polosanca.sweep_offline_equipment")
def sweep_offline_equipment_task(now_iso: str | None = None) -> dict[str, object]:
    """Periodic 60s Beat task flipping silent units (>= 600s) offline and evaluating equipment_offline rules."""
    ref_now = parse_iso_datetime(now_iso) if now_iso else None
    return sweep_offline_equipment(
        now=ref_now,
        notify_callback=_dispatch_alert_email,
    )


def enqueue_equipment_evaluation(equipment_id: uuid.UUID | str) -> None:
    """Safely trigger asynchronous (or eager test) rule evaluation after hardware telemetry ingestion."""
    try:
        evaluate_equipment_rules_task.delay(str(equipment_id))
    except Exception as exc:
        logger.warning(f"Celery broker unavailable while enqueueing evaluation for {equipment_id}: {exc}")
