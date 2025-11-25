"""
Telemetry Routes
Equipment telemetry submission (with AIP-155 idempotency), single-query live snapshots,
and historical queries (with AIP-158 keyset page_token + TimescaleDB/SQL bucket routing)
"""

import math
import uuid
from collections.abc import Iterator, Mapping, Sequence
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Literal, Protocol

from flask import Blueprint, Response, jsonify, request, stream_with_context
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_limiter.util import get_remote_address
from sqlalchemy import ColumnElement, column, func, literal, or_, select, table, text, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload
from werkzeug.datastructures import MultiDict

from app import db, limiter
from app.models import (
    AlertRule,
    AlertRuleScope,
    AlertRuleType,
    CompanyStatus,
    CurrentDataSnapshot,
    Equipment,
    EquipmentStatus,
    Telemetry,
    User,
    UserRole,
)
from app.schemas import (
    HardwareTelemetryPayload,
    HardwareTelemetrySchema,
    ManualTelemetrySchema,
    validate_request_schema,
)
from app.services import SCOPE_PRIORITY, enqueue_equipment_evaluation
from app.utils import (
    DEFAULT_OFFLINE_TIMEOUT_SECONDS,
    auto_resolve_offline_alerts,
    clamp_pagination,
    decode_page_token,
    encode_page_token,
    ensure_utc,
    format_csv_row,
    get_allowed_branch_ids,
    get_telemetry_rate_key,
    parse_iso_datetime,
    recompute_equipment_status,
    record_audit_log,
    utc_now,
    verify_api_key,
)

telemetry_bp = Blueprint("telemetry", __name__)
_hardware_telemetry_schema = HardwareTelemetrySchema()
_manual_telemetry_schema = ManualTelemetrySchema()

TelemetryInterval = Literal["raw", "5min", "1hour", "1day"]
VALID_INTERVALS: tuple[TelemetryInterval, ...] = ("raw", "5min", "1hour", "1day")
RAW_EXPORT_MAX_WINDOW = timedelta(days=90)
AGGREGATED_EXPORT_MAX_WINDOW = timedelta(days=731)
MAX_REQUEST_ID_LENGTH = 128


def _parse_telemetry_interval(raw: str) -> TelemetryInterval | None:
    """Narrow a query-string interval parameter to a validated TelemetryInterval literal."""
    if raw == "raw":
        return "raw"
    if raw == "5min":
        return "5min"
    if raw == "1hour":
        return "1hour"
    if raw == "1day":
        return "1day"
    return None


ALLOWED_PROJECTION_FIELDS = {
    "id",
    "timestamp",
    "time",
    "equipment_id",
    "temperature",
    "min_temperature",
    "max_temperature",
    "pressure",
    "door",
    "heater",
    "compressor",
    "fan",
    "source",
    "recorded_by",
    "notes",
    "sample_count",
}


def _parse_binary_flag(raw_value: object, field_name: str) -> int:
    """Validate and parse a 0/1 binary component state."""
    if raw_value is None or isinstance(raw_value, bool) or not isinstance(raw_value, int | float | str | Decimal):
        raise ValueError(f"{field_name} must be 0 or 1")
    try:
        parsed = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be 0 or 1") from exc
    if parsed not in (0, 1):
        raise ValueError(f"{field_name} must be 0 or 1")
    return parsed


