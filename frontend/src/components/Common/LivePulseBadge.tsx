import { useEffect, useState } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Space, Tooltip, Typography } from 'antd';
import { formatDateTimePtBR, formatRelativeTimePtBR } from '../../utils/formatters';

const { Text } = Typography;

export interface LivePulseBadgeProps {
  hasError?: boolean;
  isUnstable?: boolean;
  tabPaused?: boolean;
  secondsSinceSync?: number | null;
  lastSyncedAt?: number | null;
  lastRefreshedAt?: string | null;
  onlineCount?: number | null;
  offlineCount?: number | null;
  lastSignalIso?: string | null;
  onRefresh?: (() => void) | null;
  isRefreshing?: boolean;
  compact?: boolean;
  intervalLabel?: string;
}

interface BadgeVisualState {
  dotColor: string;
  pulseClass: string;
  statusBadgeText: string;
  textColor: string;
  pillBg: string;
  pillBorder: string;
  statusTooltip: string;
}

interface ResolveVisualStateArgs {
  browserOnline: boolean;
  isUnstable: boolean;
  hasError: boolean;
  tabPaused: boolean;
  allDevicesOffline: boolean;
  partiallyOffline: boolean;
  compact: boolean;
  onlineCount: number | null;
  offlineCount: number | null;
  totalScopedUnits: number;
}

function resolveEffectiveSecondsSinceSync(
  secondsSinceSync: number | null,
  lastSyncedAt: number | null,
  nowMs: number
): number | null {
  if (secondsSinceSync !== null && secondsSinceSync !== undefined) {
    return secondsSinceSync;
  }
  if (lastSyncedAt && lastSyncedAt > 0) {
    return Math.max(0, Math.floor((nowMs - lastSyncedAt) / 1000));
  }
  return null;
}

function resolveAllOfflineBadgeText(compact: boolean, totalScopedUnits: number): string {
  if (compact || totalScopedUnits === 1) {
    return 'Sem Conexão';
  }
  return `Sem Conexão (0/${totalScopedUnits})`;
}

function resolveBadgeVisualState(args: ResolveVisualStateArgs): BadgeVisualState {
  if (!args.browserOnline) {
    return {
      dotColor: '#ef4444',
      pulseClass: 'ps-dot-pulse-red',
      statusBadgeText: 'Sem rede',
      textColor: '#dc2626',
      pillBg: 'var(--ps-crit-tint)',
      pillBorder: 'var(--ps-crit-border)',
      statusTooltip: 'Navegador desconectado da rede. Tentando reconectar automaticamente.',
    };
  }
  if (args.isUnstable || args.hasError) {
    return {
      dotColor: '#f59e0b',
      pulseClass: 'ps-dot-pulse-amber',
      statusBadgeText: args.isUnstable ? 'API instável' : 'Reconectando',
      textColor: '#d97706',
      pillBg: 'var(--ps-warn-tint)',
      pillBorder: 'var(--ps-warn-border)',
      statusTooltip: 'Falha de sincronização com a API. Nova tentativa automática em 30s.',
    };
  }
  if (args.tabPaused) {
    return {
      dotColor: '#94a3b8',
      pulseClass: '',
      statusBadgeText: 'Pausado',
      textColor: 'var(--ps-text-secondary)',
      pillBg: 'var(--ps-chip-bg)',
      pillBorder: 'var(--ps-chip-border)',
      statusTooltip: 'Atualização automática pausada enquanto a aba está em segundo plano.',
    };
  }
  if (args.allDevicesOffline) {
    const scopeDetail =
      args.totalScopedUnits === 1
        ? 'este equipamento não envia telemetria há mais de 10 minutos.'
        : `nenhum dos ${args.totalScopedUnits} equipamentos deste escopo enviou telemetria nos últimos 10 minutos.`;
    return {
      dotColor: '#ef4444',
      pulseClass: '',
      statusBadgeText: resolveAllOfflineBadgeText(args.compact, args.totalScopedUnits),
      textColor: '#dc2626',
      pillBg: 'var(--ps-crit-tint)',
      pillBorder: 'var(--ps-crit-border)',
      statusTooltip: `Painel sincronizado, mas ${scopeDetail}`,
    };
  }
  if (args.partiallyOffline) {
    return {
      dotColor: '#f59e0b',
      pulseClass: 'ps-dot-pulse-amber',
      statusBadgeText: args.compact
        ? 'Parcialmente Offline'
        : `Parcialmente Offline (${args.onlineCount}/${args.totalScopedUnits} online)`,
      textColor: '#d97706',
      pillBg: 'var(--ps-warn-tint)',
      pillBorder: 'var(--ps-warn-border)',
      statusTooltip: `${args.onlineCount} de ${args.totalScopedUnits} equipamento(s) online • ${args.offlineCount} sem comunicação recente (>10 min).`,
    };
  }
  return {
    dotColor: '#10b981',
    pulseClass: 'ps-dot-pulse-green',
    statusBadgeText: 'Ao vivo',
    textColor: '#059669',
    pillBg: 'rgba(16, 185, 129, 0.1)',
    pillBorder: 'rgba(16, 185, 129, 0.25)',
    statusTooltip: 'Todos os equipamentos deste escopo estão enviando telemetria em tempo real.',
  };
}

