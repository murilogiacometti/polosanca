"""
Marshmallow Request Validation Schemas (M4 Operational Hardening)
Centralizes payload structure, type, and format validation across API routes.
"""

from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from typing import Protocol, TypeVar

from marshmallow import INCLUDE, Schema, ValidationError, fields, validate, validates_schema

from app.schemas.payloads import (
    AcceptInvitationPayload,
    AlertAcknowledgePayload,
    AlertRuleCreatePayload,
    AlertRuleUpdatePayload,
    BranchAccessInputPayload,
    BranchCreatePayload,
    BranchUpdatePayload,
    ChangePasswordPayload,
    CompanyCreatePayload,
    CompanyUpdatePayload,
    EquipmentCreatePayload,
    EquipmentUpdatePayload,
    ForgotPasswordPayload,
    HardwareTelemetryPayload,
    LoginPayload,
    MaintenanceCreatePayload,
    MaintenanceUpdatePayload,
    ManualTelemetryPayload,
    ProfileUpdatePayload,
    ResetPasswordPayload,
    UserCreatePayload,
    UserInvitePayload,
    UserUpdatePayload,
    opt_branch_access,
    opt_float,
    opt_str,
    parse_branch_access_input,
    req_bool,
    req_decimal,
    req_int,
    req_str,
    str_list,
)

__all__ = [
    "AcceptInvitationPayload",
    "AcceptInvitationSchema",
    "AlertAcknowledgePayload",
    "AlertAcknowledgeSchema",
    "AlertRuleCreatePayload",
    "AlertRuleCreateSchema",
    "AlertRuleUpdatePayload",
    "AlertRuleUpdateSchema",
    "BaseRequestSchema",
    "BinaryFlagField",
    "BranchAccessInputPayload",
    "BranchAccessInputSchema",
    "BranchCreatePayload",
    "BranchCreateSchema",
    "BranchUpdatePayload",
    "BranchUpdateSchema",
    "ChangePasswordPayload",
    "ChangePasswordSchema",
    "CompanyCreatePayload",
    "CompanyCreateSchema",
    "CompanyUpdatePayload",
    "CompanyUpdateSchema",
    "EMAIL_PATTERN",
    "EquipmentCreatePayload",
    "EquipmentCreateSchema",
    "EquipmentUpdatePayload",
    "EquipmentUpdateSchema",
    "ForgotPasswordPayload",
    "ForgotPasswordSchema",
    "HardwareTelemetryPayload",
    "HardwareTelemetrySchema",
    "LoginPayload",
    "LoginSchema",
    "MaintenanceCreatePayload",
    "MaintenanceCreateSchema",
    "MaintenanceUpdatePayload",
    "MaintenanceUpdateSchema",
    "ManualTelemetryPayload",
    "ManualTelemetrySchema",
    "NonEmptyTrimmedString",
    "ProfileUpdatePayload",
    "ProfileUpdateSchema",
    "ResetPasswordPayload",
    "ResetPasswordSchema",
    "StrictFiniteDecimalField",
    "StrictNonNegativeIntField",
    "UserCreatePayload",
    "UserCreateSchema",
    "UserInvitePayload",
    "UserInviteSchema",
    "UserUpdatePayload",
    "UserUpdateSchema",
    "validate_request_schema",
]

EMAIL_PATTERN = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"


class BaseRequestSchema(Schema):
    class Meta:
        unknown = INCLUDE


class NonEmptyTrimmedString(fields.String):
    def _deserialize(
        self,
        value: object,
        attr: str | None,
        data: Mapping[str, object] | None,
        **kwargs: object,
    ) -> str:
        parsed = super()._deserialize(value, attr, data, **kwargs)
        trimmed = str(parsed).strip()
        if not trimmed:
            raise ValidationError("Field cannot be empty.")
        return trimmed


