"""
Pydantic v2 Core Types, Shared Enums, and Request Validation Helpers.
Single source of truth for runtime validation, static typing (mypy/Pyrefly),
and OpenAPI 3.0.3 schema generation.
"""

import uuid
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from typing import Annotated, TypeVar

from flask import Response, jsonify
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, ValidationError, WithJsonSchema

from app.enums import (
    AlertRuleScope,
    AlertRuleType,
    AlertSeverity,
    AlertStatus,
    AuditEntityType,
    BinaryDeviceState,
    BranchAccessType,
    CompanyStatus,
    ComparisonOperator,
    DoorState,
    EquipmentStatus,
    EquipmentType,
    MaintenanceType,
    TelemetryInterval,
    TelemetrySource,
    UserRole,
    UserStatus,
)

EMAIL_PATTERN = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"

# ============================================================================
# CANONICAL DOMAIN ENUMS (Single Source of Truth from app.enums.StrEnum)
# ============================================================================

UserRoleLiteral = UserRole
UserStatusLiteral = UserStatus
BranchAccessTypeLiteral = BranchAccessType
CompanyStatusLiteral = CompanyStatus
EquipmentTypeLiteral = EquipmentType
EquipmentStatusLiteral = EquipmentStatus
AlertSeverityLiteral = AlertSeverity
AlertStatusLiteral = AlertStatus
AlertTypeLiteral = AlertRuleType
AlertScopeLiteral = AlertRuleScope
ComparisonOperatorLiteral = ComparisonOperator
TelemetrySourceLiteral = TelemetrySource
TelemetryIntervalLiteral = TelemetryInterval
BinaryDoorStateLiteral = DoorState
BinaryOnOffStateLiteral = BinaryDeviceState
MaintenanceTypeLiteral = MaintenanceType
AuditEntityTypeLiteral = AuditEntityType

# ============================================================================
# CUSTOM VALIDATORS (Preserve exact runtime hardening semantics)
# ============================================================================


def _strip_non_empty(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("Field must be a string.")
    trimmed = value.strip()
    if not trimmed:
        raise ValueError("Field cannot be empty.")
    return trimmed


def _parse_finite_decimal(value: object) -> Decimal:
    if value is None or isinstance(value, bool) or value == "":
        raise ValueError("Value is required")
    if not isinstance(value, int | float | str | Decimal):
        raise ValueError("Value must be a valid number")
    try:
        dec = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Value must be a valid number") from exc
    if not dec.is_finite():
        raise ValueError("Value must be finite")
    return dec


def _parse_binary_flag(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int | float | str | bytes | bytearray):
        raise ValueError("Value must be 0 or 1")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Value must be 0 or 1") from exc
    if parsed not in (0, 1):
        raise ValueError("Value must be 0 or 1")
    return parsed


def _parse_strict_non_neg_int(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("Value must be a non-negative integer")
    if value < 0:
        raise ValueError("Value must be a non-negative integer")
    return value


def _parse_strict_bool(value: object) -> bool:
    if not isinstance(value, bool):
        raise ValueError("Value must be a boolean")
    return value


def _validate_uuid_str(value: object) -> object:
    if isinstance(value, str):
        try:
            uuid.UUID(value)
        except ValueError as exc:
            raise ValueError("Invalid UUID format") from exc
    return value


NonEmptyTrimmedStr = Annotated[
    str,
    BeforeValidator(_strip_non_empty),
    Field(min_length=1),
]

FiniteDecimal = Annotated[
    Decimal,
    BeforeValidator(_parse_finite_decimal),
    WithJsonSchema({"type": "number"}),
]

BinaryFlag = Annotated[
    int,
    BeforeValidator(_parse_binary_flag),
    WithJsonSchema({"type": "integer", "enum": [0, 1]}),
]

StrictNonNegativeInt = Annotated[
    int,
    BeforeValidator(_parse_strict_non_neg_int),
    WithJsonSchema({"type": "integer", "minimum": 0}),
]

StrictBool = Annotated[
    bool,
    BeforeValidator(_parse_strict_bool),
]

UUIDStr = Annotated[
    str,
    BeforeValidator(_validate_uuid_str),
    WithJsonSchema({"type": "string", "format": "uuid"}),
]
DateTimeStr = Annotated[str, Field(json_schema_extra={"format": "date-time"})]
DateStr = Annotated[str, Field(json_schema_extra={"format": "date"})]

# ============================================================================
# BASE MODELS
# ============================================================================


class BaseRequestModel(BaseModel):
    """Base class for all incoming API request & query models."""

    model_config = ConfigDict(extra="ignore")


class BaseResponseModel(BaseModel):
    """Base class for all outgoing API response models."""

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# REQUEST VALIDATION HELPER
# ============================================================================

_TModel = TypeVar("_TModel", bound=BaseModel)


def _format_pydantic_error(err: ValidationError) -> str:
    errors = err.errors()
    if not errors:
        return "Invalid request payload"
    first = errors[0]
    loc = [str(part) for part in first.get("loc", ())]
    msg = str(first.get("msg", "Invalid value")).removeprefix("Value error, ")
    if not loc:
        return msg
    return f"{'.'.join(loc)}: {msg}"


def validate_request_model(
    model_cls: type[_TModel],
    payload: object,
    allow_empty: bool = False,
) -> tuple[_TModel | None, str | None]:
    """
    Validate a JSON request dictionary against a Pydantic v2 BaseModel.
    Returns (validated_model_or_None, error_message_or_None).
    """
    if payload is None:
        if allow_empty:
            payload = {}
        else:
            return None, "Request body is required"
    if not isinstance(payload, dict):
        return None, "Invalid JSON payload"
    if not payload and not allow_empty:
        return None, "Request body is required"

    try:
        return model_cls.model_validate(payload), None
    except ValidationError as err:
        return None, _format_pydantic_error(err)


def validate_query_model(
    model_cls: type[_TModel],
    args: Mapping[str, str],
) -> tuple[_TModel | None, str | None]:
    """
    Validate Flask request.args against a Pydantic v2 query-parameter model.
    Empty query strings are omitted so `?foo=` matches omitting `foo`.
    """
    cleaned = {k: v for k, v in args.items() if v != ""}
    try:
        return model_cls.model_validate(cleaned), None
    except ValidationError as err:
        return None, _format_pydantic_error(err)


def json_response(
    model_cls: type[_TModel],
    data: Mapping[str, object] | _TModel,
    status: int = 200,
) -> tuple[Response, int]:
    """
    Validate an outgoing payload against its canonical Pydantic response model
    and serialize it as a Flask JSON response.
    """
    validated = data if isinstance(data, model_cls) else model_cls.model_validate(data)
    return jsonify(validated.model_dump(mode="json", exclude_unset=True)), status
