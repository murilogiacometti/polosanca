import { type Key, type ReactNode, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  CheckCircleOutlined,
  CheckOutlined,
  CloseOutlined,
  ControlOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileDoneOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  App as AntdApp,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  type TableProps,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import {
  acknowledgeAlert,
  exportAlertsCsv,
  getAlert,
  getAlerts,
  getAlertStatistics,
  getBranches,
  getEquipments,
  getRealtimeTelemetry,
  resolveAlert,
  type GetAlertsParams,
  type GetAlertStatisticsParams,
} from '../api';
import AlertTriageActions from '../components/Common/AlertTriageActions';
import LivePulseBadge from '../components/Common/LivePulseBadge';
import LiveRecoveryBadge from '../components/Common/LiveRecoveryBadge';
import WorkspaceSkeleton from '../components/Common/WorkspaceSkeleton';
import AcknowledgeAlertModal from '../components/Modals/AcknowledgeAlertModal';
import { PageHeader, StatMiniCard, StatusPill } from '../components/ui';
import { useAuth } from '../context/authContextObject';
import { useSuspendShortcuts } from '../context/uiShellContextObject';
import { invalidateAlertQueries, queryKeys } from '../query/queryClient';
import { resolveAlertSeverityTone, resolveAlertStatusTone, SEMANTIC_HEX } from '../theme/tokens';
import type {
  AlertItem,
  AlertSeverity,
  AlertStatistics,
  AlertStatus,
  Branch,
  Equipment,
  PaginationMeta,
  RealtimeSnapshot,
} from '../types/models';
import {
  ALERT_SEVERITY_CONFIG,
  ALERT_STATUS_CONFIG,
  ALERT_TYPE_LABELS,
  downloadCsvResponse,
  extractApiError,
  extractBlobApiError,
  formatDateTimePtBR,
} from '../utils/formatters';

const { Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const BATCH_NOTE_PRESETS = [
  'Queda de energia na rede',
  'Degelo programado em andamento',
  'Abastecimento de mercadoria',
  'Técnico acionado para verificação',
];

type StatusTabKey = AlertStatus | 'all';

export interface AlertsPageProps {
  headerNav?: ReactNode;
  onJumpToRules?: (equipmentId: string) => void;
}

const EMPTY_ALERT_STATS: AlertStatistics = {
  total_active: 0,
  by_severity: { critical: 0, warning: 0 },
};

function resolveAlertEquipmentPath(
  alert: Pick<AlertItem, 'company_id' | 'branch_id' | 'equipment_id'>
): string {
  return alert.company_id && alert.branch_id
    ? `/operacao/empresas/${alert.company_id}/filiais/${alert.branch_id}/equipamentos/${alert.equipment_id}`
    : `/equipments/${alert.equipment_id}`;
}

interface AlertsFilterBarProps {
  branches: Branch[];
  equipments: Equipment[];
  severityFilter: AlertSeverity | undefined;
  branchFilter: string | undefined;
  equipmentFilter: string | undefined;
  dateRange: [Dayjs | null, Dayjs | null] | null;
  onSeverityChange: (val: AlertSeverity | undefined) => void;
  onBranchChange: (val: string | undefined) => void;
  onEquipmentChange: (val: string | undefined) => void;
  onDateRangeChange: (vals: [Dayjs | null, Dayjs | null] | null) => void;
}

function AlertsFilterBar({
  branches,
  equipments,
  severityFilter,
  branchFilter,
  equipmentFilter,
  dateRange,
  onSeverityChange,
  onBranchChange,
  onEquipmentChange,
  onDateRangeChange,
}: AlertsFilterBarProps) {
  const hasMultipleBranches = branches.length > 1;
  return (
    <Row gutter={[10, 10]}>
      <Col xs={24} sm={12} lg={hasMultipleBranches ? 5 : 6}>
        <Select<AlertSeverity>
          allowClear
          style={{ width: '100%' }}
          placeholder="Severidade"
          value={severityFilter}
          onChange={onSeverityChange}
          options={[
            { value: 'critical', label: 'Crítico' },
            { value: 'warning', label: 'Atenção' },
          ]}
        />
      </Col>

      {hasMultipleBranches && (
        <Col xs={24} sm={12} lg={6}>
          <Select<string>
            allowClear
            style={{ width: '100%' }}
            placeholder="Filtrar por filial"
            value={branchFilter}
            onChange={onBranchChange}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </Col>
      )}

      <Col xs={24} sm={12} lg={hasMultipleBranches ? 6 : 9}>
        <Select<string>
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
          placeholder="Filtrar por equipamento"
          value={equipmentFilter}
          onChange={onEquipmentChange}
          options={equipments
            .filter((eq) => !branchFilter || eq.branch_id === branchFilter)
            .map((eq) => ({ value: eq.id, label: eq.serial }))}
        />
      </Col>

      <Col xs={24} sm={12} lg={hasMultipleBranches ? 7 : 9}>
        <RangePicker
          showTime
          style={{ width: '100%' }}
          format="DD/MM/YYYY HH:mm"
          value={dateRange}
          onChange={onDateRangeChange}
        />
      </Col>
    </Row>
  );
}

interface AlertsBatchBarProps {
  selectedCount: number;
  activeSelectedCount: number;
  batchBusy: boolean;
  onOpenBatchAck: () => void;
  onBatchResolve: () => void;
  onClearSelection: () => void;
}

function AlertsBatchBar({
  selectedCount,
  activeSelectedCount,
  batchBusy,
  onOpenBatchAck,
  onBatchResolve,
  onClearSelection,
}: AlertsBatchBarProps) {
  return (
    <div className="ps-batch-bar">
      <Space size={10} wrap>
        <span className="ps-tabular" style={{ fontWeight: 700, fontSize: 13.5 }}>
          {selectedCount} alerta(s) selecionado(s)
        </span>
        <Text style={{ color: '#94a3b8', fontSize: 12 }}>
          Reconheça ou resolva ocorrências correlacionadas em 1 ação
        </Text>
      </Space>

      <Space size={8} wrap>
        {activeSelectedCount > 0 && (
          <Button
            type="primary"
            icon={<CheckOutlined />}
            loading={batchBusy}
            onClick={onOpenBatchAck}
          >
            Reconhecer selecionados ({activeSelectedCount})
          </Button>
        )}
        <Popconfirm
          title={`Marcar ${selectedCount} alerta(s) como resolvido(s)?`}
          description="O status operacional dos equipamentos vinculados será recalculado."
          okText="Sim, resolver todos"
          cancelText="Cancelar"
          onConfirm={onBatchResolve}
        >
          <Button
            icon={<CheckCircleOutlined style={{ color: SEMANTIC_HEX.operational }} />}
            loading={batchBusy}
          >
            Resolver selecionados ({selectedCount})
          </Button>
        </Popconfirm>
        <Button
          type="text"
          icon={<CloseOutlined />}
          style={{ color: '#cbd5e1' }}
          onClick={onClearSelection}
        >
          Limpar
        </Button>
      </Space>
    </div>
  );
}

interface AlertsBatchAckModalProps {
  open: boolean;
  activeSelectedCount: number;
  batchBusy: boolean;
  batchNote: string;
  onBatchNoteChange: (note: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function AlertsBatchAckModal({
  open,
  activeSelectedCount,
  batchBusy,
  batchNote,
  onBatchNoteChange,
  onCancel,
  onConfirm,
}: AlertsBatchAckModalProps) {
  return (
    <Modal
      open={open}
      title={`Reconhecer ${activeSelectedCount} alerta(s) em lote`}
      okText="Confirmar Reconhecimento"
      cancelText="Cancelar"
      confirmLoading={batchBusy}
      onCancel={onCancel}
      onOk={onConfirm}
      destroyOnHidden
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Adicione uma observação compartilhada opcional para documentar a causa comum nas ocorrências selecionadas:
        </Text>
        <Input.TextArea
          rows={3}
          maxLength={500}
          showCount
          placeholder="Ex.: Queda de energia na concessionária às 14h20 — gerador assumiu."
          value={batchNote}
          onChange={(e) => onBatchNoteChange(e.target.value)}
        />
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginBottom: 6 }}>
            Notas rápidas (1 toque):
          </Text>
          <Space size={[6, 6]} wrap>
            {BATCH_NOTE_PRESETS.map((preset) => (
              <StatusPill key={preset} tone="neutral" onClick={() => onBatchNoteChange(preset)}>
                + {preset}
              </StatusPill>
            ))}
          </Space>
        </div>
      </Space>
    </Modal>
  );
}

interface AlertDetailDrawerProps {
  open: boolean;
  loading: boolean;
  detailAlert: AlertItem | null;
  realtimeSnapshot: RealtimeSnapshot | undefined;
  canWriteOperations: boolean;
  quickAckId: string | null;
  onClose: () => void;
  onNavigateEquipment: (alert: AlertItem) => void;
  onJumpToRules?: (equipmentId: string) => void;
  onQuickAck: (alert: AlertItem) => void;
  onAckWithNote: (alert: AlertItem) => void;
  onResolve: (alertId: string) => void;
}

function AlertDetailDrawer({
  open,
  loading,
  detailAlert,
  realtimeSnapshot,
  canWriteOperations,
  quickAckId,
  onClose,
  onNavigateEquipment,
  onJumpToRules,
  onQuickAck,
  onAckWithNote,
  onResolve,
}: AlertDetailDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Detalhes da Ocorrência"
      width={480}
      destroyOnHidden
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : detailAlert ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Equipamento">
              <Button
                type="link"
                className="ps-mono"
                style={{ padding: 0, fontWeight: 600 }}
                onClick={() => onNavigateEquipment(detailAlert)}
              >
                {detailAlert.serial || detailAlert.equipment_id}
              </Button>
            </Descriptions.Item>
            {realtimeSnapshot && (
              <Descriptions.Item label="Situação Agora">
                <LiveRecoveryBadge snapshot={realtimeSnapshot} />
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Tipo de Regra">
              {ALERT_TYPE_LABELS[detailAlert.type] || detailAlert.type}
            </Descriptions.Item>
            <Descriptions.Item label="Severidade">
              <StatusPill tone={resolveAlertSeverityTone(detailAlert.severity)} dot>
                {ALERT_SEVERITY_CONFIG[detailAlert.severity]?.label || detailAlert.severity}
              </StatusPill>
            </Descriptions.Item>
            <Descriptions.Item label="Status Atual">
              <StatusPill tone={resolveAlertStatusTone(detailAlert.status)}>
                {ALERT_STATUS_CONFIG[detailAlert.status]?.label || detailAlert.status}
              </StatusPill>
            </Descriptions.Item>
            <Descriptions.Item label="Disparado em">
              <span className="ps-tabular">{formatDateTimePtBR(detailAlert.created_at)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Reconhecido em">
              {detailAlert.acknowledged_at ? (
                <span className="ps-tabular">{formatDateTimePtBR(detailAlert.acknowledged_at)}</span>
              ) : (
                'Não reconhecido'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Resolvido em">
              {detailAlert.resolved_at ? (
                <span className="ps-tabular">{formatDateTimePtBR(detailAlert.resolved_at)}</span>
              ) : (
                'Em aberto'
              )}
            </Descriptions.Item>
          </Descriptions>

          <Card size="small" title="Mensagem do Alerta">
            <Paragraph style={{ marginBottom: 0 }}>{detailAlert.message}</Paragraph>
          </Card>

          {detailAlert.acknowledgment_notes && (
            <Card size="small" title="Notas de Reconhecimento">
              <Paragraph style={{ marginBottom: 0 }}>{detailAlert.acknowledgment_notes}</Paragraph>
            </Card>
          )}

          {canWriteOperations && onJumpToRules && (
            <Button
              block
              icon={<ControlOutlined />}
              onClick={() => {
                const eqId = detailAlert.equipment_id;
                onClose();
                onJumpToRules(eqId);
              }}
            >
              Inspecionar Regras e Limites desta Câmara ↗
            </Button>
          )}

          {canWriteOperations && detailAlert.status !== 'resolved' && (
            <Space wrap>
              {detailAlert.status === 'active' && (
                <>
                  <Button
                    icon={<CheckOutlined />}
                    loading={quickAckId === detailAlert.id}
                    onClick={() => onQuickAck(detailAlert)}
                  >
                    Reconhecer (1 clique)
                  </Button>
                  <Button icon={<FileDoneOutlined />} onClick={() => onAckWithNote(detailAlert)}>
                    Reconhecer com Notas
                  </Button>
                </>
              )}
              <Popconfirm
                title="Resolver este alerta agora?"
                okText="Resolver"
                cancelText="Cancelar"
                onConfirm={() => onResolve(detailAlert.id)}
              >
                <Button type="primary" icon={<CheckCircleOutlined />}>
                  Marcar como Resolvido
                </Button>
              </Popconfirm>
            </Space>
          )}
        </Space>
      ) : null}
    </Drawer>
  );
}

interface AlertsTableCardProps {
  loading: boolean;
  alerts: AlertItem[];
  columns: ColumnsType<AlertItem>;
  rowSelection: TableProps<AlertItem>['rowSelection'];
  pagination: PaginationMeta;
  onPageChange: (nextPage: number) => void;
}

function AlertsTableCard({
  loading,
  alerts,
  columns,
  rowSelection,
  pagination,
  onPageChange,
}: AlertsTableCardProps) {
  if (loading && alerts.length === 0) {
    return <WorkspaceSkeleton variant="grid" />;
  }
  return (
    <Card styles={{ body: { padding: alerts.length === 0 ? 36 : 0 } }}>
      {alerts.length === 0 ? (
        <Empty description="Nenhum alerta encontrado para os filtros aplicados." />
      ) : (
        <Table<AlertItem>
          rowKey="id"
          rowSelection={rowSelection}
          columns={columns}
          dataSource={alerts}
          scroll={{ x: 1060 }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.limit,
            total: pagination.total,
            showSizeChanger: false,
            style: { padding: '0 16px' },
            onChange: onPageChange,
          }}
        />
      )}
    </Card>
  );
}

interface AlertsStatsRightSlotProps {
  alertStats: AlertStatistics;
  statusTab: StatusTabKey;
  severityFilter: AlertSeverity | undefined;
  onSelectAllActive: () => void;
  onToggleSeverity: (severity: AlertSeverity) => void;
}

function AlertsStatsRightSlot({
  alertStats,
  statusTab,
  severityFilter,
  onSelectAllActive,
  onToggleSeverity,
}: AlertsStatsRightSlotProps) {
  const isAllActiveSelected = statusTab === 'active' && !severityFilter;
  const isCritSelected = statusTab === 'active' && severityFilter === 'critical';
  const isWarnSelected = statusTab === 'active' && severityFilter === 'warning';

  return (
    <>
      <StatMiniCard
        label="Alertas Ativos"
        value={alertStats.total_active || 0}
        selected={isAllActiveSelected}
        onClick={onSelectAllActive}
      />
      <StatMiniCard
        label="Críticos"
        value={alertStats.by_severity?.critical || 0}
        tone="critical"
        selected={isCritSelected}
        onClick={() => onToggleSeverity('critical')}
      />
      <StatMiniCard
        label="Em Atenção"
        value={alertStats.by_severity?.warning || 0}
        tone="warning"
        selected={isWarnSelected}
        onClick={() => onToggleSeverity('warning')}
      />
    </>
  );
}

interface BuildAlertsColumnsParams {
  canWriteOperations: boolean;
  quickAckId: string | null;
  realtimeById: Record<string, RealtimeSnapshot>;
  onNavigateEquipment: (alert: AlertItem) => void;
  onQuickAck: (record: AlertItem) => Promise<void>;
  onAckWithNote: (record: AlertItem) => void;
  onResolve: (recordOrId: AlertItem | string) => Promise<void>;
  onOpenDetails: (record: AlertItem) => void;
  onJumpToRules?: (equipmentId: string) => void;
}

function buildAlertsColumns({
  canWriteOperations,
  quickAckId,
  realtimeById,
  onNavigateEquipment,
  onQuickAck,
  onAckWithNote,
  onResolve,
  onOpenDetails,
  onJumpToRules,
}: BuildAlertsColumnsParams): ColumnsType<AlertItem> {
  return [
    {
      title: 'Severidade',
      dataIndex: 'severity',
      key: 'severity',
      width: 115,
      render: (sev: AlertSeverity) => {
        const cfg = ALERT_SEVERITY_CONFIG[sev] || { label: sev };
        return (
          <StatusPill tone={resolveAlertSeverityTone(sev)} dot>
            {cfg.label}
          </StatusPill>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 125,
      render: (st: AlertStatus) => {
        const cfg = ALERT_STATUS_CONFIG[st] || { label: st };
        return <StatusPill tone={resolveAlertStatusTone(st)}>{cfg.label}</StatusPill>;
      },
    },
    {
      title: 'Equipamento',
      dataIndex: 'serial',
      key: 'serial',
      width: 155,
      render: (serial: string | null | undefined, record) => (
        <Button
          type="link"
          className="ps-mono"
          style={{ padding: 0, fontWeight: 600 }}
          onClick={() => onNavigateEquipment(record)}
        >
          {serial || 'Ver unidade'}
        </Button>
      ),
    },
    {
      title: 'Situação Atual (Ao Vivo)',
      key: 'live_recovery',
      width: 215,
      render: (_, record) => {
        const snap = realtimeById[record.equipment_id];
        return snap ? (
          <LiveRecoveryBadge snapshot={snap} />
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            —
          </Text>
        );
      },
    },
    {
      title: 'Ocorrência',
      dataIndex: 'message',
      key: 'message',
      render: (msg: string, record) => (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>
            {ALERT_TYPE_LABELS[record.type] || record.type}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ps-text-secondary)' }}>{msg}</div>
          {record.acknowledgment_notes && (
            <Text type="secondary" style={{ fontSize: 11.5, fontStyle: 'italic' }}>
              Nota: {record.acknowledgment_notes}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Disparado em',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 165,
      render: (ts: string) => <span className="ps-tabular">{formatDateTimePtBR(ts)}</span>,
    },
    {
      title: 'Ações Rápidas',
      key: 'actions',
      width: canWriteOperations ? 230 : 130,
      render: (_, record) => (
        <AlertTriageActions
          alertItem={record}
          canWriteOperations={canWriteOperations}
          busy={quickAckId === record.id}
          onQuickAck={onQuickAck}
          onAckWithNote={onAckWithNote}
          onResolve={onResolve}
          resolveConfirmDescription="O status do equipamento será recalculado imediatamente."
          showReadOnlyLock
          extraActions={
            <>
              <Tooltip title="Ver detalhes completos da ocorrência">
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => onOpenDetails(record)}
                >
                  {!canWriteOperations ? 'Detalhes' : null}
                </Button>
              </Tooltip>

              {canWriteOperations && onJumpToRules && (
                <Tooltip title="Inspecionar limites e regras deste equipamento">
                  <Button
                    size="small"
                    type="text"
                    icon={<ControlOutlined />}
                    onClick={() => onJumpToRules(record.equipment_id)}
                    aria-label="Ver regras do equipamento"
                  />
                </Tooltip>
              )}
            </>
          }
        />
      ),
    },
  ];
}

export default function AlertsPage({ headerNav = null, onJumpToRules }: AlertsPageProps) {
  const { message } = AntdApp.useApp();
  const { canWriteOperations } = useAuth();
  const navigate = useNavigate();

  const [exportingCsv, setExportingCsv] = useState(false);
  const [quickAckId, setQuickAckId] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<StatusTabKey>('active');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | undefined>(undefined);
  const [branchFilter, setBranchFilter] = useState<string | undefined>(undefined);
  const [equipmentFilter, setEquipmentFilter] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [page, setPage] = useState(1);

  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [batchAckModalOpen, setBatchAckModalOpen] = useState(false);
  const [batchNote, setBatchNote] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);

  const [ackTarget, setAckTarget] = useState<AlertItem | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [detailAlert, setDetailAlert] = useState<AlertItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useSuspendShortcuts(Boolean(detailAlert));
  useSuspendShortcuts(batchAckModalOpen);

  const filterOptionsQuery = useQuery<{ branches: Branch[]; equipments: Equipment[] }>({
    queryKey: ['alerts', 'filter-options'],
    queryFn: async () => {
      const [branchRes, eqRes] = await Promise.all([
        getBranches({ limit: 100 }),
        getEquipments({ limit: 100 }),
      ]);
      return {
        branches: branchRes?.branches || [],
        equipments: eqRes?.equipment || [],
      };
    },
    staleTime: 60_000,
  });

  const branches = filterOptionsQuery.data?.branches ?? [];
  const equipments = filterOptionsQuery.data?.equipments ?? [];

  const buildFilterParams = useCallback((): GetAlertsParams => {
    const params: GetAlertsParams = {};
    if (statusTab !== 'all') {
      params.status = statusTab;
    }
    if (severityFilter) {
      params.severity = severityFilter;
    }
    if (branchFilter) {
      params.branch_id = branchFilter;
    }
    if (equipmentFilter) {
      params.equipment_id = equipmentFilter;
    }
    if (dateRange?.[0]) {
      params.start_date = dateRange[0].toISOString();
    }
    if (dateRange?.[1]) {
      params.end_date = dateRange[1].toISOString();
    }
    return params;
  }, [statusTab, severityFilter, branchFilter, equipmentFilter, dateRange]);

  const filterParams = useMemo(() => buildFilterParams(), [buildFilterParams]);

  const alertsQuery = useQuery<{
    alerts: AlertItem[];
    pagination: PaginationMeta;
    alertStats: AlertStatistics;
    realtimeById: Record<string, RealtimeSnapshot>;
  }>({
    queryKey: queryKeys.alerts.list({ page, branchFilter: branchFilter || null, ...filterParams }),
    queryFn: async () => {
      const statsParams: GetAlertStatisticsParams = branchFilter ? { branch_id: branchFilter } : {};
      const [res, statsRes, rtRes] = await Promise.all([
        getAlerts({ page, limit: 20, ...filterParams }),
        getAlertStatistics(statsParams),
        getRealtimeTelemetry(),
      ]);
      const rtMap: Record<string, RealtimeSnapshot> = {};
      if (rtRes?.equipment) {
        rtRes.equipment.forEach((snap) => {
          rtMap[snap.equipment_id] = snap;
        });
      }
      return {
        alerts: res?.alerts || [],
        pagination: res?.pagination || { page, limit: 20, total: 0 },
        alertStats: statsRes || EMPTY_ALERT_STATS,
        realtimeById: rtMap,
      };
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });

  const alerts = useMemo(() => alertsQuery.data?.alerts ?? [], [alertsQuery.data]);
  const pagination = alertsQuery.data?.pagination ?? { page, limit: 20, total: 0 };
  const alertStats = alertsQuery.data?.alertStats ?? EMPTY_ALERT_STATS;
  const realtimeById = alertsQuery.data?.realtimeById ?? {};
  const loading = alertsQuery.isPending;
  const refreshing = alertsQuery.isFetching;
  const pollError = alertsQuery.isError;
  const lastRefreshedAt = alertsQuery.dataUpdatedAt
    ? new Date(alertsQuery.dataUpdatedAt).toISOString()
    : null;

  const fetchAlerts = useCallback(
    async (_silent = false) => {
      await alertsQuery.refetch();
    },
    [alertsQuery]
  );

  const notifyBadgeRefresh = () => {
    void invalidateAlertQueries();
  };

  const selectedRecords = useMemo(
    () => alerts.filter((a) => selectedRowKeys.includes(a.id)),
    [alerts, selectedRowKeys]
  );

  const activeSelectedIds = useMemo(
    () => selectedRecords.filter((a) => a.status === 'active').map((a) => a.id),
    [selectedRecords]
  );

  const handleQuickAcknowledge = async (record: AlertItem) => {
    setQuickAckId(record.id);
    try {
      const updated = await acknowledgeAlert(record.id, '');
      message.success(`Alerta de ${record.serial || 'equipamento'} reconhecido.`);
      if (detailAlert?.id === record.id) {
        setDetailAlert(updated);
      }
      notifyBadgeRefresh();
      await fetchAlerts(true);
    } catch (err) {
      message.error(extractApiError(err, 'Não foi possível reconhecer o alerta.'));
    } finally {
      setQuickAckId(null);
    }
  };

  const handleResolve = async (recordOrId: AlertItem | string) => {
    const alertId = typeof recordOrId === 'object' ? recordOrId.id : recordOrId;
    try {
      const updated = await resolveAlert(alertId);
      message.success('Alerta resolvido com sucesso.');
      setSelectedRowKeys((prev) => prev.filter((k) => k !== alertId));
      if (detailAlert?.id === alertId) {
        setDetailAlert(updated);
      }
      notifyBadgeRefresh();
      await fetchAlerts(true);
    } catch (err) {
      message.error(extractApiError(err, 'Não foi possível resolver o alerta.'));
    }
  };

  const handleBatchAcknowledgeConfirm = async () => {
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
        setBatchAckModalOpen(false);
        setBatchNote('');
        setSelectedRowKeys([]);
        notifyBadgeRefresh();
        await fetchAlerts(true);
      } else {
        message.error('Não foi possível reconhecer os alertas selecionados.');
      }
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchResolveConfirm = async () => {
    if (selectedRowKeys.length === 0) return;
    setBatchBusy(true);
    try {
      const results = await Promise.allSettled(
        selectedRowKeys.map((id) => resolveAlert(String(id)))
      );
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      if (okCount > 0) {
        message.success(`${okCount} alerta(s) resolvido(s) em lote.`);
        setSelectedRowKeys([]);
        notifyBadgeRefresh();
        await fetchAlerts(true);
      } else {
        message.error('Não foi possível resolver os alertas selecionados.');
      }
    } finally {
      setBatchBusy(false);
    }
  };

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const resp = await exportAlertsCsv(buildFilterParams());
      downloadCsvResponse(resp, 'alertas_export.csv');
      message.success('Exportação CSV de alertas concluída.');
    } catch (err) {
      const msg = await extractBlobApiError(err, 'Erro ao exportar alertas em CSV.');
      message.error(msg);
    } finally {
      setExportingCsv(false);
    }
  };

  const handleOpenDetails = async (record: AlertItem) => {
    setDetailDrawerOpen(true);
    setDetailAlert(record);
    setDetailLoading(true);
    try {
      const full = await getAlert(record.id);
      setDetailAlert(full);
    } catch {
      // Mantém os dados da linha caso falhe
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetails = () => {
    setDetailDrawerOpen(false);
    setDetailAlert(null);
  };

  const columns = buildAlertsColumns({
    canWriteOperations,
    quickAckId,
    realtimeById,
    onNavigateEquipment: (record) => {
      void navigate(resolveAlertEquipmentPath(record));
    },
    onQuickAck: handleQuickAcknowledge,
    onAckWithNote: setAckTarget,
    onResolve: handleResolve,
    onOpenDetails: (record) => {
      void handleOpenDetails(record);
    },
    onJumpToRules,
  });

  const rowSelection: TableProps<AlertItem>['rowSelection'] = canWriteOperations
    ? {
        selectedRowKeys,
        onChange: (keys: Key[]) => setSelectedRowKeys(keys),
        getCheckboxProps: (record: AlertItem) => ({
          disabled: record.status === 'resolved',
        }),
      }
    : undefined;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <PageHeader
        title="Central de Alertas"
        align="center"
        titleBadges={
          <LivePulseBadge
            hasError={pollError}
            lastRefreshedAt={lastRefreshedAt}
            intervalLabel="Monitoramento contínuo de ocorrências a cada 30 segundos"
          />
        }
        subtitle="Triagem rápida, acompanhamento de recuperação ao vivo e histórico auditável de incidentes."
        rightSlot={
          <AlertsStatsRightSlot
            alertStats={alertStats}
            statusTab={statusTab}
            severityFilter={severityFilter}
            onSelectAllActive={() => {
              setStatusTab('active');
              setSeverityFilter(undefined);
              setSelectedRowKeys([]);
              setPage(1);
            }}
            onToggleSeverity={(sev) => {
              setStatusTab('active');
              setSeverityFilter((prev) => (prev === sev ? undefined : sev));
              setSelectedRowKeys([]);
              setPage(1);
            }}
          />
        }
      />

      <div className="ps-toolbar-row">
        <Space size={10} wrap>
          {headerNav}
          <Segmented<StatusTabKey>
            className="ps-pill-switcher"
            value={statusTab}
            onChange={(key) => {
              setStatusTab(key);
              setSelectedRowKeys([]);
              setPage(1);
            }}
            options={[
              { value: 'active', label: 'Ativos' },
              { value: 'acknowledged', label: 'Reconhecidos' },
              { value: 'resolved', label: 'Resolvidos' },
              { value: 'all', label: 'Todos os Alertas' },
            ]}
          />
        </Space>

        <Space wrap>
          <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
            Filtrados: <strong className="ps-tabular">{pagination.total}</strong>
          </Text>
          <Button
            icon={<DownloadOutlined />}
            loading={exportingCsv}
            onClick={() => {
              void handleExportCsv();
            }}
          >
            Exportar CSV
          </Button>
          <Button
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={() => {
              void fetchAlerts(true);
            }}
            loading={refreshing}
          >
            Atualizar
          </Button>
        </Space>
      </div>

      <AlertsFilterBar
        branches={branches}
        equipments={equipments}
        severityFilter={severityFilter}
        branchFilter={branchFilter}
        equipmentFilter={equipmentFilter}
        dateRange={dateRange}
        onSeverityChange={(val) => {
          setSeverityFilter(val);
          setSelectedRowKeys([]);
          setPage(1);
        }}
        onBranchChange={(val) => {
          setBranchFilter(val);
          setEquipmentFilter(undefined);
          setSelectedRowKeys([]);
          setPage(1);
        }}
        onEquipmentChange={(val) => {
          setEquipmentFilter(val);
          setSelectedRowKeys([]);
          setPage(1);
        }}
        onDateRangeChange={(vals) => {
          setDateRange(vals);
          setSelectedRowKeys([]);
          setPage(1);
        }}
      />

      <AlertsTableCard
        loading={loading}
        alerts={alerts}
        columns={columns}
        rowSelection={rowSelection}
        pagination={pagination}
        onPageChange={(nextPage) => {
          setSelectedRowKeys([]);
          setPage(nextPage);
        }}
      />

      {canWriteOperations && selectedRowKeys.length > 0 && (
        <AlertsBatchBar
          selectedCount={selectedRowKeys.length}
          activeSelectedCount={activeSelectedIds.length}
          batchBusy={batchBusy}
          onOpenBatchAck={() => setBatchAckModalOpen(true)}
          onBatchResolve={() => {
            void handleBatchResolveConfirm();
          }}
          onClearSelection={() => setSelectedRowKeys([])}
        />
      )}

      <AlertsBatchAckModal
        open={batchAckModalOpen}
        activeSelectedCount={activeSelectedIds.length}
        batchBusy={batchBusy}
        batchNote={batchNote}
        onBatchNoteChange={setBatchNote}
        onCancel={() => setBatchAckModalOpen(false)}
        onConfirm={() => {
          void handleBatchAcknowledgeConfirm();
        }}
      />

      <AcknowledgeAlertModal
        open={Boolean(ackTarget)}
        onClose={() => setAckTarget(null)}
        alertItem={ackTarget}
        onSuccess={(updated: AlertItem) => {
          setAckTarget(null);
          if (detailAlert?.id === updated.id) {
            setDetailAlert(updated);
          }
          notifyBadgeRefresh();
          void fetchAlerts(true);
        }}
      />

      <AlertDetailDrawer
        open={detailDrawerOpen}
        loading={detailLoading}
        detailAlert={detailAlert}
        realtimeSnapshot={detailAlert ? realtimeById[detailAlert.equipment_id] : undefined}
        canWriteOperations={canWriteOperations}
        quickAckId={quickAckId}
        onClose={handleCloseDetails}
        onNavigateEquipment={(alert) => {
          void navigate(resolveAlertEquipmentPath(alert));
        }}
        onJumpToRules={onJumpToRules}
        onQuickAck={(alert) => {
          void handleQuickAcknowledge(alert);
        }}
        onAckWithNote={setAckTarget}
        onResolve={(alertId) => {
          void handleResolve(alertId);
        }}
      />
    </Space>
  );
}
