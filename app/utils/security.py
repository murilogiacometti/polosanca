"""
JWT Token Revocation (Redis + In-Memory Fallback) and Rate-Limit Helpers
"""

import hashlib
import logging
import time
from weakref import WeakKeyDictionary

import redis
from flask import current_app, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from flask_limiter.util import get_remote_address

logger = logging.getLogger(__name__)

_REVOKED_KEY_PREFIX = "jwt:revoked:"
_USER_MIN_IAT_PREFIX = "jwt:user_min_iat:"
_USER_MIN_IAT_TTL_SECONDS = 31 * 24 * 3600  # Exceeds 30-day refresh token lifetime
_IN_MEMORY_REVOKED_JTIS: dict[str, float] = {}
_IN_MEMORY_USER_MIN_IAT: dict[str, float] = {}
_REDIS_CLIENTS: dict[str, redis.Redis] = {}


def _get_redis_client() -> redis.Redis | None:
    """Return a short-timeout Redis client for JWT JTI blocklist checks, or None in test mode."""
    if not current_app or current_app.config.get("TESTING"):
        return None
    redis_url = current_app.config.get("REDIS_URL")
    if not redis_url:
        return None
    client = _REDIS_CLIENTS.get(redis_url)
    if client is None:
        new_client: object = redis.Redis.from_url(
            redis_url,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
            decode_responses=True,
        )
        if not isinstance(new_client, redis.Redis):
            return None
        _REDIS_CLIENTS[redis_url] = new_client
        return new_client
    return client


def _prune_expired_memory_jtis(now_ts: float) -> None:
    expired = [jti for jti, exp in _IN_MEMORY_REVOKED_JTIS.items() if exp <= now_ts]
    for jti in expired:
        _IN_MEMORY_REVOKED_JTIS.pop(jti, None)


def revoke_token_jti(jti: str, exp_timestamp: int | float | None = None) -> None:
    """Revoke a JWT JTI in Redis (with TTL matching remaining token lifetime) and local fallback."""
    if not jti:
        return
    now_ts = time.time()
    _prune_expired_memory_jtis(now_ts)
    ttl = max(int(exp_timestamp - now_ts), 1) if exp_timestamp is not None else 3600
    _IN_MEMORY_REVOKED_JTIS[jti] = now_ts + ttl

    client = _get_redis_client()
    if client is not None:
        try:
            client.setex(f"{_REVOKED_KEY_PREFIX}{jti}", ttl, "1")
        except redis.RedisError as exc:
            logger.warning(f"Redis unavailable during JWT revocation; using in-process blocklist: {exc}")


def is_token_revoked(jti: str) -> bool:
    """Return True if the JWT JTI has been explicitly revoked."""
    if not jti:
        return False
    now_ts = time.time()
    exp_ts = _IN_MEMORY_REVOKED_JTIS.get(jti)
    if exp_ts is not None:
        if exp_ts > now_ts:
            return True
        _IN_MEMORY_REVOKED_JTIS.pop(jti, None)

    client = _get_redis_client()
    if client is not None:
        try:
            return bool(client.exists(f"{_REVOKED_KEY_PREFIX}{jti}"))
        except redis.RedisError as exc:
            logger.warning(f"Redis unavailable during JWT check; falling back to in-process blocklist: {exc}")
    return False


def invalidate_user_tokens_before(user_id: str, cutoff_ts: float | None = None) -> None:
    """Invalidate all JWTs for a user issued before cutoff_ts (e.g. after password change/reset)."""
    if not user_id:
        return
    cutoff = float(cutoff_ts) if cutoff_ts is not None else time.time()
    key = user_id
    _IN_MEMORY_USER_MIN_IAT[key] = max(_IN_MEMORY_USER_MIN_IAT.get(key, 0.0), cutoff)

    client = _get_redis_client()
    if client is not None:
        try:
            client.setex(f"{_USER_MIN_IAT_PREFIX}{key}", _USER_MIN_IAT_TTL_SECONDS, str(cutoff))
        except redis.RedisError as exc:
            logger.warning(f"Redis unavailable during user token invalidation; using in-process cutoff: {exc}")


