"""
Pydantic v2 Request Body & Query Parameter Models.
Replaces both Marshmallow request schemas and app/schemas/payloads.py TypedDicts.
"""

from typing import Literal, Self

from pydantic import Field, model_validator

from app.schemas.base import (
    EMAIL_PATTERN,
    AlertScopeLiteral,
    AlertSeverityLiteral,
    AlertStatusLiteral,
    AlertTypeLiteral,
    AuditEntityTypeLiteral,
    BaseRequestModel,
    BinaryFlag,
    BranchAccessTypeLiteral,
    CompanyStatusLiteral,
    ComparisonOperatorLiteral,
    EquipmentStatusLiteral,
    EquipmentTypeLiteral,
    FiniteDecimal,
    MaintenanceTypeLiteral,
    NonEmptyTrimmedStr,
    StrictBool,
    StrictNonNegativeInt,
    TelemetryIntervalLiteral,
    UserRoleLiteral,
    UserStatusLiteral,
    UUIDStr,
)

# ============================================================================
# AUTH REQUESTS
# ============================================================================


class LoginRequest(BaseRequestModel):
    email: NonEmptyTrimmedStr
    password: str = Field(min_length=1)


class ProfileUpdateRequest(BaseRequestModel):
    name: NonEmptyTrimmedStr = Field(max_length=255)


