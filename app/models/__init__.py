"""
Polo Sanca Refrigeration Monitoring System
SQLAlchemy Models (Flask-SQLAlchemy)
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum as PyEnum
from typing import TypedDict

from sqlalchemy import (
    DDL,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    desc,
    event,
    inspect,
    true,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.orm.base import NO_VALUE
from sqlalchemy.sql import func

from app import Base
from app.enums import (
    AlertRuleScope,
    AlertRuleType,
    AlertSeverity,
    AlertStatus,
    BinaryDeviceState,
    BranchAccessType,
    CompanyStatus,
    ComparisonOperator,
    DoorState,
    EquipmentStatus,
    EquipmentType,
    UserRole,
    UserStatus,
)

__all__ = [
    "Alert",
    "AlertRule",
    "AlertRuleScope",
    "AlertRuleType",
    "AlertSeverity",
    "AlertStatus",
    "AuditLog",
    "Branch",
    "BranchAccessType",
    "Company",
    "CompanyStatus",
    "ComparisonOperator",
    "CurrentDataSnapshot",
    "Equipment",
    "EquipmentStatus",
    "EquipmentType",
    "MaintenanceRecord",
    "Telemetry",
    "User",
    "UserBranchAccess",
    "UserRole",
    "UserStatus",
]


class CurrentDataSnapshot(TypedDict):
    temperature: float
    pressure: float
    door: DoorState
    heater: BinaryDeviceState
    compressor: BinaryDeviceState
    fan: BinaryDeviceState
    last_update: str


def _enum_values(cls: type[PyEnum]) -> list[str]:
    return [str(e.value) for e in cls]


def _pg_enum(enum_cls: type[PyEnum]) -> Enum:
    """Persist Enum .value strings (e.g. 'global_admin', '>') in PostgreSQL enum types."""
    return Enum(enum_cls, values_callable=_enum_values)


# ============================================================================
# MODELS
# ============================================================================


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[CompanyStatus] = mapped_column(_pg_enum(CompanyStatus), nullable=False, default=CompanyStatus.ACTIVE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships — no destructive delete-orphan cascades on tenant entities
    branches: Mapped[list["Branch"]] = relationship("Branch", back_populates="company", passive_deletes=True)
    users: Mapped[list["User"]] = relationship("User", back_populates="company", passive_deletes=True)
    equipments: Mapped[list["Equipment"]] = relationship(
        "Equipment",
        back_populates="company",
        foreign_keys="Equipment.company_id",
        passive_deletes=True,
        overlaps="branch,equipments",
    )

    def __repr__(self) -> str:
        return f"<Company {self.name}>"

    def to_dict(self, branches_count: int | None = None, equipment_count: int | None = None) -> dict[str, object]:
        data: dict[str, object] = {
            "id": str(self.id),
            "name": self.name,
            "contact_email": self.contact_email,
            "contact_phone": self.contact_phone,
            "status": self.status.value,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if branches_count is not None:
            data["branches_count"] = branches_count
        if equipment_count is not None:
            data["equipment_count"] = equipment_count
        return data


class Branch(Base):
    __tablename__ = "branches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    manager_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    company: Mapped["Company"] = relationship("Company", back_populates="branches")
    equipments: Mapped[list["Equipment"]] = relationship(
        "Equipment",
        back_populates="branch",
        primaryjoin="Branch.id == Equipment.branch_id",
        foreign_keys="Equipment.branch_id",
        passive_deletes=True,
        overlaps="company,equipments",
    )
    user_accesses: Mapped[list["UserBranchAccess"]] = relationship(
        "UserBranchAccess", back_populates="branch", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="branches_company_name_unique"),
        UniqueConstraint("id", "company_id", name="uq_branches_id_company_id"),
        Index("ix_branches_company_id", "company_id"),
    )

    def __repr__(self) -> str:
        return f"<Branch {self.name}>"

    def to_dict(self, equipment_count: int | None = None) -> dict[str, object]:
        data: dict[str, object] = {
            "id": str(self.id),
            "company_id": str(self.company_id),
            "name": self.name,
            "address": self.address,
            "manager_contact": self.manager_contact,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if equipment_count is not None:
            data["equipment_count"] = equipment_count
        return data


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(_pg_enum(UserRole), nullable=False)
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT"), nullable=True
    )
    status: Mapped[UserStatus] = mapped_column(_pg_enum(UserStatus), nullable=False, default=UserStatus.PENDING)
    branch_access_type: Mapped[BranchAccessType] = mapped_column(
        _pg_enum(BranchAccessType), nullable=False, default=BranchAccessType.FULL
    )
    invitation_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    invitation_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    password_reset_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    company: Mapped["Company | None"] = relationship("Company", back_populates="users")
    branch_accesses: Mapped[list["UserBranchAccess"]] = relationship(
        "UserBranchAccess", back_populates="user", cascade="all, delete-orphan"
    )
    created_alert_rules: Mapped[list["AlertRule"]] = relationship("AlertRule", back_populates="creator")
    acknowledged_alerts: Mapped[list["Alert"]] = relationship(
        "Alert", foreign_keys="Alert.acknowledged_by", back_populates="acknowledger"
    )
    created_maintenance_records: Mapped[list["MaintenanceRecord"]] = relationship(
        "MaintenanceRecord", back_populates="creator"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="user")

    __table_args__ = (
        CheckConstraint(
            ((role == UserRole.GLOBAL_ADMIN) & company_id.is_(None))
            | ((role != UserRole.GLOBAL_ADMIN) & company_id.isnot(None)),
            name="ck_users_role_company_id",
        ),
        Index("ix_users_company_role_status", "company_id", "role", "status"),
        Index(
            "ix_users_invitation_token",
            "invitation_token",
            postgresql_where=invitation_token.isnot(None),
        ),
        Index(
            "ix_users_password_reset_token",
            "password_reset_token",
            postgresql_where=password_reset_token.isnot(None),
        ),
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"

    def to_dict(self, include_sensitive: bool = False) -> dict[str, object]:
        data: dict[str, object] = {
            "id": str(self.id),
            "email": self.email,
            "name": self.name,
            "role": self.role.value,
            "company_id": str(self.company_id) if self.company_id else None,
            "status": self.status.value,
            "branch_access_type": self.branch_access_type.value,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_sensitive:
            data["password_hash"] = self.password_hash
        return data


class UserBranchAccess(Base):
    __tablename__ = "user_branch_access"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="branch_accesses")
    branch: Mapped["Branch"] = relationship("Branch", back_populates="user_accesses")

    __table_args__ = (
        UniqueConstraint("user_id", "branch_id", name="user_branch_access_unique"),
        Index("ix_user_branch_access_branch_id", "branch_id"),
    )

    def __repr__(self) -> str:
        return f"<UserBranchAccess user={self.user_id} branch={self.branch_id}>"


class Equipment(Base):
    __tablename__ = "equipments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    serial: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    type: Mapped[EquipmentType] = mapped_column(_pg_enum(EquipmentType), nullable=False)
    branch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False
    )
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[EquipmentStatus] = mapped_column(
        _pg_enum(EquipmentStatus), nullable=False, default=EquipmentStatus.OFFLINE
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    api_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    # Unindexed heartbeat & snapshot columns paired with fillfactor=80 for PostgreSQL HOT updates
    current_data: Mapped[CurrentDataSnapshot | None] = mapped_column(JSONB, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    installed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_maintenance_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_maintenance_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships — RESTRICT on historical children so history is never cascade-deleted
    branch: Mapped["Branch"] = relationship(
        "Branch",
        back_populates="equipments",
        primaryjoin="Equipment.branch_id == Branch.id",
        foreign_keys=[branch_id],
        overlaps="company,equipments",
    )
    company: Mapped["Company"] = relationship(
        "Company",
        back_populates="equipments",
        foreign_keys=[company_id],
        overlaps="branch,equipments",
    )
    telemetry: Mapped[list["Telemetry"]] = relationship("Telemetry", back_populates="equipment", passive_deletes=True)
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="equipment", passive_deletes=True)
    maintenance_records: Mapped[list["MaintenanceRecord"]] = relationship(
        "MaintenanceRecord", back_populates="equipment", passive_deletes=True
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["branch_id", "company_id"],
            ["branches.id", "branches.company_id"],
            name="fk_equipments_branch_company",
            ondelete="RESTRICT",
        ),
        Index("ix_equipments_company_branch_active", "company_id", "branch_id", "is_active"),
    )

    def __repr__(self) -> str:
        return f"<Equipment {self.serial}>"

    def to_dict(self, branch_name: str | None = None) -> dict[str, object]:
        resolved_branch_name = branch_name
        if resolved_branch_name is None:
            loaded_branch = inspect(self).attrs.branch.loaded_value
            if loaded_branch is not NO_VALUE and loaded_branch is not None:
                resolved_branch_name = loaded_branch.name

        return {
            "id": str(self.id),
            "serial": self.serial,
            "type": self.type.value,
            "branch_id": str(self.branch_id),
            "branch_name": resolved_branch_name,
            "company_id": str(self.company_id),
            "manufacturer": self.manufacturer,
            "model": self.model,
            "status": self.status.value,
            "is_active": self.is_active,
            "current_data": self.current_data,
            "last_seen_at": self.last_seen_at.isoformat() if self.last_seen_at else None,
            "installed_at": self.installed_at.isoformat() if self.installed_at else None,
            "last_maintenance_date": self.last_maintenance_date.isoformat() if self.last_maintenance_date else None,
            "next_maintenance_date": self.next_maintenance_date.isoformat() if self.next_maintenance_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


event.listen(
    Equipment.__table__,
    "after_create",
    DDL("ALTER TABLE equipments SET (fillfactor = 80)").execute_if(dialect="postgresql"),
)


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_type: Mapped[AlertRuleType] = mapped_column(_pg_enum(AlertRuleType), nullable=False)
    threshold_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    comparison_operator: Mapped[ComparisonOperator | None] = mapped_column(_pg_enum(ComparisonOperator), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    severity: Mapped[AlertSeverity] = mapped_column(_pg_enum(AlertSeverity), nullable=False)
    message_template: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[AlertRuleScope] = mapped_column(_pg_enum(AlertRuleScope), nullable=False)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    creator: Mapped["User | None"] = relationship("User", back_populates="created_alert_rules")
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="alert_rule")

    __table_args__ = (
        CheckConstraint(
            (
                rule_type.in_([AlertRuleType.DOOR_OPEN, AlertRuleType.EQUIPMENT_OFFLINE])
                & threshold_value.is_(None)
                & comparison_operator.is_(None)
            )
            | (
                ~rule_type.in_([AlertRuleType.DOOR_OPEN, AlertRuleType.EQUIPMENT_OFFLINE])
                & threshold_value.isnot(None)
                & comparison_operator.isnot(None)
            ),
            name="ck_alert_rules_threshold_operator",
        ),
        CheckConstraint(
            ((scope == AlertRuleScope.GLOBAL) & scope_id.is_(None))
            | ((scope != AlertRuleScope.GLOBAL) & scope_id.isnot(None)),
            name="ck_alert_rules_scope_id",
        ),
        CheckConstraint("duration_seconds >= 0", name="ck_alert_rules_duration_nonneg"),
        Index("ix_alert_rules_active_scope", "is_active", "scope", "scope_id"),
    )

    def __repr__(self) -> str:
        return f"<AlertRule {self.name}>"

    def to_dict(self) -> dict[str, object]:
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "rule_type": self.rule_type.value,
            "threshold_value": float(self.threshold_value) if self.threshold_value is not None else None,
            "comparison_operator": self.comparison_operator.value if self.comparison_operator is not None else None,
            "duration_seconds": self.duration_seconds,
            "severity": self.severity.value,
            "message_template": self.message_template,
            "scope": self.scope.value,
            "scope_id": str(self.scope_id) if self.scope_id else None,
            "is_active": self.is_active,
            "created_by": str(self.created_by) if self.created_by else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Telemetry(Base):
    __tablename__ = "telemetry"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, nullable=False)
    equipment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("equipments.id", ondelete="RESTRICT"),
        primary_key=True,
        nullable=False,
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    temperature: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    pressure: Mapped[Decimal | None] = mapped_column(Numeric(7, 2), nullable=True)
    door: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    heater: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    compressor: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    fan: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="device", server_default="device")
    request_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    equipment: Mapped["Equipment"] = relationship("Equipment", back_populates="telemetry")

    __table_args__ = (
        CheckConstraint(
            """
            (
                source = 'device'
                AND pressure IS NOT NULL
                AND door IN (0, 1)
                AND heater IN (0, 1)
                AND compressor IN (0, 1)
                AND fan IN (0, 1)
                AND recorded_by IS NULL
            )
            OR (
                source = 'manual'
                AND pressure IS NULL
                AND door IS NULL
                AND heater IS NULL
                AND compressor IS NULL
                AND fan IS NULL
                AND recorded_by IS NOT NULL
            )
            """,
            name="ck_telemetry_source_fields",
        ),
        Index("ix_telemetry_equipment_time", "equipment_id", desc("time")),
        Index(
            "ix_telemetry_equipment_request_id",
            "equipment_id",
            "request_id",
            postgresql_where=request_id.isnot(None),
        ),
    )

    def __repr__(self) -> str:
        return f"<Telemetry {self.equipment_id} at {self.time}>"

    def to_dict(self) -> dict[str, object]:
        iso_time = self.time.isoformat() if self.time else None
        return {
            "id": str(self.id),
            "timestamp": iso_time,
            "time": iso_time,
            "equipment_id": str(self.equipment_id),
            "temperature": float(self.temperature) if self.temperature is not None else None,
            "pressure": float(self.pressure) if self.pressure is not None else None,
            "door": ("open" if self.door == 1 else "closed") if self.door is not None else None,
            "heater": ("on" if self.heater == 1 else "off") if self.heater is not None else None,
            "compressor": ("on" if self.compressor == 1 else "off") if self.compressor is not None else None,
            "fan": ("on" if self.fan == 1 else "off") if self.fan is not None else None,
            "source": self.source,
            "recorded_by": str(self.recorded_by) if self.recorded_by else None,
            "notes": self.notes,
        }


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    equipment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("equipments.id", ondelete="RESTRICT"), nullable=False
    )
    alert_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("alert_rules.id", ondelete="SET NULL"), nullable=True
    )
    type: Mapped[AlertRuleType] = mapped_column(_pg_enum(AlertRuleType), nullable=False)
    severity: Mapped[AlertSeverity] = mapped_column(_pg_enum(AlertSeverity), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[AlertStatus] = mapped_column(_pg_enum(AlertStatus), nullable=False, default=AlertStatus.ACTIVE)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    acknowledgment_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    equipment: Mapped["Equipment"] = relationship("Equipment", back_populates="alerts")
    alert_rule: Mapped["AlertRule | None"] = relationship("AlertRule", back_populates="alerts")
    acknowledger: Mapped["User | None"] = relationship(
        "User", foreign_keys=[acknowledged_by], back_populates="acknowledged_alerts"
    )

    __table_args__ = (
        Index(
            "uq_open_alert_per_rule",
            "equipment_id",
            "alert_rule_id",
            unique=True,
            postgresql_where=status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]) & alert_rule_id.isnot(None),
        ),
        Index("ix_alerts_equipment_status_created", "equipment_id", "status", desc("created_at")),
    )

    def __repr__(self) -> str:
        return f"<Alert {self.id} - {self.type.value}>"

    def to_dict(self) -> dict[str, object]:
        loaded_eq = inspect(self).attrs.equipment.loaded_value
        has_eq = loaded_eq is not NO_VALUE and loaded_eq is not None
        serial = loaded_eq.serial if has_eq else None
        branch_id = str(loaded_eq.branch_id) if has_eq and loaded_eq.branch_id else None
        company_id = str(loaded_eq.company_id) if has_eq and loaded_eq.company_id else None
        data: dict[str, object] = {
            "id": str(self.id),
            "equipment_id": str(self.equipment_id),
            "alert_rule_id": str(self.alert_rule_id) if self.alert_rule_id else None,
            "type": self.type.value,
            "severity": self.severity.value,
            "message": self.message,
            "status": self.status.value,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "acknowledged_by": str(self.acknowledged_by) if self.acknowledged_by else None,
            "acknowledgment_notes": self.acknowledgment_notes,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if serial is not None:
            data["serial"] = serial
        if branch_id is not None:
            data["branch_id"] = branch_id
        if company_id is not None:
            data["company_id"] = company_id
        return data


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    equipment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("equipments.id", ondelete="RESTRICT"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    performed_by: Mapped[str] = mapped_column(String(255), nullable=False)
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_maintenance_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    equipment: Mapped["Equipment"] = relationship("Equipment", back_populates="maintenance_records")
    creator: Mapped["User | None"] = relationship("User", back_populates="created_maintenance_records")

    __table_args__ = (Index("ix_maintenance_records_equipment_performed", "equipment_id", desc("performed_at")),)

    def __repr__(self) -> str:
        return f"<MaintenanceRecord {self.id} - {self.type}>"

    def to_dict(self) -> dict[str, object]:
        return {
            "id": str(self.id),
            "equipment_id": str(self.equipment_id),
            "type": self.type,
            "description": self.description,
            "performed_by": self.performed_by,
            "performed_at": self.performed_at.isoformat() if self.performed_at else None,
            "notes": self.notes,
            "next_maintenance_date": self.next_maintenance_date.isoformat() if self.next_maintenance_date else None,
            "created_by": str(self.created_by) if self.created_by else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    changes: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    user: Mapped["User | None"] = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index("ix_audit_logs_entity_created", "entity_type", "entity_id", desc("created_at")),
        Index("ix_audit_logs_created_id", desc("created_at"), desc("id")),
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} on {self.entity_type}>"

    def to_dict(self) -> dict[str, object]:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": str(self.entity_id) if self.entity_id else None,
            "changes": self.changes,
            "ip_address": self.ip_address if self.ip_address else None,
            "user_agent": self.user_agent,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
