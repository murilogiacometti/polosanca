import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AimOutlined,
  AlertOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Card,
  Empty,
  Segmented,
  Space,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import {
  acknowledgeAlert,
  deactivateEquipment,
  deleteMaintenanceRecord,
  exportEquipmentTelemetryCsv,
  getAlerts,
  getEquipment,
  getEquipmentAlertRules,
  getEquipmentMaintenanceRecords,
  getEquipmentTelemetry,
  resolveAlert,
  rotateEquipmentApiKey,
} from '../../api';
import AlertTriageActions from '../../components/Common/AlertTriageActions';
import WorkspaceSkeleton from '../../components/Common/WorkspaceSkeleton';
import AcknowledgeAlertModal from '../../components/Modals/AcknowledgeAlertModal';
import ApiKeyModal, { type ApiKeyModalData } from '../../components/Modals/ApiKeyModal';
import EquipmentFormModal from '../../components/Modals/EquipmentFormModal';
import MaintenanceFormModal from '../../components/Modals/MaintenanceFormModal';
import ManualTelemetryModal from '../../components/Modals/ManualTelemetryModal';
import { RowActionMenu, StatusPill, SubsystemStack } from '../../components/ui';
import { confirmWithShortcutLock, useUiShell } from '../../context/uiShellContextObject';
import { invalidateAlertQueries, queryKeys } from '../../query/queryClient';
import { resolveAlertSeverityTone, resolveAlertStatusTone } from '../../theme/tokens';
import type {
  AlertItem,
  AlertRule,
  AlertSeverity,
  AlertStatus,
  AlertType,
  Branch,
  ChartTelemetryPoint,
  Equipment,
  EquipmentStatus,
  MaintenanceRecord,
  MaintenanceType,
  RealtimeSnapshot,
  TelemetryInterval,
  TelemetryRow,
  TelemetrySource,
  TelemetryWindowKey,
  ThresholdBounds,
  TimelinePin,
} from '../../types/models';
import {
  ALERT_SEVERITY_CONFIG,
  ALERT_STATUS_CONFIG,
  ALERT_TYPE_LABELS,
  computeEffectiveTempMetaLabel,
  downloadCsvResponse,
  extractApiError,
  extractBlobApiError,
  formatDatePtBR,
  formatDateTimePtBR,
  formatPressure,
  formatTemperature,
  MAINTENANCE_TYPE_LABELS,
  TELEMETRY_WINDOW_OPTIONS,
} from '../../utils/formatters';
import EquipmentHeroSection from './equipment/EquipmentHeroSection';
import EquipmentTelemetryChartCard, {
  type SafeTempCorridor,
} from './equipment/EquipmentTelemetryChartCard';
import UnitConfigDrawer from './equipment/UnitConfigDrawer';

const { Text } = Typography;

const DAY_MS = 24 * 60 * 60 * 1000;

type HistorySubView = 'alerts' | 'maintenance' | 'readings';

interface LockedFocusState {
  eqId: string | null;
  ms: number | null;
}

interface UnitDetailsData {
  equipment: Equipment;
  applicableRules: AlertRule[];
  equipmentAlerts: AlertItem[];
  maintenanceRecords: MaintenanceRecord[];
}

interface TelemetryBundleData {
  telemetryRows: TelemetryRow[];
  prevDayRows: TelemetryRow[];
}

export interface Level3EquipmentViewProps {
  equipmentId: string;
  liveSnapshot?: RealtimeSnapshot | null;
  branches?: Branch[];
  siblingIndex?: number;
  siblingCount?: number;
  isGlobalAdmin?: boolean;
  canWriteOperations?: boolean;
  backLabel?: string | null;
  onBack?: (() => void) | null;
  onStepSibling?: (delta: number) => void;
  onEquipmentDeactivated?: () => void;
  onMutated?: () => void;
}

interface LiveTelemetryValues {
  effectiveStatus: EquipmentStatus;
  liveTemp: number | null | undefined;
  livePress: number | null | undefined;
  liveDoor: RealtimeSnapshot['door'];
  liveCompressor: RealtimeSnapshot['compressor'];
  liveFan: RealtimeSnapshot['fan'];
  liveHeater: RealtimeSnapshot['heater'];
  liveLastUpdate: string | null | undefined;
}

function resolveLiveTelemetry(
  equipment: Equipment,
  liveSnapshot: RealtimeSnapshot | null | undefined
): LiveTelemetryValues {
  const currentData = equipment.current_data || {};
  const source = liveSnapshot ?? currentData;
  return {
    effectiveStatus: liveSnapshot?.status || equipment.status || 'offline',
    liveTemp: source.temperature,
    livePress: source.pressure,
    liveDoor: source.door,
    liveCompressor: source.compressor,
    liveFan: source.fan,
    liveHeater: source.heater,
    liveLastUpdate: liveSnapshot?.last_update || currentData.last_update || equipment.last_seen_at,
  };
}