def is_token_issued_before_cutoff(user_id: str, iat: int | float | None) -> bool:
    """Return True if a token's `iat` predates the user's password-change/reset cutoff."""
    if not user_id or iat is None:
        return False
    key = user_id
    token_iat = float(iat)

    mem_cutoff = _IN_MEMORY_USER_MIN_IAT.get(key)
    if mem_cutoff is not None and token_iat < mem_cutoff:
        return True

    client = _get_redis_client()
    if client is not None:
        try:
            raw_cutoff = client.get(f"{_USER_MIN_IAT_PREFIX}{key}")
            if isinstance(raw_cutoff, str | bytes | int | float) and token_iat < float(raw_cutoff):
                return True
        except (redis.RedisError, ValueError) as exc:
            logger.warning(f"Redis unavailable during user min_iat check: {exc}")
    return False


def clear_revoked_tokens() -> None:
    """Clear in-memory revoked tokens and user cutoffs (used between isolated test runs)."""
    _IN_MEMORY_REVOKED_JTIS.clear()
    _IN_MEMORY_USER_MIN_IAT.clear()


def get_telemetry_rate_key() -> str:
    """Rate-limit hardware telemetry per hashed X-API-Key (falling back to client IP when missing)."""
    api_key = request.headers.get("X-API-Key")
    if api_key and api_key.strip():
        digest = hashlib.sha256(api_key.strip().encode("utf-8")).hexdigest()[:16]
        return f"telemetry_key:{digest}"
    return f"ip:{get_remote_address()}"


_REQUEST_JWT_INFO_CACHE: WeakKeyDictionary[object, tuple[str | None, bool]] = WeakKeyDictionary()
_REQUEST_JWT_USER_CACHE: WeakKeyDictionary[object, object] = WeakKeyDictionary()
_REQUEST_REVOCATION_CACHE: WeakKeyDictionary[object, dict[tuple[str | None, str | None], bool]] = WeakKeyDictionary()


def _current_request_obj() -> object:
    getter = getattr(request, "_get_current_object", None)
    return getter() if callable(getter) else request


def get_request_revocation_cache() -> dict[tuple[str | None, str | None], bool]:
    req = _current_request_obj()
    cache = _REQUEST_REVOCATION_CACHE.get(req)
    if cache is None:
        cache = {}
        _REQUEST_REVOCATION_CACHE[req] = cache
    return cache


def set_request_jwt_user(user: object) -> None:
    _REQUEST_JWT_USER_CACHE[_current_request_obj()] = user


def _get_cached_request_jwt_info() -> tuple[str | None, bool]:
    """Verify optional JWT at most once per HTTP Request and return (identity, is_global_admin)."""
    req = _current_request_obj()
    cached = _REQUEST_JWT_INFO_CACHE.get(req)
    if cached is not None:
        return cached

    identity = None
    is_global_admin = False
    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        if identity:
            from app.models import User, UserRole

            user = _REQUEST_JWT_USER_CACHE.get(req)
            if isinstance(user, User) and user.role == UserRole.GLOBAL_ADMIN:
                is_global_admin = True
    except Exception:
        identity = None
        is_global_admin = False

    result = (identity, is_global_admin)
    _REQUEST_JWT_INFO_CACHE[req] = result
    return result


def get_authenticated_rate_key() -> str:
    """Rate-limit authenticated API endpoints per user ID (falling back to client IP)."""
    identity, _ = _get_cached_request_jwt_info()
    if identity:
        return f"user:{identity}"
    return f"ip:{get_remote_address()}"


def get_default_user_rate_limit() -> str:
    """Dynamic default rate limit: 1000/min for Global Admin, 100/min for other callers."""
    _, is_global_admin = _get_cached_request_jwt_info()
    return "1000 per minute" if is_global_admin else "100 per minute"
