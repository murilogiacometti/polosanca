"""
Polo Sanca Refrigeration Monitoring System
SQLAlchemy Models (Flask-SQLAlchemy)
"""

from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import CheckConstraint, Enum, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
from sqlalchemy.sql import func
import uuid

from app import db

# ============================================================================
# ENUMS
# ============================================================================

class UserRole(PyEnum):
    GLOBAL_ADMIN = 'global_admin'
    COMPANY_ADMIN = 'company_admin'
    COMPANY_VIEWER = 'company_viewer'

class UserStatus(PyEnum):
    ACTIVE = 'active'
    INACTIVE = 'inactive'
    PENDING = 'pending'

class CompanyStatus(PyEnum):
    ACTIVE = 'active'
    INACTIVE = 'inactive'

class EquipmentType(PyEnum):
    FREEZER = 'freezer'
    REFRIGERATOR = 'refrigerator'
    COLD_ROOM = 'cold_room'

class EquipmentStatus(PyEnum):
    OPERATIONAL = 'operational'
    WARNING = 'warning'
    CRITICAL = 'critical'
    OFFLINE = 'offline'

class AlertSeverity(PyEnum):
    WARNING = 'warning'
    CRITICAL = 'critical'

class AlertStatus(PyEnum):
    ACTIVE = 'active'
    ACKNOWLEDGED = 'acknowledged'
    RESOLVED = 'resolved'

class AlertRuleType(PyEnum):
    TEMPERATURE_HIGH = 'temperature_high'
    TEMPERATURE_LOW = 'temperature_low'
    PRESSURE_HIGH = 'pressure_high'
    PRESSURE_LOW = 'pressure_low'
    DOOR_OPEN = 'door_open'
    EQUIPMENT_OFFLINE = 'equipment_offline'

class AlertRuleScope(PyEnum):
    GLOBAL = 'global'
    COMPANY = 'company'
    EQUIPMENT = 'equipment'

class ComparisonOperator(PyEnum):
    GT = '>'
    LT = '<'
    EQ = '='
    GTE = '>='
    LTE = '<='

class BranchAccessType(PyEnum):
    FULL = 'full'
    RESTRICTED = 'restricted'

# ============================================================================
# MODELS
# ============================================================================

