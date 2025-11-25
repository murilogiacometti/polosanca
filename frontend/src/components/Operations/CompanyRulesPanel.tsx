import { useState } from 'react';
import {
  BarChartOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Empty,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  deleteAlertRule,
  getAlertRules,
  getAlertRuleStatistics,
  getEquipmentAlertRules,
  getEquipments,
  updateAlertRule,
} from '../../api';
import { useAuth } from '../../context/authContextObject';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';
import type {
  AlertRuleStatistics,
  AlertSeverity,
  AlertType,
  Equipment,
} from '../../types/models';
import {
  ALERT_SCOPE_LABELS,
  ALERT_SEVERITY_CONFIG,
  ALERT_TYPE_LABELS,
  extractApiError,
  formatAlertRuleCondition,
} from '../../utils/formatters';
import AlertRuleModalForm, { type AlertRuleRecord } from '../Modals/AlertRuleModalForm';
import AlertRuleStatsModal from '../Modals/AlertRuleStatsModal';
import AlertRulePrecedenceCard from './AlertRulePrecedenceCard';

const { Text } = Typography;

interface BuildRuleColumnsOptions {
  companyName?: string | null;
  eqMap: Record<string, string>;
  isGlobalAdmin: boolean;
  onToggleActive: (rule: AlertRuleRecord, checked: boolean) => Promise<void>;
  onOpenStats: (rule: AlertRuleRecord) => Promise<void>;
  onEdit: (rule: AlertRuleRecord) => void;
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
}: BuildRuleColumnsOptions): ColumnsType<AlertRuleRecord> {
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
          const scopeKey = r.scope_id || r.equipment_id || '';
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
            render: (_: unknown, record: AlertRuleRecord) => (
              <Space size="small">
                <Button
                  size="small"
                  icon={<BarChartOutlined />}
                  onClick={() => {
                    void onOpenStats(record);
                  }}
                />
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => onEdit(record)}
                >
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
  const { message } = AntdApp.useApp();
  const { isGlobalAdmin } = useAuth();
  const qc = useQueryClient();

  const [inspectedEquipmentId, setInspectedEquipmentId] = useState<string | undefined>(undefined);

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRuleRecord | null>(null);
  const [statsRule, setStatsRule] = useState<AlertRuleRecord | null>(null);
  const [ruleStats, setRuleStats] = useState<AlertRuleStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useSuspendShortcuts(ruleModalOpen || Boolean(statsRule));

  const companyRulesQuery = useQuery<{ rules: AlertRuleRecord[]; equipments: Equipment[] }>({
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
        const mergedMap = new Map<string, AlertRuleRecord>();
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

  const inspectedRulesQuery = useQuery<AlertRuleRecord[]>({
    queryKey: ['alert-rules', 'inspect', inspectedEquipmentId ?? null],
    enabled: Boolean(inspectedEquipmentId),
    queryFn: async () => {
      if (!inspectedEquipmentId) return [];
      const res = await getEquipmentAlertRules(inspectedEquipmentId);
      return res?.applicable_rules || [];
    },
  });

  const rules = companyRulesQuery.data?.rules ?? [];
  const equipments = companyRulesQuery.data?.equipments ?? [];
  const loading = companyRulesQuery.isFetching;
  const inspectedRules = inspectedEquipmentId ? (inspectedRulesQuery.data ?? []) : [];
  const inspecting = inspectedRulesQuery.isFetching;

  const loadRulesAndEquipments = async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: ['alert-rules'] });
  };

  const handleInspectEquipment = (eqId: string | undefined): void => {
    setInspectedEquipmentId(eqId);
  };

  const handleToggleActive = async (rule: AlertRuleRecord, checked: boolean): Promise<void> => {
    try {
      await updateAlertRule(rule.id, { is_active: checked });
      message.success(checked ? 'Regra ativada.' : 'Regra desativada.');
      await loadRulesAndEquipments();
    } catch (err) {
      message.error(extractApiError(err, 'Não foi possível alterar o estado da regra.'));
    }
  };

  const handleDelete = async (ruleId: string): Promise<void> => {
    try {
      await deleteAlertRule(ruleId);
      message.success('Regra removida. Histórico de alertas preservado.');
      await loadRulesAndEquipments();
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao excluir regra.'));
    }
  };

  const handleOpenStats = async (rule: AlertRuleRecord): Promise<void> => {
    setStatsRule(rule);
    setRuleStats(null);
    setStatsLoading(true);
    try {
      const res = await getAlertRuleStatistics(rule.id);
      setRuleStats(res);
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao consultar estatísticas da regra.'));
    } finally {
      setStatsLoading(false);
    }
  };

  const eqMap: Record<string, string> = Object.fromEntries(
    equipments.map((e) => [e.id, e.serial])
  );

  const columns = buildCompanyRuleColumns({
    companyName,
    eqMap,
    isGlobalAdmin,
    onToggleActive: handleToggleActive,
    onOpenStats: handleOpenStats,
    onEdit: (record) => {
      setEditingRule(record);
      setRuleModalOpen(true);
    },
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
                void loadRulesAndEquipments();
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
          <Table<AlertRuleRecord>
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
        inspectedEquipmentId={inspectedEquipmentId}
        inspectingLoading={inspecting}
        inspectedRules={inspectedRules}
        onInspectEquipment={handleInspectEquipment}
        title="Simulador de Precedência por Equipamento"
        selectPlaceholder="Testar equipamento desta empresa"
        emptyDescription="Selecione um equipamento acima para inspecionar regras em vigor vs. regras sombreadas."
      />

      <Modal
        open={ruleModalOpen}
        onCancel={() => setRuleModalOpen(false)}
        footer={null}
        destroyOnHidden
        title={editingRule ? 'Editar Regra de Alerta' : 'Nova Regra de Alerta'}
        width={620}
      >
        {ruleModalOpen && (
          <AlertRuleModalForm
            rule={editingRule}
            equipments={equipments}
            defaultScope="company"
            allowedScopes={['company', 'equipment']}
            fixedCompanyId={companyId ?? undefined}
            companyName={companyName ?? undefined}
            onCancel={() => setRuleModalOpen(false)}
            onSaved={async () => {
              setRuleModalOpen(false);
              await loadRulesAndEquipments();
              if (inspectedEquipmentId) handleInspectEquipment(inspectedEquipmentId);
            }}
          />
        )}
      </Modal>

      <AlertRuleStatsModal
        rule={statsRule}
        loading={statsLoading}
        stats={ruleStats}
        onClose={() => setStatsRule(null)}
      />
    </Space>
  );
}
