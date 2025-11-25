"""
Flask Application Factory
Creates and configures the Flask application instance
"""

import os
import uuid
from typing import TYPE_CHECKING, ClassVar, Protocol, runtime_checkable

import redis
from flask import Flask, Response, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import DeclarativeBase, joinedload
from werkzeug.middleware.proxy_fix import ProxyFix

from config import get_config

if TYPE_CHECKING:
    from flask_sqlalchemy.query import Query

    from app.models import User


class Base(DeclarativeBase):
    if TYPE_CHECKING:
        query: ClassVar[Query]


# Initialize extensions (but don't bind to app yet)
db = SQLAlchemy(model_class=Base)
if not TYPE_CHECKING:
    Base = db.Model
migrate = Migrate()
jwt = JWTManager()

# Import helpers after db/jwt are initialized to avoid circular imports
from app.utils.email import init_mail
from app.utils.security import (
    get_authenticated_rate_key,
    get_default_user_rate_limit,
    get_request_revocation_cache,
    is_token_issued_before_cutoff,
    is_token_revoked,
    set_request_jwt_user,
)

limiter = Limiter(
    key_func=get_authenticated_rate_key,
    default_limits=[get_default_user_rate_limit],
    in_memory_fallback_enabled=True,
    swallow_errors=True,
)


def check_database_health() -> tuple[bool, str]:
    """Verify PostgreSQL connectivity via SELECT 1."""
    try:
        db.session.execute(text("SELECT 1")).scalar()
        return True, "ok"
    except Exception as exc:
        db.session.rollback()
        return False, f"unreachable: {exc.__class__.__name__}"


@runtime_checkable
class _Pingable(Protocol):
    def ping(self) -> object: ...


def check_redis_health(app: Flask) -> tuple[bool, str]:
    """Verify Redis connectivity via PING (respecting memory:// test isolation unless forced)."""
    if (
        app.config.get("TESTING")
        and app.config.get("RATELIMIT_STORAGE_URI") == "memory://"
        and not app.config.get("HEALTHCHECK_FORCE_REDIS")
    ):
        return True, "skipped_in_testing"

    redis_url = app.config.get("REDIS_URL")
    if not redis_url:
        return False, "unconfigured"

    try:
        client: object = redis.Redis.from_url(
            redis_url,
            socket_connect_timeout=1.0,
            socket_timeout=1.0,
            decode_responses=True,
        )
        if isinstance(client, _Pingable) and client.ping():
            return True, "ok"
        return False, "ping_failed"
    except Exception as exc:
        return False, f"unreachable: {exc.__class__.__name__}"


def create_app(config_name: str | None = None) -> Flask:
    """
    Application factory function

    Args:
        config_name: Configuration to use (development, testing, production)
                     If None, uses FLASK_ENV environment variable

    Returns:
        Configured Flask application instance
    """
    app = Flask(__name__)

    # Load configuration
    if config_name:
        from config import config

        app.config.from_object(config[config_name])
        if config_name == "testing" and os.environ.get("TEST_DATABASE_URL"):
            app.config["SQLALCHEMY_DATABASE_URI"] = os.environ["TEST_DATABASE_URL"]
    else:
        app.config.from_object(get_config())

    # Initialize extensions with app
    db.init_app(app)
    # Ensure models are imported before migrate.init_app
    from app import models  # noqa: F401

    migrate.init_app(app, db)
    jwt.init_app(app)
    init_mail(app)

    # Initialize CORS
    CORS(app, origins=app.config["CORS_ORIGINS"])

    # Honor X-Forwarded-For / X-Forwarded-Proto ONLY from configured trusted proxy hops
    trusted_proxy_hops = int(app.config.get("TRUSTED_PROXY_HOPS", 0) or 0)
    if trusted_proxy_hops > 0:
        app.wsgi_app = ProxyFix(  # type: ignore[method-assign]
            app.wsgi_app,
            x_for=trusted_proxy_hops,
            x_proto=trusted_proxy_hops,
            x_host=trusted_proxy_hops,
        )

    @app.after_request
    def apply_security_headers(response: Response) -> Response:
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cache-Control", "no-store")
        if not app.config.get("DEBUG") and not app.config.get("TESTING"):
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    # Initialize rate limiter
    limiter.init_app(app)

    # Initialize Celery worker & Beat schedule bound to this app
    from app.services.tasks import init_celery

    init_celery(app)

    # Register error handlers
    register_error_handlers(app)

    # Register blueprints
    register_blueprints(app)

    # JWT callbacks
    configure_jwt(app)

    # Deep readiness health check endpoint (PostgreSQL SELECT 1 + Redis PING)
    @app.route("/health")
    def health_check() -> tuple[Response, int]:
        db_ok, db_status = check_database_health()
        redis_ok, redis_status = check_redis_health(app)
        is_healthy = db_ok and redis_ok
        env_label = app.config.get("ENV") or (
            "testing" if app.config.get("TESTING") else ("development" if app.config.get("DEBUG") else "production")
        )
        return (
            jsonify(
                {
                    "status": "healthy" if is_healthy else "unhealthy",
                    "environment": env_label,
                    "checks": {
                        "database": db_status,
                        "redis": redis_status,
                    },
                }
            ),
            200 if is_healthy else 503,
        )

    return app


