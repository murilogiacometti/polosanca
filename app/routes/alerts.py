"""
Alerts Routes
Alert management, statistics, streamed CSV exports, acknowledgment, and serialized equipment status recomputation
"""

from collections.abc import Iterator, Mapping
from typing import Protocol, Self, TypeVar

from flask import Blueprint, Response, jsonify, request, stream_with_context
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import ColumnElement, func
from sqlalchemy.orm import contains_eager, joinedload

from app import db
from app.models import (
    Alert,
    AlertSeverity,
    AlertStatus,
    Branch,
    Equipment,
    User,
    UserRole,
)
from app.schemas import AlertAcknowledgeSchema, validate_request_schema
from app.utils import (
    clamp_pagination,
    format_csv_row,
    get_allowed_branch_ids,
    parse_iso_datetime,
    recompute_equipment_status,
    record_audit_log,
    utc_now,
)

alerts_bp = Blueprint("alerts", __name__)
_alert_acknowledge_schema = AlertAcknowledgeSchema()


class _FilterableQuery(Protocol):
    def filter(self, *criterion: ColumnElement[bool]) -> Self: ...


_Q = TypeVar("_Q", bound=_FilterableQuery)


def _apply_alert_rbac_scope(query: _Q, user: User, company_id: str | None) -> _Q:
    """Apply tenant and branch-level RBAC scoping to an Alert+Equipment query."""
    if user.role != UserRole.GLOBAL_ADMIN:
        query = query.filter(Equipment.company_id == user.company_id)
        allowed_branches = get_allowed_branch_ids(user)
        if allowed_branches is not None:
            query = query.filter(Equipment.branch_id.in_(allowed_branches))
    elif company_id:
        query = query.filter(Equipment.company_id == company_id)
    return query


def _apply_alert_status_filter(query: _Q, status: str) -> tuple[_Q | None, str | None]:
    """Parse and apply single or comma-separated AlertStatus filters."""
    raw_statuses = [s.strip() for s in status.split(",") if s.strip()]
    try:
        parsed_statuses = [AlertStatus(s) for s in raw_statuses]
    except ValueError:
        return None, "Invalid status filter"

    if len(parsed_statuses) == 1:
        return query.filter(Alert.status == parsed_statuses[0]), None
    if parsed_statuses:
        return query.filter(Alert.status.in_(parsed_statuses)), None
    return query, None


def _apply_alert_date_filters(query: _Q, start_date: str | None, end_date: str | None) -> tuple[_Q | None, str | None]:
    """Parse and apply optional start_date/end_date bounds to an Alert query."""
    start_dt = None
    end_dt = None
    if start_date:
        try:
            start_dt = parse_iso_datetime(start_date)
            query = query.filter(Alert.created_at >= start_dt)
        except ValueError:
            return None, "Invalid start_date ISO timestamp"
    if end_date:
        try:
            end_dt = parse_iso_datetime(end_date)
            query = query.filter(Alert.created_at <= end_dt)
        except ValueError:
            return None, "Invalid end_date ISO timestamp"
    if start_dt and end_dt and start_dt > end_dt:
        return None, "start_date must be earlier than or equal to end_date"
    return query, None


def _apply_alert_filters(query: _Q, user: User, args: Mapping[str, str]) -> tuple[_Q | None, str | None]:
    """Apply tenant/branch RBAC and query-string filters to an Alert+Equipment joined query."""
    query = _apply_alert_rbac_scope(query, user, args.get("company_id"))

    equipment_id = args.get("equipment_id")
    if equipment_id:
        query = query.filter(Alert.equipment_id == equipment_id)

    branch_id = args.get("branch_id")
    if branch_id:
        query = query.filter(Equipment.branch_id == branch_id)

    status = args.get("status")
    if status:
        filtered_query, err = _apply_alert_status_filter(query, status)
        if err or filtered_query is None:
            return None, err
        query = filtered_query

    severity = args.get("severity")
    if severity:
        try:
            query = query.filter(Alert.severity == AlertSeverity(severity))
        except ValueError:
            return None, "Invalid severity filter"

    return _apply_alert_date_filters(query, args.get("start_date"), args.get("end_date"))


