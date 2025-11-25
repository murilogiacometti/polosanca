import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowUpOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
  SettingOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Button, Col, Row, Space, Tooltip } from 'antd';
import { AccentCard, PageHeader, StatusPill, SubsystemStack } from '../../../components/ui';
import { SEMANTIC_HEX } from '../../../theme/tokens';
import type {
  BinaryRawState,
  Branch,
  DoorRawState,
  Equipment,
  EquipmentStatus,
  StatusTone,
  ThresholdBounds,
} from '../../../types/models';
import {
  EQUIPMENT_STATUS_CONFIG,
  EQUIPMENT_TYPE_LABELS,
  formatDatePtBR,
  formatDateTimePtBR,
  formatOfflineBadgeLabel,
  formatPressure,
  formatRelativeTimePtBR,
  formatTemperature,
  getMaintenanceCountdownInfo,
} from '../../../utils/formatters';

type HeroEquipment = Equipment & {
  manufacturer?: string | null;
};

export interface EquipmentHeroSectionProps {
  equipment: HeroEquipment;
  branches?: Branch[];
  effectiveStatus?: EquipmentStatus;
  liveTemp?: number | null;
  livePress?: number | null;
  liveDoor?: DoorRawState;
  liveCompressor?: BinaryRawState;
  liveFan?: BinaryRawState;
  liveHeater?: BinaryRawState;
  liveLastUpdate?: string | null;
  targetMetaLabel?: string | null;
  tempBounds?: ThresholdBounds | null;
  pressureMetaLabel?: string | null;
  siblingIndex?: number;
  siblingCount?: number;
  canWriteOperations?: boolean;
  backLabel?: string | null;
  onBack?: (() => void) | null;
  onStepSibling?: (delta: number) => void;
  onOpenManualModal?: () => void;
  onOpenMaintenanceModal?: () => void;
  onOpenUnitConfig?: () => void;
}

function computeTempDeviationBadge(
  temp: number | null | undefined,
  tempBounds: ThresholdBounds | null | undefined
): string | null {
  if (temp === null || temp === undefined || Number.isNaN(Number(temp)) || !tempBounds) {
    return null;
  }
  const val = Number(temp);
  if (tempBounds.high !== null && tempBounds.high !== undefined && val > tempBounds.high) {
    const diff = val - Number(tempBounds.high);
    return `+${diff.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} °C`;
  }
  if (tempBounds.low !== null && tempBounds.low !== undefined && val < tempBounds.low) {
    const diff = val - Number(tempBounds.low);
    return `${diff.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} °C`;
  }
  return null;
}

const LABEL_STYLE: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--ps-text-muted)',
};

function resolveMaintTone(tone: string | undefined): StatusTone {
  if (tone === 'red') return 'critical';
  if (tone === 'amber') return 'warning';
  return 'operational';
}

function resolveTempColor(status: EquipmentStatus): string {
  if (status === 'critical') return SEMANTIC_HEX.criticalText;
  if (status === 'warning') return SEMANTIC_HEX.warningText;
  if (status === 'offline') return 'var(--ps-text-muted)';
  return 'var(--ps-text-primary)';
}

function resolveMaintColor(tone: StatusTone): string {
  if (tone === 'critical') return SEMANTIC_HEX.criticalText;
  if (tone === 'warning') return SEMANTIC_HEX.warningText;
  return SEMANTIC_HEX.operationalText;
}

function buildHeroSubtitle(equipment: HeroEquipment, branches: Branch[]): ReactNode {
  const modelText = [equipment.manufacturer, equipment.model].filter(Boolean).join(' / ');
  if (branches.length > 1) {
    return (
      <>
        Filial:{' '}
        <strong style={{ color: 'var(--ps-text-primary)' }}>
          {equipment.branch_name || 'Filial vinculada'}
        </strong>
        {modelText ? ` · ${modelText}` : ''}
      </>
    );
  }
  const branchLabel =
    equipment.branch_name && equipment.branch_name !== 'Unidade Principal'
      ? equipment.branch_name
      : null;
  return [branchLabel, modelText || null].filter(Boolean).join(' · ') || 'Unidade única';
}

function formatShortDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface HeroHeaderRightSlotProps {
  siblingIndex: number;
  siblingCount: number;
  canWriteOperations: boolean;
  onStepSibling?: (delta: number) => void;
  onOpenMaintenanceModal?: () => void;
  onOpenUnitConfig?: () => void;
}

