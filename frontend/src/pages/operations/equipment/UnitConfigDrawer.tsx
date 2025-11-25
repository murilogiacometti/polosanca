import { useMemo, useState } from 'react';
import {
  ControlOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Button, Card, Drawer, Empty, Modal, Popconfirm, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { StatusPill } from '../../../components/ui';
import { useSuspendShortcuts } from '../../../context/uiShellContextObject';
import { resolveAlertSeverityTone } from '../../../theme/tokens';
import type { AlertRule, AlertScope, Branch, Equipment } from '../../../types/models';
import {
  ALERT_SCOPE_LABELS,
  ALERT_SEVERITY_CONFIG,
  ALERT_TYPE_LABELS,
  COMPARISON_OPERATOR_LABELS,
  formatDurationSeconds,
} from '../../../utils/formatters';
import AlertRuleModalForm from '../../../components/Modals/AlertRuleModalForm';

const { Text } = Typography;

export interface UnitConfigDrawerProps {
  open: boolean;
  onClose: () => void;
  equipment: Equipment;
  branches?: Branch[];
  applicableRules?: AlertRule[];
  isGlobalAdmin?: boolean;
  canWriteOperations?: boolean;
  onOpenEditModal?: () => void;
  onRotateApiKey?: () => void | Promise<void>;
  onDeactivate?: () => void | Promise<void>;
  onRuleCreated?: () => void | Promise<void>;
}

/**
 * Gaveta lateral de Configuração da Unidade (Nível 3):
 * Exibe precedência de regras/limites operacionais, edição cadastral, rotação de X-API-Key e desativação.
 */
export default function UnitConfigDrawer({
  open,
  onClose,
  equipment,
  branches = [],
  applicableRules = [],
  isGlobalAdmin = false,
  canWriteOperations = false,
  onOpenEditModal,
  onRotateApiKey,
  onDeactivate,
  onRuleCreated,
}: UnitConfigDrawerProps) {
  const [createRuleOpen, setCreateRuleOpen] = useState(false);

  useSuspendShortcuts(Boolean(open));
  useSuspendShortcuts(createRuleOpen);

  const winningScopeByPair = useMemo<Record<string, AlertRule>>(() => {
    const map: Record<string, AlertRule> = {};
    applicableRules.forEach((r) => {
      if (r.is_active && r.is_effective) {
        map[`${r.rule_type}:${r.severity}`] = r;
      }
    });
    return map;
  }, [applicableRules]);

  const rulesColumns: ColumnsType<AlertRule> = [
    {
      title: 'Origem / Herança',
      dataIndex: 'scope',
      key: 'scope',
      width: 195,
      render: (scope: AlertScope, r) => {
        const dimmed = !r.is_effective || !r.is_active;
        return (
          <div style={{ opacity: dimmed ? 0.58 : 1 }}>
            <StatusPill tone="neutral">{ALERT_SCOPE_LABELS[scope] || scope}</StatusPill>
          </div>
        );
      },
    },
    {
      title: 'Resolução Efetiva',
      key: 'effective',
      width: 245,
      render: (_, r) => {
        if (!r.is_active) {
          return <StatusPill tone="offline">Desativada</StatusPill>;
        }
        if (r.is_effective) {
          return (
            <StatusPill tone="operational" dot>
              Em Vigor nesta Unidade
            </StatusPill>
          );
        }
        const winner = winningScopeByPair[`${r.rule_type}:${r.severity}`];
        const winnerLabel =
          winner?.scope === 'equipment'
            ? 'Sobrescrita por Equipamento'
            : winner?.scope === 'company'
              ? 'Sobrescrita por Empresa'
              : 'Sobrescrita por prioridade maior';
        return <StatusPill tone="neutral">{winnerLabel}</StatusPill>;
      },
    },
    {
      title: 'Regra',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, r) => {
        const shadowed = r.is_active && !r.is_effective;
        return (
          <div style={{ opacity: !r.is_effective ? 0.58 : 1 }}>
            <span
              style={{
                fontWeight: r.is_effective ? 700 : 400,
                textDecoration: shadowed ? 'line-through' : 'none',
              }}
            >
              {name}
            </span>
            {r.description && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {r.description}
                </Text>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Tipo & Severidade',
      key: 'type_sev',
      render: (_, r) => {
        const sevCfg = ALERT_SEVERITY_CONFIG[r.severity] || { label: r.severity };
        return (
          <Space size={6} style={{ opacity: !r.is_effective ? 0.58 : 1 }}>
            <span>{ALERT_TYPE_LABELS[r.rule_type] || r.rule_type}</span>
            <StatusPill tone={resolveAlertSeverityTone(r.severity)} dot>
              {sevCfg.label}
            </StatusPill>
          </Space>
        );
      },
    },
    {
      title: 'Condição e Persistência',
      key: 'condition',
      render: (_, r) => {
        const shadowed = r.is_active && !r.is_effective;
        const duration = formatDurationSeconds(r.duration_seconds);
        let text: string;
        if (r.rule_type === 'door_open') {
          text = `Porta aberta por ${duration}`;
        } else if (r.rule_type === 'equipment_offline') {
          text = `Sem sinal por ${duration}`;
        } else {
          const op =
            (r.comparison_operator && COMPARISON_OPERATOR_LABELS[r.comparison_operator]) ||
            r.comparison_operator ||
            '';
          const unit = r.rule_type?.startsWith('temperature') ? '°C' : 'kPa';
          text = `${op} ${r.threshold_value ?? '—'} ${unit} por ${duration}`;
        }
        return (
          <span
            className="ps-tabular"
            style={{
              opacity: !r.is_effective ? 0.58 : 1,
              textDecoration: shadowed ? 'line-through' : 'none',
            }}
          >
            {text}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={760}
        destroyOnHidden
        title={
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Configuração da Unidade — <span className="ps-mono">{equipment.serial}</span>
            </div>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              Precedência de limites operacionais, cadastro, transferência de filial e credenciais IoT
            </Text>
          </div>
        }
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <div className="ps-toolbar-row" style={{ marginBottom: 10 }}>
              <div>
                <Text strong style={{ display: 'block' }}>
                  <ControlOutlined /> Limites e Regras Aplicáveis ({applicableRules.length})
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Equipamento (1) sobrescreve Empresa (2), que sobrescreve Global (3).
                </Text>
              </div>
              {isGlobalAdmin && (
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateRuleOpen(true)}
                >
                  Nova Regra p/ Esta Câmara
                </Button>
              )}
            </div>

            {applicableRules.length === 0 ? (
              <Empty description="Nenhuma regra aplicável configurada." />
            ) : (
              <Table<AlertRule>
                rowKey="id"
                columns={rulesColumns}
                dataSource={applicableRules}
                pagination={false}
                size="small"
                scroll={{ x: 700 }}
              />
            )}
          </div>

          {canWriteOperations && (
            <Card
              size="small"
              title={
                branches.length > 1
                  ? 'Cadastro, Filial e Credenciais do Controlador IoT'
                  : 'Cadastro e Credenciais do Controlador IoT'
              }
              style={{ background: 'var(--ps-chip-bg)' }}
            >
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Série: <strong className="ps-mono">{equipment.serial}</strong> · ID:{' '}
                  <span className="ps-mono">{equipment.id}</span>
                </Text>

                <Space wrap>
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => {
                      onClose();
                      onOpenEditModal?.();
                    }}
                  >
                    {branches.length > 1 ? 'Editar Cadastro / Transferir Filial' : 'Editar Cadastro'}
                  </Button>

                  <Popconfirm
                    title="Rotacionar chave X-API-Key?"
                    description="A chave atual será invalidada imediatamente e uma nova chave de exibição única será gerada."
                    okText="Rotacionar Chave"
                    cancelText="Cancelar"
                    onConfirm={() => {
                      void onRotateApiKey?.();
                    }}
                  >
                    <Button icon={<KeyOutlined />}>Rotacionar Chave API</Button>
                  </Popconfirm>

                  {equipment.is_active && (
                    <Popconfirm
                      title="Desativar equipamento?"
                      description="Novos envios de telemetria serão bloqueados, preservando 100% do histórico."
                      okText="Desativar"
                      okButtonProps={{ danger: true }}
                      cancelText="Cancelar"
                      onConfirm={() => {
                        void onDeactivate?.();
                      }}
                    >
                      <Button danger icon={<DeleteOutlined />}>
                        Desativar Equipamento
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              </Space>
            </Card>
          )}
        </Space>
      </Drawer>

      <Modal
        open={createRuleOpen}
        onCancel={() => setCreateRuleOpen(false)}
        footer={null}
        destroyOnHidden
        title={`Nova Regra Específica — ${equipment.serial}`}
        width={600}
      >
        {createRuleOpen && (
          <AlertRuleModalForm
            defaultScope="equipment"
            defaultScopeId={equipment.id}
            lockScope
            onCancel={() => setCreateRuleOpen(false)}
            onSaved={async () => {
              setCreateRuleOpen(false);
              await onRuleCreated?.();
            }}
          />
        )}
      </Modal>
    </>
  );
}
