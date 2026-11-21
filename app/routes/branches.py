"""
Branches Routes
CRUD operations for branches
"""

import uuid

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql.selectable import Subquery

from app import db
from app.enums import AuditEntityType
from app.models import (
    Branch,
    BranchAccessType,
    Equipment,
    User,
    UserBranchAccess,
    UserRole,
)
from app.schemas import Branch as BranchResponse
from app.schemas import (
    BranchCreateRequest,
    BranchesListResponse,
    BranchesQuery,
    BranchUpdateRequest,
    Error,
    MessageResponse,
    json_response,
    openapi_meta,
    validate_query_model,
    validate_request_model,
)
from app.utils import clamp_pagination, get_allowed_branch_ids, record_audit_log

branches_bp = Blueprint("branches", __name__)


def _branch_equipment_count_subquery() -> Subquery:
    """Grouped subquery for active equipment count per branch (prevents N+1)."""
    return (
        db.session.query(
            Equipment.branch_id.label("branch_id"),
            func.count(Equipment.id).label("equipment_count"),
        )
        .filter(Equipment.is_active.is_(True))
        .group_by(Equipment.branch_id)
        .subquery()
    )


@branches_bp.route("", methods=["GET"])
@openapi_meta(
    summary="List branches",
    tags=["Branches"],
    query_params=BranchesQuery,
    responses={200: BranchesListResponse},
)
@jwt_required()
def get_branches() -> tuple[Response, int]:
    """Get branches with pagination, viewer branch scoping, and single-query equipment_count."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    query_params, q_err = validate_query_model(BranchesQuery, request.args)
    if q_err or query_params is None:
        return jsonify({"error": q_err or "Invalid query parameters"}), 400

    page, limit = clamp_pagination(query_params.page, query_params.limit)
    company_id = query_params.company_id

    eq_sq = _branch_equipment_count_subquery()
    query = db.session.query(
        Branch,
        func.coalesce(eq_sq.c.equipment_count, 0).label("equipment_count"),
    ).outerjoin(eq_sq, Branch.id == eq_sq.c.branch_id)

    if user.role == UserRole.GLOBAL_ADMIN:
        if company_id:
            query = query.filter(Branch.company_id == company_id)
    else:
        query = query.filter(Branch.company_id == user.company_id)
        allowed_branches = get_allowed_branch_ids(user)
        if allowed_branches is not None:
            query = query.filter(Branch.id.in_(allowed_branches))

    query = query.order_by(Branch.created_at.asc())
    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    total_pages = (total + limit - 1) // limit if total else 0

    return json_response(
        BranchesListResponse,
        {
            "branches": [branch.to_dict(equipment_count=eq_count) for branch, eq_count in items],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
            },
        },
        200,
    )


@branches_bp.route("/<branch_id>", methods=["GET"])
@openapi_meta(
    summary="Get branch by ID",
    tags=["Branches"],
    responses={200: BranchResponse},
)
@jwt_required()
def get_branch(branch_id: str) -> tuple[Response, int]:
    """Get a specific branch including equipment_count."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    eq_sq = _branch_equipment_count_subquery()
    row = (
        db.session.query(
            Branch,
            func.coalesce(eq_sq.c.equipment_count, 0).label("equipment_count"),
        )
        .outerjoin(eq_sq, Branch.id == eq_sq.c.branch_id)
        .filter(Branch.id == branch_id)
        .first()
    )
    if not row:
        return jsonify({"error": "Branch not found"}), 404

    branch, eq_count = row

    if user.role != UserRole.GLOBAL_ADMIN:
        if branch.company_id != user.company_id:
            return jsonify({"error": "Forbidden"}), 403
        allowed_branches = get_allowed_branch_ids(user)
        if allowed_branches is not None and branch.id not in allowed_branches:
            return jsonify({"error": "Forbidden"}), 403

    return json_response(BranchResponse, branch.to_dict(equipment_count=eq_count), 200)


