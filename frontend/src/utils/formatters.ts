/**
 * Utilitários de formatação e tradução em Português Brasileiro (pt-BR)
 * Unidades fixas do MVP v1: Graus Celsius (°C) e Quilopascais (kPa)
 */
import type { AxiosResponse } from 'axios';
import type {
  AlertRule,
  AlertScope,
  AlertSeverity,
  AlertStatus,
  AlertType,
  BinaryRawState,
  CompanyStatus,
  ComparisonOperator,
  DoorRawState,
  EquipmentStatus,
  EquipmentType,
  MaintenanceType,
  TelemetryWindowKey,
  ThresholdBounds,
  UserRole,
  UserStatus,
} from '../types/models';

export const ROLE_LABELS: Record<UserRole, string> = {
  global_admin: 'Administrador Global',
  company_admin: 'Administrador da Empresa',
  company_viewer: 'Visualizador',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  global_admin: 'default',
  company_admin: 'default',
  company_viewer: 'default',
};

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  freezer: 'Freezer',
  refrigerator: 'Refrigerador',
  cold_room: 'Câmara Fria',
};

export interface TelemetryWindowOption {
  value: TelemetryWindowKey;
  label: string;
  hours: number | null;
}

export const TELEMETRY_WINDOW_OPTIONS: TelemetryWindowOption[] = [
  { value: '6h', label: 'Últimas 6 horas', hours: 6 },
  { value: '24h', label: 'Últimas 24 horas', hours: 24 },
  { value: '7d', label: 'Últimos 7 dias', hours: 24 * 7 },
  { value: '30d', label: 'Últimos 30 dias', hours: 24 * 30 },
  { value: 'custom', label: 'Período personalizado', hours: null },
];

export interface EquipmentStatusMeta {
  label: string;
  color: string;
  badgeStatus: 'success' | 'warning' | 'error' | 'default';
  hex: string;
}

export const EQUIPMENT_STATUS_CONFIG: Record<EquipmentStatus, EquipmentStatusMeta> = {
  operational: {
    label: 'Operando',
    color: 'success',
    badgeStatus: 'success',
    hex: '#10b981',
  },
  warning: {
    label: 'Atenção',
    color: 'warning',
    badgeStatus: 'warning',
    hex: '#f59e0b',
  },
  critical: {
    label: 'Crítico',
    color: 'error',
    badgeStatus: 'error',
    hex: '#ef4444',
  },
  offline: {
    label: 'Offline',
    color: 'default',
    badgeStatus: 'default',
    hex: '#94a3b8',
  },
};

export const ALERT_SEVERITY_CONFIG: Record<AlertSeverity, { label: string; color: string }> = {
  critical: {
    label: 'Crítico',
    color: 'error',
  },
  warning: {
    label: 'Atenção',
    color: 'warning',
  },
};

export const ALERT_STATUS_CONFIG: Record<AlertStatus, { label: string; color: string }> = {
  active: {
    label: 'Ativo',
    color: 'error',
  },
  acknowledged: {
    label: 'Reconhecido',
    color: 'warning',
  },
  resolved: {
    label: 'Resolvido',
    color: 'success',
  },
};

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  temperature_high: 'Temperatura Alta',
  temperature_low: 'Temperatura Baixa',
  pressure_high: 'Pressão Alta',
  pressure_low: 'Pressão Baixa',
  door_open: 'Porta Aberta',
  equipment_offline: 'Equipamento Offline',
};

export const ALERT_TYPE_OPTIONS: Array<{ value: AlertType; label: string }> = [
  { value: 'temperature_high', label: ALERT_TYPE_LABELS.temperature_high },
  { value: 'temperature_low', label: ALERT_TYPE_LABELS.temperature_low },
  { value: 'pressure_high', label: ALERT_TYPE_LABELS.pressure_high },
  { value: 'pressure_low', label: ALERT_TYPE_LABELS.pressure_low },
  { value: 'door_open', label: ALERT_TYPE_LABELS.door_open },
  { value: 'equipment_offline', label: ALERT_TYPE_LABELS.equipment_offline },
];

export const ALERT_SCOPE_LABELS: Record<AlertScope, string> = {
  equipment: 'Equipamento (Prioridade 1)',
  company: 'Empresa (Prioridade 2)',
  global: 'Global (Prioridade 3)',
};

