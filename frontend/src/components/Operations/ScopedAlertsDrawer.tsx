import { useMemo, useState } from 'react';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Checkbox,
  Drawer,
  Empty,
  Input,
  Popconfirm,
  Segmented,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import {
  acknowledgeAlert,
  getAlerts,
  getRealtimeTelemetry,
  resolveAlert,
  type GetAlertsParams,
} from '../../api';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';
import { invalidateAlertQueries, queryKeys } from '../../query/queryClient';
import { resolveAlertSeverityTone, resolveAlertStatusTone, SEMANTIC_HEX } from '../../theme/tokens';
import type { AlertItem, RealtimeSnapshot } from '../../types/models';
import {
  ALERT_SEVERITY_CONFIG,
  ALERT_STATUS_CONFIG,
  ALERT_TYPE_LABELS,
  extractApiError,
  formatDateTimePtBR,
  formatRelativeTimePtBR,
} from '../../utils/formatters';
import AlertTriageActions from '../Common/AlertTriageActions';
import LiveRecoveryBadge from '../Common/LiveRecoveryBadge';
import AcknowledgeAlertModal from '../Modals/AcknowledgeAlertModal';
import { AccentCard, StatusPill } from '../ui';

const { Text } = Typography;

type DrawerStatusMode = 'open' | 'resolved';

const BATCH_NOTE_PRESETS = [
  'Queda de energia na rede',
  'Degelo em andamento',
  'Abastecimento de mercadoria',
  'Técnico em deslocamento',
];

export interface ScopedAlertsDrawerProps {
  open: boolean;
  onClose: () => void;
  scopeTitle?: string;
  companyId?: string | null;
  branchId?: string | null;
  equipmentId?: string | null;
  realtimeById?: Record<string, RealtimeSnapshot>;
  canWriteOperations?: boolean;
  onJumpToEquipment?: (alert: AlertItem) => void;
  onAlertMutated?: () => void;
}

interface BatchTriageControlsProps {
  selectableCount: number;
  selectedCount: number;
  activeSelectedCount: number;
  allSelected: boolean;
  indeterminate: boolean;
  batchNote: string;
  batchBusy: boolean;
  onToggleSelectAll: (checked: boolean) => void;
  onClearSelection: () => void;
  onBatchNoteChange: (note: string) => void;
  onBatchAcknowledge: () => void;
  onBatchResolve: () => void;
}

function BatchTriageControls({
  selectableCount,
  selectedCount,
  activeSelectedCount,
  allSelected,
  indeterminate,
  batchNote,
  batchBusy,
  onToggleSelectAll,
  onClearSelection,
  onBatchNoteChange,
  onBatchAcknowledge,
  onBatchResolve,
}: BatchTriageControlsProps) {
  return (
    <>
      {selectableCount > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 2px',
          }}
        >
          <Checkbox
            checked={allSelected}
            indeterminate={indeterminate}
            onChange={(e) => onToggleSelectAll(e.target.checked)}
          >
            <span style={{ fontSize: 12.5 }}>
              Selecionar todos (<span className="ps-tabular">{selectableCount}</span>)
            </span>
          </Checkbox>
          {selectedCount > 0 && (
            <Button size="small" type="link" onClick={onClearSelection}>
              Limpar seleção
            </Button>
          )}
        </div>
      )}

      {selectedCount > 0 && (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: 'var(--ps-chip-bg)',
            border: `1px solid ${SEMANTIC_HEX.brand}`,
          }}
        >
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text strong style={{ fontSize: 12.5 }}>
              <span className="ps-tabular">{selectedCount}</span> alerta(s) selecionado(s)
            </Text>

            {activeSelectedCount > 0 && (
              <>
                <Input
                  size="small"
                  placeholder="Nota compartilhada opcional (ex.: Queda de energia CPFL)..."
                  value={batchNote}
                  onChange={(e) => onBatchNoteChange(e.target.value)}
                />
                <Space size={[4, 4]} wrap>
                  {BATCH_NOTE_PRESETS.map((preset) => (
                    <StatusPill
                      key={preset}
                      tone="neutral"
                      onClick={() => onBatchNoteChange(preset)}
                    >
                      + {preset}
                    </StatusPill>
                  ))}
                </Space>
              </>
            )}

            <Space wrap>
              {activeSelectedCount > 0 && (
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={batchBusy}
                  onClick={onBatchAcknowledge}
                >
                  Reconhecer ({activeSelectedCount})
                </Button>
              )}
              <Popconfirm
                title={`Resolver ${selectedCount} alerta(s) selecionado(s)?`}
                okText="Resolver todos"
                cancelText="Cancelar"
                onConfirm={onBatchResolve}
              >
                <Button
                  size="small"
                  icon={<CheckCircleOutlined style={{ color: SEMANTIC_HEX.operationalText }} />}
                  loading={batchBusy}
                >
                  Resolver ({selectedCount})
                </Button>
              </Popconfirm>
            </Space>
          </Space>
        </div>
      )}
    </>
  );
}

