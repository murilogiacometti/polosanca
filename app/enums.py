"""
Canonical Domain StrEnums for Polo Sanca.
Single source of truth shared across SQLAlchemy models, Pydantic v2 schemas,
OpenAPI 3.0.3 generation, and static type checkers (mypy / Pyrefly).
"""

from enum import StrEnum


class UserRole(StrEnum):
    GLOBAL_ADMIN = "global_admin"
    COMPANY_ADMIN = "company_admin"
    COMPANY_VIEWER = "company_viewer"


class UserStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"


class CompanyStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class EquipmentType(StrEnum):
    FREEZER = "freezer"
    REFRIGERATOR = "refrigerator"
    COLD_ROOM = "cold_room"


class EquipmentStatus(StrEnum):
    OPERATIONAL = "operational"
    WARNING = "warning"
    CRITICAL = "critical"
    OFFLINE = "offline"


class AlertSeverity(StrEnum):
    WARNING = "warning"
    CRITICAL = "critical"


class AlertStatus(StrEnum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class AlertRuleType(StrEnum):
    TEMPERATURE_HIGH = "temperature_high"
    TEMPERATURE_LOW = "temperature_low"
    PRESSURE_HIGH = "pressure_high"
    PRESSURE_LOW = "pressure_low"
    DOOR_OPEN = "door_open"
    EQUIPMENT_OFFLINE = "equipment_offline"


class AlertRuleScope(StrEnum):
    GLOBAL = "global"
    COMPANY = "company"
    EQUIPMENT = "equipment"


class ComparisonOperator(StrEnum):
    GT = ">"
    LT = "<"
    EQ = "="
    GTE = ">="
    LTE = "<="


class BranchAccessType(StrEnum):
    FULL = "full"
    RESTRICTED = "restricted"


class DoorState(StrEnum):
    OPEN = "open"
    CLOSED = "closed"


class BinaryDeviceState(StrEnum):
    ON = "on"
    OFF = "off"


class TelemetrySource(StrEnum):
    DEVICE = "device"
    MANUAL = "manual"


class TelemetryInterval(StrEnum):
    RAW = "raw"
    FIVE_MIN = "5min"
    ONE_HOUR = "1hour"
    ONE_DAY = "1day"


class MaintenanceType(StrEnum):
    PREVENTIVE = "preventive"
    ROUTINE_INSPECTION = "routine_inspection"
    REPAIR = "repair"
    PART_REPLACEMENT = "part_replacement"
    CALIBRATION = "calibration"
    CLEANING = "cleaning"
    EMERGENCY = "emergency"
    EMERGENCY_FIX = "emergency_fix"
    OTHER = "other"


class AuditEntityType(StrEnum):
    COMPANY = "company"
    BRANCH = "branch"
    USER = "user"
    EQUIPMENT = "equipment"
    ALERT = "alert"
    ALERT_RULE = "alert_rule"
    MAINTENANCE_RECORD = "maintenance_record"