class StrictFiniteDecimalField(fields.Field):
    """Accepts numeric or string decimals while rejecting booleans and NaN/Infinity."""

    def _deserialize(
        self,
        value: object,
        attr: str | None,
        data: Mapping[str, object] | None,
        **kwargs: object,
    ) -> Decimal:
        if value is None or isinstance(value, bool) or value == "":
            raise ValidationError(f"{attr} is required")
        try:
            dec = Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValidationError(f"{attr} must be a valid number") from exc
        if not dec.is_finite():
            raise ValidationError(f"{attr} must be finite")
        return dec


class BinaryFlagField(fields.Field):
    """Accepts 0/1 (or '0'/'1' from form-encoded hardware payloads) while rejecting booleans."""

    def _deserialize(
        self,
        value: object,
        attr: str | None,
        data: Mapping[str, object] | None,
        **kwargs: object,
    ) -> int:
        if isinstance(value, bool) or not isinstance(value, int | float | str | bytes | bytearray):
            raise ValidationError(f"{attr} must be 0 or 1")
        try:
            parsed = int(value)
        except (TypeError, ValueError) as exc:
            raise ValidationError(f"{attr} must be 0 or 1") from exc
        if parsed not in (0, 1):
            raise ValidationError(f"{attr} must be 0 or 1")
        return parsed


class StrictNonNegativeIntField(fields.Integer):
    """Rejects booleans (since isinstance(True, int) is True in Python) and negative integers."""

    def _deserialize(
        self,
        value: object,
        attr: str | None,
        data: Mapping[str, object] | None,
        **kwargs: object,
    ) -> int:
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValidationError(f"{attr} must be a non-negative integer")
        parsed = super()._deserialize(value, attr, data, **kwargs)
        if parsed is None or parsed < 0:
            raise ValidationError(f"{attr} must be a non-negative integer")
        return parsed


# ============================================================================
# AUTH SCHEMAS
# ============================================================================


class LoginSchema(BaseRequestSchema):
    email = NonEmptyTrimmedString(required=True)
    password = fields.String(required=True, validate=validate.Length(min=1))

    def parse(self, raw: Mapping[str, object]) -> LoginPayload:
        return {
            "email": req_str(raw, "email"),
            "password": req_str(raw, "password"),
        }


class ProfileUpdateSchema(BaseRequestSchema):
    name = NonEmptyTrimmedString(required=True, validate=validate.Length(max=255))

    def parse(self, raw: Mapping[str, object]) -> ProfileUpdatePayload:
        return {"name": req_str(raw, "name")}


class ChangePasswordSchema(BaseRequestSchema):
    current_password = fields.String(required=True, validate=validate.Length(min=1))
    new_password = fields.String(required=True, validate=validate.Length(min=8))

    def parse(self, raw: Mapping[str, object]) -> ChangePasswordPayload:
        return {
            "current_password": req_str(raw, "current_password"),
            "new_password": req_str(raw, "new_password"),
        }


class ForgotPasswordSchema(BaseRequestSchema):
    email = NonEmptyTrimmedString(required=True)

    def parse(self, raw: Mapping[str, object]) -> ForgotPasswordPayload:
        return {"email": req_str(raw, "email")}


class ResetPasswordSchema(BaseRequestSchema):
    token = NonEmptyTrimmedString(required=True)
    new_password = fields.String(required=True, validate=validate.Length(min=8))

    def parse(self, raw: Mapping[str, object]) -> ResetPasswordPayload:
        return {
            "token": req_str(raw, "token"),
            "new_password": req_str(raw, "new_password"),
        }


# ============================================================================
# COMPANY & BRANCH SCHEMAS
# ============================================================================


class CompanyCreateSchema(BaseRequestSchema):
    name = NonEmptyTrimmedString(required=True, validate=validate.Length(max=255))
    contact_email = fields.String(allow_none=True)
    contact_phone = fields.String(allow_none=True)

    def parse(self, raw: Mapping[str, object]) -> CompanyCreatePayload:
        payload: CompanyCreatePayload = {"name": req_str(raw, "name")}
        if "contact_email" in raw:
            payload["contact_email"] = opt_str(raw, "contact_email")
        if "contact_phone" in raw:
            payload["contact_phone"] = opt_str(raw, "contact_phone")
        return payload


