"""
Core Alerting Engine & Offline Operations Service

Implements:
1. Shared (rule_type, severity) priority resolution: equipment (1) > company (2) > global (3)
2. Sustained duration_seconds breach evaluation across live hardware ('device') telemetry
3. 60-second sustained normal-reading hysteresis before auto-resolving open threshold/door alerts
4. Periodic 60s offline heartbeat sweep: 10-minute (600s) default offline badge + equipment_offline rules
5. Tenant- and UserBranchAccess-scoped alert recipient resolution
"""

import re
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from app import db
from app.models import (
    Alert,
    AlertRule,
    AlertRuleScope,
    AlertRuleType,
    AlertStatus,
    BranchAccessType,
    Company,
    CompanyStatus,
    ComparisonOperator,
    Equipment,
    EquipmentStatus,
    Telemetry,
    User,
    UserBranchAccess,
    UserRole,
    UserStatus,
)
from app.utils import (
    ALERT_HYSTERESIS_SECONDS,
    DEFAULT_OFFLINE_TIMEOUT_SECONDS,
    create_alert_if_not_open,
    ensure_utc,
    recompute_equipment_status,
    utc_now,
)

SCOPE_PRIORITY: dict[AlertRuleScope, int] = {
    AlertRuleScope.EQUIPMENT: 1,
    AlertRuleScope.COMPANY: 2,
    AlertRuleScope.GLOBAL: 3,
}

THRESHOLD_AND_DOOR_TYPES = {
    AlertRuleType.TEMPERATURE_HIGH,
    AlertRuleType.TEMPERATURE_LOW,
    AlertRuleType.PRESSURE_HIGH,
    AlertRuleType.PRESSURE_LOW,
    AlertRuleType.DOOR_OPEN,
}


_TEMPLATE_PLACEHOLDER_RE = re.compile(r"\{([a-z_]+)\}")


def format_alert_message(
    rule: AlertRule,
    equipment: Equipment,
    current_value: float | int | Decimal | None = None,
    silence_seconds: int | None = None,
) -> str:
    """Safely render an AlertRule message_template with strict allowlisted placeholder substitution."""
    template = (rule.message_template or "").strip()
    operator_str = rule.comparison_operator.value if rule.comparison_operator else ""
    threshold_val = float(rule.threshold_value) if rule.threshold_value is not None else None

    if not template:
        if rule.rule_type == AlertRuleType.DOOR_OPEN:
            return f"{equipment.serial} door remained open for >= {rule.duration_seconds}s"
        if rule.rule_type == AlertRuleType.EQUIPMENT_OFFLINE:
            elapsed = silence_seconds if silence_seconds is not None else rule.duration_seconds
            return f"{equipment.serial} offline for {elapsed}s (threshold {rule.duration_seconds}s)"
        return f"{equipment.serial} breached {rule.rule_type.value}: {current_value} {operator_str} {threshold_val}"

    ctx = {
        "serial": equipment.serial,
        "equipment_serial": equipment.serial,
        "rule_name": rule.name,
        "rule_type": rule.rule_type.value,
        "severity": rule.severity.value,
        "threshold": threshold_val,
        "threshold_value": threshold_val,
        "operator": operator_str,
        "comparison_operator": operator_str,
        "duration_seconds": rule.duration_seconds,
        "value": current_value,
        "current_value": current_value,
        "silence_seconds": silence_seconds if silence_seconds is not None else rule.duration_seconds,
    }
    return _TEMPLATE_PLACEHOLDER_RE.sub(
        lambda m: str(ctx[m.group(1)]) if m.group(1) in ctx else m.group(0),
        template,
    )