def _parse_decimal(raw_value: object, field_name: str) -> Decimal:
    """Validate and parse a finite numeric sensor reading."""
    if raw_value is None or isinstance(raw_value, bool) or raw_value == "":
        raise ValueError(f"{field_name} is required")
    try:
        dec = Decimal(str(raw_value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a valid number") from exc
    if not dec.is_finite():
        raise ValueError(f"{field_name} must be finite")
    return dec


def _extract_request_id(data: Mapping[str, object]) -> str | None:
    """Extract and validate optional AIP-155 request_id / Idempotency-Key."""
    header_key = request.headers.get("Idempotency-Key")
    raw_body_key = data.get("request_id")
    body_key: str | None = None

    if header_key is not None:
        header_key = header_key.strip()
        if not header_key or len(header_key) > MAX_REQUEST_ID_LENGTH:
            raise ValueError(f"Idempotency-Key must be 1 to {MAX_REQUEST_ID_LENGTH} characters")

    if raw_body_key is not None:
        body_key = str(raw_body_key).strip()
        if not body_key or len(body_key) > MAX_REQUEST_ID_LENGTH:
            raise ValueError(f"request_id must be 1 to {MAX_REQUEST_ID_LENGTH} characters")

    if header_key and body_key and header_key != body_key:
        raise ValueError("Idempotency-Key header and body request_id must match when both are provided")

    return header_key or body_key


def _relation_exists(view_name: str) -> bool:
    """Check whether a PostgreSQL/TimescaleDB view or continuous aggregate exists."""
    row = db.session.execute(
        text("SELECT to_regclass(:relname)"),
        {"relname": f"public.{view_name}"},
    ).scalar()
    return row is not None


def _authenticate_hardware_equipment(serial: str, api_key: str) -> tuple[Equipment | None, tuple[Response, int] | None]:
    """Look up equipment by serial, verify X-API-Key, and ensure equipment/company are active."""
    equipment = Equipment.query.options(joinedload(Equipment.company)).filter(Equipment.serial == serial).first()
    if not equipment:
        return None, (jsonify({"error": "Equipment serial not found"}), 404)

    if not verify_api_key(api_key, equipment.api_key):
        return None, (jsonify({"error": "Invalid API key"}), 401)

    if not equipment.is_active or (equipment.company and equipment.company.status != CompanyStatus.ACTIVE):
        return None, (jsonify({"error": "Equipment or owning company is deactivated"}), 403)

    return equipment, None


def _find_idempotent_telemetry(equipment_id: uuid.UUID, request_id: str | None) -> Telemetry | None:
    """Return an existing telemetry row matching (equipment_id, request_id), if any."""
    if request_id is None:
        return None
    return (
        Telemetry.query.filter_by(equipment_id=equipment_id, request_id=request_id)
        .order_by(Telemetry.time.desc())
        .first()
    )


def _build_current_data_snapshot(data: HardwareTelemetryPayload, now: datetime) -> CurrentDataSnapshot:
    """Build Equipment.current_data JSONB payload from validated hardware telemetry."""
    return {
        "temperature": float(data["temperature"]),
        "pressure": float(data["pressure"]),
        "door": "open" if data["door"] == 1 else "closed",
        "heater": "on" if data["heater"] == 1 else "off",
        "compressor": "on" if data["compressor"] == 1 else "off",
        "fan": "on" if data["fan"] == 1 else "off",
        "last_update": now.isoformat(),
    }


@telemetry_bp.route("/equipments/telemetry", methods=["POST"])
@limiter.limit("60 per minute", key_func=get_remote_address)
@limiter.limit("12 per minute", key_func=get_telemetry_rate_key)
def submit_telemetry() -> tuple[Response, int]:
    """
    Ingest hardware telemetry reading (JSON or x-www-form-urlencoded):
    - Authenticates X-API-Key in constant time against SHA-256 hash
    - Supports optional request_id / Idempotency-Key deduplication (AIP-155)
    - Rejects deactivated equipment or inactive company (403)
    - Inserts Telemetry row with UUID id
    - Updates Equipment.last_seen_at + Equipment.current_data JSONB under SELECT ... FOR UPDATE
    - Auto-resolves open equipment_offline alerts and recomputes Equipment.status
    """
    api_key = request.headers.get("X-API-Key")
    if not api_key:
        return jsonify({"error": "Authentication required: X-API-Key header missing"}), 401

    raw_data = request.get_json(silent=True)
    if raw_data is None and request.form:
        raw_data = request.form.to_dict()

    data, val_err = validate_request_schema(_hardware_telemetry_schema, raw_data)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    try:
        raw_mapping: Mapping[str, object] = raw_data if isinstance(raw_data, dict) else {}
        request_id = _extract_request_id(raw_mapping)
    except ValueError as err:
        return jsonify({"error": str(err)}), 400

    equipment, auth_err = _authenticate_hardware_equipment(data["serial"], api_key)
    if auth_err is not None or equipment is None:
        return auth_err or (jsonify({"error": "Equipment serial not found"}), 404)

    now = utc_now()

    try:
        # Serialize concurrent heartbeat / retry / alert / status updates on this equipment row
        locked_eq = db.session.query(Equipment).filter(Equipment.id == equipment.id).with_for_update().first()
        if locked_eq is None:
            db.session.rollback()
            return jsonify({"error": "Equipment serial not found"}), 404

        existing = _find_idempotent_telemetry(locked_eq.id, request_id)
        if existing is not None:
            db.session.commit()
            return jsonify(
                {
                    "success": True,
                    "message": "Telemetry data already recorded (idempotent replay)",
                    "timestamp": existing.time.isoformat(),
                    "record_id": str(existing.id),
                    "deduplicated": True,
                }
            ), 200

        telemetry = Telemetry(
            time=now,
            equipment_id=locked_eq.id,
            temperature=data["temperature"],
            pressure=data["pressure"],
            door=data["door"],
            heater=data["heater"],
            compressor=data["compressor"],
            fan=data["fan"],
            source="device",
            request_id=request_id,
        )
        db.session.add(telemetry)

        locked_eq.last_seen_at = now
        locked_eq.current_data = _build_current_data_snapshot(data, now)

        auto_resolve_offline_alerts(locked_eq.id, now=now)
        recompute_equipment_status(locked_eq.id, now=now)

        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Telemetry payload violated database constraints"}), 400
    except Exception:
        db.session.rollback()
        raise

    enqueue_equipment_evaluation(locked_eq.id)

    return jsonify(
        {
            "success": True,
            "message": "Telemetry data recorded successfully",
            "timestamp": telemetry.time.isoformat(),
            "record_id": str(telemetry.id),
        }
    ), 200


def _is_equipment_offline(equipment: Equipment, now: datetime) -> bool:
    """Return True if equipment is marked offline or has exceeded the heartbeat timeout."""
    last_seen = ensure_utc(equipment.last_seen_at)
    return (
        equipment.status == EquipmentStatus.OFFLINE
        or last_seen is None
        or (now - last_seen).total_seconds() >= DEFAULT_OFFLINE_TIMEOUT_SECONDS
    )


def _load_locked_manual_equipment(
    user: User,
    equipment_id: str,
) -> tuple[Equipment | None, tuple[Response, int] | None]:
    """Authorize manual telemetry writer and return the active Equipment row locked FOR UPDATE."""
    equipment = Equipment.query.options(joinedload(Equipment.company)).filter(Equipment.id == equipment_id).first()
    if not equipment:
        return None, (jsonify({"error": "Equipment not found"}), 404)

    if user.role != UserRole.GLOBAL_ADMIN and equipment.company_id != user.company_id:
        return None, (jsonify({"error": "Forbidden"}), 403)

    if not equipment.is_active or (equipment.company and equipment.company.status != CompanyStatus.ACTIVE):
        return None, (jsonify({"error": "Equipment or owning company is deactivated"}), 403)

    locked_eq = db.session.query(Equipment).filter(Equipment.id == equipment.id).with_for_update().first()
    if locked_eq is None:
        db.session.rollback()
        return None, (jsonify({"error": "Equipment not found"}), 404)

    return locked_eq, None


@telemetry_bp.route("/equipments/<equipment_id>/telemetry/manual", methods=["POST"])
@jwt_required()
def submit_manual_telemetry(equipment_id: str) -> tuple[Response, int]:
    """
    Log a manual thermometer temperature reading when equipment is offline (Global Admin or owning Company Admin).
    Tags source='manual' and recorded_by=user.id, leaves pressure/component states NULL,
    keeps equipment.status='offline', and leaves last_seen_at/current_data untouched.
    Returns 409 Conflict if equipment is currently online.
    """
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == UserRole.COMPANY_VIEWER:
        return jsonify({"error": "Forbidden"}), 403

    raw_data = request.get_json(silent=True)
    data, val_err = validate_request_schema(_manual_telemetry_schema, raw_data)
    if val_err or data is None:
        return jsonify({"error": val_err or "Invalid request payload"}), 400

    temperature = data["temperature"]

    now = utc_now()
    recorded_at = now
    raw_recorded_at = data.get("recorded_at")
    if raw_recorded_at is not None:
        try:
            recorded_at = parse_iso_datetime(raw_recorded_at)
        except ValueError:
            return jsonify({"error": "Invalid recorded_at ISO timestamp"}), 400

    raw_notes = data.get("notes")
    notes = raw_notes.strip() if raw_notes is not None else None

    locked_eq, eq_err = _load_locked_manual_equipment(user, equipment_id)
    if eq_err is not None or locked_eq is None:
        return eq_err or (jsonify({"error": "Equipment not found"}), 404)

    if not _is_equipment_offline(locked_eq, now):
        db.session.rollback()
        return jsonify(
            {
                "error": "Conflict",
                "message": "Manual temperature readings can only be logged while equipment is offline",
            }
        ), 409

    # Ensure persisted badge reflects offline while preserving last_seen_at and current_data
    locked_eq.status = EquipmentStatus.OFFLINE

    telemetry = Telemetry(
        time=recorded_at,
        equipment_id=locked_eq.id,
        temperature=temperature,
        pressure=None,
        door=None,
        heater=None,
        compressor=None,
        fan=None,
        source="manual",
        recorded_by=user.id,
        notes=notes,
    )
    db.session.add(telemetry)
    db.session.flush()

    record_audit_log(
        user_id=user.id,
        action="create_manual_telemetry",
        entity_type="equipment",
        entity_id=locked_eq.id,
        changes={
            "record_id": str(telemetry.id),
            "temperature": float(temperature),
            "recorded_at": recorded_at.isoformat(),
        },
    )
    db.session.commit()

    return jsonify(
        {
            "success": True,
            "message": "Manual temperature reading recorded successfully",
            "timestamp": telemetry.time.isoformat(),
            "record_id": str(telemetry.id),
            "source": "manual",
            "recorded_by": str(user.id),
            "temperature": float(telemetry.temperature),
            "notes": telemetry.notes,
        }
    ), 201


def _load_authorized_equipment(equipment_id: str) -> tuple[Equipment | None, tuple[Response, int] | None]:
    """Load requesting user and target equipment while enforcing tenant and branch RBAC."""
    user = db.session.get(User, get_jwt_identity())
    if not user:
        return None, (jsonify({"error": "User not found"}), 404)

    equipment = db.session.get(Equipment, equipment_id)
    if not equipment:
        return None, (jsonify({"error": "Equipment not found"}), 404)

    if user.role != UserRole.GLOBAL_ADMIN:
        if equipment.company_id != user.company_id:
            return None, (jsonify({"error": "Forbidden"}), 403)
        allowed_branches = get_allowed_branch_ids(user)
        if allowed_branches is not None and equipment.branch_id not in allowed_branches:
            return None, (jsonify({"error": "Forbidden"}), 403)

    return equipment, None


def _parse_telemetry_date_range(
    args: MultiDict[str, str],
) -> tuple[datetime | None, datetime | None, tuple[Response, int] | None]:
    """Parse optional start_date/end_date ISO query parameters and validate ordering."""
    start_dt = None
    end_dt = None
    if args.get("start_date"):
        try:
            start_dt = parse_iso_datetime(args["start_date"])
        except ValueError:
            return None, None, (jsonify({"error": "Invalid start_date ISO timestamp"}), 400)
    if args.get("end_date"):
        try:
            end_dt = parse_iso_datetime(args["end_date"])
        except ValueError:
            return None, None, (jsonify({"error": "Invalid end_date ISO timestamp"}), 400)
    if start_dt and end_dt and start_dt > end_dt:
        return None, None, (jsonify({"error": "start_date must be earlier than or equal to end_date"}), 400)
    return start_dt, end_dt, None


def _decode_telemetry_cursor(
    page_token: str | None,
    interval: TelemetryInterval,
) -> tuple[dict[str, object] | None, tuple[Response, int] | None]:
    """Decode and validate an optional AIP-158 page_token against the requested interval."""
    if page_token is None:
        return None, None
    try:
        cursor_data = decode_page_token(page_token)
    except ValueError:
        return None, (jsonify({"error": "Invalid page_token"}), 400)
    if cursor_data.get("interval", "raw") != interval:
        return None, (jsonify({"error": "page_token interval does not match requested interval"}), 400)
    return cursor_data, None


def _parse_projection_fields(raw_fields: str | None) -> set[str] | None:
    """Parse optional comma-separated response field projection whitelist."""
    if not raw_fields:
        return None
    parsed_fields = {f.strip() for f in raw_fields.split(",") if f.strip() in ALLOWED_PROJECTION_FIELDS}
    if not parsed_fields:
        return None
    parsed_fields.add("timestamp")
    return parsed_fields


def _query_raw_telemetry(
    equipment_id: uuid.UUID,
    start_dt: datetime | None,
    end_dt: datetime | None,
    page: int,
    limit: int,
    cursor_data: dict[str, object] | None,
) -> tuple[list[dict[str, object]] | None, int, str | None, tuple[Response, int] | None]:
    """Fetch paginated raw telemetry rows using keyset cursor or offset pagination."""
    base_query = Telemetry.query.filter(Telemetry.equipment_id == equipment_id)
    if start_dt:
        base_query = base_query.filter(Telemetry.time >= start_dt)
    if end_dt:
        base_query = base_query.filter(Telemetry.time <= end_dt)

    total = base_query.count()

    if cursor_data is not None:
        try:
            raw_t = cursor_data["t"]
            raw_id = cursor_data["id"]
            if not isinstance(raw_t, str) or not isinstance(raw_id, str):
                raise TypeError("Cursor fields must be strings")
            cursor_time = parse_iso_datetime(raw_t)
            cursor_id = uuid.UUID(raw_id)
        except (KeyError, TypeError, ValueError):
            return None, 0, None, (jsonify({"error": "Invalid page_token"}), 400)

        fetched = (
            base_query.filter(tuple_(Telemetry.time, Telemetry.id) < tuple_(literal(cursor_time), literal(cursor_id)))
            .order_by(Telemetry.time.desc(), Telemetry.id.desc())
            .limit(limit + 1)
            .all()
        )
    else:
        offset = (page - 1) * limit
        fetched = base_query.order_by(Telemetry.time.desc(), Telemetry.id.desc()).offset(offset).limit(limit + 1).all()

    has_more = len(fetched) > limit
    items = fetched[:limit]
    next_page_token = None
    if has_more and items:
        last_item = items[-1]
        next_page_token = encode_page_token(
            {
                "interval": "raw",
                "t": last_item.time.isoformat(),
                "id": str(last_item.id),
            }
        )

    return [t.to_dict() for t in items], total, next_page_token, None


def _telemetry_bucket_expr(interval: TelemetryInterval) -> ColumnElement[datetime]:
    """Return SQL bucket truncation expression for 5min, 1hour, or 1day intervals."""
    if interval == "5min":
        return func.to_timestamp(func.floor(func.extract("epoch", Telemetry.time) / 300) * 300)
    if interval == "1hour":
        return func.date_trunc("hour", Telemetry.time)
    return func.date_trunc("day", Telemetry.time)


def _parse_telemetry_pagination(args: MultiDict[str, str]) -> tuple[int, int]:
    """Parse bounded pagination parameters supporting page_size or limit."""
    raw_limit = args.get("page_size", type=int)
    if raw_limit is None:
        raw_limit = args.get("limit", 100, type=int)
    return clamp_pagination(
        args.get("page", 1, type=int),
        raw_limit,
        default_limit=100,
        max_limit=1000,
    )


def _fetch_telemetry_rows(
    equipment_id: uuid.UUID,
    interval: TelemetryInterval,
    start_dt: datetime | None,
    end_dt: datetime | None,
    page: int,
    limit: int,
    cursor_data: dict[str, object] | None,
) -> tuple[list[dict[str, object]] | None, int, str | None, tuple[Response, int] | None]:
    """Dispatch telemetry query to raw or aggregated bucket fetcher and parse cursor tokens."""
    if interval == "raw":
        return _query_raw_telemetry(equipment_id, start_dt, end_dt, page, limit, cursor_data)

    cursor_bucket = None
    if cursor_data is not None:
        try:
            raw_b = cursor_data["b"]
            if not isinstance(raw_b, str):
                raise TypeError("Cursor bucket must be a string")
            cursor_bucket = parse_iso_datetime(raw_b)
        except (KeyError, TypeError, ValueError):
            return None, 0, None, (jsonify({"error": "Invalid page_token"}), 400)

    rows, total, next_page_token = _query_aggregated_telemetry(
        equipment_id=equipment_id,
        interval=interval,
        start_dt=start_dt,
        end_dt=end_dt,
        page=page,
        limit=limit,
        cursor_bucket=cursor_bucket,
    )
    return rows, total, next_page_token, None


@telemetry_bp.route("/equipments/<equipment_id>/telemetry", methods=["GET"])
@jwt_required()
def get_telemetry(equipment_id: str) -> tuple[Response, int]:
    """
    Get historical telemetry for an equipment with:
    - Tenant & branch-restricted viewer authorization
    - Bounded pagination (1 <= limit <= 1000) + O(1) keyset page_token cursor (AIP-158)
    - Interval routing: raw (uses ix_telemetry_equipment_time) or 5min / 1hour / 1day SQL buckets / TimescaleDB CAGGs
    """
    equipment, auth_err = _load_authorized_equipment(equipment_id)
    if auth_err is not None or equipment is None:
        return auth_err or (jsonify({"error": "Equipment not found"}), 404)

    page, limit = _parse_telemetry_pagination(request.args)

    interval = _parse_telemetry_interval(request.args.get("interval", "raw"))
    if interval is None:
        return jsonify({"error": f"Invalid interval. Must be one of: {', '.join(VALID_INTERVALS)}"}), 400

    cursor_data, token_err = _decode_telemetry_cursor(request.args.get("page_token"), interval)
    if token_err:
        return token_err

    start_dt, end_dt, date_err = _parse_telemetry_date_range(request.args)
    if date_err:
        return date_err

    requested_fields = _parse_projection_fields(request.args.get("fields"))

    rows, total, next_page_token, query_err = _fetch_telemetry_rows(
        equipment.id, interval, start_dt, end_dt, page, limit, cursor_data
    )
    if query_err is not None or rows is None:
        return query_err or (jsonify({"error": "Failed to fetch telemetry"}), 500)

    total_pages = math.ceil(total / limit) if total > 0 else 0
    if requested_fields is not None:
        rows = [{k: v for k, v in row.items() if k in requested_fields} for row in rows]

    return jsonify(
        {
            "equipment_id": str(equipment.id),
            "serial": equipment.serial,
            "interval": interval,
            "count": total,
            "data": rows,
            "next_page_token": next_page_token,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
            },
        }
    ), 200


class _AggregatedTelemetryRow(Protocol):
    bucket: datetime
    avg_temperature: Decimal | float | int | None
    min_temperature: Decimal | float | int | None
    max_temperature: Decimal | float | int | None
    avg_pressure: Decimal | float | int | None
    sample_count: int


def _fetch_cagg_telemetry_rows(
    cagg_view: str,
    equipment_id: uuid.UUID,
    start_dt: datetime | None,
    end_dt: datetime | None,
    limit: int,
    offset: int,
    cursor_bucket: datetime | None,
) -> tuple[Sequence[_AggregatedTelemetryRow], int]:
    """Query pre-aggregated rows and total count from a TimescaleDB continuous aggregate view."""
    cagg_tbl = table(
        cagg_view,
        column("equipment_id"),
        column("bucket"),
        column("avg_temperature"),
        column("min_temperature"),
        column("max_temperature"),
        column("avg_pressure"),
        column("sample_count"),
    )
    filters = [cagg_tbl.c.equipment_id == str(equipment_id)]
    if start_dt:
        filters.append(cagg_tbl.c.bucket >= start_dt)
    if end_dt:
        filters.append(cagg_tbl.c.bucket <= end_dt)

    total = db.session.execute(select(func.count()).select_from(cagg_tbl).where(*filters)).scalar() or 0

    data_filters = list(filters)
    if cursor_bucket is not None:
        data_filters.append(cagg_tbl.c.bucket < cursor_bucket)

    fetched = db.session.execute(
        select(
            cagg_tbl.c.bucket,
            cagg_tbl.c.avg_temperature,
            cagg_tbl.c.min_temperature,
            cagg_tbl.c.max_temperature,
            cagg_tbl.c.avg_pressure,
            cagg_tbl.c.sample_count,
        )
        .where(*data_filters)
        .order_by(cagg_tbl.c.bucket.desc())
        .limit(limit + 1)
        .offset(offset)
    ).fetchall()
    return fetched, total


def _fetch_sql_bucket_telemetry_rows(
    equipment_id: uuid.UUID,
    interval: TelemetryInterval,
    start_dt: datetime | None,
    end_dt: datetime | None,
    limit: int,
    offset: int,
    cursor_bucket: datetime | None,
) -> tuple[Sequence[_AggregatedTelemetryRow], int]:
    """Query SQL-bucketed telemetry aggregates and total count directly from the telemetry table."""
    bucket_expr = _telemetry_bucket_expr(interval)
    bucket_col = bucket_expr.label("bucket")
    base_filter = [Telemetry.equipment_id == equipment_id]
    if start_dt:
        base_filter.append(Telemetry.time >= start_dt)
    if end_dt:
        base_filter.append(Telemetry.time <= end_dt)

    grouped_subq = (
        db.session.query(
            bucket_col,
            func.avg(Telemetry.temperature).label("avg_temperature"),
            func.min(Telemetry.temperature).label("min_temperature"),
            func.max(Telemetry.temperature).label("max_temperature"),
            func.avg(Telemetry.pressure).label("avg_pressure"),
            func.count().label("sample_count"),
        )
        .filter(*base_filter)
        .group_by(bucket_col)
    )

    total = db.session.query(func.count()).select_from(grouped_subq.subquery()).scalar() or 0

    data_query = grouped_subq
    if cursor_bucket is not None:
        data_query = data_query.having(bucket_expr < cursor_bucket)

    fetched = data_query.order_by(bucket_col.desc()).limit(limit + 1).offset(offset).all()
    return fetched, total


def _query_aggregated_telemetry(
    equipment_id: uuid.UUID,
    interval: TelemetryInterval,
    start_dt: datetime | None,
    end_dt: datetime | None,
    page: int,
    limit: int,
    cursor_bucket: datetime | None = None,
) -> tuple[list[dict[str, object]], int, str | None]:
    """
    Route 1hour/1day queries to TimescaleDB continuous aggregates (telemetry_hourly / telemetry_daily)
    when present, or fall back cleanly to indexed SQL bucket aggregation on telemetry.
    Supports both O(1) cursor_bucket pagination (AIP-158) and offset pagination.
    """
    offset = 0 if cursor_bucket is not None else (page - 1) * limit
    cagg_map = {"1hour": "telemetry_hourly", "1day": "telemetry_daily"}
    cagg_view = cagg_map.get(interval)

    if cagg_view and _relation_exists(cagg_view):
        fetched, total = _fetch_cagg_telemetry_rows(
            cagg_view, equipment_id, start_dt, end_dt, limit, offset, cursor_bucket
        )
    else:
        fetched, total = _fetch_sql_bucket_telemetry_rows(
            equipment_id, interval, start_dt, end_dt, limit, offset, cursor_bucket
        )

    has_more = len(fetched) > limit
    result = fetched[:limit]
    next_page_token = None
    if has_more and result:
        next_page_token = encode_page_token(
            {
                "interval": interval,
                "b": result[-1].bucket.isoformat(),
            }
        )

    rows: list[dict[str, object]] = [
        {
            "timestamp": r.bucket.isoformat() if r.bucket else None,
            "time": r.bucket.isoformat() if r.bucket else None,
            "equipment_id": str(equipment_id),
            "temperature": round(float(r.avg_temperature), 2) if r.avg_temperature is not None else None,
            "min_temperature": float(r.min_temperature) if r.min_temperature is not None else None,
            "max_temperature": float(r.max_temperature) if r.max_temperature is not None else None,
            "pressure": round(float(r.avg_pressure), 2) if r.avg_pressure is not None else None,
            "sample_count": r.sample_count,
        }
        for r in result
    ]
    return rows, total, next_page_token


def _parse_export_window(
    args: MultiDict[str, str],
    interval: TelemetryInterval,
    now: datetime,
) -> tuple[datetime | None, datetime | None, tuple[Response, int] | None]:
    """Parse and validate CSV export date window against raw (90d) and aggregated (731d) caps."""
    end_dt = now
    if args.get("end_date"):
        try:
            end_dt = parse_iso_datetime(args["end_date"])
        except ValueError:
            return None, None, (jsonify({"error": "Invalid end_date ISO timestamp"}), 400)

    default_window = RAW_EXPORT_MAX_WINDOW if interval == "raw" else timedelta(days=30)
    start_dt = end_dt - default_window
    if args.get("start_date"):
        try:
            start_dt = parse_iso_datetime(args["start_date"])
        except ValueError:
            return None, None, (jsonify({"error": "Invalid start_date ISO timestamp"}), 400)

    if start_dt > end_dt:
        return None, None, (jsonify({"error": "start_date must be earlier than or equal to end_date"}), 400)

    requested_span = end_dt - start_dt
    if interval == "raw" and requested_span > RAW_EXPORT_MAX_WINDOW:
        return (
            None,
            None,
            (
                jsonify(
                    {
                        "error": "Bad Request",
                        "message": "Raw telemetry CSV export cannot exceed a 90-day window. Use 1hour or 1day interval for longer ranges.",
                    }
                ),
                400,
            ),
        )

    if interval != "raw" and requested_span > AGGREGATED_EXPORT_MAX_WINDOW:
        return (
            None,
            None,
            (
                jsonify(
                    {
                        "error": "Bad Request",
                        "message": "Aggregated telemetry CSV export cannot exceed a 2-year (731-day) window.",
                    }
                ),
                400,
            ),
        )

    return start_dt, end_dt, None


def _stream_raw_telemetry_csv(
    eq_uuid: uuid.UUID,
    serial: str,
    start_dt: datetime,
    end_dt: datetime,
) -> Iterator[str]:
    """Stream raw telemetry rows as CSV using a server-side yield_per cursor."""
    raw_query = (
        db.session.query(Telemetry)
        .filter(
            Telemetry.equipment_id == eq_uuid,
            Telemetry.time >= start_dt,
            Telemetry.time <= end_dt,
        )
        .order_by(Telemetry.time.desc(), Telemetry.id.desc())
    )
    yield format_csv_row(
        [
            "timestamp",
            "serial",
            "source",
            "temperature_c",
            "pressure_kpa",
            "door",
            "heater",
            "compressor",
            "fan",
            "recorded_by",
            "notes",
        ]
    )
    cursor = raw_query.execution_options(stream_results=True).yield_per(500)
    for row in cursor:
        yield format_csv_row(
            [
                row.time.isoformat() if row.time else "",
                serial,
                row.source or "device",
                float(row.temperature) if row.temperature is not None else "",
                float(row.pressure) if row.pressure is not None else "",
                "open" if row.door == 1 else ("closed" if row.door == 0 else ""),
                "on" if row.heater == 1 else ("off" if row.heater == 0 else ""),
                "on" if row.compressor == 1 else ("off" if row.compressor == 0 else ""),
                "on" if row.fan == 1 else ("off" if row.fan == 0 else ""),
                str(row.recorded_by) if row.recorded_by is not None else "",
                row.notes or "",
            ]
        )


def _stream_aggregated_telemetry_csv(
    eq_uuid: uuid.UUID,
    serial: str,
    interval: TelemetryInterval,
    start_dt: datetime,
    end_dt: datetime,
) -> Iterator[str]:
    """Stream bucketed telemetry aggregates as CSV using a server-side yield_per cursor."""
    bucket_col = _telemetry_bucket_expr(interval).label("bucket")
    agg_query = (
        db.session.query(
            bucket_col,
            func.avg(Telemetry.temperature).label("avg_temperature"),
            func.min(Telemetry.temperature).label("min_temperature"),
            func.max(Telemetry.temperature).label("max_temperature"),
            func.avg(Telemetry.pressure).label("avg_pressure"),
            func.count().label("sample_count"),
        )
        .filter(
            Telemetry.equipment_id == eq_uuid,
            Telemetry.time >= start_dt,
            Telemetry.time <= end_dt,
        )
        .group_by(bucket_col)
        .order_by(bucket_col.desc())
    )
    yield format_csv_row(
        [
            "bucket_timestamp",
            "serial",
            "interval",
            "avg_temperature_c",
            "min_temperature_c",
            "max_temperature_c",
            "avg_pressure_kpa",
            "sample_count",
        ]
    )
    cursor = agg_query.execution_options(stream_results=True).yield_per(500)
    for row in cursor:
        yield format_csv_row(
            [
                row.bucket.isoformat() if row.bucket else "",
                serial,
                interval,
                round(float(row.avg_temperature), 2) if row.avg_temperature is not None else "",
                float(row.min_temperature) if row.min_temperature is not None else "",
                float(row.max_temperature) if row.max_temperature is not None else "",
                round(float(row.avg_pressure), 2) if row.avg_pressure is not None else "",
                int(row.sample_count),
            ]
        )


@telemetry_bp.route("/equipments/<equipment_id>/telemetry/export", methods=["GET"])
@jwt_required()
def export_telemetry_csv(equipment_id: str) -> Response | tuple[Response, int]:
    """
    Stream historical equipment telemetry (device + manual) as text/csv using yield_per server-side cursors.
    Enforces a maximum 90-day date range for interval=raw (400 Bad Request if exceeded)
    and up to 2 years (731 days) for 5min / 1hour / 1day aggregates.
    """
    equipment, auth_err = _load_authorized_equipment(equipment_id)
    if auth_err is not None or equipment is None:
        return auth_err or (jsonify({"error": "Equipment not found"}), 404)

    interval = _parse_telemetry_interval(request.args.get("interval", "raw"))
    if interval is None:
        return jsonify({"error": f"Invalid interval. Must be one of: {', '.join(VALID_INTERVALS)}"}), 400

    now = utc_now()
    start_dt, end_dt, window_err = _parse_export_window(request.args, interval, now)
    if window_err is not None or start_dt is None or end_dt is None:
        return window_err or (jsonify({"error": "Invalid export date window"}), 400)

    serial = equipment.serial
    if interval == "raw":
        stream_gen = _stream_raw_telemetry_csv(equipment.id, serial, start_dt, end_dt)
    else:
        stream_gen = _stream_aggregated_telemetry_csv(equipment.id, serial, interval, start_dt, end_dt)

    filename = f"telemetry_{serial}_{interval}_{now.strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        stream_with_context(stream_gen),
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@telemetry_bp.route("/telemetry/realtime", methods=["GET"])
@jwt_required()
def get_realtime_telemetry() -> tuple[Response, int]:
    """
    Single-query dashboard polling endpoint reading denormalized current_data from equipments
    (zero joins or scans against the telemetry hypertable).
    """
    user_id = get_jwt_identity()
    user = db.session.get(User, uuid.UUID(str(user_id)))
    if not user:
        return jsonify({"error": "User not found"}), 404

    company_id = request.args.get("company_id")
    branch_id = request.args.get("branch_id")
    equipment_ids_param = request.args.get("equipment_ids")

    query = Equipment.query.filter(Equipment.is_active.is_(True))

    if user.role != UserRole.GLOBAL_ADMIN:
        query = query.filter(Equipment.company_id == user.company_id)
        allowed_branches = get_allowed_branch_ids(user)
        if allowed_branches is not None:
            query = query.filter(Equipment.branch_id.in_(allowed_branches))
    elif company_id:
        query = query.filter(Equipment.company_id == company_id)

    if branch_id:
        query = query.filter(Equipment.branch_id == branch_id)

    if equipment_ids_param:
        ids = [eid.strip() for eid in equipment_ids_param.split(",") if eid.strip()]
        if ids:
            query = query.filter(Equipment.id.in_(ids))

    equipments = query.order_by(Equipment.serial.asc()).all()
    now = utc_now()

    snapshots = []
    for eq in equipments:
        cd = eq.current_data or {}
        last_seen = ensure_utc(eq.last_seen_at)
        effective_status = (
            EquipmentStatus.OFFLINE.value
            if last_seen is None or (now - last_seen).total_seconds() >= DEFAULT_OFFLINE_TIMEOUT_SECONDS
            else eq.status.value
        )
        snapshots.append(
            {
                "equipment_id": str(eq.id),
                "serial": eq.serial,
                "company_id": str(eq.company_id),
                "branch_id": str(eq.branch_id),
                "temperature": cd.get("temperature"),
                "pressure": cd.get("pressure"),
                "door": cd.get("door"),
                "heater": cd.get("heater"),
                "compressor": cd.get("compressor"),
                "fan": cd.get("fan"),
                "status": effective_status,
                "last_update": cd.get("last_update") or (eq.last_seen_at.isoformat() if eq.last_seen_at else None),
            }
        )

    return jsonify({"equipment": snapshots}), 200


def _format_ptbr_decimal(value: float) -> str:
    """Format a float with 1 decimal place using pt-BR comma decimal separator."""
    return f"{value:.1f}".replace(".", ",")


def _query_accessible_active_equipments(user: User, args: MultiDict[str, str]) -> list[Equipment]:
    """Query active equipment scoped to user tenant/branch RBAC and optional query filters."""
    company_id = args.get("company_id")
    branch_id = args.get("branch_id")
    equipment_ids_param = args.get("equipment_ids")

    query = Equipment.query.filter(Equipment.is_active.is_(True))

    if user.role != UserRole.GLOBAL_ADMIN:
        query = query.filter(Equipment.company_id == user.company_id)
        allowed_branches = get_allowed_branch_ids(user)
        if allowed_branches is not None:
            query = query.filter(Equipment.branch_id.in_(allowed_branches))
    elif company_id:
        query = query.filter(Equipment.company_id == company_id)

    if branch_id:
        query = query.filter(Equipment.branch_id == branch_id)

    if equipment_ids_param:
        ids = [eid.strip() for eid in equipment_ids_param.split(",") if eid.strip()]
        if ids:
            query = query.filter(Equipment.id.in_(ids))

    return query.order_by(Equipment.serial.asc()).all()


def _fetch_24h_sparklines(eq_uuids: list[uuid.UUID], since_24h: datetime) -> dict[str, list[dict[str, object]]]:
    """Fetch 24-hour hourly average temperature sparkline points grouped by equipment ID."""
    bucket_col = func.date_trunc("hour", Telemetry.time).label("bucket")
    spark_rows = (
        db.session.query(
            Telemetry.equipment_id,
            bucket_col,
            func.avg(Telemetry.temperature).label("avg_temp"),
        )
        .filter(
            Telemetry.equipment_id.in_(eq_uuids),
            Telemetry.time >= since_24h,
        )
        .group_by(Telemetry.equipment_id, bucket_col)
        .order_by(Telemetry.equipment_id.asc(), bucket_col.asc())
        .all()
    )

    sparklines_by_eq: dict[str, list[dict[str, object]]] = {}
    for row in spark_rows:
        if row.avg_temp is None or row.bucket is None:
            continue
        sparklines_by_eq.setdefault(str(row.equipment_id), []).append(
            {
                "t": row.bucket.isoformat(),
                "v": round(float(row.avg_temp), 2),
            }
        )
    return sparklines_by_eq


def _fetch_active_temperature_rules(company_uuids: list[uuid.UUID], eq_uuids: list[uuid.UUID]) -> list[AlertRule]:
    """Fetch all active temperature alert rules applicable to the given companies/equipments."""
    rule_clauses = [AlertRule.scope == AlertRuleScope.GLOBAL]
    if company_uuids:
        rule_clauses.append((AlertRule.scope == AlertRuleScope.COMPANY) & AlertRule.scope_id.in_(company_uuids))
    if eq_uuids:
        rule_clauses.append((AlertRule.scope == AlertRuleScope.EQUIPMENT) & AlertRule.scope_id.in_(eq_uuids))

    return AlertRule.query.filter(
        AlertRule.is_active.is_(True),
        AlertRule.threshold_value.isnot(None),
        AlertRule.rule_type.in_(
            [
                AlertRuleType.TEMPERATURE_HIGH,
                AlertRuleType.TEMPERATURE_LOW,
            ]
        ),
        or_(*rule_clauses),
    ).all()


def _format_threshold_label(low_bound: float | None, high_bound: float | None) -> dict[str, object] | None:
    """Format resolved low/high temperature bounds into the pt-BR overview threshold object."""
    if low_bound is not None and high_bound is not None:
        return {
            "label": f"Meta: {_format_ptbr_decimal(low_bound)} a {_format_ptbr_decimal(high_bound)} °C",
            "low": low_bound,
            "high": high_bound,
        }
    if high_bound is not None:
        return {
            "label": f"Meta: ≤ {_format_ptbr_decimal(high_bound)} °C",
            "low": None,
            "high": high_bound,
        }
    if low_bound is not None:
        return {
            "label": f"Meta: ≥ {_format_ptbr_decimal(low_bound)} °C",
            "low": low_bound,
            "high": None,
        }
    return None


def _resolve_equipment_threshold(eq: Equipment, temp_rules: list[AlertRule]) -> dict[str, object] | None:
    """Resolve effective priority-ordered temperature threshold bounds for a single equipment."""
    candidates = [
        r
        for r in temp_rules
        if r.scope == AlertRuleScope.GLOBAL
        or (r.scope == AlertRuleScope.COMPANY and r.scope_id == eq.company_id)
        or (r.scope == AlertRuleScope.EQUIPMENT and r.scope_id == eq.id)
    ]
    candidates.sort(
        key=lambda r: (
            SCOPE_PRIORITY[r.scope],
            r.rule_type.value,
            r.severity.value,
        )
    )

    seen_pairs: set[tuple[object, object]] = set()
    effective_highs: list[float] = []
    effective_lows: list[float] = []
    for rule in candidates:
        pair = (rule.rule_type, rule.severity)
        if pair in seen_pairs or rule.threshold_value is None:
            continue
        seen_pairs.add(pair)
        val = float(rule.threshold_value)
        if rule.rule_type == AlertRuleType.TEMPERATURE_HIGH:
            effective_highs.append(val)
        elif rule.rule_type == AlertRuleType.TEMPERATURE_LOW:
            effective_lows.append(val)

    high_bound = min(effective_highs) if effective_highs else None
    low_bound = max(effective_lows) if effective_lows else None
    return _format_threshold_label(low_bound, high_bound)


@telemetry_bp.route("/telemetry/overview", methods=["GET"])
@jwt_required()
def get_telemetry_overview() -> tuple[Response, int]:
    """
    Batch dashboard overview context returning 24-hour hourly sparkline points and
    priority-resolved effective temperature threshold labels for all accessible active equipment
    without adding overhead to GET /v1/telemetry/realtime or requiring N+1 client requests.
    """
    user_id = get_jwt_identity()
    user = db.session.get(User, uuid.UUID(str(user_id)))
    if not user:
        return jsonify({"error": "User not found"}), 404

    equipments = _query_accessible_active_equipments(user, request.args)
    if not equipments:
        return jsonify({"overview": {}}), 200

    eq_uuids = [eq.id for eq in equipments]
    company_uuids = list({eq.company_id for eq in equipments if eq.company_id is not None})
    since_24h = utc_now() - timedelta(hours=24)

    sparklines_by_eq = _fetch_24h_sparklines(eq_uuids, since_24h)
    temp_rules = _fetch_active_temperature_rules(company_uuids, eq_uuids)

    overview = {
        str(eq.id): {
            "sparkline_24h": sparklines_by_eq.get(str(eq.id), []),
            "threshold": _resolve_equipment_threshold(eq, temp_rules),
        }
        for eq in equipments
    }

    return jsonify({"overview": overview}), 200