function HeroHeaderRightSlot({
  siblingIndex,
  siblingCount,
  canWriteOperations,
  onStepSibling,
  onOpenMaintenanceModal,
  onOpenUnitConfig,
}: HeroHeaderRightSlotProps) {
  return (
    <Space size={8} wrap>
      {siblingCount > 1 && onStepSibling && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: 2,
            borderRadius: 10,
            border: '1px solid var(--ps-border)',
            background: 'var(--ps-card-bg)',
          }}
        >
          <Tooltip title="Unidade anterior nesta filial (Tecla K)">
            <Button
              type="text"
              size="small"
              icon={<LeftOutlined style={{ fontSize: 11 }} />}
              onClick={() => onStepSibling(-1)}
              aria-label="Unidade anterior"
            />
          </Tooltip>
          <span
            className="ps-tabular"
            style={{
              padding: '0 8px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ps-text-secondary)',
            }}
          >
            {siblingIndex + 1} / {siblingCount}
          </span>
          <Tooltip title="Próxima unidade nesta filial (Tecla J)">
            <Button
              type="text"
              size="small"
              icon={<RightOutlined style={{ fontSize: 11 }} />}
              onClick={() => onStepSibling(1)}
              aria-label="Próxima unidade"
            />
          </Tooltip>
        </div>
      )}

      {canWriteOperations && (
        <Button icon={<ToolOutlined />} onClick={onOpenMaintenanceModal}>
          + Manutenção
        </Button>
      )}

      <Tooltip
        title={
          canWriteOperations
            ? 'Configurar parâmetros, filial e chave API desta câmara'
            : 'Consultar limites operacionais e ficha técnica'
        }
      >
        <Button
          icon={<SettingOutlined />}
          onClick={onOpenUnitConfig}
          aria-label="Configurar Unidade"
        >
          {!canWriteOperations ? 'Limites & Ficha' : null}
        </Button>
      </Tooltip>
    </Space>
  );
}

interface HeroOfflineBannerProps {
  canWriteOperations: boolean;
  isActive: boolean | undefined;
  onOpenManualModal?: () => void;
}

function HeroOfflineBanner({
  canWriteOperations,
  isActive,
  onOpenManualModal,
}: HeroOfflineBannerProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 14,
        background: 'var(--ps-warn-tint)',
        border: '1px solid var(--ps-warn-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: 'rgba(245, 158, 11, 0.18)',
            color: SEMANTIC_HEX.warningText,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <WarningOutlined style={{ fontSize: 16 }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ps-text-primary)' }}>
            Equipamento Offline (&gt; 10 min sem telemetria automática)
          </div>
          <div style={{ fontSize: 12, color: 'var(--ps-text-secondary)' }}>
            {canWriteOperations
              ? 'Registre leituras manuais de contingência para conformidade sanitária até que o controlador retome a comunicação.'
              : 'Os valores instantâneos abaixo refletem o último pacote válido antes da perda de comunicação.'}
          </div>
        </div>
      </div>

      {canWriteOperations && isActive && (
        <Button
          type="primary"
          icon={<ExperimentOutlined />}
          onClick={onOpenManualModal}
          style={{ flexShrink: 0 }}
        >
          <PlusOutlined style={{ fontSize: 11 }} /> Registrar Leitura de Contingência
        </Button>
      )}
    </div>
  );
}

interface HeroTemperatureCardProps {
  effectiveStatus: EquipmentStatus;
  liveTemp: number | null | undefined;
  liveLastUpdate: string | null | undefined;
  targetMetaLabel: string | null | undefined;
  tempDeviationLabel: string | null;
}

