/**
 * Contratos de domínio e tipos canônicos da plataforma Polo Sanca (TypeScript Estrito).
 * Enums e contratos de API são derivados diretamente de `openapi.d.ts` (gerado a partir de `openapi.yaml`).
 */

import type { components, paths } from './openapi';

type OpenApiSchemas = components['schemas'];

export type UserRole = NonNullable<OpenApiSchemas['User']['role']>;
export type UserStatus = NonNullable<OpenApiSchemas['User']['status']>;
export type BranchAccessType = OpenApiSchemas['BranchAccess']['type'];

export type UserBranchAccessPayload = OpenApiSchemas['BranchAccess'];

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status?: UserStatus;
  company_id?: string | null;
  company_name?: string | null;
  branch_access_type?: BranchAccessType | null;
  permitted_branch_ids?: string[];
  branches?: Array<{ id: string; name: string }>;
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface InviteUserPayload {
  name: string;
  email: string;
  role: UserRole;
  company_id?: string | null;
  branch_access?: UserBranchAccessPayload;
}

export interface UpdateUserPayload {
  name?: string;
  role?: UserRole;
  status?: UserStatus;
  company_id?: string | null;
  branch_access?: UserBranchAccessPayload;
}

export type CompanyStatus = NonNullable<OpenApiSchemas['Company']['status']>;

