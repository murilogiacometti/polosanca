"""
Users Routes
CRUD operations for users
"""

import secrets
import uuid
from collections.abc import Sequence
from datetime import timedelta

import bcrypt
from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_limiter.util import get_remote_address
from sqlalchemy.orm import joinedload

from app import db, limiter
from app.models import Branch, BranchAccessType, User, UserBranchAccess, UserRole, UserStatus
from app.schemas import (
    AcceptInvitationSchema,
    BranchAccessInputPayload,
    UserCreatePayload,
    UserCreateSchema,
    UserInviteSchema,
    UserUpdatePayload,
    UserUpdateSchema,
    validate_request_schema,
)
from app.utils import (
    clamp_pagination,
    ensure_utc,
    record_audit_log,
    send_invitation_email,
    utc_now,
)

users_bp = Blueprint("users", __name__)
_user_invite_schema = UserInviteSchema()
_accept_invitation_schema = AcceptInvitationSchema()
_user_create_schema = UserCreateSchema()
_user_update_schema = UserUpdateSchema()


def _validate_company_branches(company_id: uuid.UUID | str | None, branch_ids: Sequence[str]) -> str | None:
    """Verify every branch_id exists and belongs to the target company_id."""
    if not company_id:
        return "Branch restrictions cannot be assigned without a company_id"
    unique_ids = list(dict.fromkeys(branch_ids))
    matched_count = Branch.query.filter(
        Branch.company_id == company_id,
        Branch.id.in_(unique_ids),
    ).count()
    if matched_count != len(unique_ids):
        return "One or more specified branches do not belong to the user company"
    return None


def _serialize_user_with_branch_access(user: User) -> dict[str, object]:
    user_dict = user.to_dict()
    if user.branch_access_type == BranchAccessType.RESTRICTED:
        user_dict["branch_access"] = {
            "type": user.branch_access_type.value,
            "branches": [str(ba.branch_id) for ba in user.branch_accesses],
        }
    else:
        user_dict["branch_access"] = {
            "type": user.branch_access_type.value,
        }
    return user_dict


@users_bp.route("", methods=["GET"])
@jwt_required()
def get_users() -> tuple[Response, int]:
    """List users scoped to caller permissions (Global Admin or owning Company Admin)."""
    user_id = get_jwt_identity()
    requesting_user = db.session.get(User, user_id)
    if not requesting_user:
        return jsonify({"error": "User not found"}), 404

    if requesting_user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    page, limit = clamp_pagination(
        request.args.get("page", 1, type=int),
        request.args.get("limit", 20, type=int),
    )
    company_id_filter = request.args.get("company_id")
    role_filter = request.args.get("role")
    status_filter = request.args.get("status")

    query = User.query.options(joinedload(User.branch_accesses))

    if requesting_user.role == UserRole.GLOBAL_ADMIN:
        if company_id_filter:
            query = query.filter(User.company_id == company_id_filter)
    else:
        if company_id_filter and company_id_filter != str(requesting_user.company_id):
            return jsonify({"error": "Forbidden"}), 403
        query = query.filter(User.company_id == requesting_user.company_id)

    if role_filter:
        try:
            query = query.filter(User.role == UserRole(role_filter))
        except ValueError:
            return jsonify({"error": "Invalid role filter"}), 400

    if status_filter:
        try:
            query = query.filter(User.status == UserStatus(status_filter))
        except ValueError:
            return jsonify({"error": "Invalid status filter"}), 400

    users = query.order_by(User.created_at.desc()).paginate(page=page, per_page=limit, error_out=False)

    return jsonify(
        {
            "users": [_serialize_user_with_branch_access(u) for u in users.items],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": users.total,
                "total_pages": users.pages,
            },
        }
    ), 200


@users_bp.route("/<user_id>", methods=["GET"])
@jwt_required()
def get_user(user_id: str) -> tuple[Response, int]:
    """Get a specific user (Global Admin or owning Company Admin)."""
    requesting_user = db.session.get(User, get_jwt_identity())
    if not requesting_user:
        return jsonify({"error": "User not found"}), 404

    if requesting_user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if requesting_user.role == UserRole.COMPANY_ADMIN and (
        user.company_id != requesting_user.company_id or user.role == UserRole.GLOBAL_ADMIN
    ):
        return jsonify({"error": "Forbidden"}), 403

    return jsonify(_serialize_user_with_branch_access(user)), 200