class CompanyUpdateSchema(BaseRequestSchema):
    name = NonEmptyTrimmedString(validate=validate.Length(max=255))
    contact_email = fields.String(allow_none=True)
    contact_phone = fields.String(allow_none=True)
    status = fields.String(validate=validate.OneOf(["active", "inactive"]))

    def parse(self, raw: Mapping[str, object]) -> CompanyUpdatePayload:
        payload: CompanyUpdatePayload = {}
        if "name" in raw:
            payload["name"] = req_str(raw, "name")
        if "contact_email" in raw:
            payload["contact_email"] = opt_str(raw, "contact_email")
        if "contact_phone" in raw:
            payload["contact_phone"] = opt_str(raw, "contact_phone")
        if "status" in raw:
            payload["status"] = req_str(raw, "status")
        return payload


class BranchCreateSchema(BaseRequestSchema):
    name = NonEmptyTrimmedString(required=True, validate=validate.Length(max=255))
    company_id = fields.String(allow_none=True)
    address = fields.String(load_default="")
    manager_contact = fields.String(allow_none=True)

    def parse(self, raw: Mapping[str, object]) -> BranchCreatePayload:
        payload: BranchCreatePayload = {
            "name": req_str(raw, "name"),
            "address": req_str(raw, "address"),
        }
        if "company_id" in raw:
            payload["company_id"] = opt_str(raw, "company_id")
        if "manager_contact" in raw:
            payload["manager_contact"] = opt_str(raw, "manager_contact")
        return payload


class BranchUpdateSchema(BaseRequestSchema):
    name = NonEmptyTrimmedString(validate=validate.Length(max=255))
    address = fields.String(allow_none=True)
    manager_contact = fields.String(allow_none=True)

    def parse(self, raw: Mapping[str, object]) -> BranchUpdatePayload:
        payload: BranchUpdatePayload = {}
        if "name" in raw:
            payload["name"] = req_str(raw, "name")
        if "address" in raw:
            payload["address"] = opt_str(raw, "address")
        if "manager_contact" in raw:
            payload["manager_contact"] = opt_str(raw, "manager_contact")
        return payload


# ============================================================================
# USER SCHEMAS
# ============================================================================


class BranchAccessInputSchema(BaseRequestSchema):
    type = fields.String(validate=validate.OneOf(["full", "restricted"]))
    branches = fields.List(fields.String(), load_default=list)

    def parse(self, raw: Mapping[str, object]) -> BranchAccessInputPayload:
        return parse_branch_access_input(raw)


class UserInviteSchema(BaseRequestSchema):
    email = NonEmptyTrimmedString(
        required=True,
        validate=validate.Regexp(EMAIL_PATTERN, error="Invalid email format"),
    )
    name = NonEmptyTrimmedString(required=True, validate=validate.Length(max=255))
    role = fields.String(
        required=True,
        validate=validate.OneOf(["global_admin", "company_admin", "company_viewer"], error="Invalid role"),
    )
    company_id = fields.String(allow_none=True)
    branch_access = fields.Nested(BranchAccessInputSchema, allow_none=True)

    def parse(self, raw: Mapping[str, object]) -> UserInvitePayload:
        payload: UserInvitePayload = {
            "email": req_str(raw, "email"),
            "name": req_str(raw, "name"),
            "role": req_str(raw, "role"),
        }
        if "company_id" in raw:
            payload["company_id"] = opt_str(raw, "company_id")
        if "branch_access" in raw:
            payload["branch_access"] = opt_branch_access(raw, "branch_access")
        return payload


