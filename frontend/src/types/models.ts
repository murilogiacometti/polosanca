/**
 * Contratos de domínio e tipos canônicos da plataforma Polo Sanca (TypeScript Estrito).
 * Enums e contratos de API são derivados diretamente de `openapi.d.ts` (gerado a partir de `openapi.yaml`).
 */

import type { components, paths } from './openapi';

type OpenApiSchemas = components['schemas'];

export type UserRole = NonNullable<OpenApiSchemas['User']['role']>;
export type UserStatus = NonNullable<OpenApiSchemas['User']['status']>;
export type BranchAccessType = OpenApiSchemas['BranchAccess']['type'];

export type User = OpenApiSchemas['User'];

export type InviteUserPayload = OpenApiSchemas['UserInviteRequest'];

export type UpdateUserPayload = OpenApiSchemas['UserUpdateRequest'];

export type CompanyStatus = NonNullable<OpenApiSchemas['Company']['status']>;

export type Company = OpenApiSchemas['Company'];

export type CreateCompanyPayload = OpenApiSchemas['CompanyCreateRequest'];

export type UpdateCompanyPayload = OpenApiSchemas['CompanyUpdateRequest'];

export type Branch = OpenApiSchemas['Branch'];

export type CreateBranchPayload = OpenApiSchemas['BranchCreateRequest'];

export type UpdateBranchPayload = OpenApiSchemas['BranchUpdateRequest'];

export type EquipmentType = NonNullable<OpenApiSchemas['Equipment']['type']>;
export type EquipmentStatus = NonNullable<OpenApiSchemas['Equipment']['status']>;
export type DoorRawState = OpenApiSchemas['DoorState'] | null | undefined;
export type BinaryRawState = OpenApiSchemas['BinaryDeviceState'] | null | undefined;

type OpenApiOverviewEntry = NonNullable<
  paths['/telemetry/overview']['get']['responses']['200']['content']['application/json']['overview'][string]
>;

export interface SparklinePoint {
  t?: string;
  timestamp?: string;
  time?: string;
  v?: number | null;
  temperature?: number | null;
}

export type ThresholdBounds = NonNullable<OpenApiOverviewEntry['threshold']>;

export type EquipmentOverviewItem = OpenApiOverviewEntry;

export type RealtimeSnapshot = OpenApiSchemas['RealtimeTelemetry'];

export type Equipment = OpenApiSchemas['Equipment'];

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

export type CreateEquipmentPayload = OpenApiSchemas['EquipmentCreateRequest'];

export type UpdateEquipmentPayload = OpenApiSchemas['EquipmentUpdateRequest'];

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
  id?: string | null;
  timestamp?: string | null;
  time?: string | null;
  recorded_at?: string | null;
  temperature?: number | null;
  min_temperature?: number | null;
  max_temperature?: number | null;
  pressure?: number | null;
  door?: DoorRawState;
  heater?: BinaryRawState;
  compressor?: BinaryRawState;
  fan?: BinaryRawState;
  source?: TelemetrySource | null;
  notes?: string | null;
  sample_count?: number | null;
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

export type ManualTelemetryPayload = OpenApiSchemas['ManualTelemetryRequest'];

export type ManualTelemetryResponse = OpenApiSchemas['ManualTelemetryResponse'];

export type AlertSeverity = NonNullable<OpenApiSchemas['Alert']['severity']>;
export type AlertStatus = NonNullable<OpenApiSchemas['Alert']['status']>;
export type AlertType = NonNullable<OpenApiSchemas['Alert']['type']>;
export type AlertScope = NonNullable<OpenApiSchemas['AlertRule']['scope']>;
export type ComparisonOperator = NonNullable<OpenApiSchemas['AlertRule']['comparison_operator']>;

export type AlertItem = OpenApiSchemas['Alert'];

export type AlertStatistics = OpenApiSchemas['AlertStatisticsResponse'];

export type AlertRule = OpenApiSchemas['AlertRule'];

export type CreateAlertRulePayload = OpenApiSchemas['AlertRuleCreateRequest'];

export type UpdateAlertRulePayload = OpenApiSchemas['AlertRuleUpdateRequest'];

export type AlertRuleStatistics = OpenApiSchemas['AlertRuleStatisticsResponse'];

export type MaintenanceType = OpenApiSchemas['MaintenanceRecord']['type'];

export type MaintenanceRecord = OpenApiSchemas['MaintenanceRecord'];

export type CreateMaintenancePayload = OpenApiSchemas['MaintenanceCreateRequest'];

export type UpdateMaintenancePayload = OpenApiSchemas['MaintenanceUpdateRequest'];

export type AuditEntityType = OpenApiSchemas['AuditEntityType'];

export type AuditLogItem = OpenApiSchemas['AuditLog'];

export type PaginationMeta = OpenApiSchemas['Pagination'];

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
