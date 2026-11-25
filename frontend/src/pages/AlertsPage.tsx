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
  SlidersOutlined,
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
  Grid,
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
import { AccentCard, PageHeader, StatMiniCard, StatusPill } from '../components/ui';
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
  formatRelativeTimePtBR,
} from '../utils/formatters';

const { Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

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
          aria-label="Filtrar por severidade"
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
            aria-label="Filtrar por filial"
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
          aria-label="Filtrar por equipamento"
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

interface MobileAlertsFeedProps {
  loading: boolean;
  alerts: AlertItem[];
  realtimeById: Record<string, RealtimeSnapshot>;
  canWriteOperations: boolean;
  quickAckId: string | null;
  onNavigateEquipment: (alert: AlertItem) => void;
  onOpenDetails: (alert: AlertItem) => void;
  onQuickAck: (alert: AlertItem) => void;
  onResolve: (alert: AlertItem) => void;
}

function MobileAlertsFeed({
  loading,
  alerts,
  realtimeById,
  canWriteOperations,
  quickAckId,
  onNavigateEquipment,
  onOpenDetails,
  onQuickAck,
  onResolve,
}: MobileAlertsFeedProps) {
  if (loading && alerts.length === 0) {
    return <WorkspaceSkeleton variant="grid" />;
  }
  if (alerts.length === 0) {
    return (
      <Card style={{ borderRadius: 16 }}>
        <Empty description="Nenhum alerta encontrado para os filtros aplicados." />
      </Card>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {alerts.map((alert) => {
        const accent = alert.severity === 'critical' ? 'critical' : 'warning';
        const dotColor = alert.severity === 'critical' ? '#b91c1c' : '#b45309';
        const snap = realtimeById[alert.equipment_id];
        const canTriage = canWriteOperations && alert.status !== 'resolved';
        return (
          <AccentCard key={alert.id} status={accent} padding="20px" gap={12}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: dotColor,
                    flexShrink: 0,
                  }}
                />
                <button
                  type="button"
                  className="ps-mono"
                  onClick={() => onNavigateEquipment(alert)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: '4px 0',
                    minHeight: 28,
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--ps-text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {alert.serial || 'Equipamento'}
                </button>
              </div>
              <span className="ps-tabular" style={{ fontSize: 12.5, color: 'var(--ps-text-secondary)', flexShrink: 0 }}>
                {formatRelativeTimePtBR(alert.created_at)}
              </span>
            </div>

            <div style={{ fontSize: 14.5, lineHeight: 1.45, color: 'var(--ps-text-primary)' }}>
              {alert.message}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              {snap ? (
                <LiveRecoveryBadge snapshot={snap} />
              ) : (
                <span style={{ fontSize: 12.5, color: 'var(--ps-text-secondary)' }}>
                  {ALERT_TYPE_LABELS[alert.type] || alert.type}
                </span>
              )}
              <button
                type="button"
                onClick={() => onOpenDetails(alert)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '4px 0',
                  minHeight: 28,
                  color: '#1d4ed8',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Detalhes
              </button>
            </div>

            {canTriage && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: alert.status === 'active' ? '1fr 1fr' : '1fr',
                  gap: 10,
                  marginTop: 4,
                }}
              >
                {alert.status === 'active' && (
                  <Button
                    loading={quickAckId === alert.id}
                    onClick={() => onQuickAck(alert)}
                    style={{ height: 42, borderRadius: 999, fontWeight: 600 }}
                  >
                    Reconhecer
                  </Button>
                )}
                <Popconfirm
                  title="Resolver este alerta agora?"
                  okText="Resolver"
                  cancelText="Cancelar"
                  onConfirm={() => onResolve(alert)}
                >
                  <Button
                    type="primary"
                    style={{ height: 42, borderRadius: 999, fontWeight: 600 }}
                  >
                    Resolver
                  </Button>
                </Popconfirm>
              </div>
            )}
          </AccentCard>
        );
      })}
    </div>
  );
}

interface MobileAlertsSectionProps {
  headerNav: ReactNode;
  activeFilterCount: number;
  alertStats: AlertStatistics;
  statusTab: StatusTabKey;
  onStatusTabChange: (key: StatusTabKey) => void;
  loading: boolean;
  alerts: AlertItem[];
  realtimeById: Record<string, RealtimeSnapshot>;
  canWriteOperations: boolean;
  quickAckId: string | null;
  mobileFiltersOpen: boolean;
  onOpenMobileFilters: () => void;
  onCloseMobileFilters: () => void;
  filterBarNode: ReactNode;
  exportingCsv: boolean;
  refreshing: boolean;
  onExportCsv: () => void;
  onRefresh: () => void;
  onNavigateEquipment: (alert: AlertItem) => void;
  onOpenDetails: (alert: AlertItem) => void;
  onQuickAck: (alert: AlertItem) => void;
  onResolve: (alert: AlertItem) => void;
}