export const COMPARISON_OPERATOR_LABELS: Record<ComparisonOperator, string> = {
  '>': '>',
  '<': '<',
  '>=': '≥',
  '<=': '≤',
  '=': '=',
};

export const COMPARISON_OPERATOR_OPTIONS: Array<{ value: ComparisonOperator; label: string }> = [
  { value: '>', label: COMPARISON_OPERATOR_LABELS['>'] },
  { value: '<', label: COMPARISON_OPERATOR_LABELS['<'] },
  { value: '>=', label: COMPARISON_OPERATOR_LABELS['>='] },
  { value: '<=', label: COMPARISON_OPERATOR_LABELS['<='] },
  { value: '=', label: COMPARISON_OPERATOR_LABELS['='] },
];

export const COMPANY_STATUS_CONFIG: Record<CompanyStatus, { label: string; color: string }> = {
  active: { label: 'Ativa', color: 'success' },
  inactive: { label: 'Inativa', color: 'default' },
};

export const USER_STATUS_CONFIG: Record<UserStatus, { label: string; color: string }> = {
  active: { label: 'Ativo', color: 'success' },
  pending: { label: 'Convite Pendente', color: 'warning' },
  inactive: { label: 'Desativado', color: 'default' },
};

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  routine_inspection: 'Inspeção de Rotina',
  preventive: 'Manutenção Preventiva',
  repair: 'Reparo Corretivo',
  part_replacement: 'Substituição de Peça',
  emergency_fix: 'Reparo de Emergência',
};

export const MAINTENANCE_TYPE_OPTIONS: Array<{ value: MaintenanceType; label: string }> = [
  { value: 'routine_inspection', label: 'Inspeção de Rotina' },
  { value: 'preventive', label: 'Manutenção Preventiva' },
  { value: 'repair', label: 'Reparo Corretivo' },
  { value: 'part_replacement', label: 'Substituição de Peça' },
  { value: 'emergency_fix', label: 'Reparo de Emergência' },
];

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  company: 'Empresa',
  branch: 'Filial',
  user: 'Usuário',
  equipment: 'Equipamento',
  alert: 'Alerta',
  alert_rule: 'Regra de Alerta',
  maintenance_record: 'Manutenção',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create_company: 'Criação de empresa',
  update_company: 'Atualização de empresa',
  deactivate_company: 'Desativação de empresa',
  create_branch: 'Criação de filial',
  update_branch: 'Atualização de filial',
  delete_branch: 'Exclusão de filial',
  invite_user: 'Convite de usuário',
  resend_invitation: 'Reenvio de convite',
  accept_invitation: 'Aceite de convite',
  create_user: 'Criação direta de usuário',
  update_user: 'Atualização de usuário',
  deactivate_user: 'Desativação de usuário',
  update_profile: 'Atualização de perfil',
  change_password: 'Troca de senha',
  request_password_reset: 'Solicitação de redefinição de senha',
  reset_password: 'Redefinição de senha',
  create_equipment: 'Cadastro de equipamento',
  update_equipment: 'Atualização de equipamento',
  deactivate_equipment: 'Desativação de equipamento',
  rotate_equipment_api_key: 'Rotação de chave API',
  create_manual_telemetry: 'Leitura manual de temperatura',
  acknowledge_alert: 'Reconhecimento de alerta',
  resolve_alert: 'Resolução manual de alerta',
  create_alert_rule: 'Criação de regra de alerta',
  update_alert_rule: 'Atualização de regra de alerta',
  delete_alert_rule: 'Exclusão de regra de alerta',
  create_maintenance_record: 'Registro de manutenção',
  update_maintenance_record: 'Edição de manutenção',
  delete_maintenance_record: 'Exclusão de manutenção',
};

export const formatTemperature = (value: number | string | null | undefined, decimals = 1): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return `${Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} °C`;
};

export const formatPressure = (value: number | string | null | undefined, decimals = 1): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return `${Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} kPa`;
};

export interface FormattedDoorState {
  label: string;
  isOpen: boolean | null;
  color: string;
}

export const formatDoorState = (door: DoorRawState): FormattedDoorState => {
  if (door === 1 || door === 'open' || door === true) {
    return { label: 'Aberta', isOpen: true, color: 'warning' };
  }
  if (door === 0 || door === 'closed' || door === false) {
    return { label: 'Fechada', isOpen: false, color: 'success' };
  }
  return { label: 'Sem leitura', isOpen: null, color: 'default' };
};

