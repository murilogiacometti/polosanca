"""
Equipments Routes
CRUD operations for equipment
"""

import secrets
from datetime import datetime
from typing import TypeVar

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_sqlalchemy.query import Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from app import db
from app.enums import AuditEntityType
from app.models import (
    Branch,
    Equipment,
    EquipmentStatus,
    EquipmentType,
    User,
    UserRole,
)
from app.schemas import (
    Equipment as EquipmentResponse,
)
from app.schemas import (
    EquipmentAlertRulesResponse,
    EquipmentCreated,
    EquipmentCreateRequest,
    EquipmentsListResponse,
    EquipmentsQuery,
    EquipmentUpdateRequest,
    RotateApiKeyResponse,
    json_response,
    openapi_meta,
    validate_query_model,
    validate_request_model,
)
from app.services import serialize_equipment_alert_rules
from app.utils import (
    DEFAULT_OFFLINE_TIMEOUT_SECONDS,
    clamp_pagination,
    ensure_utc,
    get_allowed_branch_ids,
    hash_api_key,
    parse_iso_datetime,
    record_audit_log,
    utc_now,
)

equipments_bp = Blueprint("equipments", __name__)
_Q = TypeVar("_Q", bound=Query)


def _serialize_equipment(equipment: Equipment, now: datetime | None = None) -> dict[str, object]:
    """Serialize equipment and reflect stale-heartbeat offline status without mutating on GET."""
    payload = equipment.to_dict()
    ref_now = now or utc_now()
    last_seen = ensure_utc(equipment.last_seen_at)
    if last_seen is None or (ref_now - last_seen).total_seconds() >= DEFAULT_OFFLINE_TIMEOUT_SECONDS:
        payload["status"] = EquipmentStatus.OFFLINE.value
    return payload


def _apply_equipment_list_filters(
    query: _Q,
    branch_id: str | None,
    eq_type: EquipmentType | None,
    status: EquipmentStatus | None,
    search: str | None,
) -> _Q:
    """Apply optional branch, type, status, and serial search filters to an equipment query."""
    if branch_id:
        query = query.filter(Equipment.branch_id == branch_id)
    if eq_type is not None:
        query = query.filter(Equipment.type == eq_type)
    if status is not None:
        query = query.filter(Equipment.status == status)
    if search:
        query = query.filter(Equipment.serial.ilike(f"%{search.strip()}%"))
    return query