def resolve_equipment_alert_rules(
    equipment: Equipment,
    active_only: bool = False,
) -> list[tuple[AlertRule, int, bool]]:
    """
    Fetch all rules applicable to an Equipment unit and resolve priority per (rule_type, severity).

    Priority order:
      1 = equipment (scope_id == equipment.id)
      2 = company   (scope_id == equipment.company_id)
      3 = global    (scope_id IS NULL)

    Only active rules (`is_active == True`) can be effective or shadow lower-priority rules for the
    same `(rule_type, severity)` pair.

    Returns a list of `(rule, priority, is_effective)` ordered by `(priority, rule_type, severity)`.
    """
    query = AlertRule.query.filter(
        or_(
            AlertRule.scope == AlertRuleScope.GLOBAL,
            (AlertRule.scope == AlertRuleScope.COMPANY) & (AlertRule.scope_id == equipment.company_id),
            (AlertRule.scope == AlertRuleScope.EQUIPMENT) & (AlertRule.scope_id == equipment.id),
        )
    )
    if active_only:
        query = query.filter(AlertRule.is_active.is_(True))

    rules = query.all()
    rules.sort(
        key=lambda r: (
            SCOPE_PRIORITY[r.scope],
            r.rule_type.value,
            r.severity.value,
            ensure_utc(r.created_at) or datetime.min.replace(tzinfo=utc_now().tzinfo),
        )
    )

    claimed_pairs: set[tuple[AlertRuleType, object]] = set()
    resolved: list[tuple[AlertRule, int, bool]] = []
    for rule in rules:
        prio = SCOPE_PRIORITY[rule.scope]
        pair = (rule.rule_type, rule.severity)
        if rule.is_active and pair not in claimed_pairs:
            claimed_pairs.add(pair)
            is_eff = True
        else:
            is_eff = False
        resolved.append((rule, prio, is_eff))

    return resolved


def serialize_equipment_alert_rules(equipment: Equipment) -> list[dict[str, object]]:
    """Serialize applicable rules for GET /v1/equipments/<id>/alert-rules with priority and is_effective."""
    serialized = []
    for rule, priority, is_effective in resolve_equipment_alert_rules(equipment, active_only=False):
        item = rule.to_dict()
        item["priority"] = priority
        item["is_effective"] = is_effective
        serialized.append(item)
    return serialized


def get_effective_active_rules(equipment: Equipment) -> list[AlertRule]:
    """Return only the winning active rules per (rule_type, severity) for an Equipment unit."""
    return [rule for rule, _prio, is_eff in resolve_equipment_alert_rules(equipment, active_only=True) if is_eff]


def get_alert_notification_recipients(equipment: Equipment) -> list[User]:
    """
    Resolve active notification recipients for an equipment alert:
    - Active Company Admins of equipment.company_id
    - Active Company Viewers of equipment.company_id with FULL access, or RESTRICTED access including equipment.branch_id
    """
    company = db.session.get(Company, equipment.company_id)
    if not company or company.status != CompanyStatus.ACTIVE:
        return []

    permitted_restricted_users = (
        db.session.query(UserBranchAccess.user_id).filter(UserBranchAccess.branch_id == equipment.branch_id).subquery()
    )

    return (
        User.query.filter(
            User.company_id == equipment.company_id,
            User.status == UserStatus.ACTIVE,
            or_(
                User.role == UserRole.COMPANY_ADMIN,
                (User.role == UserRole.COMPANY_VIEWER) & (User.branch_access_type == BranchAccessType.FULL),
                (User.role == UserRole.COMPANY_VIEWER)
                & (User.branch_access_type == BranchAccessType.RESTRICTED)
                & User.id.in_(db.session.query(permitted_restricted_users.c.user_id)),
            ),
        )
        .order_by(User.email.asc())
        .all()
    )


def _compare_numeric(lhs: Decimal, op: ComparisonOperator, rhs: Decimal) -> bool:
    if op == ComparisonOperator.GT:
        return lhs > rhs
    if op == ComparisonOperator.LT:
        return lhs < rhs
    if op == ComparisonOperator.GTE:
        return lhs >= rhs
    if op == ComparisonOperator.LTE:
        return lhs <= rhs
    return lhs == rhs


def is_reading_breaching(rule: AlertRule, reading: Telemetry) -> tuple[bool, float | int | None]:
    """Check whether a single live hardware ('device') reading breaches a threshold or door_open rule."""
    if rule.rule_type in (AlertRuleType.TEMPERATURE_HIGH, AlertRuleType.TEMPERATURE_LOW):
        if reading.temperature is None or rule.threshold_value is None or rule.comparison_operator is None:
            return False, None
        val = Decimal(str(reading.temperature))
        thresh = Decimal(str(rule.threshold_value))
        return _compare_numeric(val, rule.comparison_operator, thresh), float(val)

    if rule.rule_type in (AlertRuleType.PRESSURE_HIGH, AlertRuleType.PRESSURE_LOW):
        if reading.pressure is None or rule.threshold_value is None or rule.comparison_operator is None:
            return False, None
        val = Decimal(str(reading.pressure))
        thresh = Decimal(str(rule.threshold_value))
        return _compare_numeric(val, rule.comparison_operator, thresh), float(val)

    if rule.rule_type == AlertRuleType.DOOR_OPEN:
        if reading.door is None:
            return False, None
        return reading.door == 1, reading.door

    return False, None


