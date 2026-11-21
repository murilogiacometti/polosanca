"""
Maintenance Records Routes
CRUD operations for maintenance records + denormalized Equipment maintenance summary sync
"""

from datetime import date

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.enums import AuditEntityType
from app.models import Equipment, MaintenanceRecord, User, UserRole
from app.schemas import (
    MaintenanceCreateRequest,
    MaintenanceRecordsListResponse,
    MaintenanceUpdateRequest,
    MessageResponse,
    PaginationQuery,
    json_response,
    openapi_meta,
    validate_query_model,
    validate_request_model,
)
from app.schemas import MaintenanceRecord as MaintenanceRecordResponse
from app.utils import (
    clamp_pagination,
    get_allowed_branch_ids,
    parse_iso_datetime,
    record_audit_log,
    utc_now,
)

maintenance_bp = Blueprint("maintenance", __name__)


def _sync_equipment_maintenance_dates(equipment: Equipment) -> None:
    """Keep denormalized last_maintenance_date and next_maintenance_date on Equipment in sync."""
    latest = (
        MaintenanceRecord.query.filter_by(equipment_id=equipment.id)
        .order_by(MaintenanceRecord.performed_at.desc())
        .first()
    )
    if latest is None:
        equipment.last_maintenance_date = None
        equipment.next_maintenance_date = None
    else:
        equipment.last_maintenance_date = latest.performed_at.date() if latest.performed_at else None
        equipment.next_maintenance_date = latest.next_maintenance_date


