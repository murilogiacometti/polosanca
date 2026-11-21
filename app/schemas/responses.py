"""
Pydantic v2 Response Models.
Canonical API response contracts used to generate OpenAPI 3.0.3 schemas and
TypeScript types in frontend/src/types/openapi.d.ts.
"""

from pydantic import ConfigDict, Field

from app.schemas.base import (
    AlertScopeLiteral,
    AlertSeverityLiteral,
    AlertStatusLiteral,
    AlertTypeLiteral,
    AuditEntityTypeLiteral,
    BaseResponseModel,
    BinaryDoorStateLiteral,
    BinaryOnOffStateLiteral,
    BranchAccessTypeLiteral,
    CompanyStatusLiteral,
    ComparisonOperatorLiteral,
    DateStr,
    DateTimeStr,
    EquipmentStatusLiteral,
    EquipmentTypeLiteral,
    MaintenanceTypeLiteral,
    TelemetryIntervalLiteral,
    TelemetrySourceLiteral,
    UserRoleLiteral,
    UserStatusLiteral,
    UUIDStr,
)

# ============================================================================
# SHARED / COMMON RESPONSES
# ============================================================================


class Error(BaseResponseModel):
    error: str
    message: str | None = None
    equipment_count: int | None = None


class MessageResponse(BaseResponseModel):
    success: bool | None = None
    message: str


class DeactivateCompanyResponse(BaseResponseModel):
    message: str
    status: CompanyStatusLiteral


class Pagination(BaseResponseModel):
    page: int
    limit: int
    total: int
    total_pages: int


class BranchAccess(BaseResponseModel):
    type: BranchAccessTypeLiteral
    branches: list[UUIDStr] | None = None


# ============================================================================
# DOMAIN ENTITY RESPONSES
# ============================================================================


class User(BaseResponseModel):
    id: UUIDStr
    email: str
    name: str
    role: UserRoleLiteral
    company_id: UUIDStr | None = None
    status: UserStatusLiteral
    branch_access_type: BranchAccessTypeLiteral
    branch_access: BranchAccess | None = None
    last_login_at: DateTimeStr | None = None
    created_at: DateTimeStr | None = None


class Company(BaseResponseModel):
    id: UUIDStr
    name: str
    contact_email: str | None = None
    contact_phone: str | None = None
    status: CompanyStatusLiteral
    branches_count: int | None = None
    equipment_count: int | None = None
    created_at: DateTimeStr | None = None
    updated_at: DateTimeStr | None = None


class Branch(BaseResponseModel):
    id: UUIDStr
    company_id: UUIDStr
    name: str
    address: str | None = None
    manager_contact: str | None = None
    equipment_count: int | None = None
    created_at: DateTimeStr | None = None
    updated_at: DateTimeStr | None = None


class EquipmentCurrentData(BaseResponseModel):
    temperature: float | None = None
    pressure: float | None = None
    door: BinaryDoorStateLiteral | None = None
    heater: BinaryOnOffStateLiteral | None = None
    compressor: BinaryOnOffStateLiteral | None = None
    fan: BinaryOnOffStateLiteral | None = None
    last_update: DateTimeStr | None = None


class Equipment(BaseResponseModel):
    id: UUIDStr
    serial: str
    type: EquipmentTypeLiteral
    branch_id: UUIDStr
    branch_name: str | None = None
    company_id: UUIDStr
    manufacturer: str | None = None
    model: str | None = None
    status: EquipmentStatusLiteral
    is_active: bool
    current_data: EquipmentCurrentData | None = None
    last_seen_at: DateTimeStr | None = None
    installed_at: DateTimeStr | None = None
    last_maintenance_date: DateStr | None = None
    next_maintenance_date: DateStr | None = None
    created_at: DateTimeStr | None = None


class EquipmentCreated(Equipment):
    api_key: str


class RealtimeTelemetry(BaseResponseModel):
    equipment_id: UUIDStr
    serial: str
    branch_id: UUIDStr
    company_id: UUIDStr
    status: EquipmentStatusLiteral
    temperature: float | None = None
    pressure: float | None = None
    door: BinaryDoorStateLiteral | None = None
    heater: BinaryOnOffStateLiteral | None = None
    compressor: BinaryOnOffStateLiteral | None = None
    fan: BinaryOnOffStateLiteral | None = None
    last_update: DateTimeStr | None = None


class TelemetryDataPoint(BaseResponseModel):
    id: UUIDStr | None = None
    timestamp: DateTimeStr | None = None
    time: DateTimeStr | None = None
    equipment_id: UUIDStr | None = None
    temperature: float | None = None
    min_temperature: float | None = None
    max_temperature: float | None = None
    pressure: float | None = None
    door: BinaryDoorStateLiteral | None = None
    heater: BinaryOnOffStateLiteral | None = None
    compressor: BinaryOnOffStateLiteral | None = None
    fan: BinaryOnOffStateLiteral | None = None
    source: TelemetrySourceLiteral | None = None
    recorded_by: UUIDStr | None = None
    notes: str | None = None
    sample_count: int | None = None


class OverviewSparklinePoint(BaseResponseModel):
    t: DateTimeStr
    v: float


class ThresholdBounds(BaseResponseModel):
    low: float | None = None
    high: float | None = None
    label: str | None = None