def _has_sustained_breach(
    equipment_id: uuid.UUID | str,
    rule: AlertRule,
    ref_now: datetime,
) -> tuple[bool, float | int | None]:
    """
    Verify that live hardware ('device') telemetry has continuously breached `rule` for `rule.duration_seconds`.
    """
    latest = (
        Telemetry.query.filter(
            Telemetry.equipment_id == equipment_id,
            Telemetry.source == "device",
            Telemetry.time <= ref_now,
        )
        .order_by(Telemetry.time.desc(), Telemetry.id.desc())
        .first()
    )
    if latest is None:
        return False, None

    breaching_now, latest_val = is_reading_breaching(rule, latest)
    if not breaching_now:
        return False, latest_val

    duration = max(rule.duration_seconds or 0, 0)
    if duration == 0:
        return True, latest_val

    window_start = ref_now - timedelta(seconds=duration)

    # All readings inside (window_start, ref_now] must be breaching
    window_readings = (
        Telemetry.query.filter(
            Telemetry.equipment_id == equipment_id,
            Telemetry.source == "device",
            Telemetry.time >= window_start,
            Telemetry.time <= ref_now,
        )
        .order_by(Telemetry.time.asc(), Telemetry.id.asc())
        .all()
    )
    for sample in window_readings:
        sample_breach, _ = is_reading_breaching(rule, sample)
        if not sample_breach:
            return False, latest_val

    # Check if breach started at or before window_start
    first_time = ensure_utc(window_readings[0].time) if window_readings else None
    if first_time is not None and first_time <= window_start:
        return True, latest_val

    prior_reading = (
        Telemetry.query.filter(
            Telemetry.equipment_id == equipment_id,
            Telemetry.source == "device",
            Telemetry.time < window_start,
        )
        .order_by(Telemetry.time.desc(), Telemetry.id.desc())
        .first()
    )
    if prior_reading is not None:
        prior_breach, _ = is_reading_breaching(rule, prior_reading)
        if prior_breach:
            return True, latest_val

    return False, latest_val


def _has_sustained_normal_for_hysteresis(
    equipment_id: uuid.UUID | str,
    rule: AlertRule,
    alert_created_at: datetime,
    ref_now: datetime,
) -> bool:
    """
    Return True only if live hardware ('device') telemetry has remained continuously within normal bounds
    for at least ALERT_HYSTERESIS_SECONDS (60s), preventing sensor-flapping email storms.
    """
    hysteresis_start = ref_now - timedelta(seconds=ALERT_HYSTERESIS_SECONDS)
    lookback_floor = min(ensure_utc(alert_created_at), hysteresis_start)

    recent_readings = (
        Telemetry.query.filter(
            Telemetry.equipment_id == equipment_id,
            Telemetry.source == "device",
            Telemetry.time >= lookback_floor,
            Telemetry.time <= ref_now,
        )
        .order_by(Telemetry.time.asc(), Telemetry.id.asc())
        .all()
    )
    if not recent_readings:
        return False

    # Latest reading must be normal
    latest_breach, _ = is_reading_breaching(rule, recent_readings[-1])
    if latest_breach:
        return False

    # Walk backwards to find the earliest continuous normal reading after any breach (and >= alert_created_at)
    alert_created_utc = ensure_utc(alert_created_at)
    earliest_continuous_normal: datetime | None = None
    for sample in reversed(recent_readings):
        sample_breach, _ = is_reading_breaching(rule, sample)
        if sample_breach:
            break
        sample_time = ensure_utc(sample.time)
        if sample_time is not None and sample_time >= alert_created_utc:
            earliest_continuous_normal = sample_time

    if earliest_continuous_normal is None:
        return False

    return (ref_now - earliest_continuous_normal).total_seconds() >= ALERT_HYSTERESIS_SECONDS


