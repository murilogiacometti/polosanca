-- Polo Sanca Refrigeration Monitoring System
-- Database Schema - PostgreSQL 14+ with TimescaleDB Extension
-- Author: Generated from PRD
-- Date: 2025-11-25

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE user_role AS ENUM ('global_admin', 'company_admin', 'company_viewer');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'pending');
CREATE TYPE company_status AS ENUM ('active', 'inactive');
CREATE TYPE equipment_type AS ENUM ('freezer', 'refrigerator', 'cold_room');
CREATE TYPE equipment_status AS ENUM ('operational', 'warning', 'critical', 'offline');
CREATE TYPE alert_severity AS ENUM ('warning', 'critical');
CREATE TYPE alert_status AS ENUM ('active', 'acknowledged', 'resolved');
CREATE TYPE alert_rule_type AS ENUM (
    'temperature_high',
    'temperature_low',
    'pressure_high',
    'pressure_low',
    'door_open',
    'equipment_offline'
);
CREATE TYPE alert_rule_scope AS ENUM ('global', 'company', 'equipment');
CREATE TYPE comparison_operator AS ENUM ('>', '<', '=', '>=', '<=');
CREATE TYPE branch_access_type AS ENUM ('full', 'restricted');

-- ============================================================================
-- COMPANIES TABLE
-- ============================================================================

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    status company_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT companies_name_unique UNIQUE (name),
    CONSTRAINT companies_email_check CHECK (contact_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_companies_status ON companies(status);
CREATE INDEX idx_companies_created_at ON companies(created_at);

-- ============================================================================
-- BRANCHES TABLE
-- ============================================================================

CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT branches_company_name_unique UNIQUE (company_id, name)
);

CREATE INDEX idx_branches_company_id ON branches(company_id);
CREATE INDEX idx_branches_created_at ON branches(created_at);

-- ============================================================================
-- USERS TABLE
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    status user_status NOT NULL DEFAULT 'pending',
    branch_access_type branch_access_type NOT NULL DEFAULT 'full',
    invitation_token VARCHAR(255),
    invitation_expires_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_global_admin_no_company CHECK (
        (role = 'global_admin' AND company_id IS NULL) OR
        (role != 'global_admin' AND company_id IS NOT NULL)
    ),
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_invitation_token ON users(invitation_token);

-- ============================================================================
-- USER BRANCH ACCESS TABLE (for branch-restricted viewers)
-- ============================================================================

CREATE TABLE user_branch_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT user_branch_access_unique UNIQUE (user_id, branch_id)
);

CREATE INDEX idx_user_branch_access_user_id ON user_branch_access(user_id);
CREATE INDEX idx_user_branch_access_branch_id ON user_branch_access(branch_id);

-- ============================================================================
-- EQUIPMENT TABLE
-- ============================================================================

CREATE TABLE equipments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    serial VARCHAR(100) NOT NULL UNIQUE,
    type equipment_type NOT NULL,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    status equipment_status NOT NULL DEFAULT 'offline',
    api_key VARCHAR(255) NOT NULL UNIQUE,
    last_seen_at TIMESTAMPTZ,
    installed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT equipments_branch_company_match CHECK (
        branch_id IN (SELECT id FROM branches WHERE company_id = equipments.company_id)
    )
);

CREATE INDEX idx_equipments_serial ON equipments(serial);
CREATE INDEX idx_equipments_branch_id ON equipments(branch_id);
CREATE INDEX idx_equipments_company_id ON equipments(company_id);
CREATE INDEX idx_equipments_status ON equipments(status);
CREATE INDEX idx_equipments_type ON equipments(type);
CREATE INDEX idx_equipments_api_key ON equipments(api_key);
CREATE INDEX idx_equipments_last_seen_at ON equipments(last_seen_at);

-- ============================================================================
-- ALERT RULES TABLE
-- ============================================================================

CREATE TABLE alert_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type alert_rule_type NOT NULL,
    threshold_value DECIMAL(10, 2),
    comparison_operator comparison_operator NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 300,
    severity alert_severity NOT NULL,
    message_template TEXT NOT NULL,
    scope alert_rule_scope NOT NULL,
    scope_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT alert_rules_scope_check CHECK (
        (scope = 'global' AND scope_id IS NULL) OR
        (scope = 'company' AND scope_id IS NOT NULL) OR
        (scope = 'equipment' AND scope_id IS NOT NULL)
    ),
    CONSTRAINT alert_rules_name_unique UNIQUE (name)
);