def _resolve_invite_company_id(
    requesting_user: User,
    invited_role: UserRole,
    requested_company_id: uuid.UUID | str | None,
) -> tuple[uuid.UUID | str | None, tuple[Response, int] | None]:
    """Authorize invited role/company and return (company_id, error_response)."""
    if requesting_user.role == UserRole.COMPANY_ADMIN:
        if invited_role == UserRole.GLOBAL_ADMIN:
            return None, (jsonify({"error": "You cannot invite global administrators"}), 403)
        company_id = requested_company_id or requesting_user.company_id
        if str(company_id) != str(requesting_user.company_id):
            return None, (jsonify({"error": "You can only invite users to your own company"}), 403)
        return requesting_user.company_id, None

    company_id = requested_company_id or None
    if invited_role == UserRole.GLOBAL_ADMIN:
        return None, None
    if not company_id:
        return None, (jsonify({"error": "company_id is required for non-global-admin roles"}), 400)
    return company_id, None


def _parse_invite_branch_access(
    branch_access: BranchAccessInputPayload | None,
    company_id: uuid.UUID | str | None,
) -> tuple[BranchAccessType | None, list[str], tuple[Response, int] | None]:
    """Validate optional branch_access payload for an invited user."""
    if not branch_access:
        return None, [], None

    access_type = branch_access.get("type", "full")
    try:
        parsed_type = BranchAccessType(access_type)
    except ValueError:
        return None, [], (jsonify({"error": "Invalid branch access type"}), 400)

    if access_type != "restricted":
        return parsed_type, [], None

    branch_ids = branch_access.get("branches", [])
    if not branch_ids:
        return None, [], (jsonify({"error": "At least one branch must be assigned for restricted access"}), 400)

    branch_err = _validate_company_branches(company_id, branch_ids)
    if branch_err:
        return None, [], (jsonify({"error": branch_err}), 400)

    return parsed_type, list(dict.fromkeys(branch_ids)), None


def _authorize_user_management(user_id: str) -> tuple[User | None, User | None, tuple[Response, int] | None]:
    """Load requesting and target users while enforcing admin RBAC and tenant scope."""
    requesting_user = db.session.get(User, get_jwt_identity())
    if not requesting_user:
        return None, None, (jsonify({"error": "User not found"}), 404)

    if requesting_user.role == UserRole.COMPANY_VIEWER:
        return None, None, (jsonify({"error": "Forbidden"}), 403)

    user = db.session.get(User, user_id)
    if not user:
        return None, None, (jsonify({"error": "User not found"}), 404)

    if requesting_user.role == UserRole.COMPANY_ADMIN and (
        user.company_id != requesting_user.company_id or user.role == UserRole.GLOBAL_ADMIN
    ):
        return None, None, (jsonify({"error": "Forbidden"}), 403)

    return requesting_user, user, None


def _apply_user_identity_updates(
    user: User,
    data: UserUpdatePayload,
    changes: dict[str, object],
) -> tuple[Response, int] | None:
    """Apply name and unique email updates to a user and record audit diffs."""
    if "name" in data:
        new_name = data["name"]
        if new_name != user.name:
            changes["name"] = {"old": user.name, "new": new_name}
            user.name = new_name

    if "email" in data:
        new_email = data["email"].lower()
        if new_email != user.email:
            if User.query.filter_by(email=new_email).first():
                return jsonify({"error": "A user with this email already exists"}), 400
            changes["email"] = {"old": user.email, "new": new_email}
            user.email = new_email

    return None


