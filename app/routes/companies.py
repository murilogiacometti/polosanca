"""
Companies Routes
CRUD operations for companies
"""

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql.selectable import Subquery

from app import db
from app.enums import AuditEntityType
from app.models import Branch, Company, CompanyStatus, Equipment, User, UserRole
from app.schemas import (
    CompaniesListResponse,
    CompaniesQuery,
    CompanyCreateRequest,
    CompanyUpdateRequest,
    DeactivateCompanyResponse,
    json_response,
    openapi_meta,
    validate_query_model,
    validate_request_model,
)
from app.schemas import Company as CompanyResponse
from app.utils import clamp_pagination, record_audit_log

companies_bp = Blueprint("companies", __name__)


def _company_counts_subqueries() -> tuple[Subquery, Subquery]:
    """Build grouped subqueries for branches_count and active equipment_count (prevents N+1)."""
    branches_sq = (
        db.session.query(
            Branch.company_id.label("company_id"),
            func.count(Branch.id).label("branches_count"),
        )
        .group_by(Branch.company_id)
        .subquery()
    )
    equipments_sq = (
        db.session.query(
            Equipment.company_id.label("company_id"),
            func.count(Equipment.id).label("equipment_count"),
        )
        .filter(Equipment.is_active.is_(True))
        .group_by(Equipment.company_id)
        .subquery()
    )
    return branches_sq, equipments_sq


@companies_bp.route("", methods=["GET"])
@openapi_meta(
    summary="List companies",
    tags=["Companies"],
    query_params=CompaniesQuery,
    responses={200: CompaniesListResponse},
)
@jwt_required()
def get_companies() -> tuple[Response, int]:
    """Get all companies with pagination and single-query aggregate counts."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({"error": "Forbidden"}), 403

    query_params, q_err = validate_query_model(CompaniesQuery, request.args)
    if q_err or query_params is None:
        return jsonify({"error": q_err or "Invalid query parameters"}), 400

    page, limit = clamp_pagination(query_params.page, query_params.limit)
    status_filter = query_params.status

    branches_sq, equipments_sq = _company_counts_subqueries()
    query = (
        db.session.query(
            Company,
            func.coalesce(branches_sq.c.branches_count, 0).label("branches_count"),
            func.coalesce(equipments_sq.c.equipment_count, 0).label("equipment_count"),
        )
        .outerjoin(branches_sq, Company.id == branches_sq.c.company_id)
        .outerjoin(equipments_sq, Company.id == equipments_sq.c.company_id)
    )

    if status_filter:
        query = query.filter(Company.status == status_filter)

    query = query.order_by(Company.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    total_pages = (total + limit - 1) // limit if total else 0

    return json_response(
        CompaniesListResponse,
        {
            "companies": [
                company.to_dict(branches_count=b_cnt, equipment_count=e_cnt) for company, b_cnt, e_cnt in items
            ],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
            },
        },
        200,
    )


@companies_bp.route("/<company_id>", methods=["GET"])
@openapi_meta(
    summary="Get company by ID",
    tags=["Companies"],
    responses={200: CompanyResponse},
)
@jwt_required()
def get_company(company_id: str) -> tuple[Response, int]:
    """Get a specific company with single-query aggregate counts."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    branches_sq, equipments_sq = _company_counts_subqueries()
    row = (
        db.session.query(
            Company,
            func.coalesce(branches_sq.c.branches_count, 0).label("branches_count"),
            func.coalesce(equipments_sq.c.equipment_count, 0).label("equipment_count"),
        )
        .outerjoin(branches_sq, Company.id == branches_sq.c.company_id)
        .outerjoin(equipments_sq, Company.id == equipments_sq.c.company_id)
        .filter(Company.id == company_id)
        .first()
    )

    if not row:
        return jsonify({"error": "Company not found"}), 404

    company, b_cnt, e_cnt = row

    if user.role != UserRole.GLOBAL_ADMIN and str(user.company_id) != str(company.id):
        return jsonify({"error": "Forbidden"}), 403

    return json_response(CompanyResponse, company.to_dict(branches_count=b_cnt, equipment_count=e_cnt), 200)


