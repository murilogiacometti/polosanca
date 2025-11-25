import { Card, Empty, Select, Spin, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { resolveAlertSeverityTone } from '../../theme/tokens';
import type { AlertScope, AlertSeverity, AlertType, Equipment } from '../../types/models';
import {
  ALERT_SCOPE_LABELS,
  ALERT_SEVERITY_CONFIG,
  ALERT_TYPE_LABELS,
  formatAlertRuleCondition,
} from '../../utils/formatters';
import type { AlertRuleRecord } from '../Modals/AlertRuleModalForm';
import { StatusPill } from '../ui';

const PRIORITY_COLUMNS: ColumnsType<AlertRuleRecord> = [
  {
    title: 'Escopo',
    dataIndex: 'scope',
    key: 'scope',
    render: (sc: AlertScope) => (
      <StatusPill tone="neutral">{ALERT_SCOPE_LABELS[sc] || sc}</StatusPill>
    ),
  },
  {
    title: 'Resolução Efetiva',
    key: 'effective',
    render: (_, r) => {
      if (!r.is_active) return <StatusPill tone="offline">Inativa</StatusPill>;
      return r.is_effective ? (
        <StatusPill tone="operational" dot>
          Em Vigor ✓
        </StatusPill>
      ) : (
        <StatusPill tone="neutral">Sobrescrita por prioridade maior</StatusPill>
      );
    },
  },
  {
    title: 'Regra',
    dataIndex: 'name',
    key: 'name',
    render: (n: string, r) => (
      <span
        style={{
          fontWeight: 600,
          opacity: r.is_active && !r.is_effective ? 0.55 : 1,
          textDecoration: r.is_active && !r.is_effective ? 'line-through' : 'none',
        }}
      >
        {n}
      </span>
    ),
  },
  {
    title: 'Tipo',
    dataIndex: 'rule_type',
    key: 'rule_type',
    render: (t: AlertType) => ALERT_TYPE_LABELS[t] || t,
  },
  {
    title: 'Condição',
    key: 'condition',
    render: (_, r) => (
      <span
        className="ps-tabular"
        style={{ opacity: r.is_active && !r.is_effective ? 0.55 : 1 }}
      >
        {formatAlertRuleCondition(r)}
      </span>
    ),
  },
  {
    title: 'Severidade',
    dataIndex: 'severity',
    key: 'severity',
    render: (sev: AlertSeverity) => (
      <StatusPill tone={resolveAlertSeverityTone(sev)} dot>
        {ALERT_SEVERITY_CONFIG[sev]?.label || sev}
      </StatusPill>
    ),
  },
];

export interface AlertRulePrecedenceCardProps {
  equipments: Equipment[];
  inspectedEquipmentId: string | undefined;
  inspectingLoading: boolean;
  inspectedRules: AlertRuleRecord[];
  onInspectEquipment: (eqId: string | undefined) => void;
  title?: string;
  selectPlaceholder?: string;
  emptyDescription?: string;
  noRulesDescription?: string;
}

export default function AlertRulePrecedenceCard({
  equipments,
  inspectedEquipmentId,
  inspectingLoading,
  inspectedRules,
  onInspectEquipment,
  title = 'Simulador de Precedência Efetiva por Equipamento',
  selectPlaceholder = 'Selecione uma câmara fria...',
  emptyDescription = 'Selecione um equipamento acima para visualizar quais regras vencem e quais ficam sombreadas.',
  noRulesDescription = 'Nenhuma regra aplicável a este equipamento.',
}: AlertRulePrecedenceCardProps) {
  return (
    <Card
      size="small"
      title={title}
      extra={
        <Select<string>
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 280 }}
          placeholder={selectPlaceholder}
          value={inspectedEquipmentId}
          onChange={onInspectEquipment}
          options={equipments.map((eq) => ({
            value: eq.id,
            label: `${eq.serial} — ${eq.branch_name || 'Filial'}`,
          }))}
        />
      }
    >
      {!inspectedEquipmentId ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
      ) : inspectingLoading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : inspectedRules.length === 0 ? (
        <Empty description={noRulesDescription} />
      ) : (
        <Table<AlertRuleRecord>
          rowKey="id"
          columns={PRIORITY_COLUMNS}
          dataSource={inspectedRules}
          pagination={false}
          scroll={{ x: 820 }}
        />
      )}
    </Card>
  );
}