def _apply_user_role_update(
    requesting_user: User,
    user: User,
    data: UserUpdatePayload,
    changes: dict[str, object],
) -> tuple[Response, int] | None:
    """Apply role transition with privilege-escalation and company_id guards."""
    if "role" not in data:
        return None
    new_role = UserRole(data["role"])

    if requesting_user.role == UserRole.COMPANY_ADMIN and new_role == UserRole.GLOBAL_ADMIN:
        return jsonify({"error": "Company administrators cannot assign global_admin role"}), 403

    if new_role != user.role:
        if new_role == UserRole.GLOBAL_ADMIN:
            user.company_id = None
            user.branch_access_type = BranchAccessType.FULL
            UserBranchAccess.query.filter_by(user_id=user.id).delete()
        elif user.role == UserRole.GLOBAL_ADMIN:
            target_company_id = data.get("company_id")
            if not target_company_id:
                return jsonify({"error": "company_id is required when changing global_admin to a company role"}), 400
            user.company_id = uuid.UUID(target_company_id)
        changes["role"] = {"old": user.role.value, "new": new_role.value}
        user.role = new_role

    return None


def _apply_user_branch_access_update(
    user: User,
    branch_access: BranchAccessInputPayload | None,
    changes: dict[str, object],
) -> tuple[Response, int] | None:
    """Validate and apply branch_access updates for a user."""
    if not branch_access:
        return None
    access_type = branch_access.get("type")
    if not access_type:
        return None

    try:
        parsed_access_type = BranchAccessType(access_type)
    except ValueError:
        return jsonify({"error": "Invalid branch access type"}), 400

    if parsed_access_type == BranchAccessType.RESTRICTED:
        branch_ids = branch_access.get("branches", [])
        if not branch_ids:
            return jsonify({"error": "At least one branch must be assigned for restricted access"}), 400
        branch_err = _validate_company_branches(user.company_id, branch_ids)
        if branch_err:
            return jsonify({"error": branch_err}), 400

        UserBranchAccess.query.filter_by(user_id=user.id).delete()
        deduped_branches = list(dict.fromkeys(branch_ids))
        for branch_id in deduped_branches:
            db.session.add(UserBranchAccess(user_id=user.id, branch_id=branch_id))
        changes["branch_access"] = {"type": "restricted", "branches": deduped_branches}
    elif parsed_access_type == BranchAccessType.FULL:
        UserBranchAccess.query.filter_by(user_id=user.id).delete()
        changes["branch_access"] = {"type": "full"}

    user.branch_access_type = parsed_access_type
    return None