CREATE INDEX idx_alert_rules_scope ON alert_rules(scope);
CREATE INDEX idx_alert_rules_scope_id ON alert_rules(scope_id);
CREATE INDEX idx_alert_rules_rule_type ON alert_rules(rule_type);
CREATE INDEX idx_alert_rules_is_active ON alert_rules(is_active);
CREATE INDEX idx_alert_rules_created_by ON alert_rules(created_by);

-- ============================================================================
-- TELEMETRY TABLE (TimescaleDB Hypertable)
-- ============================================================================

CREATE TABLE telemetry (
    time TIMESTAMPTZ NOT NULL,
    equipment_id UUID NOT NULL REFERENCES equipments(id) ON DELETE CASCADE,
    temperature DECIMAL(5, 2),
    pressure DECIMAL(7, 2),
    door SMALLINT CHECK (door IN (0, 1)),
    heater SMALLINT CHECK (heater IN (0, 1)),
    compressor SMALLINT CHECK (compressor IN (0, 1)),
    fan SMALLINT CHECK (fan IN (0, 1)),

    CONSTRAINT telemetry_time_equipment_unique UNIQUE (time, equipment_id)
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('telemetry', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Create indexes for common queries
CREATE INDEX idx_telemetry_equipment_id ON telemetry(equipment_id, time DESC);
CREATE INDEX idx_telemetry_time ON telemetry(time DESC);

-- Add compression policy (compress data older than 7 days)
ALTER TABLE telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'equipment_id',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('telemetry', INTERVAL '7 days', if_not_exists => TRUE);

-- Add retention policy (drop data older than 2 years)
SELECT add_retention_policy('telemetry', INTERVAL '2 years', if_not_exists => TRUE);

-- ============================================================================
-- CONTINUOUS AGGREGATES (Pre-computed Statistics)
-- ============================================================================

-- Hourly aggregates
CREATE MATERIALIZED VIEW telemetry_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS hour,
    equipment_id,
    AVG(temperature) as avg_temperature,
    MIN(temperature) as min_temperature,
    MAX(temperature) as max_temperature,
    AVG(pressure) as avg_pressure,
    MIN(pressure) as min_pressure,
    MAX(pressure) as max_pressure,
    SUM(CASE WHEN door = 1 THEN 1 ELSE 0 END) as door_open_count,
    SUM(CASE WHEN compressor = 1 THEN 1 ELSE 0 END) as compressor_on_count,
    COUNT(*) as data_points
FROM telemetry
GROUP BY hour, equipment_id
WITH NO DATA;

-- Refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy('telemetry_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Daily aggregates
CREATE MATERIALIZED VIEW telemetry_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS day,
    equipment_id,
    AVG(temperature) as avg_temperature,
    MIN(temperature) as min_temperature,
    MAX(temperature) as max_temperature,
    AVG(pressure) as avg_pressure,
    COUNT(*) as data_points
FROM telemetry
GROUP BY day, equipment_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('telemetry_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- ============================================================================
-- ALERTS TABLE
-- ============================================================================

CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipment_id UUID NOT NULL REFERENCES equipments(id) ON DELETE CASCADE,
    alert_rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
    type alert_rule_type NOT NULL,
    severity alert_severity NOT NULL,
    message TEXT NOT NULL,
    status alert_status NOT NULL DEFAULT 'active',
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledgment_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT alerts_acknowledged_check CHECK (
        (status = 'acknowledged' AND acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL) OR
        (status != 'acknowledged')
    )
);

CREATE INDEX idx_alerts_equipment_id ON alerts(equipment_id);
CREATE INDEX idx_alerts_alert_rule_id ON alerts(alert_rule_id);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX idx_alerts_acknowledged_by ON alerts(acknowledged_by);

-- ============================================================================
-- MAINTENANCE RECORDS TABLE
-- ============================================================================

CREATE TABLE maintenance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipment_id UUID NOT NULL REFERENCES equipments(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    next_maintenance_date DATE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_records_equipment_id ON maintenance_records(equipment_id);
CREATE INDEX idx_maintenance_records_performed_at ON maintenance_records(performed_at DESC);
CREATE INDEX idx_maintenance_records_next_maintenance_date ON maintenance_records(next_maintenance_date);

-- ============================================================================
-- AUDIT LOG TABLE (Optional but recommended)
-- ============================================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- TRIGGERS FOR updated_at TIMESTAMPS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_equipments_updated_at BEFORE UPDATE ON equipments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_maintenance_records_updated_at BEFORE UPDATE ON maintenance_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Equipment with current status and latest telemetry
CREATE VIEW equipment_current_status AS
SELECT
    e.id,
    e.serial,
    e.type,
    e.status,
    e.branch_id,
    b.name as branch_name,
    e.company_id,
    c.name as company_name,
    e.manufacturer,
    e.model,
    e.last_seen_at,
    t.time as last_telemetry_time,
    t.temperature as current_temperature,
    t.pressure as current_pressure,
    t.door as current_door,
    t.heater as current_heater,
    t.compressor as current_compressor,
    t.fan as current_fan
FROM equipments e
JOIN branches b ON e.branch_id = b.id
JOIN companies c ON e.company_id = c.id
LEFT JOIN LATERAL (
    SELECT * FROM telemetry
    WHERE equipment_id = e.id
    ORDER BY time DESC
    LIMIT 1
) t ON TRUE;

-- Active alerts with equipment details
CREATE VIEW active_alerts_detailed AS
SELECT
    a.id,
    a.type,
    a.severity,
    a.message,
    a.status,
    a.created_at,
    a.acknowledged_at,
    a.acknowledged_by,
    u.name as acknowledged_by_name,
    e.serial as equipment_serial,
    e.type as equipment_type,
    b.name as branch_name,
    c.id as company_id,
    c.name as company_name
FROM alerts a
JOIN equipments e ON a.equipment_id = e.id
JOIN branches b ON e.branch_id = b.id
JOIN companies c ON e.company_id = c.id
LEFT JOIN users u ON a.acknowledged_by = u.id
WHERE a.status IN ('active', 'acknowledged');

-- ============================================================================
-- SAMPLE DATA (Optional - for development)
-- ============================================================================

-- Insert sample global admin user (password: 'admin123' - bcrypt hashed)
INSERT INTO users (email, password_hash, name, role, status) VALUES
('admin@polosanca.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5lj1q7j6z0Y8u', 'Global Admin', 'global_admin', 'active');

-- Insert sample company
INSERT INTO companies (id, name, contact_email, contact_phone) VALUES
('11111111-1111-1111-1111-111111111111', 'Acme Restaurants', 'contact@acme.com', '+5511999999999');

-- Insert sample branch
INSERT INTO branches (id, company_id, name, address) VALUES
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Downtown Branch', 'Av. Paulista, 1000 - São Paulo, SP');

-- Insert sample equipment
INSERT INTO equipments (id, serial, type, branch_id, company_id, manufacturer, model, api_key, status) VALUES
('33333333-3333-3333-3333-333333333333', 'EQ-00001', 'freezer', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'CoolTech', 'CT-500', 'api_key_sample_12345', 'operational');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE companies IS 'Client companies using the monitoring system';
COMMENT ON TABLE branches IS 'Physical locations/branches for each company';
COMMENT ON TABLE users IS 'System users with different roles and permissions';
COMMENT ON TABLE user_branch_access IS 'Branch-level access restrictions for viewers';
COMMENT ON TABLE equipments IS 'Refrigeration equipment units';
COMMENT ON TABLE alert_rules IS 'Configurable alert rules for monitoring conditions';
COMMENT ON TABLE telemetry IS 'Time-series telemetry data from equipment (TimescaleDB hypertable)';
COMMENT ON TABLE alerts IS 'Generated alerts based on alert rules';
COMMENT ON TABLE maintenance_records IS 'Equipment maintenance history';
COMMENT ON TABLE audit_logs IS 'Audit trail for system actions';

-- ============================================================================
-- GRANTS (Adjust based on your user setup)
-- ============================================================================

-- Example: Grant permissions to application user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO polosanca_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO polosanca_app;