function resolveSyncLabel(params: {
  allDevicesOffline: boolean;
  lastSignalIso: string | null;
  totalScopedUnits: number;
  effectiveSecondsSinceSync: number | null;
  lastRefreshedAt: string | null;
  intervalLabel: string;
}): string {
  if (params.allDevicesOffline && params.lastSignalIso) {
    return `Último sinal ${formatRelativeTimePtBR(params.lastSignalIso)}`;
  }
  if (params.allDevicesOffline && params.totalScopedUnits > 0 && !params.lastSignalIso) {
    return 'Aguardando 1º sinal IoT';
  }
  if (params.effectiveSecondsSinceSync !== null) {
    return params.effectiveSecondsSinceSync < 60
      ? `Atualizado há ${params.effectiveSecondsSinceSync}s`
      : `Atualizado há ${Math.floor(params.effectiveSecondsSinceSync / 60)} min`;
  }
  if (params.lastRefreshedAt) {
    return `${params.intervalLabel} • ${formatDateTimePtBR(params.lastRefreshedAt)}`;
  }
  return params.intervalLabel;
}

function CompactLivePulseBadge({
  visual,
  fullTooltip,
  onRefresh,
  isRefreshing,
}: {
  visual: BadgeVisualState;
  fullTooltip: string;
  onRefresh: (() => void) | null;
  isRefreshing: boolean;
}) {
  return (
    <Tooltip title={fullTooltip}>
      <button
        type="button"
        className="ps-live-pulse-compact"
        onClick={onRefresh || undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 11px',
          borderRadius: 999,
          background: visual.pillBg,
          border: `1px solid ${visual.pillBorder}`,
          fontSize: 12,
          fontWeight: 600,
          color: visual.textColor,
          lineHeight: 1.25,
          cursor: onRefresh ? 'pointer' : 'default',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          overflow: 'hidden',
        }}
      >
        <span
          className={visual.pulseClass}
          style={{
            width: 6.5,
            height: 6.5,
            borderRadius: '50%',
            backgroundColor: visual.dotColor,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {isRefreshing ? 'Sincronizando...' : visual.statusBadgeText}
        </span>
      </button>
    </Tooltip>
  );
}

function computeFleetOnlineFlags(
  onlineCount: number | null,
  offlineCount: number | null
): { totalScopedUnits: number; allDevicesOffline: boolean; partiallyOffline: boolean } {
  if (typeof onlineCount !== 'number' || typeof offlineCount !== 'number') {
    return { totalScopedUnits: 0, allDevicesOffline: false, partiallyOffline: false };
  }
  const totalScopedUnits = onlineCount + offlineCount;
  return {
    totalScopedUnits,
    allDevicesOffline: totalScopedUnits > 0 && onlineCount === 0,
    partiallyOffline: onlineCount > 0 && offlineCount > 0,
  };
}

function FullLivePulseBadge({
  visual,
  syncLabel,
  onRefresh,
  isRefreshing,
}: {
  visual: BadgeVisualState;
  syncLabel: string;
  onRefresh: (() => void) | null;
  isRefreshing: boolean;
}) {
  return (
    <Space size={6} wrap align="center">
      <Tooltip title={visual.statusTooltip}>
        <span
          className="ps-tabular"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 9px',
            borderRadius: 999,
            background: visual.pillBg,
            border: `1px solid ${visual.pillBorder}`,
            fontSize: 12,
            fontWeight: 600,
            color: visual.textColor,
            lineHeight: 1.45,
          }}
        >
          <span
            className={visual.pulseClass}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: visual.dotColor,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          {visual.statusBadgeText}
        </span>
      </Tooltip>

      <Text type="secondary" className="ps-tabular" style={{ fontSize: 12 }}>
        {syncLabel}
      </Text>

      {onRefresh && (
        <Tooltip title="Sincronizar agora">
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined spin={isRefreshing} />}
            onClick={onRefresh}
            loading={isRefreshing}
            aria-label="Sincronizar dados agora"
            style={{ color: 'var(--ps-text-secondary)' }}
          />
        </Tooltip>
      )}
    </Space>
  );
}

