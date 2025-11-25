"""
Data Integrity, Concurrency, and Query Guardrail Helpers
"""

import base64
import binascii
import csv
import hashlib
import hmac
import io
import ipaddress
import json
import math
import uuid
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Literal, overload

from flask import has_request_context, request
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app import db
from app.models import (
    Alert,
    AlertRuleType,
    AlertSeverity,
    AlertStatus,
    AuditLog,
    BranchAccessType,
    Equipment,
    EquipmentStatus,
    User,
    UserBranchAccess,
    UserRole,
)

# Default silence threshold (10 minutes) before equipment badge transitions to offline
DEFAULT_OFFLINE_TIMEOUT_SECONDS = 600

# Continuous normal-reading window required before auto-resolving open threshold/door alerts
ALERT_HYSTERESIS_SECONDS = 60

API_KEY_HASH_PREFIX = "sha256:"


def utc_now() -> datetime:
    """Return timezone-aware current UTC datetime."""
    return datetime.now(UTC)


@overload
def ensure_utc(dt: None) -> None: ...


@overload
def ensure_utc(dt: datetime) -> datetime: ...


def ensure_utc(dt: datetime | None) -> datetime | None:
    """Normalize a datetime to timezone-aware UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def parse_iso_datetime(value: str) -> datetime:
    """Parse an ISO-8601 timestamp string into a timezone-aware UTC datetime."""
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    return ensure_utc(parsed)


def clamp_pagination(
    page: int | None,
    limit: int | None,
    default_limit: int = 20,
    max_limit: int = 100,
) -> tuple[int, int]:
    """Clamp page >= 1 and 1 <= limit <= max_limit to prevent unbounded scans or negative offsets."""
    safe_page = page if isinstance(page, int) and page >= 1 else 1
    safe_limit = default_limit if not isinstance(limit, int) or limit < 1 else min(limit, max_limit)
    return safe_page, safe_limit


def encode_page_token(payload: Mapping[str, object]) -> str:
    """Encode a keyset cursor dict into an opaque URL-safe base64 page_token (AIP-158)."""
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_page_token(token: str) -> dict[str, object]:
    """Decode and validate an opaque page_token into a cursor dict, raising ValueError if invalid."""
    if not token or not isinstance(token, str):
        raise ValueError("Invalid page_token")
    padded = token.strip() + "=" * (-len(token.strip()) % 4)
    try:
        decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        data = json.loads(decoded)
    except (binascii.Error, UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError("Invalid page_token") from exc
    if not isinstance(data, dict):
        raise ValueError("Invalid page_token")
    return data


def hash_api_key(raw_key: str) -> str:
    """Hash a plaintext equipment API key with SHA-256 for storage at rest."""
    digest = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    return f"{API_KEY_HASH_PREFIX}{digest}"


def verify_api_key(raw_key: str, stored_key: str) -> bool:
    """Verify a plaintext API key in constant time against a SHA-256 hash (or legacy fixture key)."""
    if not raw_key or not stored_key:
        return False
    if stored_key.startswith(API_KEY_HASH_PREFIX):
        candidate = hash_api_key(raw_key)
        return hmac.compare_digest(candidate, stored_key)
    return hmac.compare_digest(raw_key, stored_key)


def get_allowed_branch_ids(user: User) -> list[uuid.UUID] | None:
    """
    Return the list of permitted branch UUIDs for a branch-restricted viewer,
    or None if the user has full company/global branch visibility.
    """
    if user.role == UserRole.COMPANY_VIEWER and user.branch_access_type == BranchAccessType.RESTRICTED:
        rows = db.session.query(UserBranchAccess.branch_id).filter(UserBranchAccess.user_id == user.id).all()
        return [row[0] for row in rows]
    return None


def recompute_equipment_status(
    equipment_id: uuid.UUID | str,
    now: datetime | None = None,
) -> Equipment | None:
    """
    Recompute and persist Equipment.status under a row-level lock (SELECT ... FOR UPDATE).

    Precedence:
      1. offline     — last_seen_at is None or silence >= DEFAULT_OFFLINE_TIMEOUT_SECONDS (600s)
      2. critical    — at least one open (active/acknowledged) critical alert
      3. warning     — at least one open (active/acknowledged) warning alert
      4. operational — recent heartbeat and zero open alerts
    """
    ref_now = ensure_utc(now) or utc_now()
    equipment = db.session.query(Equipment).filter(Equipment.id == equipment_id).with_for_update().first()
    if equipment is None:
        return None

    last_seen = ensure_utc(equipment.last_seen_at)
    if last_seen is None or (ref_now - last_seen).total_seconds() >= DEFAULT_OFFLINE_TIMEOUT_SECONDS:
        equipment.status = EquipmentStatus.OFFLINE
        return equipment

    open_severities = {
        row[0]
        for row in db.session.query(Alert.severity)
        .filter(
            Alert.equipment_id == equipment.id,
            Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
        )
        .distinct()
        .all()
    }

    if AlertSeverity.CRITICAL in open_severities:
        equipment.status = EquipmentStatus.CRITICAL
    elif AlertSeverity.WARNING in open_severities:
        equipment.status = EquipmentStatus.WARNING
    else:
        equipment.status = EquipmentStatus.OPERATIONAL

    return equipment


def create_alert_if_not_open(
    equipment_id: uuid.UUID | str,
    alert_rule_id: uuid.UUID | str | None,
    alert_type: AlertRuleType,
    severity: AlertSeverity,
    message: str,
    now: datetime | None = None,
) -> tuple[uuid.UUID | None, bool]:
    """
    Atomically insert an open Alert only if no open (active/acknowledged) alert already exists
    for (equipment_id, alert_rule_id), backed by the uq_open_alert_per_rule partial unique index.

    Returns (alert_id, created_bool).
    """
    ref_now = ensure_utc(now) or utc_now()
    new_id = uuid.uuid4()

    stmt = (
        pg_insert(Alert)
        .values(
            id=new_id,
            equipment_id=equipment_id,
            alert_rule_id=alert_rule_id,
            type=alert_type,
            severity=severity,
            message=message,
            status=AlertStatus.ACTIVE,
            created_at=ref_now,
        )
        .on_conflict_do_nothing(
            index_elements=["equipment_id", "alert_rule_id"],
            index_where=(
                Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]) & Alert.alert_rule_id.isnot(None)
            ),
        )
        .returning(Alert.id)
    )

    inserted_id = db.session.execute(stmt).scalar_one_or_none()
    if inserted_id is not None:
        return inserted_id, True
    return None, False


def auto_resolve_offline_alerts(equipment_id: uuid.UUID | str, now: datetime | None = None) -> int:
    """Resolve any open equipment_offline alerts immediately upon hardware heartbeat recovery."""
    ref_now = ensure_utc(now) or utc_now()
    return (
        db.session.query(Alert)
        .filter(
            Alert.equipment_id == equipment_id,
            Alert.type == AlertRuleType.EQUIPMENT_OFFLINE,
            Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
        )
        .update(
            {
                Alert.status: AlertStatus.RESOLVED,
                Alert.resolved_at: ref_now,
            },
            synchronize_session=False,
        )
    )


_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _sanitize_csv_cell(value: object) -> object:
    """Neutralize spreadsheet formula injection while preserving legitimate finite numbers."""
    if not isinstance(value, str) or not value:
        return value
    stripped = value.lstrip(" ")
    if stripped and stripped[0] in _CSV_FORMULA_PREFIXES:
        try:
            if math.isfinite(float(stripped)):
                return value
        except ValueError:
            pass
        return f"'{value}"
    return value


def format_csv_row(values: Sequence[object]) -> str:
    """Format a CSV row with spreadsheet formula-injection neutralization."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([_sanitize_csv_cell(v) for v in values])
    return buf.getvalue()


