import { Button, Card, Col, Modal, Row, Spin, Statistic } from 'antd';
import { SEMANTIC_HEX } from '../../theme/tokens';
import type { AlertRuleStatistics } from '../../types/models';
import type { AlertRuleRecord } from './AlertRuleModalForm';

export interface AlertRuleStatsModalProps {
  rule: AlertRuleRecord | null;
  loading: boolean;
  stats: AlertRuleStatistics | null;
  onClose: () => void;
}

export default function AlertRuleStatsModal({
  rule,
  loading,
  stats,
  onClose,
}: AlertRuleStatsModalProps) {
  return (
    <Modal
      open={Boolean(rule)}
      onCancel={onClose}
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          Fechar
        </Button>,
      ]}
      destroyOnHidden
      title={rule ? `Estatísticas — ${rule.name}` : 'Estatísticas da Regra'}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : stats ? (
        <Row gutter={[16, 16]}>
          <Col xs={12}>
            <Card size="small">
              <Statistic
                title="Total de Disparos"
                value={stats.total_triggers}
                valueStyle={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </Card>
          </Col>
          <Col xs={12}>
            <Card size="small">
              <Statistic
                title="Últimos 30 Dias"
                value={stats.triggers_last_30_days}
                valueStyle={{ color: SEMANTIC_HEX.brand, fontVariantNumeric: 'tabular-nums' }}
              />
            </Card>
          </Col>
          <Col xs={12}>
            <Card size="small">
              <Statistic
                title="Equipamentos Afetados"
                value={stats.affected_equipments}
                valueStyle={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </Card>
          </Col>
          <Col xs={12}>
            <Card size="small">
              <Statistic
                title="Média por Equipamento"
                value={stats.avg_triggers_per_equipment}
                precision={2}
                valueStyle={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </Card>
          </Col>
        </Row>
      ) : null}
    </Modal>
  );
}