class AcceptInvitationSchema(BaseRequestSchema):
    token = NonEmptyTrimmedString(required=True)
    password = fields.String(required=True, validate=validate.Length(min=8))

    def parse(self, raw: Mapping[str, object]) -> AcceptInvitationPayload:
        return {
            "token": req_str(raw, "token"),
            "password": req_str(raw, "password"),
        }


class UserCreateSchema(BaseRequestSchema):
    email = NonEmptyTrimmedString(
        required=True,
        validate=validate.Regexp(EMAIL_PATTERN, error="Invalid email format"),
    )
    name = NonEmptyTrimmedString(required=True, validate=validate.Length(max=255))
    role = fields.String(
        required=True,
        validate=validate.OneOf(["global_admin", "company_admin", "company_viewer"], error="Invalid role"),
    )
    password = fields.String(required=True, validate=validate.Length(min=8))
    company_id = fields.String(allow_none=True)
    branch_access_type = fields.String(
        load_default="full",
        validate=validate.OneOf(["full", "restricted"], error="Invalid branch_access_type"),
    )
    branch_ids = fields.List(fields.String(), load_default=list)

    def parse(self, raw: Mapping[str, object]) -> UserCreatePayload:
        payload: UserCreatePayload = {
            "email": req_str(raw, "email"),
            "name": req_str(raw, "name"),
            "role": req_str(raw, "role"),
            "password": req_str(raw, "password"),
            "branch_access_type": req_str(raw, "branch_access_type"),
            "branch_ids": str_list(raw, "branch_ids"),
        }
        if "company_id" in raw:
            payload["company_id"] = opt_str(raw, "company_id")
        return payload


class UserUpdateSchema(BaseRequestSchema):
    name = NonEmptyTrimmedString(validate=validate.Length(max=255))
    email = NonEmptyTrimmedString(
        validate=validate.Regexp(EMAIL_PATTERN, error="Invalid email format"),
    )
    role = fields.String(
        validate=validate.OneOf(["global_admin", "company_admin", "company_viewer"], error="Invalid role"),
    )
    company_id = fields.String(allow_none=True)
    status = fields.String(
        validate=validate.OneOf(["active", "inactive", "pending"], error="Invalid status"),
    )
    branch_access = fields.Nested(BranchAccessInputSchema, allow_none=True)

    def parse(self, raw: Mapping[str, object]) -> UserUpdatePayload:
        payload: UserUpdatePayload = {}
        if "name" in raw:
            payload["name"] = req_str(raw, "name")
        if "email" in raw:
            payload["email"] = req_str(raw, "email")
        if "role" in raw:
            payload["role"] = req_str(raw, "role")
        if "company_id" in raw:
            payload["company_id"] = opt_str(raw, "company_id")
        if "status" in raw:
            payload["status"] = req_str(raw, "status")
        if "branch_access" in raw:
            payload["branch_access"] = opt_branch_access(raw, "branch_access")
        return payload


# ============================================================================
# EQUIPMENT & TELEMETRY SCHEMAS
# ============================================================================


class EquipmentCreateSchema(BaseRequestSchema):
    serial = NonEmptyTrimmedString(required=True, validate=validate.Length(max=100))
    type = fields.String(
        required=True,
        validate=validate.OneOf(["freezer", "refrigerator", "cold_room"], error="Invalid equipment type"),
    )
    branch_id = NonEmptyTrimmedString(required=True)
    company_id = fields.String(allow_none=True)
    manufacturer = fields.String(allow_none=True)
    model = fields.String(allow_none=True)
    installed_at = fields.String(allow_none=True)

    def parse(self, raw: Mapping[str, object]) -> EquipmentCreatePayload:
        payload: EquipmentCreatePayload = {
            "serial": req_str(raw, "serial"),
            "type": req_str(raw, "type"),
            "branch_id": req_str(raw, "branch_id"),
        }
        if "company_id" in raw:
            payload["company_id"] = opt_str(raw, "company_id")
        if "manufacturer" in raw:
            payload["manufacturer"] = opt_str(raw, "manufacturer")
        if "model" in raw:
            payload["model"] = opt_str(raw, "model")
        if "installed_at" in raw:
            payload["installed_at"] = opt_str(raw, "installed_at")
        return payload