export interface FormattedComponentState {
  label: string;
  isOn: boolean | null;
  color: string;
}

export const formatComponentState = (
  state: BinaryRawState,
  feminine = false
): FormattedComponentState => {
  if (state === 1 || state === 'on' || state === true) {
    return {
      label: feminine ? 'Ligada' : 'Ligado',
      isOn: true,
      color: 'processing',
    };
  }
  if (state === 0 || state === 'off' || state === false) {
    return {
      label: feminine ? 'Desligada' : 'Desligado',
      isOn: false,
      color: 'default',
    };
  }
  return {
    label: '—',
    isOn: null,
    color: 'default',
  };
};

export const formatDateTimePtBR = (isoString?: string | null): string => {
  if (!isoString) return 'Nunca';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatDatePtBR = (dateString?: string | null): string => {
  if (!dateString) return 'Não agendada';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [y, m, d] = dateString.split('-');
    return `${d}/${m}/${y}`;
  }
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
};

export const formatRelativeTimePtBR = (isoString?: string | null): string => {
  if (!isoString) return 'Sem comunicação';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 60) return `há ${diffSeconds} s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `há ${diffDays} dia(s)`;
};

export const formatCompactAgePtBR = (isoString?: string | null): string | null => {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;

  const diffSeconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
};

export const formatOfflineBadgeLabel = (isoString?: string | null): string => {
  if (!isoString) return 'Offline · Sem sinal';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Offline';

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const diffMinutes = Math.max(10, Math.floor(diffSeconds / 60));
  if (diffMinutes < 60) return `Offline · ${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Offline · ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Offline · ${diffDays}d`;
};

export const formatSafeRangeLabel = (
  threshold?: ThresholdBounds | null,
  fallbackLabel: string | null = null
): string => {
  if (threshold) {
    const hasLow =
      threshold.low !== null && threshold.low !== undefined && !Number.isNaN(Number(threshold.low));
    const hasHigh =
      threshold.high !== null &&
      threshold.high !== undefined &&
      !Number.isNaN(Number(threshold.high));

    if (hasLow && hasHigh) {
      return `Faixa segura: ${formatTemperature(threshold.low)} a ${formatTemperature(threshold.high)}`;
    }
    if (hasHigh) {
      return `Faixa segura: ≤ ${formatTemperature(threshold.high)}`;
    }
    if (hasLow) {
      return `Faixa segura: ≥ ${formatTemperature(threshold.low)}`;
    }
  }
  if (fallbackLabel) {
    return fallbackLabel.replace(/^Meta:\s*/i, 'Faixa segura: ');
  }
  return 'Faixa segura: sem regra ativa';
};

export const computeEffectiveTempMetaLabel = (applicableRules: AlertRule[] = []): string | null => {
  const effective = applicableRules.filter(
    (r) =>
      r.is_effective &&
      r.is_active &&
      r.threshold_value !== null &&
      r.threshold_value !== undefined
  );
  const highs = effective
    .filter((r) => r.rule_type === 'temperature_high')
    .map((r) => Number(r.threshold_value))
    .filter((v) => !Number.isNaN(v));
  const lows = effective
    .filter((r) => r.rule_type === 'temperature_low')
    .map((r) => Number(r.threshold_value))
    .filter((v) => !Number.isNaN(v));

  const high = highs.length > 0 ? Math.min(...highs) : null;
  const low = lows.length > 0 ? Math.max(...lows) : null;

  const fmt = (n: number) =>
    n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  if (low !== null && high !== null) {
    return `Meta: ${fmt(low)} a ${fmt(high)} °C`;
  }
  if (high !== null) {
    return `Meta: ≤ ${fmt(high)} °C`;
  }
  if (low !== null) {
    return `Meta: ≥ ${fmt(low)} °C`;
  }
  return null;
};

export interface MaintenanceCountdownInfo {
  days: number;
  tone: 'red' | 'amber' | 'slate';
  tagColor: string;
  label: string;
}

export const getMaintenanceCountdownInfo = (
  dateString?: string | null
): MaintenanceCountdownInfo | null => {
  if (!dateString) return null;
  let targetDate: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [y, m, d] = dateString.split('-').map(Number);
    if (y === undefined || m === undefined || d === undefined) return null;
    targetDate = new Date(y, m - 1, d);
  } else {
    targetDate = new Date(dateString);
  }
  if (Number.isNaN(targetDate.getTime())) return null;

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetMidnight = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  );
  const diffDays = Math.round((targetMidnight.getTime() - todayMidnight.getTime()) / 86400000);

  if (diffDays < 0) {
    return {
      days: diffDays,
      tone: 'red',
      tagColor: 'error',
      label: `Manutenção atrasada (${Math.abs(diffDays)}d)`,
    };
  }
  if (diffDays === 0) {
    return {
      days: 0,
      tone: 'amber',
      tagColor: 'warning',
      label: 'Preventiva hoje',
    };
  }
  if (diffDays <= 7) {
    return {
      days: diffDays,
      tone: 'amber',
      tagColor: 'warning',
      label: `Preventiva em ${diffDays}d`,
    };
  }
  return {
    days: diffDays,
    tone: 'slate',
    tagColor: 'default',
    label: `Preventiva: ${formatDatePtBR(dateString)}`,
  };
};

export const formatDurationSeconds = (seconds?: number | null): string => {
  if (seconds === null || seconds === undefined) return '—';
  const total = Number(seconds);
  if (total === 0) return 'Imediato (0 s)';
  if (total < 60) return `${total} s`;
  if (total % 60 === 0) {
    const mins = total / 60;
    return `${mins} min (${total} s)`;
  }
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins} min ${rem} s`;
};