interface ScopedAlertCardProps {
  alertItem: AlertItem;
  isChecked: boolean;
  canWriteOperations: boolean;
  busy: boolean;
  snapshot?: RealtimeSnapshot;
  onToggleSelect: (id: string, checked: boolean) => void;
  onJump: (alert: AlertItem) => void;
  onQuickAck: (alert: AlertItem) => Promise<void>;
  onAckWithNote: (alert: AlertItem) => void;
  onResolve: (alert: AlertItem) => Promise<void>;
}

function ScopedAlertCard({
  alertItem: al,
  isChecked,
  canWriteOperations,
  busy,
  snapshot,
  onToggleSelect,
  onJump,
  onQuickAck,
  onAckWithNote,
  onResolve,
}: ScopedAlertCardProps) {
  const sevCfg = ALERT_SEVERITY_CONFIG[al.severity] || { label: al.severity };
  const stCfg = ALERT_STATUS_CONFIG[al.status] || { label: al.status };

  return (
    <AccentCard
      status={al.severity === 'critical' ? 'critical' : 'warning'}
      selected={isChecked}
      padding="12px 14px"
      gap={6}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Space size={6} wrap>
          {canWriteOperations && al.status !== 'resolved' && (
            <Checkbox
              checked={isChecked}
              onChange={(e) => onToggleSelect(al.id, e.target.checked)}
            />
          )}
          <StatusPill tone={resolveAlertSeverityTone(al.severity)} dot>
            {sevCfg.label}
          </StatusPill>
          <StatusPill tone={resolveAlertStatusTone(al.status)}>{stCfg.label}</StatusPill>
          <Text strong className="ps-mono" style={{ fontSize: 13 }}>
            {al.serial || 'Equipamento'}
          </Text>
        </Space>

        <Tooltip title={formatDateTimePtBR(al.created_at)}>
          <Text type="secondary" className="ps-tabular" style={{ fontSize: 11.5 }}>
            {formatRelativeTimePtBR(al.created_at)}
          </Text>
        </Tooltip>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>
          {ALERT_TYPE_LABELS[al.type] || al.type}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ps-text-secondary)' }}>{al.message}</div>
      </div>

      {snapshot && (
        <div>
          <LiveRecoveryBadge snapshot={snapshot} />
        </div>
      )}

      {al.acknowledgment_notes && (
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--ps-text-secondary)',
            fontStyle: 'italic',
          }}
        >
          Nota: {al.acknowledgment_notes}
        </div>
      )}

      <div
        style={{
          marginTop: 4,
          paddingTop: 8,
          borderTop: '1px solid var(--ps-subtle-divider)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <Button
          size="small"
          type="link"
          style={{ padding: 0, fontWeight: 600 }}
          icon={<ArrowRightOutlined />}
          onClick={() => onJump(al)}
        >
          Ir ao equipamento
        </Button>

        <AlertTriageActions
          alertItem={al}
          canWriteOperations={canWriteOperations}
          busy={busy}
          onQuickAck={onQuickAck}
          onAckWithNote={onAckWithNote}
          onResolve={onResolve}
          resolveConfirmTitle="Marcar alerta como resolvido?"
        />
      </div>
    </AccentCard>
  );
}

/**
 * Gaveta Persistente de Exceções e Alertas Filtrada pelo Escopo Atual de Zoom
 * Construída com AccentCard, StatusPill e AlertTriageActions do Design System.
 */
