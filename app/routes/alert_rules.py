"""
Alert Rules Routes
CRUD operations for alert rules (Global Admin write; Company Admin read-only visibility)
"""

from datetime import timedelta
from typing import TypeVar

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_sqlalchemy.query import Query
from sqlalchemy import case, func, or_
from sqlalchemy.exc import IntegrityError

from app import db
from app.enums import AuditEntityType
from app.models import (
    Alert,
    AlertRule,
    AlertRuleScope,
    AlertRuleType,
    AlertSeverity,
    ComparisonOperator,
    Equipment,
    User,
    UserRole,
)
from app.schemas import (
    AlertRule as AlertRuleResponse,
)
from app.schemas import (
    AlertRuleCreateRequest,
    AlertRulesListResponse,
    AlertRulesQuery,
    AlertRuleStatisticsResponse,
    AlertRuleUpdateRequest,
    json_response,
    openapi_meta,
    validate_query_model,
    validate_request_model,
)
from app.utils import clamp_pagination, record_audit_log, utc_now

alert_rules_bp = Blueprint("alert_rules", __name__)

NON_NUMERIC_RULE_TYPES = {AlertRuleType.DOOR_OPEN, AlertRuleType.EQUIPMENT_OFFLINE}
_Q = TypeVar("_Q", bound=Query)


def _validate_rule_domain(
    rule_type: AlertRuleType,
    threshold_value: object,
    comparison_operator: ComparisonOperator | None,
    scope: AlertRuleScope,
    scope_id: object,
) -> str | None:
    """Validate alert rule domain invariants before hitting DB CHECK constraints."""
    if rule_type in NON_NUMERIC_RULE_TYPES:
        if threshold_value is not None or comparison_operator is not None:
            return "threshold_value and comparison_operator must be null for door_open and equipment_offline rules"
    else:
        if threshold_value is None or comparison_operator is None:
            return "threshold_value and comparison_operator are required for numeric threshold rules"

    if scope == AlertRuleScope.GLOBAL and scope_id is not None:
        return "scope_id must be null when scope is global"
    if scope != AlertRuleScope.GLOBAL and not scope_id:
        return "scope_id is required when scope is company or equipment"

    return None


def _apply_alert_rule_tenant_filter(
    query: _Q, user: User, company_id_filter: str | None
) -> tuple[_Q | None, tuple[Response, int] | None]:
    """Scope alert rules query to the requesting user's tenant or requested company_id."""
    if user.role == UserRole.COMPANY_ADMIN:
        if company_id_filter and company_id_filter != str(user.company_id):
            return None, (jsonify({"error": "Forbidden"}), 403)
        company_eq_ids = db.session.query(Equipment.id).filter(Equipment.company_id == user.company_id)
        query = query.filter(
            or_(
                AlertRule.scope == AlertRuleScope.GLOBAL,
                (AlertRule.scope == AlertRuleScope.COMPANY) & (AlertRule.scope_id == user.company_id),
                (AlertRule.scope == AlertRuleScope.EQUIPMENT) & AlertRule.scope_id.in_(company_eq_ids),
            )
        )
    elif company_id_filter:
        company_eq_ids = db.session.query(Equipment.id).filter(Equipment.company_id == company_id_filter)
        query = query.filter(
            or_(
                (AlertRule.scope == AlertRuleScope.COMPANY) & (AlertRule.scope_id == company_id_filter),
                (AlertRule.scope == AlertRuleScope.EQUIPMENT) & AlertRule.scope_id.in_(company_eq_ids),
            )
        )
    return query, None


def _apply_alert_rule_query_filters(
    query: _Q,
    query_params: AlertRulesQuery,
) -> _Q:
    """Apply validated optional scope, equipment, rule_type, and is_active filters to an AlertRule query."""
    if query_params.scope is not None:
        query = query.filter(AlertRule.scope == query_params.scope)

    if query_params.equipment_id:
        query = query.filter(
            AlertRule.scope == AlertRuleScope.EQUIPMENT,
            AlertRule.scope_id == query_params.equipment_id,
        )

    if query_params.rule_type is not None:
        query = query.filter(AlertRule.rule_type == query_params.rule_type)

    if query_params.is_active is not None:
        query = query.filter(AlertRule.is_active.is_(query_params.is_active))

    return query


