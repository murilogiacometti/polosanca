import { type ReactNode, useMemo, useState } from 'react';
import {
  BarChartOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Empty,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  deleteAlertRule,
  getAlertRules,
  getAlertRuleStatistics,
  getCompanies,
  getEquipmentAlertRules,
  getEquipments,
  updateAlertRule,
  type GetAlertRulesParams,
} from '../api';
import WorkspaceSkeleton from '../components/Common/WorkspaceSkeleton';
import AlertRuleModalForm, { type AlertRuleRecord } from '../components/Modals/AlertRuleModalForm';
import AlertRuleStatsModal from '../components/Modals/AlertRuleStatsModal';
import AlertRulePrecedenceCard from '../components/Operations/AlertRulePrecedenceCard';
import { PageHeader, RowActionMenu, StatusPill } from '../components/ui';
import { useAuth } from '../context/authContextObject';
import {
  confirmWithShortcutLock,
  useSuspendShortcuts,
  useUiShell,
} from '../context/uiShellContextObject';
import { resolveAlertSeverityTone } from '../theme/tokens';
import type {
  AlertRuleStatistics,
  AlertScope,
  AlertSeverity,
  AlertType,
  Company,
  Equipment,
  PaginationMeta,
} from '../types/models';
import {
  ALERT_SCOPE_LABELS,
  ALERT_SEVERITY_CONFIG,
  ALERT_TYPE_LABELS,
  ALERT_TYPE_OPTIONS,
  extractApiError,
  formatAlertRuleCondition,
} from '../utils/formatters';

const { Text } = Typography;

export interface AlertRulesPageProps {
  headerNav?: ReactNode;
  initialInspectEquipmentId?: string;
}

interface AlertRulesFilterBarProps {
  scopeFilter: AlertScope | undefined;
  typeFilter: AlertType | undefined;
  activeFilter: 'true' | 'false' | undefined;
  onScopeChange: (val: AlertScope | undefined) => void;
  onTypeChange: (val: AlertType | undefined) => void;
  onActiveChange: (val: 'true' | 'false' | undefined) => void;
}

function AlertRulesFilterBar({
  scopeFilter,
  typeFilter,
  activeFilter,
  onScopeChange,
  onTypeChange,
  onActiveChange,
}: AlertRulesFilterBarProps) {
  return (
    <Row gutter={[10, 10]}>
      <Col xs={24} sm={8}>
        <Select<AlertScope>
          allowClear
          style={{ width: '100%' }}
          placeholder="Filtrar por escopo"
          value={scopeFilter}
          onChange={onScopeChange}
          options={[
            { value: 'global', label: 'Global' },
            { value: 'company', label: 'Empresa' },
            { value: 'equipment', label: 'Equipamento' },
          ]}
        />
      </Col>

      <Col xs={24} sm={8}>
        <Select<AlertType>
          allowClear
          style={{ width: '100%' }}
          placeholder="Filtrar por tipo de monitoramento"
          value={typeFilter}
          onChange={onTypeChange}
          options={ALERT_TYPE_OPTIONS}
        />
      </Col>

      <Col xs={24} sm={8}>
        <Select<'true' | 'false'>
          allowClear
          style={{ width: '100%' }}
          placeholder="Filtrar por ativação"
          value={activeFilter}
          onChange={onActiveChange}
          options={[
            { value: 'true', label: 'Apenas Regras Ativas' },
            { value: 'false', label: 'Apenas Regras Inativas' },
          ]}
        />
      </Col>
    </Row>
  );
}

interface AlertRulesTableCardProps {
  loading: boolean;
  rules: AlertRuleRecord[];
  columns: ColumnsType<AlertRuleRecord>;
  pagination: PaginationMeta;
  onPageChange: (nextPage: number) => void;
}

