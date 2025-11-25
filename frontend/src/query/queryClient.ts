import { QueryClient } from '@tanstack/react-query';
import type { GetAlertsParams, GetAlertStatisticsParams, GetAuditLogsParams } from '../api';
import type { TelemetryInterval, TelemetryWindowKey } from '../types/models';

interface AlertsListQueryKeyParams extends GetAlertsParams {
  branchFilter?: string | null;
}

interface ScopedAlertsQueryKeyParams {
  statusMode: 'open' | 'resolved';
  companyId: string | null;
  branchId: string | null;
  equipmentId: string | null;
  needsRealtime: boolean;
}

interface EquipmentTelemetryQueryKeyParams {
  interval: TelemetryInterval;
  timeWindow: TelemetryWindowKey;
  compare24h: boolean;
  customStart: string | null;
  customEnd: string | null;
}

/**
 * Cliente global do TanStack Query v5 configurado para monitoramento industrial:
 * - Cache reativo compartilhado entre rotas (/operacao, /alerts, /admin)
 * - Deduplicação automática e cancelamento de requisições concorrentes
 * - Revalidação ao retornar para a aba ou reconectar a rede
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

export const queryKeys = {
  workspace: (scope: {
    isGlobalAdmin: boolean;
    companyId: string | null;
    activeCompanyId: string | null;
  }) => ['workspace', scope] as const,
  alerts: {
    all: ['alerts'] as const,
    activeCount: () => ['alerts', 'active-count'] as const,
    list: (params: AlertsListQueryKeyParams) => ['alerts', 'list', params] as const,
    stats: (params: GetAlertStatisticsParams) => ['alerts', 'stats', params] as const,
    scoped: (scope: ScopedAlertsQueryKeyParams) => ['alerts', 'scoped', scope] as const,
  },
  equipment: {
    all: ['equipment'] as const,
    detail: (equipmentId: string) => ['equipment', 'detail', equipmentId] as const,
    telemetry: (equipmentId: string, params: EquipmentTelemetryQueryKeyParams) =>
      ['equipment', 'telemetry', equipmentId, params] as const,
  },
  auditLogs: {
    all: ['audit-logs'] as const,
    list: (params: GetAuditLogsParams) => ['audit-logs', 'list', params] as const,
    users: () => ['audit-logs', 'users'] as const,
  },
};

/**
 * Invalida reativamente todas as consultas de alertas (badge da sidebar, Central de Alertas,
 * gaveta contextual e listas de alertas no Nível 3) sem recorrer a eventos globais no `window`.
 */
export function invalidateAlertQueries(): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all }),
    queryClient.invalidateQueries({ queryKey: ['workspace'] }),
  ]).then(() => undefined);
}

/**
 * Invalida toda a árvore operacional (workspace + detalhe de equipamento).
 */
export function invalidateOperationalQueries(): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['workspace'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all }),
  ]).then(() => undefined);
}