class TelemetryOverviewEntry(BaseResponseModel):
    sparkline_24h: list[OverviewSparklinePoint]
    threshold: ThresholdBounds | None = None


class Alert(BaseResponseModel):
    id: UUIDStr
    equipment_id: UUIDStr
    alert_rule_id: UUIDStr | None = None
    serial: str | None = None
    branch_id: UUIDStr | None = None
    company_id: UUIDStr | None = None
    type: AlertTypeLiteral
    severity: AlertSeverityLiteral
    message: str
    status: AlertStatusLiteral
    acknowledged_at: DateTimeStr | None = None
    acknowledged_by: UUIDStr | None = None
    acknowledgment_notes: str | None = None
    resolved_at: DateTimeStr | None = None
    created_at: DateTimeStr | None = None


class AlertRule(BaseResponseModel):
    id: UUIDStr
    name: str
    description: str | None = None
    rule_type: AlertTypeLiteral
    threshold_value: float | None = None
    comparison_operator: ComparisonOperatorLiteral | None = None
    duration_seconds: int
    severity: AlertSeverityLiteral
    message_template: str | None = None
    scope: AlertScopeLiteral
    scope_id: UUIDStr | None = None
    is_active: bool
    created_by: UUIDStr | None = None
    created_at: DateTimeStr | None = None
    updated_at: DateTimeStr | None = None
    priority: int | None = None
    is_effective: bool | None = None


class MaintenanceRecord(BaseResponseModel):
    id: UUIDStr
    equipment_id: UUIDStr
    type: MaintenanceTypeLiteral
    description: str
    performed_by: str
    performed_at: DateTimeStr | None = None
    notes: str | None = None
    next_maintenance_date: DateStr | None = None
    created_by: UUIDStr | None = None
    created_at: DateTimeStr | None = None


class AuditLog(BaseResponseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUIDStr
    user_id: UUIDStr | None = None
    action: str
    entity_type: AuditEntityTypeLiteral
    entity_id: UUIDStr | None = None
    changes: dict[str, object] | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: DateTimeStr | None = None


# ============================================================================
# ENDPOINT ENVELOPE RESPONSES
# ============================================================================


class LoginResponse(BaseResponseModel):
    access_token: str
    refresh_token: str
    user: User


class RefreshResponse(BaseResponseModel):
    access_token: str


class CompaniesListResponse(BaseResponseModel):
    companies: list[Company]
    pagination: Pagination


class BranchesListResponse(BaseResponseModel):
    branches: list[Branch]
    pagination: Pagination


class UsersListResponse(BaseResponseModel):
    users: list[User]
    pagination: Pagination


class UserInviteResponse(BaseResponseModel):
    success: bool
    user_id: UUIDStr
    invitation_sent: bool
    user: User
    message: str


class ResendInvitationResponse(BaseResponseModel):
    success: bool
    user_id: UUIDStr
    invitation_sent: bool
    message: str


class EquipmentsListResponse(BaseResponseModel):
    equipment: list[Equipment]
    pagination: Pagination


class RotateApiKeyResponse(BaseResponseModel):
    equipment_id: UUIDStr
    api_key: str


class EquipmentAlertRulesResponse(BaseResponseModel):
    equipment_id: UUIDStr
    applicable_rules: list[AlertRule]


class HardwareTelemetryResponse(BaseResponseModel):
    success: bool
    message: str
    timestamp: DateTimeStr
    record_id: UUIDStr
    deduplicated: bool | None = None


class ManualTelemetryResponse(BaseResponseModel):
    success: bool
    equipment_id: UUIDStr
    timestamp: DateTimeStr
    temperature: float
    source: TelemetrySourceLiteral
    recorded_by: UUIDStr
    notes: str | None = None


class TelemetryHistoryResponse(BaseResponseModel):
    equipment_id: UUIDStr
    serial: str | None = None
    interval: TelemetryIntervalLiteral
    count: int
    data: list[TelemetryDataPoint]
    next_page_token: str | None = None
    pagination: Pagination | None = None


class RealtimeTelemetryListResponse(BaseResponseModel):
    equipment: list[RealtimeTelemetry]


class TelemetryOverviewResponse(BaseResponseModel):
    overview: dict[str, TelemetryOverviewEntry]


class AlertsListResponse(BaseResponseModel):
    alerts: list[Alert]
    pagination: Pagination


class AlertSeverityCounts(BaseResponseModel):
    warning: int = 0
    critical: int = 0


class AlertStatisticsResponse(BaseResponseModel):
    total_active: int
    by_severity: AlertSeverityCounts = Field(default_factory=AlertSeverityCounts)
    by_type: dict[AlertTypeLiteral, int] = Field(default_factory=dict)


class AlertRulesListResponse(BaseResponseModel):
    alert_rules: list[AlertRule]
    pagination: Pagination


class AlertRuleStatisticsResponse(BaseResponseModel):
    rule_id: UUIDStr
    total_triggers: int
    triggers_last_30_days: int
    affected_equipments: int
    avg_triggers_per_equipment: float


class MaintenanceRecordsListResponse(BaseResponseModel):
    equipment_id: UUIDStr
    maintenance_records: list[MaintenanceRecord]
    pagination: Pagination


class AuditLogsListResponse(BaseResponseModel):
    audit_logs: list[AuditLog]
    next_page_token: str | None = None
    pagination: Pagination