class Company(db.Model):
    __tablename__ = 'companies'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(255), nullable=False, unique=True)
    contact_email = db.Column(db.String(255))
    contact_phone = db.Column(db.String(50))
    status = db.Column(Enum(CompanyStatus), nullable=False, default=CompanyStatus.ACTIVE)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Relationships
    branches = db.relationship('Branch', back_populates='company', cascade='all, delete-orphan')
    users = db.relationship('User', back_populates='company', cascade='all, delete-orphan')
    equipments = db.relationship('Equipment', back_populates='company', cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Company {self.name}>'

    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'contact_email': self.contact_email,
            'contact_phone': self.contact_phone,
            'status': self.status.value,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


class Branch(db.Model):
    __tablename__ = 'branches'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    address = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Relationships
    company = db.relationship('Company', back_populates='branches')
    equipments = db.relationship('Equipment', back_populates='branch')
    user_accesses = db.relationship('UserBranchAccess', back_populates='branch', cascade='all, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('company_id', 'name', name='branches_company_name_unique'),
    )

    def __repr__(self):
        return f'<Branch {self.name}>'

    def to_dict(self):
        return {
            'id': str(self.id),
            'company_id': str(self.company_id),
            'name': self.name,
            'address': self.address,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = db.Column(db.String(255), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    role = db.Column(Enum(UserRole), nullable=False)
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey('companies.id', ondelete='CASCADE'))
    status = db.Column(Enum(UserStatus), nullable=False, default=UserStatus.PENDING)
    branch_access_type = db.Column(Enum(BranchAccessType), nullable=False, default=BranchAccessType.FULL)
    invitation_token = db.Column(db.String(255))
    invitation_expires_at = db.Column(db.DateTime(timezone=True))
    last_login_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Relationships
    company = db.relationship('Company', back_populates='users')
    branch_accesses = db.relationship('UserBranchAccess', back_populates='user', cascade='all, delete-orphan')
    created_alert_rules = db.relationship('AlertRule', back_populates='creator')
    acknowledged_alerts = db.relationship('Alert', foreign_keys='Alert.acknowledged_by', back_populates='acknowledger')
    created_maintenance_records = db.relationship('MaintenanceRecord', back_populates='creator')
    audit_logs = db.relationship('AuditLog', back_populates='user')

    def __repr__(self):
        return f'<User {self.email}>'

    def to_dict(self, include_sensitive=False):
        data = {
            'id': str(self.id),
            'email': self.email,
            'name': self.name,
            'role': self.role.value,
            'company_id': str(self.company_id) if self.company_id else None,
            'status': self.status.value,
            'branch_access_type': self.branch_access_type.value,
            'last_login_at': self.last_login_at.isoformat() if self.last_login_at else None,
            'created_at': self.created_at.isoformat(),
        }
        if include_sensitive:
            data['password_hash'] = self.password_hash
        return data


class UserBranchAccess(db.Model):
    __tablename__ = 'user_branch_access'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    branch_id = db.Column(UUID(as_uuid=True), db.ForeignKey('branches.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    user = db.relationship('User', back_populates='branch_accesses')
    branch = db.relationship('Branch', back_populates='user_accesses')

    __table_args__ = (
        db.UniqueConstraint('user_id', 'branch_id', name='user_branch_access_unique'),
    )

    def __repr__(self):
        return f'<UserBranchAccess user={self.user_id} branch={self.branch_id}>'


class Equipment(db.Model):
    __tablename__ = 'equipments'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    serial = db.Column(db.String(100), nullable=False, unique=True)
    type = db.Column(Enum(EquipmentType), nullable=False)
    branch_id = db.Column(UUID(as_uuid=True), db.ForeignKey('branches.id', ondelete='RESTRICT'), nullable=False)
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False)
    manufacturer = db.Column(db.String(255))
    model = db.Column(db.String(255))
    status = db.Column(Enum(EquipmentStatus), nullable=False, default=EquipmentStatus.OFFLINE)
    api_key = db.Column(db.String(255), nullable=False, unique=True)
    last_seen_at = db.Column(db.DateTime(timezone=True))
    installed_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Relationships
    branch = db.relationship('Branch', back_populates='equipments')
    company = db.relationship('Company', back_populates='equipments')
    telemetry = db.relationship('Telemetry', back_populates='equipment', cascade='all, delete-orphan')
    alerts = db.relationship('Alert', back_populates='equipment', cascade='all, delete-orphan')
    maintenance_records = db.relationship('MaintenanceRecord', back_populates='equipment', cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Equipment {self.serial}>'

    def to_dict(self):
        return {
            'id': str(self.id),
            'serial': self.serial,
            'type': self.type.value,
            'branch_id': str(self.branch_id),
            'company_id': str(self.company_id),
            'manufacturer': self.manufacturer,
            'model': self.model,
            'status': self.status.value,
            'last_seen_at': self.last_seen_at.isoformat() if self.last_seen_at else None,
            'installed_at': self.installed_at.isoformat() if self.installed_at else None,
            'created_at': self.created_at.isoformat(),
        }


class AlertRule(db.Model):
    __tablename__ = 'alert_rules'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(255), nullable=False, unique=True)
    description = db.Column(db.Text)
    rule_type = db.Column(Enum(AlertRuleType), nullable=False)
    threshold_value = db.Column(db.Numeric(10, 2))
    comparison_operator = db.Column(Enum(ComparisonOperator), nullable=False)
    duration_seconds = db.Column(db.Integer, nullable=False, default=300)
    severity = db.Column(Enum(AlertSeverity), nullable=False)
    message_template = db.Column(db.Text, nullable=False)
    scope = db.Column(Enum(AlertRuleScope), nullable=False)
    scope_id = db.Column(UUID(as_uuid=True))
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_by = db.Column(UUID(as_uuid=True), db.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Relationships
    creator = db.relationship('User', back_populates='created_alert_rules')
    alerts = db.relationship('Alert', back_populates='alert_rule')

    def __repr__(self):
        return f'<AlertRule {self.name}>'

    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'description': self.description,
            'rule_type': self.rule_type.value,
            'threshold_value': float(self.threshold_value) if self.threshold_value else None,
            'comparison_operator': self.comparison_operator.value,
            'duration_seconds': self.duration_seconds,
            'severity': self.severity.value,
            'message_template': self.message_template,
            'scope': self.scope.value,
            'scope_id': str(self.scope_id) if self.scope_id else None,
            'is_active': self.is_active,
            'created_by': str(self.created_by),
            'created_at': self.created_at.isoformat(),
        }


class Telemetry(db.Model):
    __tablename__ = 'telemetry'

    time = db.Column(db.DateTime(timezone=True), primary_key=True, nullable=False)
    equipment_id = db.Column(UUID(as_uuid=True), db.ForeignKey('equipments.id', ondelete='CASCADE'), primary_key=True, nullable=False)
    temperature = db.Column(db.Numeric(5, 2))
    pressure = db.Column(db.Numeric(7, 2))
    door = db.Column(db.SmallInteger, CheckConstraint('door IN (0, 1)'))
    heater = db.Column(db.SmallInteger, CheckConstraint('heater IN (0, 1)'))
    compressor = db.Column(db.SmallInteger, CheckConstraint('compressor IN (0, 1)'))
    fan = db.Column(db.SmallInteger, CheckConstraint('fan IN (0, 1)'))

    # Relationships
    equipment = db.relationship('Equipment', back_populates='telemetry')

    def __repr__(self):
        return f'<Telemetry {self.equipment_id} at {self.time}>'

    def to_dict(self):
        return {
            'time': self.time.isoformat(),
            'equipment_id': str(self.equipment_id),
            'temperature': float(self.temperature) if self.temperature else None,
            'pressure': float(self.pressure) if self.pressure else None,
            'door': self.door,
            'heater': self.heater,
            'compressor': self.compressor,
            'fan': self.fan,
        }


class Alert(db.Model):
    __tablename__ = 'alerts'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    equipment_id = db.Column(UUID(as_uuid=True), db.ForeignKey('equipments.id', ondelete='CASCADE'), nullable=False)
    alert_rule_id = db.Column(UUID(as_uuid=True), db.ForeignKey('alert_rules.id', ondelete='SET NULL'))
    type = db.Column(Enum(AlertRuleType), nullable=False)
    severity = db.Column(Enum(AlertSeverity), nullable=False)
    message = db.Column(db.Text, nullable=False)
    status = db.Column(Enum(AlertStatus), nullable=False, default=AlertStatus.ACTIVE)
    acknowledged_at = db.Column(db.DateTime(timezone=True))
    acknowledged_by = db.Column(UUID(as_uuid=True), db.ForeignKey('users.id', ondelete='SET NULL'))
    acknowledgment_notes = db.Column(db.Text)
    resolved_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    equipment = db.relationship('Equipment', back_populates='alerts')
    alert_rule = db.relationship('AlertRule', back_populates='alerts')
    acknowledger = db.relationship('User', foreign_keys=[acknowledged_by], back_populates='acknowledged_alerts')

    def __repr__(self):
        return f'<Alert {self.id} - {self.type.value}>'

    def to_dict(self):
        return {
            'id': str(self.id),
            'equipment_id': str(self.equipment_id),
            'alert_rule_id': str(self.alert_rule_id) if self.alert_rule_id else None,
            'type': self.type.value,
            'severity': self.severity.value,
            'message': self.message,
            'status': self.status.value,
            'acknowledged_at': self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            'acknowledged_by': str(self.acknowledged_by) if self.acknowledged_by else None,
            'acknowledgment_notes': self.acknowledgment_notes,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'created_at': self.created_at.isoformat(),
        }


class MaintenanceRecord(db.Model):
    __tablename__ = 'maintenance_records'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    equipment_id = db.Column(UUID(as_uuid=True), db.ForeignKey('equipments.id', ondelete='CASCADE'), nullable=False)
    type = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=False)
    performed_by = db.Column(db.String(255), nullable=False)
    performed_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    notes = db.Column(db.Text)
    next_maintenance_date = db.Column(db.Date)
    created_by = db.Column(UUID(as_uuid=True), db.ForeignKey('users.id', ondelete='SET NULL'))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Relationships
    equipment = db.relationship('Equipment', back_populates='maintenance_records')
    creator = db.relationship('User', back_populates='created_maintenance_records')

    def __repr__(self):
        return f'<MaintenanceRecord {self.id} - {self.type}>'

    def to_dict(self):
        return {
            'id': str(self.id),
            'equipment_id': str(self.equipment_id),
            'type': self.type,
            'description': self.description,
            'performed_by': self.performed_by,
            'performed_at': self.performed_at.isoformat(),
            'notes': self.notes,
            'next_maintenance_date': self.next_maintenance_date.isoformat() if self.next_maintenance_date else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'created_at': self.created_at.isoformat(),
        }


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey('users.id', ondelete='SET NULL'))
    action = db.Column(db.String(100), nullable=False)
    entity_type = db.Column(db.String(50), nullable=False)
    entity_id = db.Column(UUID(as_uuid=True))
    changes = db.Column(JSONB)
    ip_address = db.Column(INET)
    user_agent = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    user = db.relationship('User', back_populates='audit_logs')

    def __repr__(self):
        return f'<AuditLog {self.action} on {self.entity_type}>'

    def to_dict(self):
        return {
            'id': str(self.id),
            'user_id': str(self.user_id) if self.user_id else None,
            'action': self.action,
            'entity_type': self.entity_type,
            'entity_id': str(self.entity_id) if self.entity_id else None,
            'changes': self.changes,
            'ip_address': str(self.ip_address) if self.ip_address else None,
            'user_agent': self.user_agent,
            'created_at': self.created_at.isoformat(),
        }