@alerts_bp.route("", methods=["GET"])
@jwt_required()
def get_alerts() -> tuple[Response, int]:
    """Get alerts with single-query Equipment eager loading, tenant/branch scoping, and pagination."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    page, limit = clamp_pagination(
        request.args.get("page", 1, type=int),
        request.args.get("limit", 20, type=int),
    )

    base_query = Alert.query.join(Alert.equipment).options(contains_eager(Alert.equipment))
    query, filter_err = _apply_alert_filters(base_query, user, request.args)
    if filter_err or query is None:
        return jsonify({"error": filter_err or "Invalid filter"}), 400

    query = query.order_by(Alert.created_at.desc())
    alerts = query.paginate(page=page, per_page=limit, error_out=False)

    return jsonify(
        {
            "alerts": [a.to_dict() for a in alerts.items],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": alerts.total,
                "total_pages": alerts.pages,
            },
        }
    ), 200


@alerts_bp.route("/export", methods=["GET"])
@jwt_required()
def export_alerts_csv() -> Response | tuple[Response, int]:
    """Stream filtered alerts as text/csv using yield_per server-side cursors."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    base_query = (
        db.session.query(Alert, Equipment.serial, Equipment.branch_id, Branch.name)
        .join(Equipment, Alert.equipment_id == Equipment.id)
        .join(Branch, Equipment.branch_id == Branch.id)
    )
    query, filter_err = _apply_alert_filters(base_query, user, request.args)
    if filter_err or query is None:
        return jsonify({"error": filter_err or "Invalid filter"}), 400

    ordered_query = query.order_by(Alert.created_at.desc())

    def generate() -> Iterator[str]:
        yield format_csv_row(
            [
                "id",
                "created_at",
                "serial",
                "branch_name",
                "branch_id",
                "equipment_id",
                "type",
                "severity",
                "status",
                "message",
                "acknowledged_at",
                "acknowledged_by",
                "acknowledgment_notes",
                "resolved_at",
            ]
        )
        cursor = ordered_query.execution_options(stream_results=True).yield_per(500)
        for alert_row, serial, branch_id, branch_name in cursor:
            yield format_csv_row(
                [
                    str(alert_row.id),
                    alert_row.created_at.isoformat() if alert_row.created_at else "",
                    serial or "",
                    branch_name or "",
                    str(branch_id) if branch_id else "",
                    str(alert_row.equipment_id),
                    alert_row.type.value,
                    alert_row.severity.value,
                    alert_row.status.value,
                    alert_row.message or "",
                    alert_row.acknowledged_at.isoformat() if alert_row.acknowledged_at else "",
                    str(alert_row.acknowledged_by) if alert_row.acknowledged_by else "",
                    alert_row.acknowledgment_notes or "",
                    alert_row.resolved_at.isoformat() if alert_row.resolved_at else "",
                ]
            )

    filename = f"alerts_export_{utc_now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        stream_with_context(generate()),
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@alerts_bp.route("/statistics", methods=["GET"])
@jwt_required()
def get_alert_statistics() -> tuple[Response, int]:
    """Active alert counts grouped by severity and rule type, scoped to caller permissions."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    query = (
        db.session.query(
            Alert.severity,
            Alert.type,
            func.count(Alert.id).label("cnt"),
        )
        .join(Equipment, Alert.equipment_id == Equipment.id)
        .filter(Alert.status == AlertStatus.ACTIVE)
    )

    company_id = request.args.get("company_id")
    if user.role != UserRole.GLOBAL_ADMIN:
        query = query.filter(Equipment.company_id == user.company_id)
        allowed_branches = get_allowed_branch_ids(user)
        if allowed_branches is not None:
            query = query.filter(Equipment.branch_id.in_(allowed_branches))
    elif company_id:
        query = query.filter(Equipment.company_id == company_id)

    branch_id = request.args.get("branch_id")
    if branch_id:
        query = query.filter(Equipment.branch_id == branch_id)

    equipment_id = request.args.get("equipment_id")
    if equipment_id:
        query = query.filter(Alert.equipment_id == equipment_id)

    rows = query.group_by(Alert.severity, Alert.type).all()

    total_active = 0
    by_severity = {"warning": 0, "critical": 0}
    by_type: dict[str, int] = {}

    for sev, rtype, cnt in rows:
        count_int = int(cnt)
        total_active += count_int
        by_severity[sev.value] = by_severity.get(sev.value, 0) + count_int
        by_type[rtype.value] = by_type.get(rtype.value, 0) + count_int

    return jsonify(
        {
            "total_active": total_active,
            "by_severity": by_severity,
            "by_type": by_type,
        }
    ), 200


@alerts_bp.route("/<alert_id>", methods=["GET"])
@jwt_required()
def get_alert(alert_id: str) -> tuple[Response, int]:
    """Get a specific alert with tenant and branch access checks."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    alert = Alert.query.options(joinedload(Alert.equipment)).filter(Alert.id == alert_id).first()
    if not alert:
        return jsonify({"error": "Alert not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN:
        if alert.equipment.company_id != user.company_id:
            return jsonify({"error": "Forbidden"}), 403
        allowed_branches = get_allowed_branch_ids(user)
        if allowed_branches is not None and alert.equipment.branch_id not in allowed_branches:
            return jsonify({"error": "Forbidden"}), 403

    return jsonify(alert.to_dict()), 200


@alerts_bp.route("/<alert_id>/acknowledge", methods=["POST"])
@jwt_required()
def acknowledge_alert(alert_id: str) -> tuple[Response, int]:
    """Acknowledge an active alert (Global Admin or owning Company Admin)."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    alert = Alert.query.options(joinedload(Alert.equipment)).filter(Alert.id == alert_id).first()
    if not alert:
        return jsonify({"error": "Alert not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN and alert.equipment.company_id != user.company_id:
        return jsonify({"error": "Forbidden"}), 403

    if alert.status == AlertStatus.RESOLVED:
        return jsonify({"error": "Cannot acknowledge an already resolved alert"}), 409

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_schema(_alert_acknowledge_schema, raw_data, allow_empty=True)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400
    old_status = alert.status.value

    alert.status = AlertStatus.ACKNOWLEDGED
    alert.acknowledged_at = utc_now()
    alert.acknowledged_by = user.id
    alert.acknowledgment_notes = data.get("notes")

    record_audit_log(
        user_id=user.id,
        action="acknowledge_alert",
        entity_type="alert",
        entity_id=alert.id,
        changes={
            "status": {"old": old_status, "new": AlertStatus.ACKNOWLEDGED.value},
            "notes": alert.acknowledgment_notes,
        },
    )
    db.session.commit()

    return jsonify(alert.to_dict()), 200


@alerts_bp.route("/<alert_id>/resolve", methods=["POST"])
@jwt_required()
def resolve_alert(alert_id: str) -> tuple[Response, int]:
    """Resolve an alert and atomically recompute Equipment.status under SELECT ... FOR UPDATE."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    alert = (
        Alert.query.join(Alert.equipment)
        .options(contains_eager(Alert.equipment))
        .filter(Alert.id == alert_id)
        .with_for_update(of=Alert)
        .first()
    )
    if not alert:
        return jsonify({"error": "Alert not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN and alert.equipment.company_id != user.company_id:
        db.session.rollback()
        return jsonify({"error": "Forbidden"}), 403

    old_status = alert.status.value
    now = utc_now()
    alert.status = AlertStatus.RESOLVED
    alert.resolved_at = now
    db.session.flush()

    recompute_equipment_status(alert.equipment_id, now=now)
    record_audit_log(
        user_id=user.id,
        action="resolve_alert",
        entity_type="alert",
        entity_id=alert.id,
        changes={"status": {"old": old_status, "new": AlertStatus.RESOLVED.value}},
    )
    db.session.commit()

    return jsonify(alert.to_dict()), 200
