"""
Authentication Routes
Login, logout, token refresh, profile self-service, and password recovery
"""

import secrets
from datetime import timedelta

import bcrypt
from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)
from flask_limiter.util import get_remote_address

from app import db, limiter
from app.models import CompanyStatus, User, UserStatus
from app.schemas import (
    ChangePasswordSchema,
    ForgotPasswordSchema,
    LoginSchema,
    ProfileUpdateSchema,
    ResetPasswordSchema,
    validate_request_schema,
)
from app.utils import (
    ensure_utc,
    invalidate_user_tokens_before,
    record_audit_log,
    revoke_token_jti,
    send_password_reset_email,
    utc_now,
)

auth_bp = Blueprint("auth", __name__)
_login_schema = LoginSchema()
_profile_update_schema = ProfileUpdateSchema()
_change_password_schema = ChangePasswordSchema()
_forgot_password_schema = ForgotPasswordSchema()
_reset_password_schema = ResetPasswordSchema()


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("10 per minute", key_func=get_remote_address)
def login() -> tuple[Response, int]:
    """User login"""
    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_schema(_login_schema, raw_data)
    if val_err or data is None:
        return jsonify({"error": "Email and password are required"}), 400

    raw_email = data["email"]
    email = raw_email.lower()
    user = User.query.filter_by(email=email).first()
    if user is None and email != raw_email:
        user = User.query.filter_by(email=raw_email).first()

    if not user or not bcrypt.checkpw(data["password"].encode("utf-8"), user.password_hash.encode("utf-8")):
        return jsonify({"error": "Invalid email or password"}), 401

    if user.status != UserStatus.ACTIVE:
        return jsonify({"error": f"Account is {user.status.value}"}), 403

    if user.company_id and user.company and user.company.status != CompanyStatus.ACTIVE:
        return jsonify({"error": "Company account is inactive"}), 403

    # Update last login
    user.last_login_at = utc_now()
    db.session.commit()

    # Create tokens
    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({"access_token": access_token, "refresh_token": refresh_token, "user": user.to_dict()}), 200


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh() -> tuple[Response, int]:
    """Refresh access token"""
    identity = get_jwt_identity()
    access_token = create_access_token(identity=identity)

    return jsonify({"access_token": access_token}), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def get_current_user() -> tuple[Response, int]:
    """Get current user information"""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify(user.to_dict()), 200


@auth_bp.route("/me", methods=["PATCH"])
@jwt_required()
def update_current_user() -> tuple[Response, int]:
    """Update authenticated user's own profile name."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_schema(_profile_update_schema, raw_data)
    if val_err or data is None:
        return jsonify({"error": "A non-empty name is required"}), 400

    old_name = user.name
    new_name = data["name"]
    user.name = new_name

    record_audit_log(
        user_id=user.id,
        action="update_profile",
        entity_type="user",
        entity_id=user.id,
        changes={"name": {"old": old_name, "new": new_name}},
    )
    db.session.commit()

    return jsonify(user.to_dict()), 200


@auth_bp.route("/change-password", methods=["POST"])
@jwt_required()
def change_password() -> tuple[Response, int]:
    """Change authenticated user's own password."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_schema(_change_password_schema, raw_data)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    current_password = data["current_password"]
    new_password = data["new_password"]

    if not bcrypt.checkpw(current_password.encode("utf-8"), user.password_hash.encode("utf-8")):
        return jsonify({"error": "Current password is incorrect"}), 401

    user.password_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    record_audit_log(
        user_id=user.id,
        action="change_password",
        entity_type="user",
        entity_id=user.id,
    )
    db.session.commit()

    jwt_payload = get_jwt()
    jti = jwt_payload.get("jti")
    if isinstance(jti, str):
        revoke_token_jti(jti, jwt_payload.get("exp"))
    invalidate_user_tokens_before(str(user.id))

    return jsonify(
        {
            "success": True,
            "message": "Password changed successfully",
        }
    ), 200


@auth_bp.route("/forgot-password", methods=["POST"])
@limiter.limit("10 per minute", key_func=get_remote_address)
def forgot_password() -> tuple[Response, int]:
    """Issue a 1-hour single-use reset token for an active user; always return 200 to prevent enumeration."""
    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_schema(_forgot_password_schema, raw_data)
    if val_err or data is None:
        return jsonify({"error": "Email is required"}), 400

    email = data["email"].lower()
    user = User.query.filter_by(email=email).first()

    if (
        user
        and user.status == UserStatus.ACTIVE
        and (not user.company_id or not user.company or user.company.status == CompanyStatus.ACTIVE)
    ):
        reset_token = secrets.token_urlsafe(32)
        user.password_reset_token = reset_token
        user.password_reset_expires_at = utc_now() + timedelta(hours=1)
        record_audit_log(
            user_id=user.id,
            action="request_password_reset",
            entity_type="user",
            entity_id=user.id,
        )
        db.session.commit()
        send_password_reset_email(user.email, user.name, reset_token)

    return jsonify(
        {
            "success": True,
            "message": "If an active account exists for this email, password reset instructions have been sent",
        }
    ), 200


@auth_bp.route("/reset-password", methods=["POST"])
@limiter.limit("10 per minute", key_func=get_remote_address)
def reset_password() -> tuple[Response, int]:
    """Redeem a valid 1-hour password reset token and set a new password."""
    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_schema(_reset_password_schema, raw_data)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    token = data["token"]
    new_password = data["new_password"]

    user = User.query.filter_by(password_reset_token=token).first()
    if not user or user.status != UserStatus.ACTIVE:
        return jsonify({"error": "Invalid or expired password reset token"}), 400

    expires_at = ensure_utc(user.password_reset_expires_at)
    if not expires_at or expires_at <= utc_now():
        return jsonify({"error": "Password reset token has expired"}), 400

    user.password_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user.password_reset_token = None
    user.password_reset_expires_at = None

    record_audit_log(
        user_id=user.id,
        action="reset_password",
        entity_type="user",
        entity_id=user.id,
    )
    db.session.commit()
    invalidate_user_tokens_before(str(user.id))

    return jsonify(
        {
            "success": True,
            "message": "Password reset successfully",
        }
    ), 200


@auth_bp.route("/logout", methods=["POST"])
@jwt_required(verify_type=False)
def logout() -> tuple[Response, int]:
    """Revoke the caller's JWT JTI immediately in Redis (with in-memory fallback)."""
    jwt_payload = get_jwt()
    jti = jwt_payload.get("jti")
    if isinstance(jti, str):
        revoke_token_jti(jti, jwt_payload.get("exp"))
    return jsonify(
        {
            "success": True,
            "message": "Logged out successfully",
        }
    ), 200