@users_bp.route("/invite", methods=["POST"])
@jwt_required()
def invite_user() -> tuple[Response, int]:
    """
    Invite a new user to the system

    Authorization:
    - Global admins can invite anyone to any company
    - Company admins can only invite to their own company
    - Company admins cannot create global admins
    - Viewers cannot invite users
    """
    requesting_user = db.session.get(User, get_jwt_identity())
    if not requesting_user:
        return jsonify({"error": "User not found"}), 404

    if requesting_user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "You do not have permission to invite users"}), 403

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_schema(_user_invite_schema, raw_data)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    email = data["email"].lower()
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "A user with this email already exists"}), 400

    invited_role = UserRole(data["role"])
    company_id, auth_err = _resolve_invite_company_id(requesting_user, invited_role, data.get("company_id"))
    if auth_err:
        return auth_err

    parsed_access_type, restricted_branch_ids, branch_err = _parse_invite_branch_access(
        data.get("branch_access"),
        company_id,
    )
    if branch_err:
        return branch_err

    invitation_token = secrets.token_urlsafe(32)
    invitation_expires_at = utc_now() + timedelta(days=7)
    temp_password = secrets.token_urlsafe(16)
    password_hash = bcrypt.hashpw(temp_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    new_user = User(
        email=email,
        password_hash=password_hash,
        name=data["name"],
        role=invited_role,
        company_id=company_id,
        status=UserStatus.PENDING,
        invitation_token=invitation_token,
        invitation_expires_at=invitation_expires_at,
    )
    if parsed_access_type is not None:
        new_user.branch_access_type = parsed_access_type

    db.session.add(new_user)
    db.session.flush()

    for branch_id in restricted_branch_ids:
        db.session.add(UserBranchAccess(user_id=new_user.id, branch_id=branch_id))

    record_audit_log(
        user_id=requesting_user.id,
        action="invite_user",
        entity_type="user",
        entity_id=new_user.id,
        changes={
            "email": new_user.email,
            "role": new_user.role.value,
            "company_id": str(new_user.company_id) if new_user.company_id else None,
        },
    )
    db.session.commit()

    send_invitation_email(new_user.email, new_user.name, invitation_token)

    return jsonify(
        {
            "success": True,
            "user_id": str(new_user.id),
            "invitation_sent": True,
            "user": _serialize_user_with_branch_access(new_user),
            "message": "User invitation sent successfully",
        }
    ), 201


@users_bp.route("/accept-invitation", methods=["POST"])
@limiter.limit("10 per minute", key_func=get_remote_address)
def accept_invitation() -> tuple[Response, int]:
    """Redeem a 7-day invitation token, set password, and transition pending -> active."""
    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_schema(_accept_invitation_schema, raw_data)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    token = data["token"]
    password = data["password"]

    user = User.query.filter_by(invitation_token=token).first()
    if not user or user.status != UserStatus.PENDING:
        return jsonify({"error": "Invalid or already redeemed invitation token"}), 400

    expires_at = ensure_utc(user.invitation_expires_at)
    if not expires_at or expires_at <= utc_now():
        return jsonify({"error": "Invitation token has expired"}), 400

    user.password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user.status = UserStatus.ACTIVE
    user.invitation_token = None
    user.invitation_expires_at = None

    record_audit_log(
        user_id=user.id,
        action="accept_invitation",
        entity_type="user",
        entity_id=user.id,
        changes={"status": {"old": "pending", "new": "active"}},
    )
    db.session.commit()

    return jsonify(
        {
            "success": True,
            "message": "Invitation accepted successfully",
        }
    ), 200


@users_bp.route("/<user_id>/resend-invitation", methods=["POST"])
@jwt_required()
def resend_invitation(user_id: str) -> tuple[Response, int]:
    """Resend invitation email to a pending user"""
    requesting_user_id = get_jwt_identity()
    requesting_user = db.session.get(User, requesting_user_id)

    if not requesting_user:
        return jsonify({"error": "Requesting user not found"}), 404

    # Only admins can resend invitations
    if requesting_user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "You do not have permission to resend invitations"}), 403

    # Get the user to resend invitation to
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Company admins can only resend invitations for their own company (check before status leak)
    if requesting_user.role == UserRole.COMPANY_ADMIN and (
        user.company_id != requesting_user.company_id or user.role == UserRole.GLOBAL_ADMIN
    ):
        return jsonify({"error": "You can only resend invitations to users in your company"}), 403

    # Check if user is pending
    if user.status != UserStatus.PENDING:
        return jsonify({"error": "Can only resend invitations to pending users"}), 400

    # Generate new invitation token
    invitation_token = secrets.token_urlsafe(32)
    invitation_expires_at = utc_now() + timedelta(days=7)

    # Update user's invitation token
    user.invitation_token = invitation_token
    user.invitation_expires_at = invitation_expires_at
    record_audit_log(
        user_id=requesting_user.id,
        action="resend_invitation",
        entity_type="user",
        entity_id=user.id,
    )
    db.session.commit()

    # Send invitation email
    send_invitation_email(user.email, user.name, invitation_token)

    return jsonify(
        {"success": True, "user_id": str(user.id), "invitation_sent": True, "message": "Invitation resent successfully"}
    ), 200


def _validate_direct_user_branch_access(
    data: UserCreatePayload,
    company_id: uuid.UUID | str | None,
) -> tuple[BranchAccessType | None, list[str], tuple[Response, int] | None]:
    """Parse and validate branch_access_type and branch_ids for direct user creation."""
    access_type = BranchAccessType(data["branch_access_type"])
    branch_ids = data["branch_ids"]
    if access_type != BranchAccessType.RESTRICTED:
        return access_type, [], None
    if not branch_ids:
        return None, [], (jsonify({"error": "branch_ids are required for restricted branch access"}), 400)
    branch_err = _validate_company_branches(company_id, branch_ids)
    if branch_err:
        return None, [], (jsonify({"error": branch_err}), 400)
    return access_type, list(dict.fromkeys(branch_ids)), None