@companies_bp.route("", methods=["POST"])
@openapi_meta(
    summary="Create a new company",
    tags=["Companies"],
    request_body=CompanyCreateRequest,
    responses={201: CompanyResponse},
)
@jwt_required()
def create_company() -> tuple[Response, int]:
    """Create a new company (Global Admin only)."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({"error": "Forbidden"}), 403

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_model(CompanyCreateRequest, raw_data)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    name = data.name
    if Company.query.filter_by(name=name).first():
        return jsonify({"error": "A company with this name already exists"}), 400

    company = Company(
        name=name,
        contact_email=data.contact_email,
        contact_phone=data.contact_phone,
    )

    try:
        db.session.add(company)
        db.session.flush()
        record_audit_log(
            user_id=user.id,
            action="create_company",
            entity_type=AuditEntityType.COMPANY,
            entity_id=company.id,
            changes={"name": company.name},
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "A company with this name already exists"}), 400

    return json_response(CompanyResponse, company.to_dict(branches_count=0, equipment_count=0), 201)


def _apply_company_updates(company: Company, data: CompanyUpdateRequest) -> dict[str, object]:
    """Apply validated partial update fields to a Company and return the audit diff."""
    changes: dict[str, object] = {}
    fields = data.model_fields_set
    if "name" in fields and data.name is not None and data.name != company.name:
        changes["name"] = {"old": company.name, "new": data.name}
        company.name = data.name
    if "contact_email" in fields and data.contact_email != company.contact_email:
        changes["contact_email"] = {"old": company.contact_email, "new": data.contact_email}
        company.contact_email = data.contact_email
    if "contact_phone" in fields and data.contact_phone != company.contact_phone:
        changes["contact_phone"] = {"old": company.contact_phone, "new": data.contact_phone}
        company.contact_phone = data.contact_phone
    if "status" in fields and data.status is not None:
        new_status = CompanyStatus(data.status)
        if new_status != company.status:
            changes["status"] = {"old": company.status.value, "new": new_status.value}
            company.status = new_status
    return changes


@companies_bp.route("/<company_id>", methods=["PATCH"])
@openapi_meta(
    summary="Update company",
    tags=["Companies"],
    request_body=CompanyUpdateRequest,
    responses={200: CompanyResponse},
)
@jwt_required()
def update_company(company_id: str) -> tuple[Response, int]:
    """Update a company (Global Admin or own Company Admin; status changes Global Admin only)."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    company = db.session.get(Company, company_id)
    if not company:
        return jsonify({"error": "Company not found"}), 404

    if user.role == UserRole.COMPANY_ADMIN and str(user.company_id) != str(company.id):
        return jsonify({"error": "Forbidden"}), 403

    raw_data = request.get_json(silent=True)
    if isinstance(raw_data, dict) and "status" in raw_data and user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({"error": "Only Global Administrators can change company status"}), 403

    data, val_err = validate_request_model(CompanyUpdateRequest, raw_data, allow_empty=True)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    changes = _apply_company_updates(company, data)

    try:
        record_audit_log(
            user_id=user.id,
            action="update_company",
            entity_type=AuditEntityType.COMPANY,
            entity_id=company.id,
            changes=changes or None,
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "A company with this name already exists"}), 400

    return json_response(CompanyResponse, company.to_dict(), 200)


@companies_bp.route("/<company_id>", methods=["DELETE"])
@openapi_meta(
    summary="Deactivate company",
    tags=["Companies"],
    responses={200: DeactivateCompanyResponse},
)
@jwt_required()
def delete_company(company_id: str) -> tuple[Response, int]:
    """Soft-deactivate a company (Global Admin only) — preserves all historical records."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({"error": "Forbidden"}), 403

    company = db.session.get(Company, company_id)
    if not company:
        return jsonify({"error": "Company not found"}), 404

    old_status = company.status.value
    company.status = CompanyStatus.INACTIVE
    record_audit_log(
        user_id=user.id,
        action="deactivate_company",
        entity_type=AuditEntityType.COMPANY,
        entity_id=company.id,
        changes={"status": {"old": old_status, "new": CompanyStatus.INACTIVE.value}},
    )
    db.session.commit()

    return json_response(
        DeactivateCompanyResponse, {"message": "Company deactivated", "status": company.status.value}, 200
    )