@equipments_bp.route("", methods=["GET"])
@openapi_meta(
    summary="List equipments",
    tags=["Equipments"],
    query_params=EquipmentsQuery,
    responses={200: EquipmentsListResponse},
)
@jwt_required()
def get_equipments() -> tuple[Response, int]:
    """Get equipment list in a single query using joinedload(branch) + current_data JSONB."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    query_params, q_err = validate_query_model(EquipmentsQuery, request.args)
    if q_err or query_params is None:
        return jsonify({"error": q_err or "Invalid query parameters"}), 400

    page, limit = clamp_pagination(query_params.page, query_params.limit)
    company_id = query_params.company_id
    include_inactive = bool(query_params.include_inactive)

    query = Equipment.query.options(joinedload(Equipment.branch))

    if not include_inactive:
        query = query.filter(Equipment.is_active.is_(True))

    if user.role == UserRole.GLOBAL_ADMIN:
        if company_id:
            query = query.filter(Equipment.company_id == company_id)
    else:
        query = query.filter(Equipment.company_id == user.company_id)
        allowed_branches = get_allowed_branch_ids(user)
        if allowed_branches is not None:
            query = query.filter(Equipment.branch_id.in_(allowed_branches))

    filtered_query = _apply_equipment_list_filters(
        query,
        query_params.branch_id,
        query_params.type,
        query_params.status,
        query_params.search,
    )

    query = filtered_query.order_by(Equipment.created_at.desc())
    pagination = query.paginate(page=page, per_page=limit, error_out=False)
    now = utc_now()

    return json_response(
        EquipmentsListResponse,
        {
            "equipment": [_serialize_equipment(e, now=now) for e in pagination.items],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": pagination.total,
                "total_pages": pagination.pages,
            },
        },
        200,
    )


@equipments_bp.route("/<equipment_id>", methods=["GET"])
@openapi_meta(
    summary="Get equipment details",
    tags=["Equipments"],
    responses={200: EquipmentResponse},
)
@jwt_required()
def get_equipment(equipment_id: str) -> tuple[Response, int]:
    """Get a specific equipment with tenant and branch-level access enforcement."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    equipment = Equipment.query.options(joinedload(Equipment.branch)).filter(Equipment.id == equipment_id).first()
    if not equipment:
        return jsonify({"error": "Equipment not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN:
        if equipment.company_id != user.company_id:
            return jsonify({"error": "Forbidden"}), 403
        allowed_branches = get_allowed_branch_ids(user)
        if allowed_branches is not None and equipment.branch_id not in allowed_branches:
            return jsonify({"error": "Forbidden"}), 403

    return json_response(EquipmentResponse, _serialize_equipment(equipment), 200)


@equipments_bp.route("/<equipment_id>/alert-rules", methods=["GET"])
@openapi_meta(
    summary="List alert rules applicable to equipment",
    tags=["Equipments"],
    responses={200: EquipmentAlertRulesResponse},
)
@jwt_required()
def get_equipment_alert_rules(equipment_id: str) -> tuple[Response, int]:
    """
    List all rules applicable to an equipment unit ordered by priority per (rule_type, severity)
    (1=equipment > 2=company > 3=global) and annotated with `is_effective`.
    Accessible to Global Admin, owning Company Admin, and permitted Company Viewers.
    """
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

    return json_response(
        EquipmentAlertRulesResponse,
        {
            "equipment_id": str(equipment.id),
            "applicable_rules": serialize_equipment_alert_rules(equipment),
        },
        200,
    )


def _resolve_target_branch_for_create(
    user: User, data: EquipmentCreateRequest
) -> tuple[Branch | None, tuple[Response, int] | None]:
    """Load and authorize the target branch for equipment creation."""
    branch = db.session.get(Branch, data.branch_id)
    if not branch:
        return None, (jsonify({"error": "Branch not found"}), 404)

    if user.role != UserRole.GLOBAL_ADMIN:
        if branch.company_id != user.company_id:
            return None, (jsonify({"error": "Forbidden"}), 403)
    else:
        company_id = data.company_id
        if company_id and company_id != str(branch.company_id):
            return None, (jsonify({"error": "Branch does not belong to the specified company"}), 400)

    return branch, None


@equipments_bp.route("", methods=["POST"])
@openapi_meta(
    summary="Register new equipment",
    tags=["Equipments"],
    request_body=EquipmentCreateRequest,
    responses={201: EquipmentCreated},
)
@jwt_required()
def create_equipment() -> tuple[Response, int]:
    """Register new equipment, derive company_id from branch, and store SHA-256 hashed API key."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_model(EquipmentCreateRequest, raw_data)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    serial = data.serial
    eq_type = EquipmentType(data.type)

    branch, branch_err = _resolve_target_branch_for_create(user, data)
    if branch_err:
        return branch_err
    if branch is None:
        return jsonify({"error": "Branch not found"}), 404

    if Equipment.query.filter_by(serial=serial).first():
        return jsonify({"error": "Equipment with this serial number already exists"}), 400

    installed_at = None
    raw_installed_at = data.installed_at
    if raw_installed_at:
        try:
            installed_at = parse_iso_datetime(raw_installed_at)
        except ValueError:
            return jsonify({"error": "Invalid installed_at timestamp"}), 400

    plaintext_api_key = secrets.token_urlsafe(32)

    equipment = Equipment(
        serial=serial,
        type=eq_type,
        branch_id=branch.id,
        company_id=branch.company_id,
        manufacturer=data.manufacturer,
        model=data.model,
        installed_at=installed_at,
        api_key=hash_api_key(plaintext_api_key),
    )

    try:
        db.session.add(equipment)
        db.session.flush()
        record_audit_log(
            user_id=user.id,
            action="create_equipment",
            entity_type=AuditEntityType.EQUIPMENT,
            entity_id=equipment.id,
            changes={"serial": equipment.serial, "branch_id": str(equipment.branch_id)},
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify(
            {"error": "Equipment with this serial number already exists or violates branch/company integrity"}
        ), 400

    result = equipment.to_dict(branch_name=branch.name)
    result["api_key"] = plaintext_api_key  # Plaintext returned only once on creation

    return json_response(EquipmentCreated, result, 201)


def _load_mutable_equipment(
    equipment_id: str,
) -> tuple[User | None, Equipment | None, tuple[Response, int] | None]:
    """Load requesting admin user and target equipment with joined branch and tenant guard."""
    user = db.session.get(User, get_jwt_identity())
    if not user:
        return None, None, (jsonify({"error": "User not found"}), 404)

    if user.role == UserRole.COMPANY_VIEWER:
        return None, None, (jsonify({"error": "Forbidden"}), 403)

    equipment = Equipment.query.options(joinedload(Equipment.branch)).filter(Equipment.id == equipment_id).first()
    if not equipment:
        return None, None, (jsonify({"error": "Equipment not found"}), 404)

    if user.role != UserRole.GLOBAL_ADMIN and equipment.company_id != user.company_id:
        return None, None, (jsonify({"error": "Forbidden"}), 403)

    return user, equipment, None


def _apply_equipment_branch_update(
    equipment: Equipment, branch_id: str, changes: dict[str, object]
) -> tuple[Response, int] | None:
    """Validate same-company branch reassignment and record audit diff."""
    new_branch = db.session.get(Branch, branch_id)
    if not new_branch:
        return jsonify({"error": "Target branch not found"}), 404
    if new_branch.company_id != equipment.company_id:
        return jsonify({"error": "Cannot move equipment to a branch in another company"}), 400
    if new_branch.id != equipment.branch_id:
        changes["branch_id"] = {"old": str(equipment.branch_id), "new": str(new_branch.id)}
        equipment.branch_id = new_branch.id
    return None


def _apply_equipment_metadata_updates(
    equipment: Equipment, data: EquipmentUpdateRequest, changes: dict[str, object]
) -> tuple[Response, int] | None:
    """Apply manufacturer, model, installed_at, and is_active updates to an equipment record."""
    if "manufacturer" in data.model_fields_set and data.manufacturer != equipment.manufacturer:
        manufacturer = data.manufacturer
        changes["manufacturer"] = {"old": equipment.manufacturer, "new": manufacturer}
        equipment.manufacturer = manufacturer

    if "model" in data.model_fields_set and data.model != equipment.model:
        model_val = data.model
        changes["model"] = {"old": equipment.model, "new": model_val}
        equipment.model = model_val

    if "installed_at" in data.model_fields_set:
        raw_installed_at = data.installed_at
        if raw_installed_at is None:
            equipment.installed_at = None
        else:
            try:
                equipment.installed_at = parse_iso_datetime(raw_installed_at)
            except ValueError:
                return jsonify({"error": "Invalid installed_at timestamp"}), 400

    if "is_active" in data.model_fields_set and data.is_active is not None and data.is_active != equipment.is_active:
        changes["is_active"] = {"old": equipment.is_active, "new": data.is_active}
        equipment.is_active = data.is_active

    return None


@equipments_bp.route("/<equipment_id>", methods=["PATCH"])
@openapi_meta(
    summary="Update equipment",
    tags=["Equipments"],
    request_body=EquipmentUpdateRequest,
    responses={200: EquipmentResponse},
)
@jwt_required()
def update_equipment(equipment_id: str) -> tuple[Response, int]:
    """Update equipment metadata or reassign branch within the same company."""
    user, equipment, auth_err = _load_mutable_equipment(equipment_id)
    if auth_err:
        return auth_err
    if user is None or equipment is None:
        return jsonify({"error": "Equipment not found"}), 404

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_model(EquipmentUpdateRequest, raw_data, allow_empty=True)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400
    changes: dict[str, object] = {}

    if "type" in data.model_fields_set and data.type is not None:
        new_type = EquipmentType(data.type)
        if new_type != equipment.type:
            changes["type"] = {"old": equipment.type.value, "new": new_type.value}
            equipment.type = new_type

    if "branch_id" in data.model_fields_set and data.branch_id is not None:
        branch_err = _apply_equipment_branch_update(equipment, data.branch_id, changes)
        if branch_err:
            return branch_err

    meta_err = _apply_equipment_metadata_updates(equipment, data, changes)
    if meta_err:
        return meta_err

    try:
        record_audit_log(
            user_id=user.id,
            action="update_equipment",
            entity_type=AuditEntityType.EQUIPMENT,
            entity_id=equipment.id,
            changes=changes or None,
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Equipment update violated database integrity constraints"}), 400

    db.session.refresh(equipment)
    return json_response(EquipmentResponse, _serialize_equipment(equipment), 200)


@equipments_bp.route("/<equipment_id>/rotate-api-key", methods=["POST"])
@openapi_meta(
    summary="Rotate equipment API key",
    tags=["Equipments"],
    responses={200: RotateApiKeyResponse},
)
@jwt_required()
def rotate_equipment_api_key(equipment_id: str) -> tuple[Response, int]:
    """Rotate equipment API key and store only its SHA-256 hash."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        return jsonify({"error": "Equipment not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN and equipment.company_id != user.company_id:
        return jsonify({"error": "Forbidden"}), 403

    plaintext_api_key = secrets.token_urlsafe(32)
    equipment.api_key = hash_api_key(plaintext_api_key)
    record_audit_log(
        user_id=user.id,
        action="rotate_equipment_api_key",
        entity_type=AuditEntityType.EQUIPMENT,
        entity_id=equipment.id,
    )
    db.session.commit()

    return json_response(
        RotateApiKeyResponse,
        {
            "equipment_id": str(equipment.id),
            "api_key": plaintext_api_key,
        },
        200,
    )


@equipments_bp.route("/<equipment_id>", methods=["DELETE"])
@openapi_meta(
    summary="Deactivate equipment",
    tags=["Equipments"],
    responses={204: None},
)
@jwt_required()
def delete_equipment(equipment_id: str) -> tuple[Response | str, int]:
    """Soft-deactivate equipment (is_active = False) to preserve 100% of telemetry, alert, and maintenance history."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        return jsonify({"error": "Equipment not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN and equipment.company_id != user.company_id:
        return jsonify({"error": "Forbidden"}), 403

    old_active = equipment.is_active
    equipment.is_active = False
    record_audit_log(
        user_id=user.id,
        action="deactivate_equipment",
        entity_type=AuditEntityType.EQUIPMENT,
        entity_id=equipment.id,
        changes={"is_active": {"old": old_active, "new": False}},
    )
    db.session.commit()

    return "", 204