def _auto_resolve_threshold_alerts(equipment_id: uuid.UUID | str, ref_now: datetime) -> list[str]:
    """Auto-resolve open threshold/door alerts that have remained normal continuously for >= 60s."""
    open_alerts = (
        Alert.query.options(joinedload(Alert.alert_rule))
        .filter(
            Alert.equipment_id == equipment_id,
            Alert.type.in_(THRESHOLD_AND_DOOR_TYPES),
            Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
        )
        .all()
    )
    resolved_alert_ids: list[str] = []
    for open_alert in open_alerts:
        if open_alert.alert_rule is None:
            continue
        if _has_sustained_normal_for_hysteresis(
            equipment_id,
            open_alert.alert_rule,
            open_alert.created_at,
            ref_now,
        ):
            open_alert.status = AlertStatus.RESOLVED
            open_alert.resolved_at = ref_now
            resolved_alert_ids.append(str(open_alert.id))
    return resolved_alert_ids


def _evaluate_threshold_rules(equipment: Equipment, ref_now: datetime) -> list[str]:
    """Evaluate effective active threshold & door_open rules and create alerts for sustained breaches."""
    effective_rules = [
        rule for rule in get_effective_active_rules(equipment) if rule.rule_type in THRESHOLD_AND_DOOR_TYPES
    ]
    created_alert_ids: list[str] = []
    for rule in effective_rules:
        breached, current_val = _has_sustained_breach(equipment.id, rule, ref_now)
        if not breached:
            continue

        msg = format_alert_message(rule, equipment, current_value=current_val)
        inserted_id, created = create_alert_if_not_open(
            equipment_id=equipment.id,
            alert_rule_id=rule.id,
            alert_type=rule.rule_type,
            severity=rule.severity,
            message=msg,
            now=ref_now,
        )
        if created and inserted_id is not None:
            created_alert_ids.append(str(inserted_id))
    return created_alert_ids


def evaluate_equipment_rules(
    equipment_id: uuid.UUID | str,
    now: datetime | None = None,
    notify_callback: Callable[[str], None] | None = None,
) -> dict[str, list[str]]:
    """
    Evaluate threshold & door_open alert rules and 60s auto-resolution hysteresis for a single Equipment unit.
    """
    ref_now = ensure_utc(now) or utc_now()
    eq_uuid = equipment_id if isinstance(equipment_id, uuid.UUID) else uuid.UUID(equipment_id)

    equipment = Equipment.query.options(joinedload(Equipment.company)).filter(Equipment.id == eq_uuid).first()
    if (
        not equipment
        or not equipment.is_active
        or (equipment.company and equipment.company.status != CompanyStatus.ACTIVE)
    ):
        return {"created_alert_ids": [], "resolved_alert_ids": []}

    last_seen = ensure_utc(equipment.last_seen_at)
    if last_seen is None or (ref_now - last_seen).total_seconds() >= DEFAULT_OFFLINE_TIMEOUT_SECONDS:
        # Stale/offline hardware is handled by sweep_offline_equipment; do not evaluate stale sensor data
        return {"created_alert_ids": [], "resolved_alert_ids": []}

    resolved_alert_ids = _auto_resolve_threshold_alerts(equipment.id, ref_now)
    created_alert_ids = _evaluate_threshold_rules(equipment, ref_now)

    if created_alert_ids or resolved_alert_ids:
        db.session.flush()
        recompute_equipment_status(equipment.id, now=ref_now)
        db.session.commit()

    if notify_callback and created_alert_ids:
        for alert_id in created_alert_ids:
            notify_callback(alert_id)

    return {
        "created_alert_ids": created_alert_ids,
        "resolved_alert_ids": resolved_alert_ids,
    }