class EquipmentUpdateSchema(BaseRequestSchema):
    type = fields.String(
        validate=validate.OneOf(["freezer", "refrigerator", "cold_room"], error="Invalid equipment type"),
    )
    branch_id = NonEmptyTrimmedString()
    manufacturer = fields.String(allow_none=True)
    model = fields.String(allow_none=True)
    installed_at = fields.String(allow_none=True)
    is_active = fields.Boolean(truthy={True}, falsy={False})

    def parse(self, raw: Mapping[str, object]) -> EquipmentUpdatePayload:
        payload: EquipmentUpdatePayload = {}
        if "type" in raw:
            payload["type"] = req_str(raw, "type")
        if "branch_id" in raw:
            payload["branch_id"] = req_str(raw, "branch_id")
        if "manufacturer" in raw:
            payload["manufacturer"] = opt_str(raw, "manufacturer")
        if "model" in raw:
            payload["model"] = opt_str(raw, "model")
        if "installed_at" in raw:
            payload["installed_at"] = opt_str(raw, "installed_at")
        if "is_active" in raw:
            payload["is_active"] = req_bool(raw, "is_active")
        return payload


class HardwareTelemetrySchema(BaseRequestSchema):
    serial = NonEmptyTrimmedString(required=True, validate=validate.Length(max=100))
    temperature = StrictFiniteDecimalField(required=True)
    pressure = StrictFiniteDecimalField(required=True)
    door = BinaryFlagField(required=True)
    heater = BinaryFlagField(required=True)
    compressor = BinaryFlagField(required=True)
    fan = BinaryFlagField(required=True)
    request_id = fields.String(allow_none=True)

    def parse(self, raw: Mapping[str, object]) -> HardwareTelemetryPayload:
        payload: HardwareTelemetryPayload = {
            "serial": req_str(raw, "serial"),
            "temperature": req_decimal(raw, "temperature"),
            "pressure": req_decimal(raw, "pressure"),
            "door": req_int(raw, "door"),
            "heater": req_int(raw, "heater"),
            "compressor": req_int(raw, "compressor"),
            "fan": req_int(raw, "fan"),
        }
        if "request_id" in raw:
            payload["request_id"] = opt_str(raw, "request_id")
        return payload


class ManualTelemetrySchema(BaseRequestSchema):
    temperature = StrictFiniteDecimalField(required=True)
    recorded_at = fields.String(allow_none=True)
    notes = fields.String(allow_none=True)

    def parse(self, raw: Mapping[str, object]) -> ManualTelemetryPayload:
        payload: ManualTelemetryPayload = {"temperature": req_decimal(raw, "temperature")}
        if "recorded_at" in raw:
            payload["recorded_at"] = opt_str(raw, "recorded_at")
        if "notes" in raw:
            payload["notes"] = opt_str(raw, "notes")
        return payload


# ============================================================================
# ALERT, ALERT RULE & MAINTENANCE SCHEMAS
# ============================================================================


class AlertAcknowledgeSchema(BaseRequestSchema):
    notes = fields.String(allow_none=True)

    def parse(self, raw: Mapping[str, object]) -> AlertAcknowledgePayload:
        payload: AlertAcknowledgePayload = {}
        if "notes" in raw:
            payload["notes"] = opt_str(raw, "notes")
        return payload