@alert_rules_bp.route("", methods=["GET"])
@openapi_meta(
    summary="List alert rules",
    tags=["Alert Rules"],
    query_params=AlertRulesQuery,
    responses={200: AlertRulesListResponse},
)
@jwt_required()
def get_alert_rules() -> tuple[Response, int]:
    """
    List alert rules with pagination and filters.
    Global Admins view all rules; Company Admins have read-only access to global rules
    plus rules scoped to their company or its equipment.
    """
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    query_params, q_err = validate_query_model(AlertRulesQuery, request.args)
    if q_err or query_params is None:
        return jsonify({"error": q_err or "Invalid query parameters"}), 400

    page, limit = clamp_pagination(query_params.page, query_params.limit)
    scoped_query, tenant_err = _apply_alert_rule_tenant_filter(AlertRule.query, user, query_params.company_id)
    if tenant_err:
        return tenant_err
    if scoped_query is None:
        return jsonify({"error": "Forbidden"}), 403

    query = _apply_alert_rule_query_filters(scoped_query, query_params)

    alert_rules = query.order_by(AlertRule.created_at.desc()).paginate(page=page, per_page=limit, error_out=False)

    return json_response(
        AlertRulesListResponse,
        {
            "alert_rules": [ar.to_dict() for ar in alert_rules.items],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": alert_rules.total,
                "total_pages": alert_rules.pages,
            },
        },
        200,
    )