@users_bp.route("", methods=["POST"])
@jwt_required()
def create_user() -> tuple[Response, int]:
    """Direct user creation (restricted strictly to Global Admin; prefer /v1/users/invite)."""
    requesting_user = db.session.get(User, get_jwt_identity())
    if not requesting_user:
        return jsonify({"error": "User not found"}), 404

    if requesting_user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({"error": "Forbidden: use /v1/users/invite to onboard users"}), 403

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_schema(_user_create_schema, raw_data)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    email = data["email"].lower()
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "A user with this email already exists"}), 400

    role = UserRole(data["role"])

    company_id = None if role == UserRole.GLOBAL_ADMIN else data.get("company_id")
    if role != UserRole.GLOBAL_ADMIN and not company_id:
        return jsonify({"error": "company_id is required for non-global-admin roles"}), 400

    access_type, restricted_branch_ids, branch_err = _validate_direct_user_branch_access(data, company_id)
    if branch_err:
        return branch_err

    password = data["password"]
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    user = User(
        email=email,
        password_hash=password_hash,
        name=data["name"].strip(),
        role=role,
        company_id=company_id,
        status=UserStatus.ACTIVE,
        branch_access_type=access_type,
    )

    db.session.add(user)
    db.session.flush()

    for branch_id in restricted_branch_ids:
        db.session.add(UserBranchAccess(user_id=user.id, branch_id=branch_id))

    record_audit_log(
        user_id=requesting_user.id,
        action="create_user",
        entity_type="user",
        entity_id=user.id,
        changes={"email": user.email, "role": user.role.value},
    )
    db.session.commit()

    return jsonify(_serialize_user_with_branch_access(user)), 201


@users_bp.route("/<user_id>", methods=["PATCH"])
@jwt_required()
def update_user(user_id: str) -> tuple[Response, int]:
    """Update a user (Global Admin, or owning Company Admin without privilege escalation)."""
    requesting_user, user, auth_err = _authorize_user_management(user_id)
    if auth_err is not None or requesting_user is None or user is None:
        return auth_err or (jsonify({"error": "User not found"}), 404)

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_schema(_user_update_schema, raw_data, allow_empty=True)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400
    changes: dict[str, object] = {}

    identity_err = _apply_user_identity_updates(user, data, changes)
    if identity_err:
        return identity_err

    if "role" in data:
        role_err = _apply_user_role_update(requesting_user, user, data, changes)
        if role_err:
            return role_err

    if "status" in data:
        new_status = UserStatus(data["status"])
        if new_status != user.status:
            changes["status"] = {"old": user.status.value, "new": new_status.value}
            user.status = new_status

    if "branch_access" in data:
        branch_err = _apply_user_branch_access_update(user, data["branch_access"], changes)
        if branch_err:
            return branch_err

    record_audit_log(
        user_id=requesting_user.id,
        action="update_user",
        entity_type="user",
        entity_id=user.id,
        changes=changes or None,
    )
    db.session.commit()

    return jsonify(_serialize_user_with_branch_access(user)), 200


@users_bp.route("/<user_id>", methods=["DELETE"])
@jwt_required()
def delete_user(user_id: str) -> tuple[Response | str, int]:
    """Soft-deactivate a user (Global Admin or owning Company Admin)."""
    requesting_user = db.session.get(User, get_jwt_identity())
    if not requesting_user:
        return jsonify({"error": "User not found"}), 404

    if requesting_user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if requesting_user.role == UserRole.COMPANY_ADMIN and (
        user.company_id != requesting_user.company_id or user.role == UserRole.GLOBAL_ADMIN
    ):
        return jsonify({"error": "Forbidden"}), 403

    old_status = user.status.value
    user.status = UserStatus.INACTIVE
    user.invitation_token = None
    user.invitation_expires_at = None
    user.password_reset_token = None
    user.password_reset_expires_at = None

    record_audit_log(
        user_id=requesting_user.id,
        action="deactivate_user",
        entity_type="user",
        entity_id=user.id,
        changes={"status": {"old": old_status, "new": UserStatus.INACTIVE.value}},
    )
    db.session.commit()

    return "", 204
