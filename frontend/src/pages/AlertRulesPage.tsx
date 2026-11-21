import { type ReactNode, useMemo, useState } from 'react';
import {
  BarChartOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  getAlertRules,
  getCompanies,
  getEquipments,
  type GetAlertRulesParams,
} from '../api';
import WorkspaceSkeleton from '../components/Common/WorkspaceSkeleton';
import AlertRuleFormModal from '../components/Modals/AlertRuleFormModal';
import AlertRuleStatsModal from '../components/Modals/AlertRuleStatsModal';
import AlertRulePrecedenceCard from '../components/Operations/AlertRulePrecedenceCard';
import { useAlertRuleManagement } from '../components/Operations/useAlertRuleManagement';
import { PageHeader, RowActionMenu, StatusPill } from '../components/ui';
import { useAuth } from '../context/authContextObject';
import { resolveAlertSeverityTone } from '../theme/tokens';
import type {
  AlertRule,
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
  rules: AlertRule[];
  columns: ColumnsType<AlertRule>;
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
        <Table<AlertRule>
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

interface BuildAlertRuleColumnsParams {
  isGlobalAdmin: boolean;
  companyMap: Record<string, string>;
  equipmentMap: Record<string, string>;
  onToggleActive: (rule: AlertRule, checked: boolean) => void;
  onOpenStats: (rule: AlertRule) => void;
  onEdit: (rule: AlertRule) => void;
  onRequestDelete: (rule: AlertRule) => void;
}

function buildAlertRuleColumns({
  isGlobalAdmin,
  companyMap,
  equipmentMap,
  onToggleActive,
  onOpenStats,
  onEdit,
  onRequestDelete,
}: BuildAlertRuleColumnsParams): ColumnsType<AlertRule> {
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
        ] satisfies ColumnsType<AlertRule>)
      : []),
  ];
}

export default function AlertRulesPage({
  headerNav = null,
  initialInspectEquipmentId = undefined,
}: AlertRulesPageProps) {
  const { isGlobalAdmin } = useAuth();
  const {
    ruleModalOpen,
    editingRule,
    openCreateModal,
    openEditModal,
    closeRuleModal,
    statsRule,
    ruleStats,
    statsLoading,
    handleOpenStats,
    closeStatsModal,
    refreshRules,
    handleRuleSaved,
    handleToggleActive,
    handleRequestDelete,
  } = useAlertRuleManagement();

  const [scopeFilter, setScopeFilter] = useState<AlertScope | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<AlertType | undefined>(undefined);
  const [activeFilter, setActiveFilter] = useState<'true' | 'false' | undefined>(undefined);
  const [page, setPage] = useState(1);

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
    if (activeFilter !== undefined) params.is_active = activeFilter === 'true';
    return params;
  }, [page, scopeFilter, typeFilter, activeFilter]);

  const rulesQuery = useQuery<{ alert_rules: AlertRule[]; pagination: PaginationMeta }>({
    queryKey: ['alert-rules', 'list', rulesParams],
    queryFn: async () => {
      const res = await getAlertRules(rulesParams);
      return {
        alert_rules: res?.alert_rules || [],
        pagination: res?.pagination || { page: 1, limit: 20, total: 0, total_pages: 0 },
      };
    },
    placeholderData: keepPreviousData,
  });

  const rules = rulesQuery.data?.alert_rules ?? [];
  const pagination = rulesQuery.data?.pagination ?? { page: 1, limit: 20, total: 0, total_pages: 0 };
  const loading = rulesQuery.isFetching;

  const companyMap: Record<string, string> = Object.fromEntries(
    companies.map((c) => [c.id, c.name])
  );
  const equipmentMap: Record<string, string> = Object.fromEntries(
    equipments.map((e) => [e.id, e.serial])
  );

  const columns = buildAlertRuleColumns({
    isGlobalAdmin,
    companyMap,
    equipmentMap,
    onToggleActive: (record, checked) => {
      void handleToggleActive(record, checked);
    },
    onOpenStats: (record) => {
      void handleOpenStats(record);
    },
    onEdit: openEditModal,
    onRequestDelete: handleRequestDelete,
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
                void refreshRules();
              }}
            >
              Atualizar
            </Button>
            {isGlobalAdmin && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
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
        initialEquipmentId={initialInspectEquipmentId}
      />

      <AlertRuleFormModal
        open={ruleModalOpen}
        rule={editingRule}
        companies={companies}
        equipments={equipments}
        onCancel={closeRuleModal}
        onSaved={handleRuleSaved}
      />

      <AlertRuleStatsModal
        rule={statsRule}
        loading={statsLoading}
        stats={ruleStats}
        onClose={closeStatsModal}
      />
    </Space>
  );
}