@alert_rules_bp.route("/<rule_id>", methods=["GET"])
@openapi_meta(
    summary="Get alert rule details",
    tags=["Alert Rules"],
    responses={200: AlertRuleResponse},
)
@jwt_required()
def get_alert_rule(rule_id: str) -> tuple[Response, int]:
    """Get a specific alert rule (Global Admin, or Company Admin if applicable to their company/equipment)."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    alert_rule = db.session.get(AlertRule, rule_id)
    if not alert_rule:
        return jsonify({"error": "Alert rule not found"}), 404

    if user.role == UserRole.COMPANY_ADMIN:
        if alert_rule.scope == AlertRuleScope.COMPANY and alert_rule.scope_id != user.company_id:
            return jsonify({"error": "Forbidden"}), 403
        if alert_rule.scope == AlertRuleScope.EQUIPMENT:
            target_eq = db.session.get(Equipment, alert_rule.scope_id) if alert_rule.scope_id else None
            if not target_eq or target_eq.company_id != user.company_id:
                return jsonify({"error": "Forbidden"}), 403

    return json_response(AlertRuleResponse, alert_rule.to_dict(), 200)


@alert_rules_bp.route("", methods=["POST"])
@openapi_meta(
    summary="Create alert rule",
    tags=["Alert Rules"],
    request_body=AlertRuleCreateRequest,
    responses={201: AlertRuleResponse},
)
@jwt_required()
def create_alert_rule() -> tuple[Response, int]:
    """Create a new alert rule enforcing numeric vs non-numeric and scope invariants."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({"error": "Forbidden"}), 403

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_model(AlertRuleCreateRequest, raw_data)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    rule_type = AlertRuleType(data.rule_type)
    severity = AlertSeverity(data.severity)
    scope = AlertRuleScope(data.scope)
    comp_op = _parse_comparison_operator(data.comparison_operator)

    threshold_value = data.threshold_value
    scope_id = data.scope_id or None
    duration_seconds = data.duration_seconds

    domain_error = _validate_rule_domain(rule_type, threshold_value, comp_op, scope, scope_id)
    if domain_error:
        return jsonify({"error": domain_error}), 400

    alert_rule = AlertRule(
        name=data.name,
        description=data.description,
        rule_type=rule_type,
        threshold_value=threshold_value,
        comparison_operator=comp_op,
        duration_seconds=duration_seconds,
        severity=severity,
        message_template=data.message_template or "{serial} triggered {rule_type}",
        scope=scope,
        scope_id=scope_id,
        is_active=data.is_active,
        created_by=user.id,
    )

    try:
        db.session.add(alert_rule)
        db.session.flush()
        record_audit_log(
            user_id=user.id,
            action="create_alert_rule",
            entity_type=AuditEntityType.ALERT_RULE,
            entity_id=alert_rule.id,
            changes={
                "name": alert_rule.name,
                "rule_type": alert_rule.rule_type.value,
                "scope": alert_rule.scope.value,
            },
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Alert rule violates uniqueness or domain constraints"}), 400

    return json_response(AlertRuleResponse, alert_rule.to_dict(), 201)


def _parse_comparison_operator(value: str | None) -> ComparisonOperator | None:
    """Convert an optional comparison operator string to ComparisonOperator."""
    return ComparisonOperator(value) if value is not None else None


def _apply_alert_rule_updates(alert_rule: AlertRule, data: AlertRuleUpdateRequest) -> None:
    """Apply validated partial update fields to an AlertRule instance."""
    fields = data.model_fields_set
    if "name" in fields and data.name is not None:
        alert_rule.name = data.name
    if "description" in fields:
        alert_rule.description = data.description
    if "threshold_value" in fields:
        alert_rule.threshold_value = data.threshold_value
    if "duration_seconds" in fields and data.duration_seconds is not None:
        alert_rule.duration_seconds = data.duration_seconds
    if "message_template" in fields and data.message_template is not None:
        alert_rule.message_template = data.message_template
    if "comparison_operator" in fields:
        alert_rule.comparison_operator = _parse_comparison_operator(data.comparison_operator)
    if "severity" in fields and data.severity is not None:
        alert_rule.severity = AlertSeverity(data.severity)
    if "is_active" in fields and data.is_active is not None:
        alert_rule.is_active = data.is_active


@alert_rules_bp.route("/<rule_id>", methods=["PATCH"])
@openapi_meta(
    summary="Update alert rule",
    tags=["Alert Rules"],
    request_body=AlertRuleUpdateRequest,
    responses={200: AlertRuleResponse},
)
@jwt_required()
def update_alert_rule(rule_id: str) -> tuple[Response, int]:
    """Update an alert rule while preserving domain constraints."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({"error": "Forbidden"}), 403

    alert_rule = db.session.get(AlertRule, rule_id)
    if not alert_rule:
        return jsonify({"error": "Alert rule not found"}), 404

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_model(AlertRuleUpdateRequest, raw_data, allow_empty=True)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    _apply_alert_rule_updates(alert_rule, data)

    domain_error = _validate_rule_domain(
        alert_rule.rule_type,
        alert_rule.threshold_value,
        alert_rule.comparison_operator,
        alert_rule.scope,
        alert_rule.scope_id,
    )
    if domain_error:
        db.session.rollback()
        return jsonify({"error": domain_error}), 400

    try:
        record_audit_log(
            user_id=user.id,
            action="update_alert_rule",
            entity_type=AuditEntityType.ALERT_RULE,
            entity_id=alert_rule.id,
            changes={"is_active": alert_rule.is_active},
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Alert rule update violates uniqueness or domain constraints"}), 400

    return json_response(AlertRuleResponse, alert_rule.to_dict(), 200)


@alert_rules_bp.route("/<rule_id>", methods=["DELETE"])
@openapi_meta(
    summary="Delete alert rule",
    tags=["Alert Rules"],
    responses={204: None},
)
@jwt_required()
def delete_alert_rule(rule_id: str) -> tuple[Response | str, int]:
    """Delete an alert rule (alerts retain history via ON DELETE SET NULL)."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({"error": "Forbidden"}), 403

    alert_rule = db.session.get(AlertRule, rule_id)
    if not alert_rule:
        return jsonify({"error": "Alert rule not found"}), 404

    deleted_id = alert_rule.id
    deleted_name = alert_rule.name
    db.session.delete(alert_rule)
    record_audit_log(
        user_id=user.id,
        action="delete_alert_rule",
        entity_type=AuditEntityType.ALERT_RULE,
        entity_id=deleted_id,
        changes={"name": deleted_name},
    )
    db.session.commit()

    return "", 204


@alert_rules_bp.route("/<rule_id>/statistics", methods=["GET"])
@openapi_meta(
    summary="Get alert rule trigger statistics",
    tags=["Alert Rules"],
    responses={200: AlertRuleStatisticsResponse},
)
@jwt_required()
def get_alert_rule_statistics(rule_id: str) -> tuple[Response, int]:
    """Get trigger statistics for a specific alert rule (Global Admin only)."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({"error": "Forbidden"}), 403

    alert_rule = db.session.get(AlertRule, rule_id)
    if not alert_rule:
        return jsonify({"error": "Alert rule not found"}), 404

    cutoff_30d = utc_now() - timedelta(days=30)
    stats_row = (
        db.session.query(
            func.count(Alert.id).label("total_triggers"),
            func.count(case((Alert.created_at >= cutoff_30d, 1))).label("triggers_last_30_days"),
            func.count(func.distinct(Alert.equipment_id)).label("affected_equipments"),
        )
        .filter(Alert.alert_rule_id == alert_rule.id)
        .one()
    )

    total_triggers = int(stats_row.total_triggers or 0)
    triggers_last_30_days = int(stats_row.triggers_last_30_days or 0)
    affected_equipments = int(stats_row.affected_equipments or 0)
    avg_triggers = round(total_triggers / affected_equipments, 2) if affected_equipments > 0 else 0.0

    return json_response(
        AlertRuleStatisticsResponse,
        {
            "rule_id": str(alert_rule.id),
            "total_triggers": total_triggers,
            "triggers_last_30_days": triggers_last_30_days,
            "affected_equipments": affected_equipments,
            "avg_triggers_per_equipment": avg_triggers,
        },
        200,
    )