export default function ScopedAlertsDrawer({
  open,
  onClose,
  scopeTitle = 'Todos os Escopos',
  companyId = null,
  branchId = null,
  equipmentId = null,
  realtimeById = {},
  canWriteOperations = false,
  onJumpToEquipment,
  onAlertMutated,
}: ScopedAlertsDrawerProps) {
  useSuspendShortcuts(Boolean(open));

  const { message } = AntdApp.useApp();
  const qc = useQueryClient();

  const [statusMode, setStatusMode] = useState<DrawerStatusMode>('open');
  const [ackModalTarget, setAckModalTarget] = useState<AlertItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchNote, setBatchNote] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);

  const hasParentRealtime = Object.keys(realtimeById).length > 0;

  const scopedKey = useMemo(
    () =>
      queryKeys.alerts.scoped({
        statusMode,
        companyId: companyId || null,
        branchId: branchId || null,
        equipmentId: equipmentId || null,
        needsRealtime: !hasParentRealtime,
      }),
    [statusMode, companyId, branchId, equipmentId, hasParentRealtime]
  );

  const scopedQuery = useQuery<{
    alerts: AlertItem[];
    fallbackRealtime: Record<string, RealtimeSnapshot>;
  }>({
    queryKey: scopedKey,
    enabled: Boolean(open),
    queryFn: async () => {
      const params: GetAlertsParams = {
        limit: 50,
        status: statusMode === 'open' ? 'active,acknowledged' : 'resolved',
      };
      if (companyId) params.company_id = companyId;
      if (branchId) params.branch_id = branchId;
      if (equipmentId) params.equipment_id = equipmentId;

      const [res, rtRes] = await Promise.all([
        getAlerts(params),
        !hasParentRealtime
          ? getRealtimeTelemetry(companyId ? { company_id: companyId } : {})
          : Promise.resolve(null),
      ]);

      const rtMap: Record<string, RealtimeSnapshot> = {};
      if (rtRes?.equipment) {
        rtRes.equipment.forEach((snap) => {
          rtMap[snap.equipment_id] = snap;
        });
      }

      return {
        alerts: res?.alerts || [],
        fallbackRealtime: rtMap,
      };
    },
  });

  const alerts = useMemo(() => scopedQuery.data?.alerts ?? [], [scopedQuery.data]);
  const effectiveRealtime = hasParentRealtime
    ? realtimeById
    : scopedQuery.data?.fallbackRealtime ?? {};
  const loading = scopedQuery.isFetching;

  const loadScopedAlerts = async (): Promise<void> => {
    setSelectedIds([]);
    await scopedQuery.refetch();
  };

  const selectableAlerts = useMemo(
    () => alerts.filter((a) => a.status !== 'resolved'),
    [alerts]
  );

  const selectedAlertObjects = useMemo(
    () => alerts.filter((a) => selectedIds.includes(a.id)),
    [alerts, selectedIds]
  );

  const activeSelectedIds = useMemo(
    () => selectedAlertObjects.filter((a) => a.status === 'active').map((a) => a.id),
    [selectedAlertObjects]
  );

  const toggleSelect = (id: string, checked: boolean): void => {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)
    );
  };

  const toggleSelectAll = (checked: boolean): void => {
    if (checked) {
      setSelectedIds(selectableAlerts.map((a) => a.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleQuickAcknowledge = async (item: AlertItem): Promise<void> => {
    const previous = scopedQuery.data;
    setBusyId(item.id);
    if (previous) {
      qc.setQueryData(scopedKey, {
        ...previous,
        alerts: previous.alerts.map((a): AlertItem =>
          a.id === item.id
            ? { ...a, status: 'acknowledged', acknowledged_at: new Date().toISOString() }
            : a
        ),
      });
    }
    try {
      await acknowledgeAlert(item.id, '');
      message.success(`Alerta de ${item.serial || 'equipamento'} reconhecido.`);
      await invalidateAlertQueries();
      onAlertMutated?.();
    } catch (err) {
      if (previous) qc.setQueryData(scopedKey, previous);
      message.error(extractApiError(err, 'Falha ao reconhecer alerta.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleResolve = async (item: AlertItem): Promise<void> => {
    const previous = scopedQuery.data;
    setBusyId(item.id);
    if (previous) {
      qc.setQueryData(scopedKey, {
        ...previous,
        alerts: previous.alerts.filter((a) => a.id !== item.id),
      });
    }
    setSelectedIds((curr) => curr.filter((id) => id !== item.id));
    try {
      await resolveAlert(item.id);
      message.success(`Alerta de ${item.serial || 'equipamento'} resolvido.`);
      await invalidateAlertQueries();
      onAlertMutated?.();
    } catch (err) {
      if (previous) qc.setQueryData(scopedKey, previous);
      message.error(extractApiError(err, 'Falha ao resolver alerta.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleBatchAcknowledge = async (): Promise<void> => {
    if (activeSelectedIds.length === 0) return;
    setBatchBusy(true);
    try {
      const note = batchNote.trim();
      const results = await Promise.allSettled(
        activeSelectedIds.map((id) => acknowledgeAlert(id, note))
      );
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      if (okCount > 0) {
        message.success(`${okCount} alerta(s) reconhecido(s) em lote.`);
        setBatchNote('');
        setSelectedIds([]);
        await invalidateAlertQueries();
        onAlertMutated?.();
      } else {
        message.error('Não foi possível reconhecer os alertas selecionados.');
      }
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchResolve = async (): Promise<void> => {
    if (selectedIds.length === 0) return;
    setBatchBusy(true);
    try {
      const results = await Promise.allSettled(selectedIds.map((id) => resolveAlert(id)));
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      if (okCount > 0) {
        message.success(`${okCount} alerta(s) resolvido(s) em lote.`);
        setSelectedIds([]);
        await invalidateAlertQueries();
        onAlertMutated?.();
      } else {
        message.error('Não foi possível resolver os alertas selecionados.');
      }
    } finally {
      setBatchBusy(false);
    }
  };

  const allSelected =
    selectableAlerts.length > 0 && selectedIds.length === selectableAlerts.length;
  const indeterminate =
    selectedIds.length > 0 && selectedIds.length < selectableAlerts.length;

  const handleJump = (al: AlertItem): void => {
    onClose();
    onJumpToEquipment?.(al);
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Alertas no Escopo</div>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              {scopeTitle}
            </Text>
          </div>
        }
        extra={
          <Button
            size="small"
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => {
              void loadScopedAlerts();
            }}
          />
        }
        width={500}
        destroyOnHidden
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Segmented<DrawerStatusMode>
            block
            className="ps-pill-switcher"
            value={statusMode}
            onChange={(val) => {
              setStatusMode(val);
              setSelectedIds([]);
            }}
            options={[
              { value: 'open', label: 'Ativos & Reconhecidos' },
              { value: 'resolved', label: 'Resolvidos Recentes' },
            ]}
          />

          {canWriteOperations && statusMode === 'open' && (
            <BatchTriageControls
              selectableCount={selectableAlerts.length}
              selectedCount={selectedIds.length}
              activeSelectedCount={activeSelectedIds.length}
              allSelected={allSelected}
              indeterminate={indeterminate}
              batchNote={batchNote}
              batchBusy={batchBusy}
              onToggleSelectAll={toggleSelectAll}
              onClearSelection={() => setSelectedIds([])}
              onBatchNoteChange={setBatchNote}
              onBatchAcknowledge={() => {
                void handleBatchAcknowledge();
              }}
              onBatchResolve={() => {
                void handleBatchResolve();
              }}
            />
          )}

          {loading && alerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
            </div>
          ) : alerts.length === 0 ? (
            <Empty
              description={
                statusMode === 'open'
                  ? 'Nenhum alerta em aberto neste nível da hierarquia.'
                  : 'Nenhum alerta resolvido encontrado.'
              }
            />
          ) : (
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {alerts.map((al) => (
                <ScopedAlertCard
                  key={al.id}
                  alertItem={al}
                  isChecked={selectedIds.includes(al.id)}
                  canWriteOperations={canWriteOperations}
                  busy={busyId === al.id}
                  snapshot={effectiveRealtime[al.equipment_id]}
                  onToggleSelect={toggleSelect}
                  onJump={handleJump}
                  onQuickAck={handleQuickAcknowledge}
                  onAckWithNote={setAckModalTarget}
                  onResolve={handleResolve}
                />
              ))}
            </Space>
          )}
        </Space>
      </Drawer>

      <AcknowledgeAlertModal
        open={Boolean(ackModalTarget)}
        onClose={() => setAckModalTarget(null)}
        alertItem={ackModalTarget}
        onSuccess={(updated: AlertItem) => {
          setAckModalTarget(null);
          if (scopedQuery.data) {
            qc.setQueryData(scopedKey, {
              ...scopedQuery.data,
              alerts: scopedQuery.data.alerts.map((a) =>
                a.id === updated.id ? { ...a, ...updated } : a
              ),
            });
          }
          void invalidateAlertQueries();
          onAlertMutated?.();
        }}
      />
    </>
  );
}