interface EquipmentHistoryCardProps {
  historySubView: HistorySubView;
  onHistorySubViewChange: (view: HistorySubView) => void;
  canWriteOperations: boolean;
  equipmentAlerts: AlertItem[];
  maintenanceRecords: MaintenanceRecord[];
  telemetryRows: TelemetryRow[];
  quickAckId: string | null;
  isTimestampFocused: (isoTimestamp?: string | null) => boolean;
  onFocusOnChart: (isoTimestamp?: string | null) => void;
  onQuickAckAlert: (alertRecord: AlertItem) => Promise<void>;
  onAckWithNote: (alertRecord: AlertItem) => void;
  onResolveAlert: (alertRecord: AlertItem) => Promise<void>;
  onOpenNewMaintenance: () => void;
  onEditMaintenance: (record: MaintenanceRecord) => void;
  onRequestDeleteMaintenance: (recordId: string) => void;
}

function EquipmentHistoryCard({
  historySubView,
  onHistorySubViewChange,
  canWriteOperations,
  equipmentAlerts,
  maintenanceRecords,
  telemetryRows,
  quickAckId,
  isTimestampFocused,
  onFocusOnChart,
  onQuickAckAlert,
  onAckWithNote,
  onResolveAlert,
  onOpenNewMaintenance,
  onEditMaintenance,
  onRequestDeleteMaintenance,
}: EquipmentHistoryCardProps) {
  const alertsColumns: ColumnsType<AlertItem> = [
    {
      title: 'Severidade',
      dataIndex: 'severity',
      key: 'severity',
      width: 115,
      render: (sev: AlertSeverity) => (
        <StatusPill tone={resolveAlertSeverityTone(sev)} dot>
          {ALERT_SEVERITY_CONFIG[sev]?.label || sev}
        </StatusPill>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (st: AlertStatus) => (
        <StatusPill tone={resolveAlertStatusTone(st)}>
          {ALERT_STATUS_CONFIG[st]?.label || st}
        </StatusPill>
      ),
    },
    {
      title: 'Tipo',
      dataIndex: 'type',
      key: 'type',
      render: (t: AlertType) => ALERT_TYPE_LABELS[t] || t,
    },
    {
      title: 'Mensagem / Notas',
      dataIndex: 'message',
      key: 'message',
      render: (msg: string, r) => (
        <div>
          <div>{msg}</div>
          {r.acknowledgment_notes && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Nota: {r.acknowledgment_notes}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Disparado em',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 175,
      render: (ts: string) => <span className="ps-tabular">{formatDateTimePtBR(ts)}</span>,
    },
    {
      title: 'Ações Rápidas',
      key: 'actions',
      width: canWriteOperations ? 330 : 165,
      align: 'right',
      render: (_, r) => {
        const focused = isTimestampFocused(r.created_at);
        return (
          <Space size={6} wrap style={{ justifyContent: 'flex-end' }}>
            <Button
              size="small"
              type={focused ? 'primary' : 'default'}
              ghost={focused}
              icon={<AimOutlined />}
              onClick={() => onFocusOnChart(r.created_at)}
            >
              {focused ? 'Focado' : 'Focar no Gráfico'}
            </Button>
            {canWriteOperations && (
              <AlertTriageActions
                alertItem={r}
                canWriteOperations={canWriteOperations}
                busy={quickAckId === r.id}
                onQuickAck={onQuickAckAlert}
                onAckWithNote={onAckWithNote}
                onResolve={onResolveAlert}
              />
            )}
          </Space>
        );
      },
    },
  ];

  const readingsColumns: ColumnsType<TelemetryRow> = [
    {
      title: 'Data / Hora',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (ts: string | undefined, r) => (
        <span className="ps-tabular">{formatDateTimePtBR(ts || r.time)}</span>
      ),
    },
    {
      title: 'Origem',
      dataIndex: 'source',
      key: 'source',
      render: (src: TelemetrySource | undefined) => {
        if (src === 'manual') {
          return <StatusPill tone="warning">◆ Manual (Offline)</StatusPill>;
        }
        return <StatusPill tone="neutral">{src === 'device' ? 'Hardware' : 'Agregado'}</StatusPill>;
      },
    },
    {
      title: 'Temperatura',
      dataIndex: 'temperature',
      key: 'temperature',
      render: (val: number | null | undefined) => (
        <strong className="ps-tabular">{formatTemperature(val)}</strong>
      ),
    },
    {
      title: 'Pressão',
      dataIndex: 'pressure',
      key: 'pressure',
      render: (val: number | null | undefined) => (
        <span className="ps-tabular">{formatPressure(val)}</span>
      ),
    },
    {
      title: 'Detalhes / Observações',
      key: 'details',
      render: (_, r) => {
        if (r.sample_count !== undefined) {
          return (
            <Text type="secondary" className="ps-tabular" style={{ fontSize: 12 }}>
              {r.sample_count} amostras (Mín {formatTemperature(r.min_temperature)} / Máx{' '}
              {formatTemperature(r.max_temperature)})
            </Text>
          );
        }
        if (r.source === 'manual') {
          return r.notes ? (
            <Text style={{ fontSize: 12 }}>Nota: {r.notes}</Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Termômetro de contingência
            </Text>
          );
        }
        return (
          <SubsystemStack
            door={r.door}
            compressor={r.compressor}
            fan={r.fan}
            heater={r.heater}
            showClosedDoor
            layout="horizontal"
          />
        );
      },
    },
    {
      title: 'Ação Rápida',
      key: 'focus',
      width: 155,
      align: 'right',
      render: (_, r) => {
        const ts = r.timestamp || r.time;
        const focused = isTimestampFocused(ts);
        return (
          <Tooltip title="Travar cursor do gráfico neste horário">
            <Button
              size="small"
              type={focused ? 'primary' : 'default'}
              ghost={focused}
              icon={<AimOutlined />}
              onClick={() => onFocusOnChart(ts)}
            >
              {focused ? 'Focado' : 'Focar no Gráfico'}
            </Button>
          </Tooltip>
        );
      },
    },
  ];

  const maintenanceColumns: ColumnsType<MaintenanceRecord> = [
    {
      title: 'Execução',
      dataIndex: 'performed_at',
      key: 'performed_at',
      width: 175,
      render: (ts: string) => <span className="ps-tabular">{formatDateTimePtBR(ts)}</span>,
    },
    {
      title: 'Tipo',
      dataIndex: 'type',
      key: 'type',
      width: 190,
      render: (t: MaintenanceType) => (
        <StatusPill tone="neutral">{MAINTENANCE_TYPE_LABELS[t] || t}</StatusPill>
      ),
    },
    {
      title: 'Responsável Técnico',
      dataIndex: 'performed_by',
      key: 'performed_by',
      width: 195,
    },
    {
      title: 'Serviço Executado',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string, r) => (
        <div>
          <div>{desc}</div>
          {r.notes && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Obs.: {r.notes}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Próxima Preventiva',
      dataIndex: 'next_maintenance_date',
      key: 'next_maintenance_date',
      width: 155,
      render: (dt: string | null | undefined) => (
        <span className="ps-tabular">{formatDatePtBR(dt)}</span>
      ),
    },
    ...(canWriteOperations
      ? ([
          {
            title: 'Ações',
            key: 'actions',
            width: 64,
            align: 'right',
            render: (_, record) => (
              <RowActionMenu
                ariaLabel="Ações de manutenção"
                items={[
                  {
                    key: 'edit',
                    icon: <EditOutlined />,
                    label: 'Editar Registro',
                    onClick: () => onEditMaintenance(record),
                  },
                  { type: 'divider' },
                  {
                    key: 'delete',
                    icon: <DeleteOutlined />,
                    danger: true,
                    label: 'Excluir Registro',
                    onClick: () => onRequestDeleteMaintenance(record.id),
                  },
                ]}
              />
            ),
          },
        ] satisfies ColumnsType<MaintenanceRecord>)
      : []),
  ];

  const showFocusHint =
    (historySubView === 'alerts' && equipmentAlerts.length > 0) ||
    (historySubView === 'readings' && telemetryRows.length > 0);

  return (
    <Card>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div className="ps-toolbar-row">
          <Segmented<HistorySubView>
            className="ps-pill-switcher"
            value={historySubView}
            onChange={onHistorySubViewChange}
            options={[
              {
                value: 'alerts',
                icon: <AlertOutlined />,
                label: `Alertas (${equipmentAlerts.length})`,
              },
              {
                value: 'maintenance',
                icon: <ToolOutlined />,
                label: `Manutenções (${maintenanceRecords.length})`,
              },
              {
                value: 'readings',
                icon: <HistoryOutlined />,
                label: `Leituras (${telemetryRows.length})`,
              },
            ]}
          />

          {historySubView === 'maintenance' && canWriteOperations ? (
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={onOpenNewMaintenance}>
              Registrar Manutenção
            </Button>
          ) : showFocusHint ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Clique em <strong>&ldquo;Focar no Gráfico&rdquo;</strong> para travar o cursor no horário do evento
            </Text>
          ) : null}
        </div>

        {historySubView === 'alerts' &&
          (equipmentAlerts.length === 0 ? (
            <Empty description="Nenhum alerta registrado para este equipamento." />
          ) : (
            <Table<AlertItem>
              rowKey="id"
              columns={alertsColumns}
              dataSource={equipmentAlerts}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              scroll={{ x: 860 }}
              onRow={(r) =>
                isTimestampFocused(r.created_at)
                  ? { style: { background: 'rgba(37, 99, 235, 0.06)' } }
                  : {}
              }
            />
          ))}

        {historySubView === 'maintenance' &&
          (maintenanceRecords.length === 0 ? (
            <Empty description="Nenhum registro de manutenção lançado para este equipamento." />
          ) : (
            <Table<MaintenanceRecord>
              rowKey="id"
              columns={maintenanceColumns}
              dataSource={maintenanceRecords}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              scroll={{ x: 840 }}
            />
          ))}

        {historySubView === 'readings' &&
          (telemetryRows.length === 0 ? (
            <Empty description="Nenhuma leitura no período selecionado." />
          ) : (
            <Table<TelemetryRow>
              rowKey={(r) => r.id || `${r.timestamp}-${r.temperature}`}
              columns={readingsColumns}
              dataSource={telemetryRows}
              pagination={{ pageSize: 15, showSizeChanger: false }}
              scroll={{ x: 860 }}
              onRow={(r) =>
                isTimestampFocused(r.timestamp || r.time)
                  ? { style: { background: 'rgba(37, 99, 235, 0.06)' } }
                  : {}
              }
            />
          ))}
      </Space>
    </Card>
  );
}

/**
 * Nível 3 (Diagnóstico de Alta Precisão):
 * Composição modularizada sobre o Design System Polo Sanca (`ui/` + `equipment/`).
 */
export default function Level3EquipmentView({
  equipmentId,
  liveSnapshot = null,
  branches = [],
  siblingIndex = -1,
  siblingCount = 0,
  isGlobalAdmin = false,
  canWriteOperations = false,
  backLabel = null,
  onBack = null,
  onStepSibling,
  onEquipmentDeactivated,
  onMutated,
}: Level3EquipmentViewProps) {
  const { message, modal } = AntdApp.useApp();
  const { acquireShortcutLock } = useUiShell();
  const qc = useQueryClient();

  const [exportingCsv, setExportingCsv] = useState(false);
  const [quickAckId, setQuickAckId] = useState<string | null>(null);

  const [interval, setIntervalMode] = useState<TelemetryInterval>('raw');
  const [timeWindow, setTimeWindow] = useState<TelemetryWindowKey>('24h');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().subtract(24, 'hour'),
    dayjs(),
  ]);
  const [compare24h, setCompare24h] = useState(true);
  const [historySubView, setHistorySubView] = useState<HistorySubView>('alerts');
  const [lockedFocus, setLockedFocus] = useState<LockedFocusState>({ eqId: null, ms: null });
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const lockedMs = lockedFocus.eqId === equipmentId ? lockedFocus.ms : null;
  const handleLockedMsChange = useCallback(
    (nextMs: number | null) => {
      setLockedFocus({ eqId: equipmentId, ms: nextMs });
    },
    [equipmentId]
  );

  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [apiKeyModalData, setApiKeyModalData] = useState<ApiKeyModalData | null>(null);
  const [ackTarget, setAckTarget] = useState<AlertItem | null>(null);
  const [maintModalOpen, setMaintModalOpen] = useState(false);
  const [editingMaintRecord, setEditingMaintRecord] = useState<MaintenanceRecord | null>(null);
  const [unitConfigOpen, setUnitConfigOpen] = useState(false);

  const computeDateBounds = useCallback((): { start: Dayjs; end: Dayjs } => {
    if (timeWindow === 'custom' && customRange?.[0] && customRange?.[1]) {
      return {
        start: customRange[0],
        end: customRange[1],
      };
    }
    const found = TELEMETRY_WINDOW_OPTIONS.find((w) => w.value === timeWindow);
    const hours = found?.hours || 24;
    const end = dayjs();
    return {
      start: end.subtract(hours, 'hour'),
      end,
    };
  }, [timeWindow, customRange]);

  const isRawRangeOver90Days = useMemo(() => {
    if (interval !== 'raw' || timeWindow !== 'custom') return false;
    if (!customRange?.[0] || !customRange?.[1]) return false;
    return customRange[1].diff(customRange[0], 'day', true) > 90;
  }, [interval, timeWindow, customRange]);

  const detailKey = useMemo(() => queryKeys.equipment.detail(equipmentId), [equipmentId]);
  const telemetryKey = useMemo(
    () =>
      queryKeys.equipment.telemetry(equipmentId, {
        interval,
        timeWindow,
        compare24h,
        customStart: timeWindow === 'custom' ? customRange?.[0]?.toISOString() ?? null : null,
        customEnd: timeWindow === 'custom' ? customRange?.[1]?.toISOString() ?? null : null,
      }),
    [equipmentId, interval, timeWindow, compare24h, customRange]
  );

  const unitDetailsQuery = useQuery<UnitDetailsData>({
    queryKey: detailKey,
    enabled: Boolean(equipmentId),
    queryFn: async () => {
      const [eqData, rulesData, alertsData, maintData] = await Promise.all([
        getEquipment(equipmentId),
        getEquipmentAlertRules(equipmentId),
        getAlerts({ equipment_id: equipmentId, limit: 30 }),
        getEquipmentMaintenanceRecords(equipmentId, { limit: 50 }),
      ]);
      return {
        equipment: eqData,
        applicableRules: rulesData?.applicable_rules || [],
        equipmentAlerts: alertsData?.alerts || [],
        maintenanceRecords: maintData?.maintenance_records || [],
      };
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const telemetryQuery = useQuery<TelemetryBundleData>({
    queryKey: telemetryKey,
    enabled: Boolean(equipmentId),
    queryFn: async () => {
      const { start, end } = computeDateBounds();
      const mainReq = getEquipmentTelemetry(equipmentId, {
        interval,
        limit: 300,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
      });

      const prevReq: Promise<{ data: TelemetryRow[]; count?: number }> = compare24h
        ? getEquipmentTelemetry(equipmentId, {
            interval,
            limit: 300,
            start_date: start.subtract(24, 'hour').toISOString(),
            end_date: end.subtract(24, 'hour').toISOString(),
          })
        : Promise.resolve({ data: [] });

      const [mainRes, prevRes] = await Promise.all([mainReq, prevReq]);
      return {
        telemetryRows: mainRes?.data || [],
        prevDayRows: prevRes?.data || [],
      };
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });

  const equipment = unitDetailsQuery.data?.equipment ?? null;
  const applicableRules = useMemo(
    () => unitDetailsQuery.data?.applicableRules ?? [],
    [unitDetailsQuery.data]
  );
  const equipmentAlerts = useMemo(
    () => unitDetailsQuery.data?.equipmentAlerts ?? [],
    [unitDetailsQuery.data]
  );
  const maintenanceRecords = useMemo(
    () => unitDetailsQuery.data?.maintenanceRecords ?? [],
    [unitDetailsQuery.data]
  );
  const telemetryRows = useMemo(
    () => telemetryQuery.data?.telemetryRows ?? [],
    [telemetryQuery.data]
  );
  const prevDayRows = useMemo(
    () => telemetryQuery.data?.prevDayRows ?? [],
    [telemetryQuery.data]
  );
  const loading = unitDetailsQuery.isPending;
  const telemetryLoading = telemetryQuery.isFetching;

  const loadUnitDetails = useCallback(
    async (_silent = false) => {
      await unitDetailsQuery.refetch();
    },
    [unitDetailsQuery]
  );

  const loadTelemetry = useCallback(
    async (_silent = false) => {
      await telemetryQuery.refetch();
    },
    [telemetryQuery]
  );

  const { fullChartData, timelinePins } = useMemo<{
    fullChartData: ChartTelemetryPoint[];
    timelinePins: TimelinePin[];
  }>(() => {
    const prevPoints: Array<{ ms: number; temp: number }> = [];
    prevDayRows.forEach((r) => {
      const ts = r.timestamp || r.time;
      const ms = ts ? new Date(ts).getTime() : NaN;
      if (!Number.isNaN(ms) && r.temperature !== null && r.temperature !== undefined) {
        prevPoints.push({ ms, temp: r.temperature });
      }
    });
    prevPoints.sort((a, b) => a.ms - b.ms);

    const toleranceMs =
      interval === '1day'
        ? 12 * 3600 * 1000
        : interval === '1hour'
          ? 75 * 60 * 1000
          : 25 * 60 * 1000;

    const findPrevDayMatch = (targetMs: number): number | null => {
      if (prevPoints.length === 0 || Number.isNaN(targetMs)) return null;
      let bestDiff = Infinity;
      let bestVal: number | null = null;
      for (const pt of prevPoints) {
        const diff = Math.abs(pt.ms - targetMs);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestVal = pt.temp;
        }
      }
      return bestDiff <= toleranceMs ? bestVal : null;
    };

    const points: ChartTelemetryPoint[] = [...telemetryRows]
      .reverse()
      .map((row, idx) => {
        const ts = row.timestamp || row.time;
        const parsed = ts ? new Date(ts) : null;
        const ms = parsed ? parsed.getTime() : NaN;
        const shortTime = parsed
          ? parsed.toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : `#${idx + 1}`;
        const timelineEvents: ChartTelemetryPoint['timelineEvents'] = [];
        return {
          ...row,
          idx,
          ms,
          timestamp: ts,
          shortTime,
          manualTemp: row.source === 'manual' ? row.temperature : null,
          prevDayTemp: compare24h ? findPrevDayMatch(ms - DAY_MS) : null,
          timelineEvents,
        };
      });

    const pins: TimelinePin[] = [];
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    if (points.length >= 2 && firstPoint && lastPoint) {
      const minMs = firstPoint.ms - 15 * 60 * 1000;
      const maxMs = lastPoint.ms + 15 * 60 * 1000;

      const attachNearest = (
        eventMs: number,
        pinMeta: ChartTelemetryPoint['timelineEvents'][number]
      ) => {
        if (Number.isNaN(eventMs) || eventMs < minMs || eventMs > maxMs) return;
        let bestIdx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < points.length; i += 1) {
          const pt = points[i];
          if (!pt) continue;
          const d = Math.abs(pt.ms - eventMs);
          if (d < bestDiff) {
            bestDiff = d;
            bestIdx = i;
          }
        }
        const bestPoint = points[bestIdx];
        if (!bestPoint) return;
        bestPoint.timelineEvents.push(pinMeta);
        if (!pins.some((p) => p.idx === bestIdx && p.kind === pinMeta.kind)) {
          pins.push({
            idx: bestIdx,
            shortTime: bestPoint.shortTime,
            ...pinMeta,
          });
        }
      };

      equipmentAlerts.slice(0, 12).forEach((al) => {
        const ms = al.created_at ? new Date(al.created_at).getTime() : NaN;
        attachNearest(ms, {
          kind: 'alert',
          severity: al.severity,
          label: `Alerta: ${ALERT_TYPE_LABELS[al.type] || al.type}`,
        });
      });

      maintenanceRecords.slice(0, 8).forEach((mr) => {
        const ms = mr.performed_at ? new Date(mr.performed_at).getTime() : NaN;
        attachNearest(ms, {
          kind: 'maintenance',
          label: `Manutenção: ${MAINTENANCE_TYPE_LABELS[mr.type] || mr.type}`,
        });
      });
    }

    return { fullChartData: points, timelinePins: pins };
  }, [telemetryRows, prevDayRows, compare24h, interval, equipmentAlerts, maintenanceRecords]);

  const effectiveTempRules = useMemo(
    () =>
      applicableRules.filter(
        (r) =>
          r.is_effective &&
          r.is_active &&
          (r.rule_type === 'temperature_high' || r.rule_type === 'temperature_low') &&
          r.threshold_value !== null &&
          r.threshold_value !== undefined
      ),
    [applicableRules]
  );

  const tempBounds = useMemo<ThresholdBounds | null>(() => {
    const highs = effectiveTempRules
      .filter((r) => r.rule_type === 'temperature_high')
      .map((r) => Number(r.threshold_value))
      .filter((n) => !Number.isNaN(n));
    const lows = effectiveTempRules
      .filter((r) => r.rule_type === 'temperature_low')
      .map((r) => Number(r.threshold_value))
      .filter((n) => !Number.isNaN(n));

    const high = highs.length > 0 ? Math.min(...highs) : null;
    const low = lows.length > 0 ? Math.max(...lows) : null;
    if (low === null && high === null) return null;
    return { low, high };
  }, [effectiveTempRules]);

  const safeTempCorridor = useMemo<SafeTempCorridor | null>(() => {
    if (
      tempBounds &&
      tempBounds.low !== null &&
      tempBounds.low !== undefined &&
      tempBounds.high !== null &&
      tempBounds.high !== undefined &&
      tempBounds.low < tempBounds.high
    ) {
      return { low: tempBounds.low, high: tempBounds.high };
    }
    return null;
  }, [tempBounds]);

  const effectivePressureRules = useMemo(
    () =>
      applicableRules.filter(
        (r) =>
          r.is_effective &&
          r.is_active &&
          (r.rule_type === 'pressure_high' || r.rule_type === 'pressure_low') &&
          r.threshold_value !== null &&
          r.threshold_value !== undefined
      ),
    [applicableRules]
  );

  const pressureMetaLabel = useMemo<string | null>(() => {
    const highs = effectivePressureRules
      .filter((r) => r.rule_type === 'pressure_high')
      .map((r) => Number(r.threshold_value))
      .filter((n) => !Number.isNaN(n));
    const lows = effectivePressureRules
      .filter((r) => r.rule_type === 'pressure_low')
      .map((r) => Number(r.threshold_value))
      .filter((n) => !Number.isNaN(n));
    const high = highs.length > 0 ? Math.min(...highs) : null;
    const low = lows.length > 0 ? Math.max(...lows) : null;
    if (low !== null && high !== null) {
      return `Faixa: ${formatPressure(low)} – ${formatPressure(high)}`;
    }
    if (high !== null) return `Máx: ≤ ${formatPressure(high)}`;
    if (low !== null) return `Mín: ≥ ${formatPressure(low)}`;
    return null;
  }, [effectivePressureRules]);

  const targetMetaLabel = useMemo(
    () => computeEffectiveTempMetaLabel(applicableRules),
    [applicableRules]
  );

  const handleFocusOnChart = useCallback(
    (isoTimestamp?: string | null) => {
      const targetMs = isoTimestamp ? new Date(isoTimestamp).getTime() : NaN;
      if (Number.isNaN(targetMs)) return;

      const { start, end } = computeDateBounds();
      const marginMs = 15 * 60 * 1000;
      if (targetMs < start.valueOf() - marginMs || targetMs > end.valueOf() + marginMs) {
        const targetDay = dayjs(targetMs);
        const nowDay = dayjs();
        const windowEnd = targetDay.add(12, 'hour').isAfter(nowDay)
          ? nowDay
          : targetDay.add(12, 'hour');
        const windowStart = targetDay.subtract(12, 'hour');
        setCustomRange([windowStart, windowEnd]);
        setTimeWindow('custom');
      }

      handleLockedMsChange(targetMs);
      chartContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    [computeDateBounds, handleLockedMsChange]
  );

  const isTimestampFocused = useCallback(
    (isoTimestamp?: string | null): boolean => {
      if (lockedMs === null || lockedMs === undefined || !isoTimestamp) return false;
      const rowMs = new Date(isoTimestamp).getTime();
      if (Number.isNaN(rowMs)) return false;
      return Math.abs(rowMs - lockedMs) <= 5 * 60 * 1000;
    },
    [lockedMs]
  );

  const handleQuickAckAlert = async (alertRecord: AlertItem) => {
    const prev = unitDetailsQuery.data;
    setQuickAckId(alertRecord.id);
    if (prev) {
      qc.setQueryData<UnitDetailsData>(detailKey, {
        ...prev,
        equipmentAlerts: prev.equipmentAlerts.map((a) =>
          a.id === alertRecord.id
            ? { ...a, status: 'acknowledged', acknowledged_at: new Date().toISOString() }
            : a
        ),
      });
    }
    try {
      await acknowledgeAlert(alertRecord.id, '');
      message.success('Alerta reconhecido com sucesso.');
      await invalidateAlertQueries();
      onMutated?.();
    } catch (err) {
      if (prev) qc.setQueryData(detailKey, prev);
      message.error(extractApiError(err, 'Erro ao reconhecer alerta.'));
    } finally {
      setQuickAckId(null);
    }
  };

  const handleResolveAlert = async (alertRecord: AlertItem) => {
    const alertId = alertRecord.id;
    const prev = unitDetailsQuery.data;
    if (prev) {
      qc.setQueryData<UnitDetailsData>(detailKey, {
        ...prev,
        equipmentAlerts: prev.equipmentAlerts.map((a) =>
          a.id === alertId ? { ...a, status: 'resolved', resolved_at: new Date().toISOString() } : a
        ),
      });
    }
    try {
      await resolveAlert(alertId);
      message.success('Alerta resolvido com sucesso.');
      await invalidateAlertQueries();
      onMutated?.();
    } catch (err) {
      if (prev) qc.setQueryData(detailKey, prev);
      message.error(extractApiError(err, 'Erro ao resolver alerta.'));
    }
  };

  const handleExportTelemetryCsv = async () => {
    if (!equipment) return;
    if (isRawRangeOver90Days) {
      message.warning(
        'O modo Bruto suporta exportação de até 90 dias. Selecione 5 min, 1 hora ou 1 dia para períodos longos.'
      );
      return;
    }
    setExportingCsv(true);
    try {
      const { start, end } = computeDateBounds();
      const resp = await exportEquipmentTelemetryCsv(equipment.id, {
        interval,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
      });
      downloadCsvResponse(resp, `telemetria_${equipment.serial}_${interval}.csv`);
      message.success('Exportação CSV concluída.');
    } catch (err) {
      const msg = await extractBlobApiError(
        err,
        'Não foi possível exportar a telemetria. Para intervalos brutos (raw), selecione até 90 dias.'
      );
      message.error(msg);
    } finally {
      setExportingCsv(false);
    }
  };

  const handleRotateApiKey = async () => {
    if (!equipment) return;
    try {
      const res = await rotateEquipmentApiKey(equipment.id);
      message.success('Chave de API rotacionada com sucesso!');
      setApiKeyModalData({
        serial: equipment.serial,
        apiKey: res.api_key,
        isRotation: true,
      });
    } catch (err) {
      message.error(extractApiError(err, 'Não foi possível rotacionar a chave de API.'));
    }
  };

  const handleDeactivate = async () => {
    if (!equipment) return;
    try {
      await deactivateEquipment(equipment.id);
      message.success('Equipamento desativado. Histórico preservado integralmente.');
      onEquipmentDeactivated?.();
    } catch (err) {
      message.error(extractApiError(err, 'Não foi possível desativar o equipamento.'));
    }
  };

  const handleDeleteMaintenance = async (recordId: string) => {
    try {
      await deleteMaintenanceRecord(recordId);
      message.success('Registro de manutenção excluído.');
      await loadUnitDetails(false);
      onMutated?.();
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao excluir registro de manutenção.'));
    }
  };

  if (loading && !equipment) {
    return <WorkspaceSkeleton variant="detail" />;
  }

  if (!equipment) return null;

  const {
    effectiveStatus,
    liveTemp,
    livePress,
    liveDoor,
    liveCompressor,
    liveFan,
    liveHeater,
    liveLastUpdate,
  } = resolveLiveTelemetry(equipment, liveSnapshot);

  const handleRequestDeleteMaintenance = (recordId: string) => {
    confirmWithShortcutLock(
      modal,
      {
        title: 'Excluir registro de manutenção?',
        okText: 'Excluir',
        okButtonProps: { danger: true },
        cancelText: 'Cancelar',
        onOk: () => handleDeleteMaintenance(recordId),
      },
      acquireShortcutLock
    );
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <EquipmentHeroSection
        equipment={equipment}
        branches={branches}
        effectiveStatus={effectiveStatus}
        liveTemp={liveTemp}
        livePress={livePress}
        liveDoor={liveDoor}
        liveCompressor={liveCompressor}
        liveFan={liveFan}
        liveHeater={liveHeater}
        liveLastUpdate={liveLastUpdate}
        targetMetaLabel={targetMetaLabel}
        tempBounds={tempBounds}
        pressureMetaLabel={pressureMetaLabel}
        siblingIndex={siblingIndex}
        siblingCount={siblingCount}
        canWriteOperations={canWriteOperations}
        backLabel={backLabel}
        onBack={onBack}
        onStepSibling={onStepSibling}
        onOpenManualModal={() => setManualModalOpen(true)}
        onOpenMaintenanceModal={() => {
          setEditingMaintRecord(null);
          setMaintModalOpen(true);
        }}
        onOpenUnitConfig={() => setUnitConfigOpen(true)}
      />

      <EquipmentTelemetryChartCard
        key={equipment.id}
        containerRef={chartContainerRef}
        fullChartData={fullChartData}
        timelinePins={timelinePins}
        safeTempCorridor={safeTempCorridor}
        tempBounds={tempBounds}
        pressureMetaLabel={pressureMetaLabel}
        effectiveTempRules={effectiveTempRules}
        effectivePressureRules={effectivePressureRules}
        interval={interval}
        onIntervalChange={setIntervalMode}
        timeWindow={timeWindow}
        onTimeWindowChange={setTimeWindow}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        compare24h={compare24h}
        onCompare24hChange={setCompare24h}
        lockedMs={lockedMs}
        onLockedMsChange={handleLockedMsChange}
        isRawRangeOver90Days={isRawRangeOver90Days}
        telemetryLoading={telemetryLoading}
        exportingCsv={exportingCsv}
        onExportCsv={handleExportTelemetryCsv}
      />

      <EquipmentHistoryCard
        historySubView={historySubView}
        onHistorySubViewChange={setHistorySubView}
        canWriteOperations={canWriteOperations}
        equipmentAlerts={equipmentAlerts}
        maintenanceRecords={maintenanceRecords}
        telemetryRows={telemetryRows}
        quickAckId={quickAckId}
        isTimestampFocused={isTimestampFocused}
        onFocusOnChart={handleFocusOnChart}
        onQuickAckAlert={handleQuickAckAlert}
        onAckWithNote={setAckTarget}
        onResolveAlert={handleResolveAlert}
        onOpenNewMaintenance={() => {
          setEditingMaintRecord(null);
          setMaintModalOpen(true);
        }}
        onEditMaintenance={(record) => {
          setEditingMaintRecord(record);
          setMaintModalOpen(true);
        }}
        onRequestDeleteMaintenance={handleRequestDeleteMaintenance}
      />

      <UnitConfigDrawer
        open={unitConfigOpen}
        onClose={() => setUnitConfigOpen(false)}
        equipment={equipment}
        branches={branches}
        applicableRules={applicableRules}
        isGlobalAdmin={isGlobalAdmin}
        canWriteOperations={canWriteOperations}
        onOpenEditModal={() => setEditModalOpen(true)}
        onRotateApiKey={handleRotateApiKey}
        onDeactivate={handleDeactivate}
        onRuleCreated={async () => {
          await loadUnitDetails(false);
          onMutated?.();
        }}
      />

      <ManualTelemetryModal
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        equipment={{ ...equipment, liveTemperature: liveTemp }}
        onSuccess={async (created) => {
          setManualModalOpen(false);
          if (created && telemetryQuery.data) {
            const optimisticRow: TelemetryRow = {
              id: `manual-${Date.now()}`,
              timestamp: created.timestamp || new Date().toISOString(),
              temperature: created.temperature,
              pressure: null,
              source: created.source,
              recorded_by: created.recorded_by,
              notes: created.notes ?? null,
            };
            qc.setQueryData<TelemetryBundleData>(telemetryKey, {
              ...telemetryQuery.data,
              telemetryRows: [optimisticRow, ...telemetryQuery.data.telemetryRows],
            });
          }
          await loadTelemetry(true);
          onMutated?.();
        }}
      />

      <EquipmentFormModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        equipment={equipment}
        branches={branches}
        isGlobalAdmin={isGlobalAdmin}
        onSuccess={async () => {
          setEditModalOpen(false);
          await loadUnitDetails(false);
          onMutated?.();
        }}
      />

      <ApiKeyModal
        open={Boolean(apiKeyModalData)}
        onClose={() => setApiKeyModalData(null)}
        apiKeyData={apiKeyModalData}
      />

      <AcknowledgeAlertModal
        open={Boolean(ackTarget)}
        onClose={() => setAckTarget(null)}
        alertItem={ackTarget}
        onSuccess={async () => {
          setAckTarget(null);
          await invalidateAlertQueries();
          onMutated?.();
        }}
      />

      <MaintenanceFormModal
        open={maintModalOpen}
        onClose={() => {
          setMaintModalOpen(false);
          setEditingMaintRecord(null);
        }}
        equipmentId={equipment.id}
        record={editingMaintRecord}
        onSuccess={async () => {
          setMaintModalOpen(false);
          setEditingMaintRecord(null);
          await loadUnitDetails(false);
          onMutated?.();
        }}
      />
    </Space>
  );
}
