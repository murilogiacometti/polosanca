"""
Audit Logs Routes
Immutable administrative audit trail query with O(1) keyset page_token pagination (AIP-158)
"""

import math
import uuid
from datetime import datetime

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import literal, tuple_
from sqlalchemy.orm import Query

from app import db
from app.models import AuditLog, User, UserRole
from app.schemas import AuditLogsListResponse, AuditLogsQuery, json_response, openapi_meta, validate_query_model
from app.utils import (
    clamp_pagination,
    decode_page_token,
    encode_page_token,
    parse_iso_datetime,
)

audit_logs_bp = Blueprint("audit_logs", __name__)


def _decode_audit_cursor(
    page_token: str | None,
) -> tuple[datetime | None, uuid.UUID | None, tuple[Response, int] | None]:
    """Decode optional keyset page_token into (cursor_time, cursor_id, error_response)."""
    if page_token is None:
        return None, None, None
    try:
        token_data = decode_page_token(page_token)
        raw_t = token_data["t"]
        raw_id = token_data["id"]
        if not isinstance(raw_t, str) or not isinstance(raw_id, str):
            raise TypeError("Cursor fields must be strings")
        return parse_iso_datetime(raw_t), uuid.UUID(raw_id), None
    except (KeyError, TypeError, ValueError):
        return None, None, (jsonify({"error": "Invalid page_token"}), 400)


def _apply_audit_log_filters(
    query: Query[AuditLog], query_params: AuditLogsQuery
) -> tuple[Query[AuditLog] | None, tuple[Response, int] | None]:
    """Apply optional query-string filters to an AuditLog query."""
    if query_params.user_id:
        query = query.filter(AuditLog.user_id == query_params.user_id)
    if query_params.entity_type:
        query = query.filter(AuditLog.entity_type == query_params.entity_type.value)
    if query_params.entity_id:
        query = query.filter(AuditLog.entity_id == query_params.entity_id)
    if query_params.action:
        query = query.filter(AuditLog.action == query_params.action)
    if query_params.start_date:
        try:
            query = query.filter(AuditLog.created_at >= parse_iso_datetime(query_params.start_date))
        except ValueError:
            return None, (jsonify({"error": "Invalid start_date ISO timestamp"}), 400)
    if query_params.end_date:
        try:
            query = query.filter(AuditLog.created_at <= parse_iso_datetime(query_params.end_date))
        except ValueError:
            return None, (jsonify({"error": "Invalid end_date ISO timestamp"}), 400)
    return query, None


@audit_logs_bp.route("", methods=["GET"])
@openapi_meta(
    summary="List audit logs",
    tags=["Audit Logs"],
    query_params=AuditLogsQuery,
    responses={200: AuditLogsListResponse},
)
@jwt_required()
def get_audit_logs() -> tuple[Response, int]:
    """List immutable administrative audit events (Global Admin only) with keyset page_token support."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({"error": "Forbidden"}), 403

    query_params, q_err = validate_query_model(AuditLogsQuery, request.args)
    if q_err or query_params is None:
        return jsonify({"error": q_err or "Invalid query parameters"}), 400

    raw_limit = query_params.page_size or query_params.limit
    page, limit = clamp_pagination(
        query_params.page,
        raw_limit,
        default_limit=20,
        max_limit=100,
    )

    cursor_time, cursor_id, token_err = _decode_audit_cursor(query_params.page_token)
    if token_err:
        return token_err

    query, filter_err = _apply_audit_log_filters(AuditLog.query, query_params)
    if filter_err is not None or query is None:
        return filter_err or (jsonify({"error": "Invalid query filters"}), 400)

    total = query.count()
    total_pages = math.ceil(total / limit)

    if cursor_time is not None and cursor_id is not None:
        fetched = (
            query.filter(tuple_(AuditLog.created_at, AuditLog.id) < tuple_(literal(cursor_time), literal(cursor_id)))
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(limit + 1)
            .all()
        )
    else:
        offset = (page - 1) * limit
        fetched = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset(offset).limit(limit + 1).all()

    has_more = len(fetched) > limit
    items = fetched[:limit]
    next_page_token = None
    if has_more and items:
        last_item = items[-1]
        next_page_token = encode_page_token(
            {
                "t": last_item.created_at.isoformat(),
                "id": str(last_item.id),
            }
        )

    return json_response(
        AuditLogsListResponse,
        {
            "audit_logs": [log.to_dict() for log in items],
            "next_page_token": next_page_token,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
            },
        },
        200,
    )