function HeroTemperatureCard({
  effectiveStatus,
  liveTemp,
  liveLastUpdate,
  targetMetaLabel,
  tempDeviationLabel,
}: HeroTemperatureCardProps) {
  const isOffline = effectiveStatus === 'offline';

  return (
    <AccentCard
      status={effectiveStatus}
      padding="16px 18px"
      gap={8}
      style={{ height: '100%', justifyContent: 'space-between' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={LABEL_STYLE}>Temperatura {isOffline ? 'Congelada' : 'Atual'}</span>
        {isOffline && (
          <StatusPill
            tone="offline"
            icon={<ClockCircleOutlined style={{ fontSize: 10 }} />}
            tooltip={`Última leitura registrada ${formatDateTimePtBR(liveLastUpdate)}`}
          >
            Congelada
          </StatusPill>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span
          className="ps-tabular"
          style={{
            fontSize: 30,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            color: resolveTempColor(effectiveStatus),
          }}
        >
          {formatTemperature(liveTemp)}
        </span>

        {tempDeviationLabel && (
          <StatusPill tone="critical" bordered>
            {tempDeviationLabel}
          </StatusPill>
        )}
      </div>

      <div
        className="ps-tabular"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          fontSize: 11.5,
          color: 'var(--ps-text-secondary)',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {targetMetaLabel || 'Sem limite ativo'}
        </span>
        <span style={{ color: 'var(--ps-text-muted)', flexShrink: 0 }}>
          {formatRelativeTimePtBR(liveLastUpdate)}
        </span>
      </div>
    </AccentCard>
  );
}

interface HeroPressureCardProps {
  isOffline: boolean;
  livePress: number | null | undefined;
  liveLastUpdate: string | null | undefined;
  pressureMetaLabel: string | null;
}

function HeroPressureCard({
  isOffline,
  livePress,
  liveLastUpdate,
  pressureMetaLabel,
}: HeroPressureCardProps) {
  return (
    <AccentCard
      status="teal"
      padding="16px 18px"
      gap={8}
      style={{ height: '100%', justifyContent: 'space-between' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={LABEL_STYLE}>Pressão de Sucção</span>
        <DashboardOutlined style={{ fontSize: 14, color: SEMANTIC_HEX.teal }} />
      </div>

      <div
        className="ps-tabular"
        style={{
          fontSize: 30,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          color: isOffline ? 'var(--ps-text-muted)' : 'var(--ps-text-primary)',
        }}
      >
        {formatPressure(livePress)}
      </div>

      <div
        className="ps-tabular"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          fontSize: 11.5,
          color: 'var(--ps-text-secondary)',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {pressureMetaLabel || (isOffline ? 'Valor em cache' : 'Leitura de linha')}
        </span>
        <span style={{ color: 'var(--ps-text-muted)', flexShrink: 0 }}>
          {formatShortDateTime(liveLastUpdate)}
        </span>
      </div>
    </AccentCard>
  );
}

interface HeroMaintenanceCardProps {
  lastMaintenanceDate: string | null | undefined;
  maintCountdown: ReturnType<typeof getMaintenanceCountdownInfo>;
  maintTone: StatusTone;
  canWriteOperations: boolean;
  onOpenMaintenanceModal?: () => void;
}

function HeroMaintenanceCard({
  lastMaintenanceDate,
  maintCountdown,
  maintTone,
  canWriteOperations,
  onOpenMaintenanceModal,
}: HeroMaintenanceCardProps) {
  return (
    <AccentCard
      padding="16px 18px"
      gap={8}
      style={{ height: '100%', justifyContent: 'space-between' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={LABEL_STYLE}>Plano Preventivo</span>
        <CalendarOutlined style={{ fontSize: 14, color: SEMANTIC_HEX.brand }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: 'var(--ps-text-secondary)' }}>Última:</span>
          <strong className="ps-tabular" style={{ color: 'var(--ps-text-primary)' }}>
            {lastMaintenanceDate ? formatDatePtBR(lastMaintenanceDate) : 'Sem registro'}
          </strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: 'var(--ps-text-secondary)' }}>Próxima:</span>
          {maintCountdown ? (
            <span
              className="ps-tabular"
              style={{
                fontWeight: 700,
                color: resolveMaintColor(maintTone),
              }}
            >
              {maintCountdown.label}
            </span>
          ) : (
            <span style={{ fontWeight: 600, color: 'var(--ps-text-muted)' }}>Não agendada</span>
          )}
        </div>
      </div>

      {canWriteOperations ? (
        <button
          type="button"
          onClick={onOpenMaintenanceModal}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            color: SEMANTIC_HEX.brand,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          <span>Agendar preventiva</span>
          <ArrowUpOutlined style={{ fontSize: 11, transform: 'rotate(45deg)' }} />
        </button>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--ps-text-muted)' }}>
          Histórico abaixo em Manutenções
        </span>
      )}
    </AccentCard>
  );
}

/**
 * Seção Hero de Nível 3 (Equipamento):
 * - Cabeçalho enxuto em linha única com stepper compacto `‹ 1 / N ›` e engrenagem discreta
 * - Banner de contingência offline acionável com CTA direto de leitura manual
 * - Faixa compacta de 4 cartões KPI (Temperatura c/ delta + Congelada, Pressão em Teal, Relés 2x2, Plano Preventivo)
 */
export default function EquipmentHeroSection({
  equipment,
  branches = [],
  effectiveStatus = 'offline',
  liveTemp,
  livePress,
  liveDoor,
  liveCompressor,
  liveFan,
  liveHeater,
  liveLastUpdate,
  targetMetaLabel,
  tempBounds = null,
  pressureMetaLabel = null,
  siblingIndex = -1,
  siblingCount = 0,
  canWriteOperations = false,
  backLabel = null,
  onBack = null,
  onStepSibling,
  onOpenManualModal,
  onOpenMaintenanceModal,
  onOpenUnitConfig,
}: EquipmentHeroSectionProps) {
  const stCfg = EQUIPMENT_STATUS_CONFIG[effectiveStatus] || EQUIPMENT_STATUS_CONFIG.offline;
  const isOffline = effectiveStatus === 'offline';
  const tempDeviationLabel = computeTempDeviationBadge(liveTemp, tempBounds);
  const maintCountdown = getMaintenanceCountdownInfo(equipment.next_maintenance_date);
  const maintTone = resolveMaintTone(maintCountdown?.tone);
  const showUrgentMaint = maintTone === 'critical' || maintTone === 'warning';

  return (
    <>
      <PageHeader
        backLabel={backLabel}
        onBack={onBack}
        title={equipment.serial}
        monoTitle
        align="center"
        titleBadges={
          <>
            <StatusPill tone={effectiveStatus} dot pulse={effectiveStatus === 'operational'}>
              {isOffline ? formatOfflineBadgeLabel(liveLastUpdate) : stCfg.label}
            </StatusPill>
            <StatusPill tone="neutral">
              {EQUIPMENT_TYPE_LABELS[equipment.type] || equipment.type}
            </StatusPill>
            {maintCountdown && showUrgentMaint && (
              <StatusPill tone={maintTone} icon={<ToolOutlined style={{ fontSize: 11 }} />} bordered>
                {maintCountdown.label}
              </StatusPill>
            )}
          </>
        }
        subtitle={buildHeroSubtitle(equipment, branches)}
        rightSlot={
          <HeroHeaderRightSlot
            siblingIndex={siblingIndex}
            siblingCount={siblingCount}
            canWriteOperations={canWriteOperations}
            onStepSibling={onStepSibling}
            onOpenMaintenanceModal={onOpenMaintenanceModal}
            onOpenUnitConfig={onOpenUnitConfig}
          />
        }
      />

      {isOffline && (
        <HeroOfflineBanner
          canWriteOperations={canWriteOperations}
          isActive={equipment.is_active}
          onOpenManualModal={onOpenManualModal}
        />
      )}

      <Row gutter={[14, 14]}>
        {/* Card 1: Temperatura Atual / Congelada */}
        <Col xs={24} sm={12} xl={6}>
          <HeroTemperatureCard
            effectiveStatus={effectiveStatus}
            liveTemp={liveTemp}
            liveLastUpdate={liveLastUpdate}
            targetMetaLabel={targetMetaLabel}
            tempDeviationLabel={tempDeviationLabel}
          />
        </Col>

        {/* Card 2: Pressão de Sucção (Teal Accent sincronizado com a curva de pressão) */}
        <Col xs={24} sm={12} xl={6}>
          <HeroPressureCard
            isOffline={isOffline}
            livePress={livePress}
            liveLastUpdate={liveLastUpdate}
            pressureMetaLabel={pressureMetaLabel}
          />
        </Col>

        {/* Card 3: Estado Físico 2x2 Grid (Relés & Sensores) */}
        <Col xs={24} sm={12} xl={6}>
          <AccentCard
            padding="16px 18px"
            gap={10}
            style={{ height: '100%', justifyContent: 'space-between' }}
          >
            <span style={LABEL_STYLE}>Estado de Operação (Relés)</span>

            <SubsystemStack
              door={liveDoor}
              compressor={liveCompressor}
              fan={liveFan}
              heater={liveHeater}
              isOffline={isOffline}
              layout="grid"
            />
          </AccentCard>
        </Col>

        {/* Card 4: Plano Preventivo & Conformidade */}
        <Col xs={24} sm={12} xl={6}>
          <HeroMaintenanceCard
            lastMaintenanceDate={equipment.last_maintenance_date}
            maintCountdown={maintCountdown}
            maintTone={maintTone}
            canWriteOperations={canWriteOperations}
            onOpenMaintenanceModal={onOpenMaintenanceModal}
          />
        </Col>
      </Row>
    </>
  );
}
