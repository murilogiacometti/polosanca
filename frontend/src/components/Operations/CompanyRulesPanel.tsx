import {
  BarChartOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Empty,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getAlertRules, getEquipments } from '../../api';
import { useAuth } from '../../context/authContextObject';
import type { AlertRule, AlertSeverity, AlertType, Equipment } from '../../types/models';
import {
  ALERT_SCOPE_LABELS,
  ALERT_SEVERITY_CONFIG,
  ALERT_TYPE_LABELS,
  formatAlertRuleCondition,
} from '../../utils/formatters';
import AlertRuleFormModal from '../Modals/AlertRuleFormModal';
import AlertRuleStatsModal from '../Modals/AlertRuleStatsModal';
import AlertRulePrecedenceCard from './AlertRulePrecedenceCard';
import { useAlertRuleManagement } from './useAlertRuleManagement';

const { Text } = Typography;

interface BuildRuleColumnsOptions {
  companyName?: string | null;
  eqMap: Record<string, string>;
  isGlobalAdmin: boolean;
  onToggleActive: (rule: AlertRule, checked: boolean) => Promise<void>;
  onOpenStats: (rule: AlertRule) => Promise<void>;
  onEdit: (rule: AlertRule) => void;
  onDelete: (ruleId: string) => Promise<void>;
}