@maintenance_bp.route("/equipments/<equipment_id>/maintenance-records", methods=["GET"])
@openapi_meta(
    summary="List maintenance records for equipment",
    tags=["Maintenance"],
    query_params=PaginationQuery,
    responses={200: MaintenanceRecordsListResponse},
)
@jwt_required()
def get_maintenance_records(equipment_id: str) -> tuple[Response, int]:
    """Get maintenance records for an equipment."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        return jsonify({"error": "Equipment not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN:
        if equipment.company_id != user.company_id:
            return jsonify({"error": "Forbidden"}), 403
        allowed_branches = get_allowed_branch_ids(user)
        if allowed_branches is not None and equipment.branch_id not in allowed_branches:
            return jsonify({"error": "Forbidden"}), 403

    query_params, q_err = validate_query_model(PaginationQuery, request.args)
    if q_err or query_params is None:
        return jsonify({"error": q_err or "Invalid query parameters"}), 400

    page, limit = clamp_pagination(query_params.page, query_params.limit)

    records = (
        MaintenanceRecord.query.filter_by(equipment_id=equipment.id)
        .order_by(MaintenanceRecord.performed_at.desc())
        .paginate(page=page, per_page=limit, error_out=False)
    )

    return json_response(
        MaintenanceRecordsListResponse,
        {
            "equipment_id": str(equipment.id),
            "maintenance_records": [r.to_dict() for r in records.items],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": records.total,
                "total_pages": records.pages,
            },
        },
        200,
    )


@maintenance_bp.route("/maintenance-records/<record_id>", methods=["GET"])
@openapi_meta(
    summary="Get maintenance record details",
    tags=["Maintenance"],
    responses={200: MaintenanceRecordResponse},
)
@jwt_required()
def get_maintenance_record(record_id: str) -> tuple[Response, int]:
    """Get a specific maintenance record."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    record = db.session.get(MaintenanceRecord, record_id)
    if not record:
        return jsonify({"error": "Maintenance record not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN:
        if record.equipment.company_id != user.company_id:
            return jsonify({"error": "Forbidden"}), 403
        allowed_branches = get_allowed_branch_ids(user)
        if allowed_branches is not None and record.equipment.branch_id not in allowed_branches:
            return jsonify({"error": "Forbidden"}), 403

    return json_response(MaintenanceRecordResponse, record.to_dict(), 200)


@maintenance_bp.route("/equipments/<equipment_id>/maintenance-records", methods=["POST"])
@openapi_meta(
    summary="Create maintenance record",
    tags=["Maintenance"],
    request_body=MaintenanceCreateRequest,
    responses={201: MaintenanceRecordResponse},
)
@jwt_required()
def create_maintenance_record(equipment_id: str) -> tuple[Response, int]:
    """Create a maintenance record and sync denormalized Equipment maintenance dates."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_model(MaintenanceCreateRequest, raw_data)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    equipment = db.session.query(Equipment).filter(Equipment.id == equipment_id).with_for_update().first()
    if not equipment:
        return jsonify({"error": "Equipment not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN and equipment.company_id != user.company_id:
        db.session.rollback()
        return jsonify({"error": "Forbidden"}), 403

    performed_at = utc_now()
    raw_performed_at = data.performed_at
    if raw_performed_at:
        try:
            performed_at = parse_iso_datetime(raw_performed_at)
        except ValueError:
            db.session.rollback()
            return jsonify({"error": "Invalid performed_at timestamp"}), 400

    next_maint_date = None
    raw_next_date = data.next_maintenance_date
    if raw_next_date:
        try:
            next_maint_date = date.fromisoformat(raw_next_date[:10])
        except ValueError:
            db.session.rollback()
            return jsonify({"error": "Invalid next_maintenance_date"}), 400

    record = MaintenanceRecord(
        equipment_id=equipment.id,
        type=data.type,
        description=data.description,
        performed_by=data.performed_by,
        performed_at=performed_at,
        notes=data.notes,
        next_maintenance_date=next_maint_date,
        created_by=user.id,
    )

    db.session.add(record)
    db.session.flush()
    _sync_equipment_maintenance_dates(equipment)
    record_audit_log(
        user_id=user.id,
        action="create_maintenance_record",
        entity_type=AuditEntityType.MAINTENANCE_RECORD,
        entity_id=record.id,
        changes={"equipment_id": str(equipment.id), "type": record.type},
    )
    db.session.commit()

    return json_response(MaintenanceRecordResponse, record.to_dict(), 201)


def _load_writable_maintenance_record(
    record_id: str,
) -> tuple[User | None, MaintenanceRecord | None, Equipment | None, tuple[Response, int] | None]:
    """Authorize writer and load maintenance record with its equipment row locked."""
    user = db.session.get(User, get_jwt_identity())
    if not user:
        return None, None, None, (jsonify({"error": "User not found"}), 404)

    if user.role == UserRole.COMPANY_VIEWER:
        return None, None, None, (jsonify({"error": "Forbidden"}), 403)

    record = db.session.get(MaintenanceRecord, record_id)
    if not record:
        return None, None, None, (jsonify({"error": "Maintenance record not found"}), 404)

    equipment = db.session.query(Equipment).filter(Equipment.id == record.equipment_id).with_for_update().first()
    if equipment is None:
        db.session.rollback()
        return None, None, None, (jsonify({"error": "Equipment not found"}), 404)
    if user.role != UserRole.GLOBAL_ADMIN and equipment.company_id != user.company_id:
        db.session.rollback()
        return None, None, None, (jsonify({"error": "Forbidden"}), 403)

    return user, record, equipment, None


def _apply_maintenance_record_updates(record: MaintenanceRecord, data: MaintenanceUpdateRequest) -> str | None:
    """Apply validated field updates to a MaintenanceRecord, returning an error message if parsing fails."""
    if "type" in data.model_fields_set and data.type is not None:
        record.type = data.type
    if "description" in data.model_fields_set and data.description is not None:
        record.description = data.description
    if "performed_by" in data.model_fields_set and data.performed_by is not None:
        record.performed_by = data.performed_by
    if "notes" in data.model_fields_set:
        record.notes = data.notes

    raw_performed_at = data.performed_at
    if raw_performed_at is not None:
        try:
            record.performed_at = parse_iso_datetime(raw_performed_at)
        except ValueError:
            return "Invalid performed_at timestamp"

    if "next_maintenance_date" in data.model_fields_set:
        raw_next_date = data.next_maintenance_date
        if raw_next_date is None:
            record.next_maintenance_date = None
        else:
            try:
                record.next_maintenance_date = date.fromisoformat(raw_next_date[:10])
            except ValueError:
                return "Invalid next_maintenance_date"

    return None


@maintenance_bp.route("/maintenance-records/<record_id>", methods=["PATCH"])
@openapi_meta(
    summary="Update maintenance record",
    tags=["Maintenance"],
    request_body=MaintenanceUpdateRequest,
    responses={200: MaintenanceRecordResponse},
)
@jwt_required()
def update_maintenance_record(record_id: str) -> tuple[Response, int]:
    """Update a maintenance record and resync Equipment maintenance summary dates."""
    user, record, equipment, auth_err = _load_writable_maintenance_record(record_id)
    if auth_err is not None or user is None or record is None or equipment is None:
        return auth_err or (jsonify({"error": "Maintenance record not found"}), 404)

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_model(MaintenanceUpdateRequest, raw_data, allow_empty=True)
    if val_err or data is None:
        db.session.rollback()
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    apply_err = _apply_maintenance_record_updates(record, data)
    if apply_err:
        db.session.rollback()
        return jsonify({"error": apply_err}), 400

    db.session.flush()
    _sync_equipment_maintenance_dates(equipment)
    record_audit_log(
        user_id=user.id,
        action="update_maintenance_record",
        entity_type=AuditEntityType.MAINTENANCE_RECORD,
        entity_id=record.id,
        changes={"equipment_id": str(equipment.id), "type": record.type},
    )
    db.session.commit()

    return json_response(MaintenanceRecordResponse, record.to_dict(), 200)


@maintenance_bp.route("/maintenance-records/<record_id>", methods=["DELETE"])
@openapi_meta(
    summary="Delete maintenance record",
    tags=["Maintenance"],
    responses={200: MessageResponse},
)
@jwt_required()
def delete_maintenance_record(record_id: str) -> tuple[Response, int]:
    """Delete a maintenance record and resync Equipment maintenance summary dates."""
    user, record, equipment, auth_err = _load_writable_maintenance_record(record_id)
    if auth_err is not None or user is None or record is None or equipment is None:
        return auth_err or (jsonify({"error": "Maintenance record not found"}), 404)

    deleted_id = record.id
    db.session.delete(record)
    db.session.flush()
    _sync_equipment_maintenance_dates(equipment)
    record_audit_log(
        user_id=user.id,
        action="delete_maintenance_record",
        entity_type=AuditEntityType.MAINTENANCE_RECORD,
        entity_id=deleted_id,
        changes={"equipment_id": str(equipment.id)},
    )
    db.session.commit()

    return json_response(MessageResponse, {"message": "Maintenance record deleted"}, 200)