function AlertRulesTableCard({
  loading,
  rules,
  columns,
  pagination,
  onPageChange,
}: AlertRulesTableCardProps) {
  if (loading && rules.length === 0) {
    return <WorkspaceSkeleton variant="grid" />;
  }
  return (
    <Card styles={{ body: { padding: rules.length === 0 ? 36 : 0 } }}>
      {rules.length === 0 ? (
        <Empty description="Nenhuma regra de alerta encontrada." />
      ) : (
        <Table<AlertRuleRecord>
          rowKey="id"
          columns={columns}
          dataSource={rules}
          scroll={{ x: 960 }}
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

interface AlertRuleFormModalProps {
  open: boolean;
  editingRule: AlertRuleRecord | null;
  companies: Company[];
  equipments: Equipment[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}

function AlertRuleFormModal({
  open,
  editingRule,
  companies,
  equipments,
  onCancel,
  onSaved,
}: AlertRuleFormModalProps) {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnHidden
      title={editingRule ? 'Editar Regra de Alerta' : 'Nova Regra de Alerta'}
      width={620}
    >
      {open && (
        <AlertRuleModalForm
          rule={editingRule}
          companies={companies}
          equipments={equipments}
          onCancel={onCancel}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}

interface BuildAlertRuleColumnsParams {
  isGlobalAdmin: boolean;
  companyMap: Record<string, string>;
  equipmentMap: Record<string, string>;
  onToggleActive: (rule: AlertRuleRecord, checked: boolean) => void;
  onOpenStats: (rule: AlertRuleRecord) => void;
  onEdit: (rule: AlertRuleRecord) => void;
  onRequestDelete: (rule: AlertRuleRecord) => void;
}

function buildAlertRuleColumns({
  isGlobalAdmin,
  companyMap,
  equipmentMap,
  onToggleActive,
  onOpenStats,
  onEdit,
  onRequestDelete,
}: BuildAlertRuleColumnsParams): ColumnsType<AlertRuleRecord> {
  return [
    {
      title: 'Nome da Regra',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, r) => (
        <div>
          <strong>{name}</strong>
          {r.description && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {r.description}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Escopo / Alvo',
      key: 'scope',
      render: (_, r) => {
        let target: string | null | undefined = 'Todas as empresas';
        if (r.scope === 'company') {
          target = (r.scope_id ? companyMap[r.scope_id] : undefined) || 'Empresa vinculada';
        } else if (r.scope === 'equipment') {
          target = (r.scope_id ? equipmentMap[r.scope_id] : undefined) || r.scope_id;
        }
        return (
          <div>
            <StatusPill tone="neutral">{ALERT_SCOPE_LABELS[r.scope] || r.scope}</StatusPill>
            <div
              className={r.scope === 'equipment' ? 'ps-mono' : undefined}
              style={{ fontSize: 12, color: 'var(--ps-text-secondary)', marginTop: 2 }}
            >
              {target}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Tipo',
      dataIndex: 'rule_type',
      key: 'rule_type',
      render: (t: AlertType) => ALERT_TYPE_LABELS[t] || t,
    },
    {
      title: 'Condição e Persistência',
      key: 'condition',
      render: (_, r) => <span className="ps-tabular">{formatAlertRuleCondition(r)}</span>,
    },
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
      dataIndex: 'is_active',
      key: 'is_active',
      width: 115,
      render: (active: boolean, record) =>
        isGlobalAdmin ? (
          <Switch
            size="small"
            checked={active}
            checkedChildren="Ativa"
            unCheckedChildren="Inativa"
            onChange={(checked) => onToggleActive(record, checked)}
          />
        ) : active ? (
          <StatusPill tone="operational" dot>
            Ativa
          </StatusPill>
        ) : (
          <StatusPill tone="offline">Inativa</StatusPill>
        ),
    },
    ...(isGlobalAdmin
      ? ([
          {
            title: 'Ações',
            key: 'actions',
            width: 64,
            align: 'right',
            render: (_, record) => (
              <RowActionMenu
                ariaLabel={`Ações para ${record.name}`}
                items={[
                  {
                    key: 'stats',
                    icon: <BarChartOutlined />,
                    label: 'Estatísticas de Disparo',
                    onClick: () => onOpenStats(record),
                  },
                  {
                    key: 'edit',
                    icon: <EditOutlined />,
                    label: 'Editar Regra',
                    onClick: () => onEdit(record),
                  },
                  { type: 'divider' },
                  {
                    key: 'delete',
                    icon: <DeleteOutlined />,
                    danger: true,
                    label: 'Excluir Regra',
                    onClick: () => onRequestDelete(record),
                  },
                ]}
              />
            ),
          },
        ] satisfies ColumnsType<AlertRuleRecord>)
      : []),
  ];
}

export default function AlertRulesPage({
  headerNav = null,
  initialInspectEquipmentId = undefined,
}: AlertRulesPageProps) {
  const { message, modal } = AntdApp.useApp();
  const { isGlobalAdmin } = useAuth();
  const { acquireShortcutLock } = useUiShell();
  const qc = useQueryClient();

  const [scopeFilter, setScopeFilter] = useState<AlertScope | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<AlertType | undefined>(undefined);
  const [activeFilter, setActiveFilter] = useState<'true' | 'false' | undefined>(undefined);
  const [page, setPage] = useState(1);

  const [selectedInspectEquipmentId, setSelectedInspectEquipmentId] = useState<
    string | undefined
  >(undefined);
  const inspectedEquipmentId = selectedInspectEquipmentId ?? initialInspectEquipmentId;

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRuleRecord | null>(null);
  const [statsModalRule, setStatsModalRule] = useState<AlertRuleRecord | null>(null);
  const [ruleStats, setRuleStats] = useState<AlertRuleStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useSuspendShortcuts(ruleModalOpen || Boolean(statsModalRule));

  const auxiliaryQuery = useQuery<{ equipments: Equipment[]; companies: Company[] }>({
    queryKey: ['alert-rules', 'auxiliary', isGlobalAdmin],
    queryFn: async () => {
      const [eqRes, compRes] = await Promise.all([
        getEquipments({ limit: 100 }),
        isGlobalAdmin ? getCompanies({ limit: 100 }) : Promise.resolve(null),
      ]);
      return {
        equipments: eqRes?.equipment || [],
        companies: compRes?.companies || [],
      };
    },
    staleTime: 60_000,
  });

  const equipments = auxiliaryQuery.data?.equipments ?? [];
  const companies = auxiliaryQuery.data?.companies ?? [];

  const rulesParams = useMemo<GetAlertRulesParams>(() => {
    const params: GetAlertRulesParams = { page, limit: 20 };
    if (scopeFilter) params.scope = scopeFilter;
    if (typeFilter) params.rule_type = typeFilter;
    if (activeFilter !== undefined) params.is_active = activeFilter;
    return params;
  }, [page, scopeFilter, typeFilter, activeFilter]);

  const rulesQuery = useQuery<{ alert_rules: AlertRuleRecord[]; pagination: PaginationMeta }>({
    queryKey: ['alert-rules', 'list', rulesParams],
    queryFn: async () => {
      const res = await getAlertRules(rulesParams);
      return {
        alert_rules: res?.alert_rules || [],
        pagination: res?.pagination || { page: 1, limit: 20, total: 0 },
      };
    },
    placeholderData: keepPreviousData,
  });

  const inspectedRulesQuery = useQuery<AlertRuleRecord[]>({
    queryKey: ['alert-rules', 'inspect', inspectedEquipmentId ?? null],
    enabled: Boolean(inspectedEquipmentId),
    queryFn: async () => {
      if (!inspectedEquipmentId) return [];
      const res = await getEquipmentAlertRules(inspectedEquipmentId);
      return res?.applicable_rules || [];
    },
  });

  const rules = rulesQuery.data?.alert_rules ?? [];
  const pagination = rulesQuery.data?.pagination ?? { page: 1, limit: 20, total: 0 };
  const loading = rulesQuery.isFetching;
  const inspectedRules = inspectedEquipmentId ? (inspectedRulesQuery.data ?? []) : [];
  const inspectingLoading = inspectedRulesQuery.isFetching;

  const fetchRules = async () => {
    await qc.invalidateQueries({ queryKey: ['alert-rules'] });
  };

  const handleInspectEquipment = (eqId: string | undefined) => {
    setSelectedInspectEquipmentId(eqId);
  };

  const handleToggleRuleActive = async (rule: AlertRuleRecord, checked: boolean) => {
    try {
      await updateAlertRule(rule.id, { is_active: checked });
      message.success(checked ? 'Regra ativada.' : 'Regra desativada.');
      await fetchRules();
    } catch (err) {
      message.error(extractApiError(err, 'Não foi possível alterar o estado da regra.'));
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await deleteAlertRule(ruleId);
      message.success('Regra excluída. Alertas históricos foram preservados.');
      await fetchRules();
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao excluir regra de alerta.'));
    }
  };

  const handleOpenStats = async (rule: AlertRuleRecord) => {
    setStatsModalRule(rule);
    setRuleStats(null);
    setStatsLoading(true);
    try {
      const data = await getAlertRuleStatistics(rule.id);
      setRuleStats(data);
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao carregar estatísticas da regra.'));
    } finally {
      setStatsLoading(false);
    }
  };

  const companyMap: Record<string, string> = Object.fromEntries(
    companies.map((c) => [c.id, c.name])
  );
  const equipmentMap: Record<string, string> = Object.fromEntries(
    equipments.map((e) => [e.id, e.serial])
  );

  const handleRequestDeleteRule = (record: AlertRuleRecord) => {
    confirmWithShortcutLock(
      modal,
      {
        title: `Excluir "${record.name}"?`,
        content: 'Alertas já gerados por esta regra continuarão preservados no histórico.',
        okText: 'Excluir',
        okButtonProps: { danger: true },
        cancelText: 'Cancelar',
        onOk: () => handleDeleteRule(record.id),
      },
      acquireShortcutLock
    );
  };

  const columns = buildAlertRuleColumns({
    isGlobalAdmin,
    companyMap,
    equipmentMap,
    onToggleActive: (record, checked) => {
      void handleToggleRuleActive(record, checked);
    },
    onOpenStats: (record) => {
      void handleOpenStats(record);
    },
    onEdit: (record) => {
      setEditingRule(record);
      setRuleModalOpen(true);
    },
    onRequestDelete: handleRequestDeleteRule,
  });

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <PageHeader
        title="Regras e Limites Operacionais"
        align="center"
        subtitle="Precedência automática por (tipo, severidade): Equipamento (1) > Empresa (2) > Global (3)."
        rightSlot={
          <>
            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={() => {
                void fetchRules();
              }}
            >
              Atualizar
            </Button>
            {isGlobalAdmin && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingRule(null);
                  setRuleModalOpen(true);
                }}
              >
                Nova Regra
              </Button>
            )}
          </>
        }
      />

      {headerNav && <div className="ps-toolbar-row">{headerNav}</div>}

      {!isGlobalAdmin && (
        <Alert
          type="info"
          showIcon
          message="Consulta de Regras Aplicáveis"
          description="As regras de alerta são parametrizadas pela Administração Global da Polo Sanca. Consulte abaixo os limites aplicáveis à sua empresa ou simule a precedência por equipamento."
        />
      )}

      <AlertRulesFilterBar
        scopeFilter={scopeFilter}
        typeFilter={typeFilter}
        activeFilter={activeFilter}
        onScopeChange={(val) => {
          setScopeFilter(val);
          setPage(1);
        }}
        onTypeChange={(val) => {
          setTypeFilter(val);
          setPage(1);
        }}
        onActiveChange={(val) => {
          setActiveFilter(val);
          setPage(1);
        }}
      />

      <AlertRulesTableCard
        loading={loading}
        rules={rules}
        columns={columns}
        pagination={pagination}
        onPageChange={setPage}
      />

      <AlertRulePrecedenceCard
        equipments={equipments}
        inspectedEquipmentId={inspectedEquipmentId}
        inspectingLoading={inspectingLoading}
        inspectedRules={inspectedRules}
        onInspectEquipment={handleInspectEquipment}
      />

      <AlertRuleFormModal
        open={ruleModalOpen}
        editingRule={editingRule}
        companies={companies}
        equipments={equipments}
        onCancel={() => setRuleModalOpen(false)}
        onSaved={async () => {
          setRuleModalOpen(false);
          await fetchRules();
          if (inspectedEquipmentId) {
            handleInspectEquipment(inspectedEquipmentId);
          }
        }}
      />

      <AlertRuleStatsModal
        rule={statsModalRule}
        loading={statsLoading}
        stats={ruleStats}
        onClose={() => setStatsModalRule(null)}
      />
    </Space>
  );
}
