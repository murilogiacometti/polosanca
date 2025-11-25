"""Initial hardened schema with integrity constraints, HOT fillfactor, and TimescaleDB policies

Revision ID: 0001_initial_hardened
Revises:
Create Date: 2026-11-14 22:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0001_initial_hardened'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # 1. Enum types (persisting canonical .value strings)
    companystatus = postgresql.ENUM('active', 'inactive', name='companystatus', create_type=False)
    userrole = postgresql.ENUM('global_admin', 'company_admin', 'company_viewer', name='userrole', create_type=False)
    userstatus = postgresql.ENUM('active', 'inactive', 'pending', name='userstatus', create_type=False)
    branchaccesstype = postgresql.ENUM('full', 'restricted', name='branchaccesstype', create_type=False)
    equipmenttype = postgresql.ENUM('freezer', 'refrigerator', 'cold_room', name='equipmenttype', create_type=False)
    equipmentstatus = postgresql.ENUM('operational', 'warning', 'critical', 'offline', name='equipmentstatus', create_type=False)
    alertruletype = postgresql.ENUM(
        'temperature_high',
        'temperature_low',
        'pressure_high',
        'pressure_low',
        'door_open',
        'equipment_offline',
        name='alertruletype',
        create_type=False,
    )
    comparisonoperator = postgresql.ENUM('>', '<', '=', '>=', '<=', name='comparisonoperator', create_type=False)
    alertseverity = postgresql.ENUM('warning', 'critical', name='alertseverity', create_type=False)
    alertrulescope = postgresql.ENUM('global', 'company', 'equipment', name='alertrulescope', create_type=False)
    alertstatus = postgresql.ENUM('active', 'acknowledged', 'resolved', name='alertstatus', create_type=False)

    bind = op.get_bind()
    for enum_type in (
        companystatus,
        userrole,
        userstatus,
        branchaccesstype,
        equipmenttype,
        equipmentstatus,
        alertruletype,
        comparisonoperator,
        alertseverity,
        alertrulescope,
        alertstatus,
    ):
        enum_type.create(bind, checkfirst=True)

    # 2. Relational & Time-Series Tables
    op.create_table(
        'companies',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('contact_email', sa.String(length=255), nullable=True),
        sa.Column('contact_phone', sa.String(length=50), nullable=True),
        sa.Column('status', companystatus, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    op.create_table(
        'branches',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('address', sa.Text(), nullable=False),
        sa.Column('manager_contact', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('company_id', 'name', name='branches_company_name_unique'),
        sa.UniqueConstraint('id', 'company_id', name='uq_branches_id_company_id'),
    )
    op.create_index('ix_branches_company_id', 'branches', ['company_id'], unique=False)

    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('role', userrole, nullable=False),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('status', userstatus, nullable=False),
        sa.Column('branch_access_type', branchaccesstype, nullable=False),
        sa.Column('invitation_token', sa.String(length=255), nullable=True),
        sa.Column('invitation_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint(
            "(role = 'global_admin' AND company_id IS NULL) OR (role != 'global_admin' AND company_id IS NOT NULL)",
            name='ck_users_role_company_id',
        ),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index('ix_users_company_role_status', 'users', ['company_id', 'role', 'status'], unique=False)

    op.create_table(
        'alert_rules',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('rule_type', alertruletype, nullable=False),
        sa.Column('threshold_value', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('comparison_operator', comparisonoperator, nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=False),
        sa.Column('severity', alertseverity, nullable=False),
        sa.Column('message_template', sa.Text(), nullable=False),
        sa.Column('scope', alertrulescope, nullable=False),
        sa.Column('scope_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint(
            "(rule_type IN ('door_open', 'equipment_offline') AND threshold_value IS NULL AND comparison_operator IS NULL) "
            "OR (rule_type NOT IN ('door_open', 'equipment_offline') AND threshold_value IS NOT NULL AND comparison_operator IS NOT NULL)",
            name='ck_alert_rules_threshold_operator',
        ),
        sa.CheckConstraint(
            "(scope = 'global' AND scope_id IS NULL) OR (scope != 'global' AND scope_id IS NOT NULL)",
            name='ck_alert_rules_scope_id',
        ),
        sa.CheckConstraint('duration_seconds >= 0', name='ck_alert_rules_duration_nonneg'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_index('ix_alert_rules_active_scope', 'alert_rules', ['is_active', 'scope', 'scope_id'], unique=False)

    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('changes', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('ip_address', postgresql.INET(), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_audit_logs_entity_created',
        'audit_logs',
        ['entity_type', 'entity_id', sa.text('created_at DESC')],
        unique=False,
    )
    op.create_index(
        'ix_audit_logs_created_id',
        'audit_logs',
        [sa.text('created_at DESC'), sa.text('id DESC')],
        unique=False,
    )

    op.create_table(
        'equipments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('serial', sa.String(length=100), nullable=False),
        sa.Column('type', equipmenttype, nullable=False),
        sa.Column('branch_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('manufacturer', sa.String(length=255), nullable=True),
        sa.Column('model', sa.String(length=255), nullable=True),
        sa.Column('status', equipmentstatus, nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('api_key', sa.String(length=255), nullable=False),
        sa.Column('current_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('installed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_maintenance_date', sa.Date(), nullable=True),
        sa.Column('next_maintenance_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(
            ['branch_id', 'company_id'],
            ['branches.id', 'branches.company_id'],
            name='fk_equipments_branch_company',
            ondelete='RESTRICT',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('api_key'),
        sa.UniqueConstraint('serial'),
    )
    op.create_index(
        'ix_equipments_company_branch_active',
        'equipments',
        ['company_id', 'branch_id', 'is_active'],
        unique=False,
    )
    # Reserve 20% page slack for PostgreSQL HOT updates on unindexed last_seen_at + current_data
    op.execute('ALTER TABLE equipments SET (fillfactor = 80)')

    op.create_table(
        'user_branch_access',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('branch_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'branch_id', name='user_branch_access_unique'),
    )
    op.create_index('ix_user_branch_access_branch_id', 'user_branch_access', ['branch_id'], unique=False)

    op.create_table(
        'alerts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('equipment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('alert_rule_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('type', alertruletype, nullable=False),
        sa.Column('severity', alertseverity, nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('status', alertstatus, nullable=False),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('acknowledged_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('acknowledgment_notes', sa.Text(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['acknowledged_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['alert_rule_id'], ['alert_rules.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipments.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'uq_open_alert_per_rule',
        'alerts',
        ['equipment_id', 'alert_rule_id'],
        unique=True,
        postgresql_where=sa.text("status IN ('active', 'acknowledged') AND alert_rule_id IS NOT NULL"),
    )
    op.create_index(
        'ix_alerts_equipment_status_created',
        'alerts',
        ['equipment_id', 'status', sa.text('created_at DESC')],
        unique=False,
    )

    op.create_table(
        'maintenance_records',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('equipment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('type', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('performed_by', sa.String(length=255), nullable=False),
        sa.Column('performed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('next_maintenance_date', sa.Date(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipments.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_maintenance_records_equipment_performed',
        'maintenance_records',
        ['equipment_id', sa.text('performed_at DESC')],
        unique=False,
    )

    op.create_table(
        'telemetry',
        sa.Column('time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('equipment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('temperature', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('pressure', sa.Numeric(precision=7, scale=2), nullable=True),
        sa.Column('door', sa.SmallInteger(), nullable=True),
        sa.Column('heater', sa.SmallInteger(), nullable=True),
        sa.Column('compressor', sa.SmallInteger(), nullable=True),
        sa.Column('fan', sa.SmallInteger(), nullable=True),
        sa.Column('source', sa.String(length=16), server_default='device', nullable=False),
        sa.Column('request_id', sa.String(length=128), nullable=True),
        sa.Column('recorded_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.CheckConstraint(
            "("
            "source = 'device' AND pressure IS NOT NULL "
            "AND door IN (0, 1) AND heater IN (0, 1) AND compressor IN (0, 1) AND fan IN (0, 1) "
            "AND recorded_by IS NULL"
            ") OR ("
            "source = 'manual' AND pressure IS NULL "
            "AND door IS NULL AND heater IS NULL AND compressor IS NULL AND fan IS NULL "
            "AND recorded_by IS NOT NULL"
            ")",
            name='ck_telemetry_source_fields',
        ),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipments.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['recorded_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('time', 'equipment_id', 'id'),
    )
    op.create_index(
        'ix_telemetry_equipment_time',
        'telemetry',
        ['equipment_id', sa.text('time DESC')],
        unique=False,
    )
    op.create_index(
        'ix_telemetry_equipment_request_id',
        'telemetry',
        ['equipment_id', 'request_id'],
        unique=False,
        postgresql_where=sa.text('request_id IS NOT NULL'),
    )

    # 3. TimescaleDB Hypertable, Compression, Retention & Continuous Aggregates (when available)
    has_timescaledb = bind.execute(
        sa.text("SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'")
    ).scalar()

    if has_timescaledb:
        op.execute('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE')
        op.execute(
            "SELECT create_hypertable('telemetry', 'time', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE)"
        )
        op.execute(
            """
            ALTER TABLE telemetry SET (
                timescaledb.compress,
                timescaledb.compress_segmentby = 'equipment_id',
                timescaledb.compress_orderby = 'time DESC, id DESC'
            )
            """
        )
        op.execute("SELECT add_compression_policy('telemetry', INTERVAL '7 days', if_not_exists => TRUE)")
        op.execute("SELECT add_retention_policy('telemetry', INTERVAL '2 years', if_not_exists => TRUE)")

        with op.get_context().autocommit_block():
            op.execute(
                """
                CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_hourly
                WITH (timescaledb.continuous) AS
                SELECT
                    time_bucket('1 hour', time) AS bucket,
                    equipment_id,
                    AVG(temperature) AS avg_temperature,
                    MIN(temperature) AS min_temperature,
                    MAX(temperature) AS max_temperature,
                    AVG(pressure) AS avg_pressure,
                    COUNT(*) AS sample_count
                FROM telemetry
                GROUP BY bucket, equipment_id
                WITH NO DATA
                """
            )
            op.execute(
                """
                SELECT add_continuous_aggregate_policy(
                    'telemetry_hourly',
                    start_offset => INTERVAL '3 hours',
                    end_offset => INTERVAL '5 minutes',
                    schedule_interval => INTERVAL '5 minutes',
                    if_not_exists => TRUE
                )
                """
            )
            op.execute(
                """
                CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_daily
                WITH (timescaledb.continuous) AS
                SELECT
                    time_bucket('1 day', time) AS bucket,
                    equipment_id,
                    AVG(temperature) AS avg_temperature,
                    MIN(temperature) AS min_temperature,
                    MAX(temperature) AS max_temperature,
                    AVG(pressure) AS avg_pressure,
                    COUNT(*) AS sample_count
                FROM telemetry
                GROUP BY bucket, equipment_id
                WITH NO DATA
                """
            )
            op.execute(
                """
                SELECT add_continuous_aggregate_policy(
                    'telemetry_daily',
                    start_offset => INTERVAL '3 days',
                    end_offset => INTERVAL '1 hour',
                    schedule_interval => INTERVAL '1 hour',
                    if_not_exists => TRUE
                )
                """
            )


def downgrade():
    bind = op.get_bind()
    has_timescaledb = bind.execute(
        sa.text("SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'")
    ).scalar()

    if has_timescaledb:
        with op.get_context().autocommit_block():
            op.execute('DROP MATERIALIZED VIEW IF EXISTS telemetry_daily CASCADE')
            op.execute('DROP MATERIALIZED VIEW IF EXISTS telemetry_hourly CASCADE')

    op.drop_index('ix_telemetry_equipment_request_id', table_name='telemetry')
    op.drop_index('ix_telemetry_equipment_time', table_name='telemetry')
    op.drop_table('telemetry')
    op.drop_index('ix_maintenance_records_equipment_performed', table_name='maintenance_records')
    op.drop_table('maintenance_records')
    op.drop_index('ix_alerts_equipment_status_created', table_name='alerts')
    op.drop_index('uq_open_alert_per_rule', table_name='alerts')
    op.drop_table('alerts')
    op.drop_index('ix_user_branch_access_branch_id', table_name='user_branch_access')
    op.drop_table('user_branch_access')
    op.drop_index('ix_equipments_company_branch_active', table_name='equipments')
    op.drop_table('equipments')
    op.drop_index('ix_audit_logs_created_id', table_name='audit_logs')
    op.drop_index('ix_audit_logs_entity_created', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index('ix_alert_rules_active_scope', table_name='alert_rules')
    op.drop_table('alert_rules')
    op.drop_index('ix_users_company_role_status', table_name='users')
    op.drop_table('users')
    op.drop_index('ix_branches_company_id', table_name='branches')
    op.drop_table('branches')
    op.drop_table('companies')

    for enum_name in (
        'alertstatus',
        'alertrulescope',
        'alertseverity',
        'comparisonoperator',
        'alertruletype',
        'equipmentstatus',
        'equipmenttype',
        'branchaccesstype',
        'userstatus',
        'userrole',
        'companystatus',
    ):
        op.execute(f'DROP TYPE IF EXISTS {enum_name}')