@branches_bp.route("", methods=["POST"])
@openapi_meta(
    summary="Create a new branch",
    tags=["Branches"],
    request_body=BranchCreateRequest,
    responses={201: BranchResponse},
)
@jwt_required()
def create_branch() -> tuple[Response, int]:
    """Create a new branch (Global Admin or owning Company Admin)."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_model(BranchCreateRequest, raw_data)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    company_id: uuid.UUID | str | None
    if user.role == UserRole.GLOBAL_ADMIN:
        company_id = data.company_id
        if not company_id:
            return jsonify({"error": "company_id is required for Global Admin"}), 400
    else:
        requested_company_id = data.company_id
        if requested_company_id and requested_company_id != str(user.company_id):
            return jsonify({"error": "Forbidden"}), 403
        company_id = user.company_id

    name = data.name
    if Branch.query.filter_by(company_id=company_id, name=name).first():
        return jsonify({"error": "A branch with this name already exists in the company"}), 400

    branch = Branch(
        company_id=company_id,
        name=name,
        address=data.address,
        manager_contact=data.manager_contact,
    )

    try:
        db.session.add(branch)
        db.session.flush()
        record_audit_log(
            user_id=user.id,
            action="create_branch",
            entity_type=AuditEntityType.BRANCH,
            entity_id=branch.id,
            changes={"name": branch.name, "company_id": str(branch.company_id)},
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "A branch with this name already exists in the company"}), 400

    return json_response(BranchResponse, branch.to_dict(equipment_count=0), 201)


def _apply_branch_updates(branch: Branch, data: BranchUpdateRequest) -> dict[str, object]:
    """Apply validated partial update fields to a Branch and return the audit diff."""
    changes: dict[str, object] = {}
    fields = data.model_fields_set
    if "name" in fields and data.name is not None and data.name != branch.name:
        changes["name"] = {"old": branch.name, "new": data.name}
        branch.name = data.name
    if "address" in fields and data.address is not None and data.address != branch.address:
        changes["address"] = {"old": branch.address, "new": data.address}
        branch.address = data.address
    if "manager_contact" in fields and data.manager_contact != branch.manager_contact:
        changes["manager_contact"] = {"old": branch.manager_contact, "new": data.manager_contact}
        branch.manager_contact = data.manager_contact
    return changes


@branches_bp.route("/<branch_id>", methods=["PATCH"])
@openapi_meta(
    summary="Update branch",
    tags=["Branches"],
    request_body=BranchUpdateRequest,
    responses={200: BranchResponse},
)
@jwt_required()
def update_branch(branch_id: str) -> tuple[Response, int]:
    """Update a branch (Global Admin or owning Company Admin)."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    branch = db.session.get(Branch, branch_id)
    if not branch:
        return jsonify({"error": "Branch not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN and branch.company_id != user.company_id:
        return jsonify({"error": "Forbidden"}), 403

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_model(BranchUpdateRequest, raw_data, allow_empty=True)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    changes = _apply_branch_updates(branch, data)

    try:
        record_audit_log(
            user_id=user.id,
            action="update_branch",
            entity_type=AuditEntityType.BRANCH,
            entity_id=branch.id,
            changes=changes or None,
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "A branch with this name already exists in the company"}), 400

    eq_count = Equipment.query.filter_by(branch_id=branch.id, is_active=True).count()
    return json_response(BranchResponse, branch.to_dict(equipment_count=eq_count), 200)


@branches_bp.route("/<branch_id>", methods=["DELETE"])
@openapi_meta(
    summary="Delete branch",
    tags=["Branches"],
    responses={200: MessageResponse, 409: Error},
)
@jwt_required()
def delete_branch(branch_id: str) -> tuple[Response, int]:
    """Delete an empty branch (guarded against assigned equipment and single-branch viewers)."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    branch = db.session.get(Branch, branch_id)
    if not branch:
        return jsonify({"error": "Branch not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN and branch.company_id != user.company_id:
        return jsonify({"error": "Forbidden"}), 403

    # Guard 1: Cannot delete a branch that has any equipment (active or historical)
    assigned_equipment_count = Equipment.query.filter_by(branch_id=branch.id).count()
    if assigned_equipment_count > 0:
        return jsonify(
            {
                "error": "Conflict",
                "message": "Cannot delete branch with assigned equipment. Reassign equipment first.",
                "equipment_count": assigned_equipment_count,
            }
        ), 409

    # Guard 2: Cannot delete a branch if any restricted viewer would be left with 0 branches
    restricted_users_with_branch = (
        db.session.query(UserBranchAccess.user_id)
        .join(User, User.id == UserBranchAccess.user_id)
        .filter(
            UserBranchAccess.branch_id == branch.id,
            User.role == UserRole.COMPANY_VIEWER,
            User.branch_access_type == BranchAccessType.RESTRICTED,
        )
        .subquery()
    )
    orphaned_viewer = (
        db.session.query(UserBranchAccess.user_id)
        .filter(UserBranchAccess.user_id.in_(db.session.query(restricted_users_with_branch.c.user_id)))
        .group_by(UserBranchAccess.user_id)
        .having(func.count(UserBranchAccess.branch_id) <= 1)
        .first()
    )
    if orphaned_viewer:
        return jsonify(
            {
                "error": "Conflict",
                "message": "Cannot delete branch because at least one restricted viewer is only assigned to this branch.",
            }
        ), 409

    deleted_id = branch.id
    deleted_name = branch.name
    try:
        db.session.delete(branch)
        record_audit_log(
            user_id=user.id,
            action="delete_branch",
            entity_type=AuditEntityType.BRANCH,
            entity_id=deleted_id,
            changes={"name": deleted_name},
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify(
            {
                "error": "Conflict",
                "message": "Branch is still referenced and cannot be deleted.",
            }
        ), 409

    return json_response(MessageResponse, {"message": "Branch deleted"}, 200)