def evaluate_all_active_equipment(
    now: datetime | None = None,
    notify_callback: Callable[[str], None] | None = None,
) -> dict[str, object]:
    """Periodic 60s evaluation sweep across all active equipment belonging to active companies."""
    ref_now = ensure_utc(now) or utc_now()
    active_ids = [
        row[0]
        for row in db.session.query(Equipment.id)
        .join(Company, Company.id == Equipment.company_id)
        .filter(
            Equipment.is_active.is_(True),
            Company.status == CompanyStatus.ACTIVE,
        )
        .all()
    ]

    total_created: list[str] = []
    total_resolved: list[str] = []
    for eq_id in active_ids:
        res = evaluate_equipment_rules(eq_id, now=ref_now, notify_callback=notify_callback)
        total_created.extend(res["created_alert_ids"])
        total_resolved.extend(res["resolved_alert_ids"])

    return {
        "evaluated_equipment_count": len(active_ids),
        "created_alert_ids": total_created,
        "resolved_alert_ids": total_resolved,
    }


def _mark_equipment_offline_locked(equipment_id: uuid.UUID | str, flipped_offline_ids: list[str]) -> bool:
    """Lock an Equipment row and flip its status to OFFLINE if not already offline."""
    locked_eq = db.session.query(Equipment).filter(Equipment.id == equipment_id).with_for_update().first()
    if locked_eq and locked_eq.status != EquipmentStatus.OFFLINE:
        locked_eq.status = EquipmentStatus.OFFLINE
        if str(locked_eq.id) not in flipped_offline_ids:
            flipped_offline_ids.append(str(locked_eq.id))
        return True
    return False


def _sweep_single_offline_equipment(
    eq: Equipment,
    ref_now: datetime,
    flipped_offline_ids: list[str],
    created_alert_ids: list[str],
) -> None:
    """Check default offline timeout and equipment_offline rules for a single Equipment unit."""
    silence_anchor = ensure_utc(eq.last_seen_at) or ensure_utc(eq.created_at) or ref_now
    silence_seconds = (ref_now - silence_anchor).total_seconds()

    changed = False
    # 1. Default 10-minute (600s) silence badge transition even without any alert rule
    if silence_seconds >= DEFAULT_OFFLINE_TIMEOUT_SECONDS and eq.status != EquipmentStatus.OFFLINE:
        changed = _mark_equipment_offline_locked(eq.id, flipped_offline_ids)

    # 2. Evaluate effective active equipment_offline rules
    offline_rules = [
        rule for rule in get_effective_active_rules(eq) if rule.rule_type == AlertRuleType.EQUIPMENT_OFFLINE
    ]
    for rule in offline_rules:
        if silence_seconds < max(rule.duration_seconds or 0, 0):
            continue

        if _mark_equipment_offline_locked(eq.id, flipped_offline_ids):
            changed = True

        msg = format_alert_message(
            rule,
            eq,
            silence_seconds=int(silence_seconds),
        )
        inserted_id, created = create_alert_if_not_open(
            equipment_id=eq.id,
            alert_rule_id=rule.id,
            alert_type=AlertRuleType.EQUIPMENT_OFFLINE,
            severity=rule.severity,
            message=msg,
            now=ref_now,
        )
        if created and inserted_id is not None:
            created_alert_ids.append(str(inserted_id))
            changed = True

    if changed:
        db.session.commit()


def sweep_offline_equipment(
    now: datetime | None = None,
    notify_callback: Callable[[str], None] | None = None,
) -> dict[str, object]:
    """
    Periodic 60s offline heartbeat sweep across active equipment:
    1. Flips equipment.status to OFFLINE after DEFAULT_OFFLINE_TIMEOUT_SECONDS (600s / 10 min) of silence by default
    2. Evaluates effective active equipment_offline rules (Equipment > Company > Global per severity):
       when silence >= rule.duration_seconds, transitions status to OFFLINE, creates race-free alert,
       and triggers single email notification
    """
    ref_now = ensure_utc(now) or utc_now()
    equipments = (
        Equipment.query.join(Company, Company.id == Equipment.company_id)
        .filter(
            Equipment.is_active.is_(True),
            Company.status == CompanyStatus.ACTIVE,
        )
        .all()
    )

    flipped_offline_ids: list[str] = []
    created_alert_ids: list[str] = []

    for eq in equipments:
        _sweep_single_offline_equipment(eq, ref_now, flipped_offline_ids, created_alert_ids)

    if notify_callback and created_alert_ids:
        for alert_id in created_alert_ids:
            notify_callback(alert_id)

    return {
        "swept_equipment_count": len(equipments),
        "flipped_offline_ids": flipped_offline_ids,
        "created_alert_ids": created_alert_ids,
    }