export interface Company {
  id: string;
  name: string;
  cnpj?: string | null;
  address?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  status?: CompanyStatus;
  branches_count?: number;
  equipments_count?: number;
  users_count?: number;
  active_alerts_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCompanyPayload {
  name: string;
  cnpj?: string | null;
  address?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

export interface UpdateCompanyPayload extends Partial<CreateCompanyPayload> {
  status?: CompanyStatus;
}

export interface Branch {
  id: string;
  company_id: string;
  company_name?: string | null;
  name: string;
  address?: string | null;
  manager_name?: string | null;
  contact_phone?: string | null;
  equipments_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateBranchPayload {
  company_id?: string;
  name: string;
  address?: string | null;
  manager_name?: string | null;
  contact_phone?: string | null;
}

export type UpdateBranchPayload = Partial<CreateBranchPayload>;

export type EquipmentType = NonNullable<OpenApiSchemas['Equipment']['type']>;
export type EquipmentStatus = NonNullable<OpenApiSchemas['Equipment']['status']>;
export type DoorRawState = 0 | 1 | 'open' | 'closed' | boolean | null | undefined;
export type BinaryRawState = 0 | 1 | 'on' | 'off' | boolean | null | undefined;

interface EquipmentCurrentData {
  temperature?: number | null;
  pressure?: number | null;
  door?: DoorRawState;
  heater?: BinaryRawState;
  compressor?: BinaryRawState;
  fan?: BinaryRawState;
  last_update?: string | null;
}

export interface SparklinePoint {
  t?: string;
  timestamp?: string;
  time?: string;
  v?: number | null;
  temperature?: number | null;
}

export interface ThresholdBounds {
  low?: number | null;
  high?: number | null;
  label?: string | null;
}

export interface EquipmentOverviewItem {
  sparkline_24h?: SparklinePoint[];
  threshold?: ThresholdBounds | null;
}

export interface RealtimeSnapshot {
  equipment_id: string;
  serial?: string;
  status?: EquipmentStatus;
  temperature?: number | null;
  pressure?: number | null;
  door?: DoorRawState;
  heater?: BinaryRawState;
  compressor?: BinaryRawState;
  fan?: BinaryRawState;
  last_update?: string | null;
}

export interface Equipment {
  id: string;
  serial: string;
  name?: string | null;
  model?: string | null;
  type: EquipmentType;
  status?: EquipmentStatus;
  company_id: string;
  company_name?: string | null;
  branch_id: string;
  branch_name?: string | null;
  location_notes?: string | null;
  installation_date?: string | null;
  last_maintenance_date?: string | null;
  next_maintenance_date?: string | null;
  last_seen_at?: string | null;
  current_data?: EquipmentCurrentData | null;
  api_key_prefix?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EquipmentWithLive extends Equipment {
  effectiveStatus: EquipmentStatus;
  branchDisplayName: string;
  liveTemperature?: number | null;
  livePressure?: number | null;
  liveDoor?: DoorRawState;
  liveHeater?: BinaryRawState;
  liveCompressor?: BinaryRawState;
  liveFan?: BinaryRawState;
  liveLastUpdate?: string | null;
  sparkline24h: SparklinePoint[];
  threshold: ThresholdBounds | null;
  thresholdLabel: string | null;
}

export interface CreateEquipmentPayload {
  serial: string;
  type: EquipmentType;
  branch_id: string;
  company_id?: string;
  model?: string | null;
  name?: string | null;
  location_notes?: string | null;
  installation_date?: string | null;
  next_maintenance_date?: string | null;
}

export type UpdateEquipmentPayload = Partial<CreateEquipmentPayload>;

export interface RotateApiKeyResponse {
  equipment_id?: string;
  serial?: string;
  api_key: string;
  message?: string;
}

export type TelemetryInterval = NonNullable<
  NonNullable<
    paths['/equipments/{equipment_id}/telemetry']['get']['parameters']['query']
  >['interval']
>;
export type TelemetryWindowKey = '6h' | '24h' | '7d' | '30d' | 'custom';
export type TelemetrySource =
  | NonNullable<OpenApiSchemas['TelemetryDataPoint']['source']>
  | 'aggregated';

export interface TelemetryRow {
  id?: string;
  timestamp?: string;
  time?: string;
  recorded_at?: string;
  temperature?: number | null;
  min_temperature?: number | null;
  max_temperature?: number | null;
  pressure?: number | null;
  door?: DoorRawState;
  heater?: BinaryRawState;
  compressor?: BinaryRawState;
  fan?: BinaryRawState;
  source?: TelemetrySource;
  notes?: string | null;
  sample_count?: number;
  recorded_by?: string | null;
  recorded_by_name?: string | null;
}

export interface TimelinePin {
  idx: number;
  plotIdx?: number;
  shortTime: string;
  kind: 'alert' | 'maintenance';
  severity?: AlertSeverity;
  label: string;
}

export interface ChartTelemetryPoint extends TelemetryRow {
  idx: number;
  plotIdx?: number;
  ms: number;
  shortTime: string;
  manualTemp: number | null | undefined;
  prevDayTemp: number | null;
  timelineEvents: Array<{
    kind: 'alert' | 'maintenance';
    severity?: AlertSeverity;
    label: string;
  }>;
}

export interface ManualTelemetryPayload {
  temperature: number;
  recorded_at?: string;
  notes?: string;
}

export type AlertSeverity = NonNullable<OpenApiSchemas['Alert']['severity']>;
export type AlertStatus = NonNullable<OpenApiSchemas['Alert']['status']>;
export type AlertType = NonNullable<OpenApiSchemas['Alert']['type']>;
export type AlertScope = NonNullable<OpenApiSchemas['AlertRule']['scope']>;
export type ComparisonOperator = NonNullable<OpenApiSchemas['AlertRule']['comparison_operator']>;

export interface AlertItem {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  equipment_id: string;
  serial?: string | null;
  equipment_serial?: string | null;
  equipment_type?: EquipmentType | null;
  branch_id?: string | null;
  branch_name?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  rule_id?: string | null;
  rule_name?: string | null;
  trigger_value?: number | null;
  threshold_value?: number | null;
  created_at: string;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  acknowledged_by_name?: string | null;
  acknowledgment_notes?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolved_by_name?: string | null;
}

export interface AlertStatistics {
  total_active?: number;
  total_acknowledged?: number;
  total_resolved?: number;
  by_severity?: Partial<Record<AlertSeverity, number>>;
  by_status?: Partial<Record<AlertStatus, number>>;
  by_type?: Partial<Record<AlertType, number>>;
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string | null;
  rule_type: AlertType;
  severity: AlertSeverity;
  scope: AlertScope;
  company_id?: string | null;
  company_name?: string | null;
  equipment_id?: string | null;
  equipment_serial?: string | null;
  equipment_type?: EquipmentType | null;
  comparison_operator?: ComparisonOperator | null;
  threshold_value?: number | null;
  duration_seconds?: number | null;
  cooldown_minutes?: number | null;
  is_active: boolean;
  is_effective?: boolean;
  overridden_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateAlertRulePayload {
  name: string;
  description?: string | null;
  rule_type: AlertType;
  severity: AlertSeverity;
  scope: AlertScope;
  company_id?: string | null;
  equipment_id?: string | null;
  equipment_type?: EquipmentType | null;
  comparison_operator?: ComparisonOperator | null;
  threshold_value?: number | null;
  duration_seconds?: number | null;
  cooldown_minutes?: number | null;
  is_active?: boolean;
}

export type UpdateAlertRulePayload = Partial<CreateAlertRulePayload>;

export interface AlertRuleStatistics {
  rule_id?: string;
  total_triggers: number;
  triggers_last_30_days: number;
  affected_equipments: number;
  avg_triggers_per_equipment: number;
}

export type MaintenanceType =
  | NonNullable<OpenApiSchemas['MaintenanceRecord']['type']>
  | 'preventive';

export interface MaintenanceRecord {
  id: string;
  equipment_id: string;
  type: MaintenanceType;
  performed_at: string;
  performed_by: string;
  description: string;
  notes?: string | null;
  next_maintenance_date?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateMaintenancePayload {
  type: MaintenanceType;
  performed_at: string;
  performed_by: string;
  description: string;
  notes?: string | null;
  next_maintenance_date?: string | null;
}

export type UpdateMaintenancePayload = Partial<CreateMaintenancePayload>;

type AuditEntityType =
  | 'company'
  | 'branch'
  | 'user'
  | 'equipment'
  | 'alert'
  | 'alert_rule'
  | 'maintenance_record';

type AuditActionType = string;

export interface AuditLogItem {
  id: string;
  action: AuditActionType;
  entity_type: AuditEntityType;
  entity_id?: string | null;
  user_id?: string | null;
  company_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  changes?: Record<string, unknown> | null;
  created_at: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages?: number;
}

export type StatusTone =
  | 'operational'
  | 'normal'
  | 'warning'
  | 'critical'
  | 'offline'
  | 'brand'
  | 'neutral';

export type AccentStatus =
  | 'critical'
  | 'warning'
  | 'operational'
  | 'normal'
  | 'offline'
  | 'brand'
  | 'teal'
  | null
  | undefined;

export type SubsystemLayout = 'vertical' | 'horizontal' | 'grid';