export const formatAlertRuleCondition = (
  rule: Pick<AlertRule, 'rule_type' | 'comparison_operator' | 'threshold_value' | 'duration_seconds'>
): string => {
  const duration = formatDurationSeconds(rule.duration_seconds);
  if (rule.rule_type === 'door_open') return `Porta aberta por ${duration}`;
  if (rule.rule_type === 'equipment_offline') return `Sem sinal por ${duration}`;
  const op = rule.comparison_operator
    ? COMPARISON_OPERATOR_LABELS[rule.comparison_operator] || rule.comparison_operator
    : '';
  const unit = rule.rule_type?.startsWith('temperature') ? '°C' : 'kPa';
  return `${op} ${rule.threshold_value ?? '—'} ${unit} por ${duration}`;
};

const isObjectRecord = (value: unknown): value is object =>
  typeof value === 'object' && value !== null;

const getErrorResponseData = (error: unknown): unknown => {
  if (!isObjectRecord(error) || !('response' in error)) return undefined;
  const { response } = error;
  if (!isObjectRecord(response) || !('data' in response)) return undefined;
  return response.data;
};

const extractPayloadMessage = (payload: unknown): string | null => {
  if (!isObjectRecord(payload)) return null;
  if ('message' in payload && typeof payload.message === 'string' && payload.message) {
    return payload.message;
  }
  if ('error' in payload && typeof payload.error === 'string' && payload.error) {
    return payload.error;
  }
  return null;
};

export const extractApiError = (
  error: unknown,
  fallback = 'Ocorreu um erro inesperado. Tente novamente.'
): string => {
  const data = getErrorResponseData(error);
  if (!data) {
    if (isObjectRecord(error) && 'message' in error && error.message === 'Network Error') {
      return 'Não foi possível conectar ao servidor da API. Verifique sua conexão.';
    }
    return fallback;
  }
  if (typeof data === 'string') {
    return data;
  }
  return extractPayloadMessage(data) ?? fallback;
};

export const extractBlobApiError = async (
  error: unknown,
  fallback = 'Não foi possível exportar o arquivo CSV.'
): Promise<string> => {
  const data = getErrorResponseData(error);
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed: unknown = JSON.parse(text);
      return extractPayloadMessage(parsed) ?? fallback;
    } catch {
      return fallback;
    }
  }
  return extractApiError(error, fallback);
};

export const downloadCsvResponse = (
  axiosResponse: AxiosResponse<Blob | BlobPart>,
  fallbackFilename: string
): void => {
  const rawDisposition: unknown = axiosResponse?.headers?.['content-disposition'];
  const disposition = typeof rawDisposition === 'string' ? rawDisposition : '';
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  const filename = filenameMatch?.[1] || fallbackFilename;

  const blob =
    axiosResponse.data instanceof Blob
      ? axiosResponse.data
      : new Blob([axiosResponse.data], { type: 'text/csv;charset=utf-8;' });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