function buildCompanyRuleColumns({
  companyName,
  eqMap,
  isGlobalAdmin,
  onToggleActive,
  onOpenStats,
  onEdit,
  onDelete,
}: BuildRuleColumnsOptions): ColumnsType<AlertRule> {
  return [
    {
      title: 'Regra',
      dataIndex: 'name',
      key: 'name',
      render: (n: string, r) => (
        <div>
          <strong>{n}</strong>
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
      title: 'Escopo & Herança',
      key: 'scope',
      render: (_, r) => {
        let target = 'Herdada do Padrão Global';
        if (r.scope === 'company') target = companyName || 'Específica da Empresa';
        if (r.scope === 'equipment') {
          const scopeKey = r.scope_id || '';
          target = `Equipamento: ${eqMap[scopeKey] || scopeKey}`;
        }
        return (
          <div>
            <Tag
              color={
                r.scope === 'equipment' ? 'purple' : r.scope === 'company' ? 'blue' : 'default'
              }
            >
              {ALERT_SCOPE_LABELS[r.scope] || r.scope}
            </Tag>
            <div style={{ fontSize: 11.5, color: 'var(--ps-text-secondary)', marginTop: 2 }}>
              {target}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Monitoramento',
      dataIndex: 'rule_type',
      key: 'rule_type',
      render: (t: AlertType) => ALERT_TYPE_LABELS[t] || t,
    },
    {
      title: 'Condição',
      key: 'condition',
      render: (_, r) => formatAlertRuleCondition(r),
    },
    {
      title: 'Severidade',
      dataIndex: 'severity',
      key: 'severity',
      render: (sev: AlertSeverity) => (
        <Tag color={ALERT_SEVERITY_CONFIG[sev]?.color || 'default'}>
          {ALERT_SEVERITY_CONFIG[sev]?.label || sev}
        </Tag>
      ),
    },
    {
      title: 'Ativação',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean, r) =>
        isGlobalAdmin ? (
          <Switch
            size="small"
            checked={active}
            onChange={(checked) => {
              void onToggleActive(r, checked);
            }}
          />
        ) : active ? (
          <Tag color="success">Ativa</Tag>
        ) : (
          <Tag>Inativa</Tag>
        ),
    },
    ...(isGlobalAdmin
      ? [
          {
            title: 'Ações',
            key: 'actions',
            width: 220,
            render: (_: unknown, record: AlertRule) => (
              <Space size="small">
                <Button
                  size="small"
                  icon={<BarChartOutlined />}
                  onClick={() => {
                    void onOpenStats(record);
                  }}
                />
                <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)}>
                  Editar
                </Button>
                <Popconfirm
                  title="Excluir regra de alerta?"
                  okText="Excluir"
                  okButtonProps={{ danger: true }}
                  cancelText="Cancelar"
                  onConfirm={() => {
                    void onDelete(record.id);
                  }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];
}

export interface CompanyRulesPanelProps {
  companyId?: string | null;
  companyName?: string | null;
}

export default function CompanyRulesPanel({
  companyId,
  companyName,
}: CompanyRulesPanelProps) {
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
    handleDelete,
  } = useAlertRuleManagement();

  const companyRulesQuery = useQuery<{ rules: AlertRule[]; equipments: Equipment[] }>({
    queryKey: ['alert-rules', 'company-panel', companyId ?? null, isGlobalAdmin],
    enabled: Boolean(companyId),
    queryFn: async () => {
      if (!companyId) {
        return { rules: [], equipments: [] };
      }
      if (isGlobalAdmin) {
        const [globalRes, scopedRes, eqRes] = await Promise.all([
          getAlertRules({ scope: 'global', limit: 100 }),
          getAlertRules({ company_id: companyId, limit: 100 }),
          getEquipments({ company_id: companyId, limit: 100 }),
        ]);
        const mergedMap = new Map<string, AlertRule>();
        (scopedRes?.alert_rules || []).forEach((r) => mergedMap.set(r.id, r));
        (globalRes?.alert_rules || []).forEach((r) => {
          if (!mergedMap.has(r.id)) mergedMap.set(r.id, r);
        });
        return {
          rules: Array.from(mergedMap.values()),
          equipments: eqRes?.equipment || [],
        };
      }
      const [rulesRes, eqRes] = await Promise.all([
        getAlertRules({ limit: 100 }),
        getEquipments({ limit: 100 }),
      ]);
      return {
        rules: rulesRes?.alert_rules || [],
        equipments: eqRes?.equipment || [],
      };
    },
  });

  const rules = companyRulesQuery.data?.rules ?? [];
  const equipments = companyRulesQuery.data?.equipments ?? [];
  const loading = companyRulesQuery.isFetching;

  const eqMap: Record<string, string> = Object.fromEntries(
    equipments.map((e) => [e.id, e.serial])
  );

  const columns = buildCompanyRuleColumns({
    companyName,
    eqMap,
    isGlobalAdmin,
    onToggleActive: handleToggleActive,
    onOpenStats: handleOpenStats,
    onEdit: openEditModal,
    onDelete: handleDelete,
  });

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {!isGlobalAdmin && (
        <Alert
          type="info"
          showIcon
          message="Regras Aplicáveis (Somente Leitura para Empresa)"
          description="As regras de alerta seguem a precedência Equipamento (1) > Empresa (2) > Global (3). Solicite ajustes finos de limite à engenharia da Polo Sanca ou simule abaixo a regra em vigor em cada equipamento."
        />
      )}

      <Card
        title="Regras Globais, da Empresa e de Equipamentos"
        extra={
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void refreshRules();
              }}
            >
              Atualizar
            </Button>
            {isGlobalAdmin && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                Nova Regra para Empresa
              </Button>
            )}
          </Space>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : rules.length === 0 ? (
          <Empty description="Nenhuma regra aplicável encontrada." />
        ) : (
          <Table<AlertRule>
            rowKey="id"
            columns={columns}
            dataSource={rules}
            scroll={{ x: 900 }}
            pagination={{ pageSize: 12, showSizeChanger: false }}
          />
        )}
      </Card>

      <AlertRulePrecedenceCard
        equipments={equipments}
        title="Simulador de Precedência por Equipamento"
        selectPlaceholder="Testar equipamento desta empresa"
        emptyDescription="Selecione um equipamento acima para inspecionar regras em vigor vs. regras sombreadas."
      />

      <AlertRuleFormModal
        open={ruleModalOpen}
        rule={editingRule}
        equipments={equipments}
        defaultScope="company"
        allowedScopes={['company', 'equipment']}
        fixedCompanyId={companyId ?? undefined}
        companyName={companyName ?? undefined}
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