class ChangePasswordRequest(BaseRequestModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class ForgotPasswordRequest(BaseRequestModel):
    email: NonEmptyTrimmedStr


class ResetPasswordRequest(BaseRequestModel):
    token: NonEmptyTrimmedStr
    new_password: str = Field(min_length=8)


# ============================================================================
# COMPANY & BRANCH REQUESTS
# ============================================================================


class CompanyCreateRequest(BaseRequestModel):
    name: NonEmptyTrimmedStr = Field(max_length=255)
    contact_email: str | None = None
    contact_phone: str | None = None


class CompanyUpdateRequest(BaseRequestModel):
    name: NonEmptyTrimmedStr | None = Field(default=None, max_length=255)
    contact_email: str | None = None
    contact_phone: str | None = None
    status: CompanyStatusLiteral | None = None


class BranchCreateRequest(BaseRequestModel):
    name: NonEmptyTrimmedStr = Field(max_length=255)
    company_id: UUIDStr | None = None
    address: str = ""
    manager_contact: str | None = None


class BranchUpdateRequest(BaseRequestModel):
    name: NonEmptyTrimmedStr | None = Field(default=None, max_length=255)
    address: str | None = None
    manager_contact: str | None = None


# ============================================================================
# USER REQUESTS
# ============================================================================


class BranchAccessInput(BaseRequestModel):
    type: BranchAccessTypeLiteral | None = None
    branches: list[UUIDStr] = Field(default_factory=list)


class UserInviteRequest(BaseRequestModel):
    email: NonEmptyTrimmedStr = Field(pattern=EMAIL_PATTERN)
    name: NonEmptyTrimmedStr = Field(max_length=255)
    role: UserRoleLiteral
    company_id: UUIDStr | None = None
    branch_access: BranchAccessInput | None = None


class AcceptInvitationRequest(BaseRequestModel):
    token: NonEmptyTrimmedStr
    password: str = Field(min_length=8)


class UserCreateRequest(BaseRequestModel):
    email: NonEmptyTrimmedStr = Field(pattern=EMAIL_PATTERN)
    name: NonEmptyTrimmedStr = Field(max_length=255)
    role: UserRoleLiteral
    password: str = Field(min_length=8)
    company_id: UUIDStr | None = None
    branch_access_type: BranchAccessTypeLiteral = BranchAccessTypeLiteral.FULL
    branch_ids: list[UUIDStr] = Field(default_factory=list)


class UserUpdateRequest(BaseRequestModel):
    name: NonEmptyTrimmedStr | None = Field(default=None, max_length=255)
    email: NonEmptyTrimmedStr | None = Field(default=None, pattern=EMAIL_PATTERN)
    role: UserRoleLiteral | None = None
    company_id: UUIDStr | None = None
    status: UserStatusLiteral | None = None
    branch_access: BranchAccessInput | None = None


# ============================================================================
# EQUIPMENT & TELEMETRY REQUESTS
# ============================================================================


class EquipmentCreateRequest(BaseRequestModel):
    serial: NonEmptyTrimmedStr = Field(max_length=100)
    type: EquipmentTypeLiteral
    branch_id: UUIDStr
    company_id: UUIDStr | None = None
    manufacturer: str | None = None
    model: str | None = None
    installed_at: str | None = None


class EquipmentUpdateRequest(BaseRequestModel):
    type: EquipmentTypeLiteral | None = None
    branch_id: UUIDStr | None = None
    manufacturer: str | None = None
    model: str | None = None
    installed_at: str | None = None
    is_active: StrictBool | None = None


class HardwareTelemetryRequest(BaseRequestModel):
    serial: NonEmptyTrimmedStr = Field(max_length=100)
    temperature: FiniteDecimal
    pressure: FiniteDecimal
    door: BinaryFlag
    heater: BinaryFlag
    compressor: BinaryFlag
    fan: BinaryFlag
    request_id: str | None = None


class ManualTelemetryRequest(BaseRequestModel):
    temperature: FiniteDecimal
    recorded_at: str | None = None
    notes: str | None = None


# ============================================================================
# ALERT, ALERT RULE & MAINTENANCE REQUESTS
# ============================================================================


class AlertAcknowledgeRequest(BaseRequestModel):
    notes: str | None = None


class AlertRuleCreateRequest(BaseRequestModel):
    name: NonEmptyTrimmedStr = Field(max_length=255)
    description: str | None = None
    rule_type: AlertTypeLiteral
    threshold_value: FiniteDecimal | None = None
    comparison_operator: ComparisonOperatorLiteral | None = None
    duration_seconds: StrictNonNegativeInt = 300
    severity: AlertSeverityLiteral
    message_template: str | None = None
    scope: AlertScopeLiteral
    scope_id: UUIDStr | None = None
    is_active: StrictBool = True

    @model_validator(mode="after")
    def validate_rule_invariants(self) -> Self:
        if self.rule_type in ("door_open", "equipment_offline"):
            if self.threshold_value is not None or self.comparison_operator is not None:
                raise ValueError(
                    "threshold_value and comparison_operator must be null for door_open and equipment_offline rules"
                )
        elif self.threshold_value is None or self.comparison_operator is None:
            raise ValueError("threshold_value and comparison_operator are required for numeric threshold rules")

        if self.scope == "global" and self.scope_id is not None:
            raise ValueError("scope_id must be null when scope is global")
        if self.scope in ("company", "equipment") and not self.scope_id:
            raise ValueError("scope_id is required when scope is company or equipment")
        return self


class AlertRuleUpdateRequest(BaseRequestModel):
    name: NonEmptyTrimmedStr | None = Field(default=None, max_length=255)
    description: str | None = None
    threshold_value: FiniteDecimal | None = None
    comparison_operator: ComparisonOperatorLiteral | None = None
    duration_seconds: StrictNonNegativeInt | None = None
    severity: AlertSeverityLiteral | None = None
    message_template: str | None = None
    is_active: StrictBool | None = None


class MaintenanceCreateRequest(BaseRequestModel):
    type: MaintenanceTypeLiteral
    description: NonEmptyTrimmedStr
    performed_by: NonEmptyTrimmedStr = Field(max_length=255)
    performed_at: str | None = None
    notes: str | None = None
    next_maintenance_date: str | None = None


class MaintenanceUpdateRequest(BaseRequestModel):
    type: MaintenanceTypeLiteral | None = None
    description: NonEmptyTrimmedStr | None = None
    performed_by: NonEmptyTrimmedStr | None = Field(default=None, max_length=255)
    performed_at: str | None = None
    notes: str | None = None
    next_maintenance_date: str | None = None


# ============================================================================
# QUERY PARAMETER MODELS (Used for OpenAPI Query Parameters & TS Types)
# ============================================================================


class PaginationQuery(BaseRequestModel):
    page: int | None = None
    limit: int | None = None


class CompaniesQuery(PaginationQuery):
    status: CompanyStatusLiteral | None = None


class BranchesQuery(PaginationQuery):
    company_id: UUIDStr | None = None


class UsersQuery(PaginationQuery):
    company_id: UUIDStr | None = None
    role: UserRoleLiteral | None = None
    status: UserStatusLiteral | None = None


class EquipmentsQuery(PaginationQuery):
    company_id: UUIDStr | None = None
    branch_id: UUIDStr | None = None
    type: EquipmentTypeLiteral | None = None
    status: EquipmentStatusLiteral | None = None
    search: str | None = None
    include_inactive: bool | None = None


class TelemetryQuery(BaseRequestModel):
    start_date: str | None = None
    end_date: str | None = None
    interval: TelemetryIntervalLiteral | None = None
    page: int | None = None
    limit: int | None = None
    page_size: int | None = None
    page_token: str | None = None
    fields: str | None = None


class TelemetryExportQuery(BaseRequestModel):
    start_date: str | None = None
    end_date: str | None = None
    interval: TelemetryIntervalLiteral | None = None


class TelemetryScopeQuery(BaseRequestModel):
    company_id: UUIDStr | None = None
    branch_id: UUIDStr | None = None
    equipment_ids: str | None = None


class AlertsQuery(PaginationQuery):
    company_id: UUIDStr | None = None
    branch_id: UUIDStr | None = None
    equipment_id: UUIDStr | None = None
    status: AlertStatusLiteral | Literal["active,acknowledged"] | None = None
    severity: AlertSeverityLiteral | None = None
    start_date: str | None = None
    end_date: str | None = None


class AlertStatisticsQuery(BaseRequestModel):
    company_id: UUIDStr | None = None
    branch_id: UUIDStr | None = None
    equipment_id: UUIDStr | None = None


class AlertRulesQuery(PaginationQuery):
    company_id: UUIDStr | None = None
    scope: AlertScopeLiteral | None = None
    equipment_id: UUIDStr | None = None
    rule_type: AlertTypeLiteral | None = None
    is_active: bool | None = None


class AuditLogsQuery(PaginationQuery):
    page_size: int | None = Field(default=None, ge=1, le=100)
    page_token: str | None = None
    user_id: UUIDStr | None = None
    entity_type: AuditEntityTypeLiteral | None = None
    entity_id: UUIDStr | None = None
    action: str | None = None
    start_date: str | None = None
    end_date: str | None = None