function MobileAlertsSection({
  headerNav,
  activeFilterCount,
  alertStats,
  statusTab,
  onStatusTabChange,
  loading,
  alerts,
  realtimeById,
  canWriteOperations,
  quickAckId,
  mobileFiltersOpen,
  onOpenMobileFilters,
  onCloseMobileFilters,
  filterBarNode,
  exportingCsv,
  refreshing,
  onExportCsv,
  onRefresh,
  onNavigateEquipment,
  onOpenDetails,
  onQuickAck,
  onResolve,
}: MobileAlertsSectionProps) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--ps-text-primary)',
          }}
        >
          Central de Alertas
        </h1>
        <Button
          icon={<SlidersOutlined />}
          type={activeFilterCount > 0 ? 'primary' : 'default'}
          ghost={activeFilterCount > 0}
          aria-label="Abrir filtros de alertas"
          onClick={onOpenMobileFilters}
          style={{ borderRadius: 999 }}
        />
      </div>

      {headerNav && <div className="ps-segmented-scroll">{headerNav}</div>}

      <Segmented<StatusTabKey>
        block
        className="ps-pill-switcher"
        value={statusTab === 'acknowledged' || statusTab === 'all' ? 'active' : statusTab}
        onChange={onStatusTabChange}
        options={[
          { value: 'active', label: `Ativos (${alertStats.total_active || 0})` },
          { value: 'resolved', label: 'Resolvidos' },
        ]}
      />

      <MobileAlertsFeed
        loading={loading}
        alerts={alerts}
        realtimeById={realtimeById}
        canWriteOperations={canWriteOperations}
        quickAckId={quickAckId}
        onNavigateEquipment={onNavigateEquipment}
        onOpenDetails={onOpenDetails}
        onQuickAck={onQuickAck}
        onResolve={onResolve}
      />

      <Drawer
        open={mobileFiltersOpen}
        onClose={onCloseMobileFilters}
        placement="bottom"
        height="auto"
        title="Filtros de Alertas"
        styles={{ body: { padding: '16px 18px 28px' } }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Segmented<StatusTabKey>
            block
            className="ps-pill-switcher"
            value={statusTab}
            onChange={onStatusTabChange}
            options={[
              { value: 'active', label: 'Ativos' },
              { value: 'acknowledged', label: 'Reconhecidos' },
              { value: 'resolved', label: 'Resolvidos' },
              { value: 'all', label: 'Todos' },
            ]}
          />
          {filterBarNode}
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button icon={<DownloadOutlined />} loading={exportingCsv} onClick={onExportCsv}>
              Exportar CSV
            </Button>
            <Button icon={<ReloadOutlined spin={refreshing} />} loading={refreshing} onClick={onRefresh}>
              Atualizar
            </Button>
          </Space>
        </Space>
      </Drawer>
    </>
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

function countActiveAlertFilters(params: {
  severityFilter?: AlertSeverity;
  branchFilter?: string;
  equipmentFilter?: string;
  dateRange: [Dayjs | null, Dayjs | null] | null;
}): number {
  return [
    Boolean(params.severityFilter),
    Boolean(params.branchFilter),
    Boolean(params.equipmentFilter),
    Boolean(params.dateRange?.[0] || params.dateRange?.[1]),
  ].filter(Boolean).length;
}

interface DesktopAlertsSectionProps {
  headerNav: ReactNode;
  pollError: boolean;
  lastRefreshedAt: string | null;
  alertStats: AlertStatistics;
  statusTab: StatusTabKey;
  severityFilter: AlertSeverity | undefined;
  pagination: PaginationMeta;
  exportingCsv: boolean;
  refreshing: boolean;
  loading: boolean;
  alerts: AlertItem[];
  columns: ColumnsType<AlertItem>;
  rowSelection: TableProps<AlertItem>['rowSelection'];
  filterBarNode: ReactNode;
  onSelectAllActive: () => void;
  onToggleSeverity: (sev: AlertSeverity) => void;
  onStatusTabChange: (key: StatusTabKey) => void;
  onExportCsv: () => void;
  onRefresh: () => void;
  onPageChange: (nextPage: number) => void;
}

function DesktopAlertsSection({
  headerNav,
  pollError,
  lastRefreshedAt,
  alertStats,
  statusTab,
  severityFilter,
  pagination,
  exportingCsv,
  refreshing,
  loading,
  alerts,
  columns,
  rowSelection,
  filterBarNode,
  onSelectAllActive,
  onToggleSeverity,
  onStatusTabChange,
  onExportCsv,
  onRefresh,
  onPageChange,
}: DesktopAlertsSectionProps) {
  return (
    <>
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
            onSelectAllActive={onSelectAllActive}
            onToggleSeverity={onToggleSeverity}
          />
        }
      />

      <div className="ps-toolbar-row">
        <Space size={10} wrap style={{ maxWidth: '100%' }}>
          {headerNav}
          <div className="ps-segmented-scroll">
            <Segmented<StatusTabKey>
              className="ps-pill-switcher"
              value={statusTab}
              onChange={onStatusTabChange}
              options={[
                { value: 'active', label: 'Ativos' },
                { value: 'acknowledged', label: 'Reconhecidos' },
                { value: 'resolved', label: 'Resolvidos' },
                { value: 'all', label: 'Todos' },
              ]}
            />
          </div>
        </Space>

        <Space wrap>
          <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
            Filtrados: <strong className="ps-tabular">{pagination.total}</strong>
          </Text>
          <Button icon={<DownloadOutlined />} loading={exportingCsv} onClick={onExportCsv}>
            Exportar CSV
          </Button>
          <Button
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={onRefresh}
            loading={refreshing}
          >
            Atualizar
          </Button>
        </Space>
      </div>

      {filterBarNode}

      <AlertsTableCard
        loading={loading}
        alerts={alerts}
        columns={columns}
        rowSelection={rowSelection}
        pagination={pagination}
        onPageChange={onPageChange}
      />
    </>
  );
}