class AlertRuleCreateSchema(BaseRequestSchema):
    name = NonEmptyTrimmedString(required=True, validate=validate.Length(max=255))
    description = fields.String(allow_none=True)
    rule_type = fields.String(
        required=True,
        validate=validate.OneOf(
            [
                "temperature_high",
                "temperature_low",
                "pressure_high",
                "pressure_low",
                "door_open",
                "equipment_offline",
            ]
        ),
    )
    threshold_value = fields.Float(allow_none=True)
    comparison_operator = fields.String(
        allow_none=True,
        validate=validate.OneOf([">", "<", "=", ">=", "<="]),
    )
    duration_seconds = StrictNonNegativeIntField(load_default=300)
    severity = fields.String(
        required=True,
        validate=validate.OneOf(["warning", "critical"]),
    )
    message_template = fields.String(allow_none=True)
    scope = fields.String(
        required=True,
        validate=validate.OneOf(["global", "company", "equipment"]),
    )
    scope_id = fields.String(allow_none=True)
    is_active = fields.Boolean(load_default=True)

    @validates_schema
    def validate_rule_invariants(self, data: dict[str, object], **kwargs: object) -> None:
        rule_type = data.get("rule_type")
        threshold = data.get("threshold_value")
        operator = data.get("comparison_operator")
        scope = data.get("scope")
        scope_id = data.get("scope_id") or None

        if rule_type in ("door_open", "equipment_offline"):
            if threshold is not None or operator is not None:
                raise ValidationError(
                    "threshold_value and comparison_operator must be null for door_open and equipment_offline rules"
                )
        else:
            if threshold is None or operator is None:
                raise ValidationError(
                    "threshold_value and comparison_operator are required for numeric threshold rules"
                )

        if scope == "global" and scope_id is not None:
            raise ValidationError("scope_id must be null when scope is global")
        if scope in ("company", "equipment") and not scope_id:
            raise ValidationError("scope_id is required when scope is company or equipment")

    def parse(self, raw: Mapping[str, object]) -> AlertRuleCreatePayload:
        payload: AlertRuleCreatePayload = {
            "name": req_str(raw, "name"),
            "rule_type": req_str(raw, "rule_type"),
            "duration_seconds": req_int(raw, "duration_seconds"),
            "severity": req_str(raw, "severity"),
            "scope": req_str(raw, "scope"),
            "is_active": req_bool(raw, "is_active"),
        }
        if "description" in raw:
            payload["description"] = opt_str(raw, "description")
        if "threshold_value" in raw:
            payload["threshold_value"] = opt_float(raw, "threshold_value")
        if "comparison_operator" in raw:
            payload["comparison_operator"] = opt_str(raw, "comparison_operator")
        if "message_template" in raw:
            payload["message_template"] = opt_str(raw, "message_template")
        if "scope_id" in raw:
            payload["scope_id"] = opt_str(raw, "scope_id")
        return payload


class AlertRuleUpdateSchema(BaseRequestSchema):
    name = NonEmptyTrimmedString(validate=validate.Length(max=255))
    description = fields.String(allow_none=True)
    threshold_value = fields.Float(allow_none=True)
    comparison_operator = fields.String(
        allow_none=True,
        validate=validate.OneOf([">", "<", "=", ">=", "<="]),
    )
    duration_seconds = StrictNonNegativeIntField()
    severity = fields.String(validate=validate.OneOf(["warning", "critical"]))
    message_template = fields.String(allow_none=True)
    is_active = fields.Boolean()

    def parse(self, raw: Mapping[str, object]) -> AlertRuleUpdatePayload:
        payload: AlertRuleUpdatePayload = {}
        if "name" in raw:
            payload["name"] = req_str(raw, "name")
        if "description" in raw:
            payload["description"] = opt_str(raw, "description")
        if "threshold_value" in raw:
            payload["threshold_value"] = opt_float(raw, "threshold_value")
        if "comparison_operator" in raw:
            payload["comparison_operator"] = opt_str(raw, "comparison_operator")
        if "duration_seconds" in raw:
            payload["duration_seconds"] = req_int(raw, "duration_seconds")
        if "severity" in raw:
            payload["severity"] = req_str(raw, "severity")
        if "message_template" in raw:
            payload["message_template"] = opt_str(raw, "message_template")
        if "is_active" in raw:
            payload["is_active"] = req_bool(raw, "is_active")
        return payload