def register_blueprints(app: Flask) -> None:
    """Register all Flask blueprints"""
    from app.routes.alert_rules import alert_rules_bp
    from app.routes.alerts import alerts_bp
    from app.routes.audit_logs import audit_logs_bp
    from app.routes.auth import auth_bp
    from app.routes.branches import branches_bp
    from app.routes.companies import companies_bp
    from app.routes.equipments import equipments_bp
    from app.routes.maintenance import maintenance_bp
    from app.routes.telemetry import telemetry_bp
    from app.routes.users import users_bp

    # Register with /v1/ prefix
    app.register_blueprint(auth_bp, url_prefix="/v1/auth")
    app.register_blueprint(companies_bp, url_prefix="/v1/companies")
    app.register_blueprint(branches_bp, url_prefix="/v1/branches")
    app.register_blueprint(users_bp, url_prefix="/v1/users")
    app.register_blueprint(equipments_bp, url_prefix="/v1/equipments")
    app.register_blueprint(telemetry_bp, url_prefix="/v1")
    app.register_blueprint(alerts_bp, url_prefix="/v1/alerts")
    app.register_blueprint(alert_rules_bp, url_prefix="/v1/alert-rules")
    app.register_blueprint(maintenance_bp, url_prefix="/v1")
    app.register_blueprint(audit_logs_bp, url_prefix="/v1/audit-logs")


def register_error_handlers(app: Flask) -> None:
    """Register global error handlers"""

    @app.errorhandler(400)
    def bad_request(error: Exception) -> tuple[Response, int]:
        return jsonify({"error": "Bad Request", "message": "Invalid request payload or parameters"}), 400

    @app.errorhandler(DataError)
    def handle_data_error(error: DataError) -> tuple[Response, int]:
        db.session.rollback()
        app.logger.warning(f"Invalid database parameter syntax: {error}")
        return jsonify(
            {
                "error": "Bad Request",
                "message": "Invalid identifier or parameter format.",
            }
        ), 400

    @app.errorhandler(401)
    def unauthorized(error: Exception) -> tuple[Response, int]:
        return jsonify({"error": "Unauthorized", "message": "Authentication required"}), 401

    @app.errorhandler(403)
    def forbidden(error: Exception) -> tuple[Response, int]:
        return jsonify({"error": "Forbidden", "message": "You do not have permission to access this resource"}), 403

    @app.errorhandler(404)
    def not_found(error: Exception) -> tuple[Response, int]:
        return jsonify({"error": "Not Found", "message": "The requested resource was not found"}), 404

    @app.errorhandler(429)
    def ratelimit_handler(error: Exception) -> tuple[Response, int]:
        return jsonify(
            {
                "error": "Too Many Requests",
                "message": getattr(error, "description", "Rate limit exceeded"),
            }
        ), 429

    @app.errorhandler(IntegrityError)
    def handle_integrity_error(error: IntegrityError) -> tuple[Response, int]:
        db.session.rollback()
        app.logger.warning(f"Database integrity error: {error}")
        return jsonify(
            {
                "error": "Data Integrity Violation",
                "message": "The operation violated a database uniqueness, foreign-key, or domain constraint.",
            }
        ), 400

    @app.errorhandler(500)
    def internal_error(error: Exception) -> tuple[Response, int]:
        db.session.rollback()
        app.logger.error(f"Internal server error: {error}")
        return jsonify({"error": "Internal Server Error", "message": "An unexpected error occurred"}), 500


def _resolve_active_jwt_user(identity: object) -> "User | None":
    """Load an active JWT user (with an active company, if any), or return None."""
    from app.models import CompanyStatus, User, UserStatus

    try:
        user_uuid = uuid.UUID(str(identity))
        user = db.session.get(User, user_uuid, options=[joinedload(User.company)])
    except Exception:
        return None
    if not user or user.status != UserStatus.ACTIVE:
        return None
    if user.company_id and user.company and user.company.status != CompanyStatus.ACTIVE:
        return None
    return user


def _check_if_token_revoked(jwt_header: dict[str, object], jwt_payload: dict[str, object]) -> bool:
    """Check token blocklist, revocation cutoff, and active user/company status with per-request caching."""
    raw_jti = jwt_payload.get("jti")
    jti = raw_jti if isinstance(raw_jti, str) else None
    raw_identity = jwt_payload.get("sub")
    identity = str(raw_identity) if raw_identity is not None else None
    cache_key = (jti, identity)

    revocation_cache = get_request_revocation_cache()
    if cache_key in revocation_cache:
        return revocation_cache[cache_key]

    if jti and is_token_revoked(jti):
        revocation_cache[cache_key] = True
        return True

    raw_iat = jwt_payload.get("iat")
    iat = raw_iat if isinstance(raw_iat, int | float) else None
    if identity and is_token_issued_before_cutoff(identity, iat):
        revocation_cache[cache_key] = True
        return True

    if identity:
        user = _resolve_active_jwt_user(identity)
        if user is None:
            revocation_cache[cache_key] = True
            return True
        set_request_jwt_user(user)

    revocation_cache[cache_key] = False
    return False


def configure_jwt(app: Flask) -> None:
    """Configure JWT callbacks"""
    jwt.token_in_blocklist_loader(_check_if_token_revoked)

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header: dict[str, object], jwt_payload: dict[str, object]) -> tuple[Response, int]:
        return jsonify(
            {"error": "Token Revoked", "message": "The token has been revoked or the account is inactive"}
        ), 401

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header: dict[str, object], jwt_payload: dict[str, object]) -> tuple[Response, int]:
        return jsonify({"error": "Token Expired", "message": "The token has expired"}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error: str) -> tuple[Response, int]:
        return jsonify({"error": "Invalid Token", "message": "Token verification failed"}), 401

    @jwt.unauthorized_loader
    def missing_token_callback(error: str) -> tuple[Response, int]:
        return jsonify({"error": "Authorization Required", "message": "Request does not contain a valid token"}), 401