AuditEntityType = Literal[
    "company",
    "branch",
    "user",
    "equipment",
    "alert",
    "alert_rule",
    "maintenance_record",
]


def record_audit_log(
    user_id: uuid.UUID | str | None,
    action: str,
    entity_type: AuditEntityType,
    entity_id: uuid.UUID | str | None = None,
    changes: Mapping[str, object] | None = None,
) -> AuditLog:
    """
    Stage an AuditLog row in the current SQLAlchemy transaction.
    Automatically captures validated client IP (resolved via Werkzeug ProxyFix when configured)
    and User-Agent when in a Flask request context.
    """
    ip_addr = None
    user_agent = None
    if has_request_context():
        candidate_ip = (request.remote_addr or "").strip()
        if candidate_ip:
            try:
                ip_addr = str(ipaddress.ip_address(candidate_ip))
            except ValueError:
                ip_addr = None
        user_agent = request.headers.get("User-Agent")

    parsed_entity_id = None
    if entity_id is not None:
        parsed_entity_id = entity_id if isinstance(entity_id, uuid.UUID) else uuid.UUID(entity_id)

    parsed_user_id = None
    if user_id is not None:
        parsed_user_id = user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(user_id)

    entry = AuditLog(
        user_id=parsed_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=parsed_entity_id,
        changes=dict(changes) if changes is not None else None,
        ip_address=ip_addr,
        user_agent=user_agent,
    )
    db.session.add(entry)
    return entry
