"""
TypedDict definitions and typed extractors for Marshmallow request payloads.
"""

from collections.abc import Mapping
from decimal import Decimal
from typing import NotRequired, TypedDict

# ============================================================================
# AUTH PAYLOADS
# ============================================================================


class LoginPayload(TypedDict):
    email: str
    password: str


class ProfileUpdatePayload(TypedDict):
    name: str


class ChangePasswordPayload(TypedDict):
    current_password: str
    new_password: str


class ForgotPasswordPayload(TypedDict):
    email: str


class ResetPasswordPayload(TypedDict):
    token: str
    new_password: str


# ============================================================================
# COMPANY & BRANCH PAYLOADS
# ============================================================================


class CompanyCreatePayload(TypedDict):
    name: str
    contact_email: NotRequired[str | None]
    contact_phone: NotRequired[str | None]


class CompanyUpdatePayload(TypedDict, total=False):
    name: str
    contact_email: str | None
    contact_phone: str | None
    status: str


class BranchCreatePayload(TypedDict):
    name: str
    company_id: NotRequired[str | None]
    address: str
    manager_contact: NotRequired[str | None]


class BranchUpdatePayload(TypedDict, total=False):
    name: str
    address: str | None
    manager_contact: str | None


# ============================================================================
# USER PAYLOADS
# ============================================================================


class BranchAccessInputPayload(TypedDict, total=False):
    type: str
    branches: list[str]


class UserInvitePayload(TypedDict):
    email: str
    name: str
    role: str
    company_id: NotRequired[str | None]
    branch_access: NotRequired[BranchAccessInputPayload | None]


class AcceptInvitationPayload(TypedDict):
    token: str
    password: str


class UserCreatePayload(TypedDict):
    email: str
    name: str
    role: str
    password: str
    company_id: NotRequired[str | None]
    branch_access_type: str
    branch_ids: list[str]


class UserUpdatePayload(TypedDict, total=False):
    name: str
    email: str
    role: str
    company_id: str | None
    status: str
    branch_access: BranchAccessInputPayload | None


# ============================================================================
# EQUIPMENT & TELEMETRY PAYLOADS
# ============================================================================


class EquipmentCreatePayload(TypedDict):
    serial: str
    type: str
    branch_id: str
    company_id: NotRequired[str | None]
    manufacturer: NotRequired[str | None]
    model: NotRequired[str | None]
    installed_at: NotRequired[str | None]


class EquipmentUpdatePayload(TypedDict, total=False):
    type: str
    branch_id: str
    manufacturer: str | None
    model: str | None
    installed_at: str | None
    is_active: bool


class HardwareTelemetryPayload(TypedDict):
    serial: str
    temperature: Decimal
    pressure: Decimal
    door: int
    heater: int
    compressor: int
    fan: int
    request_id: NotRequired[str | None]


class ManualTelemetryPayload(TypedDict):
    temperature: Decimal
    recorded_at: NotRequired[str | None]
    notes: NotRequired[str | None]


# ============================================================================
# ALERT, ALERT RULE & MAINTENANCE PAYLOADS
# ============================================================================


class AlertAcknowledgePayload(TypedDict):
    notes: NotRequired[str | None]


class AlertRuleCreatePayload(TypedDict):
    name: str
    description: NotRequired[str | None]
    rule_type: str
    threshold_value: NotRequired[float | None]
    comparison_operator: NotRequired[str | None]
    duration_seconds: int
    severity: str
    message_template: NotRequired[str | None]
    scope: str
    scope_id: NotRequired[str | None]
    is_active: bool


class AlertRuleUpdatePayload(TypedDict, total=False):
    name: str
    description: str | None
    threshold_value: float | None
    comparison_operator: str | None
    duration_seconds: int
    severity: str
    message_template: str | None
    is_active: bool


class MaintenanceCreatePayload(TypedDict):
    type: str
    description: str
    performed_by: str
    performed_at: NotRequired[str | None]
    notes: NotRequired[str | None]
    next_maintenance_date: NotRequired[str | None]


class MaintenanceUpdatePayload(TypedDict, total=False):
    type: str
    description: str
    performed_by: str
    performed_at: str | None
    notes: str | None
    next_maintenance_date: str | None


# ============================================================================
# TYPED EXTRACTORS
# ============================================================================


def req_str(raw: Mapping[str, object], key: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str):
        raise ValueError(f"Expected string for field '{key}'")
    return value


def opt_str(raw: Mapping[str, object], key: str) -> str | None:
    value = raw.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"Expected optional string for field '{key}'")
    return value


def req_decimal(raw: Mapping[str, object], key: str) -> Decimal:
    value = raw.get(key)
    if not isinstance(value, Decimal):
        raise ValueError(f"Expected Decimal for field '{key}'")
    return value


def req_int(raw: Mapping[str, object], key: str) -> int:
    value = raw.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"Expected int for field '{key}'")
    return value


def opt_int(raw: Mapping[str, object], key: str) -> int | None:
    value = raw.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"Expected optional int for field '{key}'")
    return value


def opt_float(raw: Mapping[str, object], key: str) -> float | None:
    value = raw.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ValueError(f"Expected optional float for field '{key}'")
    return float(value)


def req_bool(raw: Mapping[str, object], key: str) -> bool:
    value = raw.get(key)
    if not isinstance(value, bool):
        raise ValueError(f"Expected bool for field '{key}'")
    return value


def opt_bool(raw: Mapping[str, object], key: str) -> bool | None:
    value = raw.get(key)
    if value is None:
        return None
    if not isinstance(value, bool):
        raise ValueError(f"Expected optional bool for field '{key}'")
    return value


def str_list(raw: Mapping[str, object], key: str) -> list[str]:
    value = raw.get(key)
    if not isinstance(value, list):
        raise ValueError(f"Expected list of strings for field '{key}'")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise ValueError(f"Expected string item in field '{key}'")
        result.append(item)
    return result


def parse_branch_access_input(raw: Mapping[str, object]) -> BranchAccessInputPayload:
    payload: BranchAccessInputPayload = {}
    if "type" in raw:
        payload["type"] = req_str(raw, "type")
    if "branches" in raw:
        payload["branches"] = str_list(raw, "branches")
    return payload


def opt_branch_access(raw: Mapping[str, object], key: str) -> BranchAccessInputPayload | None:
    value = raw.get(key)
    if value is None:
        return None
    if not isinstance(value, Mapping):
        raise ValueError(f"Expected mapping for field '{key}'")
    return parse_branch_access_input(value)