export default function AlertsPage({ headerNav = null, onJumpToRules }: AlertsPageProps) {
  const { message } = AntdApp.useApp();
  const { canWriteOperations } = useAuth();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobilePhone = !screens.md;

  const [exportingCsv, setExportingCsv] = useState(false);
  const [quickAckId, setQuickAckId] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
        pagination: res?.pagination || { page, limit: 20, total: 0, total_pages: 0 },
        alertStats: statsRes || EMPTY_ALERT_STATS,
        realtimeById: rtMap,
      };
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });

  const alerts = useMemo(() => alertsQuery.data?.alerts ?? [], [alertsQuery.data]);
  const pagination = alertsQuery.data?.pagination ?? { page, limit: 20, total: 0, total_pages: 0 };
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

  const activeFilterCount = countActiveAlertFilters({
    severityFilter,
    branchFilter,
    equipmentFilter,
    dateRange,
  });

  const filterBarNode = (
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
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {isMobilePhone ? (
        <MobileAlertsSection
          headerNav={headerNav}
          activeFilterCount={activeFilterCount}
          alertStats={alertStats}
          statusTab={statusTab}
          onStatusTabChange={(key) => {
            setStatusTab(key);
            setSelectedRowKeys([]);
            setPage(1);
          }}
          loading={loading}
          alerts={alerts}
          realtimeById={realtimeById}
          canWriteOperations={canWriteOperations}
          quickAckId={quickAckId}
          mobileFiltersOpen={mobileFiltersOpen}
          onOpenMobileFilters={() => setMobileFiltersOpen(true)}
          onCloseMobileFilters={() => setMobileFiltersOpen(false)}
          filterBarNode={filterBarNode}
          exportingCsv={exportingCsv}
          refreshing={refreshing}
          onExportCsv={() => {
            void handleExportCsv();
          }}
          onRefresh={() => {
            void fetchAlerts(true);
          }}
          onNavigateEquipment={(alert) => {
            void navigate(resolveAlertEquipmentPath(alert));
          }}
          onOpenDetails={(alert) => {
            void handleOpenDetails(alert);
          }}
          onQuickAck={(alert) => {
            void handleQuickAcknowledge(alert);
          }}
          onResolve={(alert) => {
            void handleResolve(alert);
          }}
        />
      ) : (
        <DesktopAlertsSection
          headerNav={headerNav}
          pollError={pollError}
          lastRefreshedAt={lastRefreshedAt}
          alertStats={alertStats}
          statusTab={statusTab}
          severityFilter={severityFilter}
          pagination={pagination}
          exportingCsv={exportingCsv}
          refreshing={refreshing}
          loading={loading}
          alerts={alerts}
          columns={columns}
          rowSelection={rowSelection}
          filterBarNode={filterBarNode}
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
          onStatusTabChange={(key) => {
            setStatusTab(key);
            setSelectedRowKeys([]);
            setPage(1);
          }}
          onExportCsv={() => {
            void handleExportCsv();
          }}
          onRefresh={() => {
            void fetchAlerts(true);
          }}
          onPageChange={(nextPage) => {
            setSelectedRowKeys([]);
            setPage(nextPage);
          }}
        />
      )}

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