/**
 * Indicador operacional alinhado ao estado real da frota / escopo atual:
 * - "Ao vivo" (verde) quando todos os equipamentos do escopo estão online
 * - "Parcialmente Offline" (âmbar) quando parte das unidades perdeu sinal (>10 min)
 * - "Sem Conexão" (vermelho) quando 100% das unidades do escopo estão offline
 * Quando `lastSyncedAt` (epoch ms) é fornecido, o relógio local de 1s roda isolado neste badge,
 * evitando re-renderizações por segundo na árvore pai.
 */
export default function LivePulseBadge({
  hasError = false,
  isUnstable = false,
  tabPaused = false,
  secondsSinceSync = null,
  lastSyncedAt = null,
  lastRefreshedAt = null,
  onlineCount = null,
  offlineCount = null,
  lastSignalIso = null,
  onRefresh = null,
  isRefreshing = false,
  compact = false,
  intervalLabel = 'Sincronização a cada 30s',
}: LivePulseBadgeProps) {
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!lastSyncedAt || lastSyncedAt <= 0) return undefined;
    const clock = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(clock);
  }, [lastSyncedAt]);

  const effectiveSecondsSinceSync = resolveEffectiveSecondsSinceSync(
    secondsSinceSync,
    lastSyncedAt,
    nowMs
  );

  const { totalScopedUnits, allDevicesOffline, partiallyOffline } = computeFleetOnlineFlags(
    onlineCount,
    offlineCount
  );

  const visual = resolveBadgeVisualState({
    browserOnline,
    isUnstable,
    hasError,
    tabPaused,
    allDevicesOffline,
    partiallyOffline,
    compact,
    onlineCount,
    offlineCount,
    totalScopedUnits,
  });

  const syncLabel = resolveSyncLabel({
    allDevicesOffline,
    lastSignalIso,
    totalScopedUnits,
    effectiveSecondsSinceSync,
    lastRefreshedAt,
    intervalLabel,
  });

  const refreshHint = onRefresh ? ' — clique para sincronizar agora' : '';
  const fullTooltip = `${visual.statusTooltip} (${syncLabel}${refreshHint})`;

  if (compact) {
    return (
      <CompactLivePulseBadge
        visual={visual}
        fullTooltip={fullTooltip}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
      />
    );
  }

  return (
    <FullLivePulseBadge
      visual={visual}
      syncLabel={syncLabel}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
    />
  );
}