class MaintenanceCreateSchema(BaseRequestSchema):
    type = NonEmptyTrimmedString(required=True, validate=validate.Length(max=100))
    description = NonEmptyTrimmedString(required=True)
    performed_by = NonEmptyTrimmedString(required=True, validate=validate.Length(max=255))
    performed_at = fields.String(allow_none=True)
    notes = fields.String(allow_none=True)
    next_maintenance_date = fields.String(allow_none=True)

    def parse(self, raw: Mapping[str, object]) -> MaintenanceCreatePayload:
        payload: MaintenanceCreatePayload = {
            "type": req_str(raw, "type"),
            "description": req_str(raw, "description"),
            "performed_by": req_str(raw, "performed_by"),
        }
        if "performed_at" in raw:
            payload["performed_at"] = opt_str(raw, "performed_at")
        if "notes" in raw:
            payload["notes"] = opt_str(raw, "notes")
        if "next_maintenance_date" in raw:
            payload["next_maintenance_date"] = opt_str(raw, "next_maintenance_date")
        return payload


class MaintenanceUpdateSchema(BaseRequestSchema):
    type = NonEmptyTrimmedString(validate=validate.Length(max=100))
    description = NonEmptyTrimmedString()
    performed_by = NonEmptyTrimmedString(validate=validate.Length(max=255))
    performed_at = fields.String(allow_none=True)
    notes = fields.String(allow_none=True)
    next_maintenance_date = fields.String(allow_none=True)

    def parse(self, raw: Mapping[str, object]) -> MaintenanceUpdatePayload:
        payload: MaintenanceUpdatePayload = {}
        if "type" in raw:
            payload["type"] = req_str(raw, "type")
        if "description" in raw:
            payload["description"] = req_str(raw, "description")
        if "performed_by" in raw:
            payload["performed_by"] = req_str(raw, "performed_by")
        if "performed_at" in raw:
            payload["performed_at"] = opt_str(raw, "performed_at")
        if "notes" in raw:
            payload["notes"] = opt_str(raw, "notes")
        if "next_maintenance_date" in raw:
            payload["next_maintenance_date"] = opt_str(raw, "next_maintenance_date")
        return payload


_TPayload = TypeVar("_TPayload", covariant=True)


class _TypedRequestSchema(Protocol[_TPayload]):
    def load(self, data: Mapping[str, object]) -> object: ...
    def parse(self, raw: Mapping[str, object]) -> _TPayload: ...


def _format_validation_error(err: ValidationError) -> str:
    messages = err.messages
    if isinstance(messages, dict):
        first_field, first_msgs = next(iter(messages.items()))
        if isinstance(first_msgs, list) and first_msgs:
            if first_field == "_schema":
                return str(first_msgs[0])
            return f"{first_field}: {first_msgs[0]}"
        if isinstance(first_msgs, dict):
            sub_field, sub_msgs = next(iter(first_msgs.items()))
            msg = sub_msgs[0] if isinstance(sub_msgs, list) and sub_msgs else str(sub_msgs)
            return f"{first_field}.{sub_field}: {msg}"
    return str(messages)


def validate_request_schema(
    schema: _TypedRequestSchema[_TPayload],
    payload: object,
    allow_empty: bool = False,
) -> tuple[_TPayload | None, str | None]:
    """
    Validate a request dictionary against a Marshmallow schema.
    Returns (validated_data, error_message_or_None).
    """
    if payload is None:
        if allow_empty:
            empty_payload: dict[str, object] = {}
            payload = empty_payload
        else:
            return None, "Request body is required"
    if not isinstance(payload, dict):
        return None, "Invalid JSON payload"
    if not payload and not allow_empty:
        return None, "Request body is required"

    try:
        cleaned = schema.load(payload)
        if not isinstance(cleaned, Mapping):
            return None, "Invalid JSON payload"
        return schema.parse(cleaned), None
    except ValidationError as err:
        return None, _format_validation_error(err)
