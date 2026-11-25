import { type RefObject, useState } from 'react';
import { SlidersOutlined, ZoomOutOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Drawer, Empty, Grid, Segmented, Spin } from 'antd';
import type { Dayjs } from 'dayjs';
import DutyCycleSwimlane from '../../../components/Operations/DutyCycleSwimlane';
import type {
  AlertRule,
  ChartTelemetryPoint,
  TelemetryInterval,
  TelemetryWindowKey,
  ThresholdBounds,
  TimelinePin,
} from '../../../types/models';
import TelemetryChartHeaderControls from './TelemetryChartHeaderControls';
import type { SafeTempCorridor } from './telemetryChartTypes';
import TelemetryInspectionRibbon from './TelemetryInspectionRibbon';
import TelemetryPressureChart from './TelemetryPressureChart';
import TelemetryTemperatureChart from './TelemetryTemperatureChart';
import { useTelemetryChartState } from './useTelemetryChartState';

export type { SafeTempCorridor };

export interface EquipmentTelemetryChartCardProps {
  containerRef?: RefObject<HTMLDivElement | null> | null;
  fullChartData?: ChartTelemetryPoint[];
  timelinePins?: TimelinePin[];
  safeTempCorridor?: SafeTempCorridor | null;
  tempBounds?: ThresholdBounds | null;
  pressureMetaLabel?: string | null;
  effectiveTempRules?: AlertRule[];
  effectivePressureRules?: AlertRule[];
  interval?: TelemetryInterval;
  onIntervalChange?: (next: TelemetryInterval) => void;
  timeWindow?: TelemetryWindowKey;
  onTimeWindowChange?: (next: TelemetryWindowKey) => void;
  customRange?: [Dayjs, Dayjs];
  onCustomRangeChange?: (next: [Dayjs, Dayjs]) => void;
  compare24h?: boolean;
  onCompare24hChange?: (checked: boolean) => void;
  lockedMs?: number | null;
  onLockedMsChange?: (nextMs: number | null) => void;
  isRawRangeOver90Days?: boolean;
  telemetryLoading?: boolean;
  exportingCsv?: boolean;
  onExportCsv?: () => void | Promise<void>;
}

const EMPTY_CHART_DATA: ChartTelemetryPoint[] = [];
const EMPTY_PINS: TimelinePin[] = [];
const EMPTY_RULES: AlertRule[] = [];
const { useBreakpoint } = Grid;

function normalizeTelemetryChartProps(
  props: Omit<EquipmentTelemetryChartCardProps, 'containerRef'>
) {
  return {
    fullChartData: props.fullChartData ?? EMPTY_CHART_DATA,
    timelinePins: props.timelinePins ?? EMPTY_PINS,
    safeTempCorridor: props.safeTempCorridor ?? null,
    tempBounds: props.tempBounds ?? null,
    pressureMetaLabel: props.pressureMetaLabel ?? null,
    effectiveTempRules: props.effectiveTempRules ?? EMPTY_RULES,
    effectivePressureRules: props.effectivePressureRules ?? EMPTY_RULES,
    interval: props.interval ?? 'raw',
    timeWindow: props.timeWindow ?? '24h',
    compare24h: props.compare24h ?? true,
    lockedMs: props.lockedMs ?? null,
    isRawRangeOver90Days: props.isRawRangeOver90Days ?? false,
    telemetryLoading: props.telemetryLoading ?? false,
    exportingCsv: props.exportingCsv ?? false,
  };
}

/**
 * Painel de Telemetria Sincronizada de Causa-Raiz (Nível 3):
 * 1. Faixa Escura Persistente de Inspeção + Travamento de Foco (`Fixado`)
 * 2. Camada 1: Curva de Temperatura (°C) com zonas sombreadas de Porta Aberta / Degelo + pílula de Correlação
 * 3. Camada 2: Curva de Pressão de Sucção (kPa) alinhada pixel a pixel no mesmo eixo X (colapsável)
 * 4. Camada 3: Raia Sincronizada de Degelo, Porta e Ciclo de Trabalho com scrubbing bidirecional
 */
export default function EquipmentTelemetryChartCard({
  containerRef,
  ...props
}: EquipmentTelemetryChartCardProps) {
  const cfg = normalizeTelemetryChartProps(props);
  const screens = useBreakpoint();
  const isMobilePhone = !screens.md;
  const [optionsDrawerOpen, setOptionsDrawerOpen] = useState(false);

  const state = useTelemetryChartState({
    fullChartData: cfg.fullChartData,
    timelinePins: cfg.timelinePins,
    tempBounds: cfg.tempBounds,
    interval: cfg.interval,
    lockedMs: cfg.lockedMs,
    onLockedMsChange: props.onLockedMsChange,
  });

  const controlsNode = (
    <TelemetryChartHeaderControls
      compare24h={cfg.compare24h}
      onCompare24hChange={props.onCompare24hChange}
      showPressureChart={state.showPressureChart}
      onShowPressureChartChange={state.setShowPressureChart}
      interval={cfg.interval}
      onIntervalChange={props.onIntervalChange}
      timeWindow={cfg.timeWindow}
      onTimeWindowChange={props.onTimeWindowChange}
      customRange={props.customRange}
      onCustomRangeChange={props.onCustomRangeChange}
      onResetZoom={state.resetZoom}
      isRawRangeOver90Days={cfg.isRawRangeOver90Days}
      exportingCsv={cfg.exportingCsv}
      onExportCsv={props.onExportCsv}
    />
  );

  const mobileWindowValue: TelemetryWindowKey =
    cfg.timeWindow === '6h' || cfg.timeWindow === '24h' || cfg.timeWindow === '7d'
      ? cfg.timeWindow
      : '24h';

  return (
    <div ref={containerRef}>
      <Card
        title={
          isMobilePhone ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>
                  Telemetria Sincronizada de Causa-Raiz
                </span>
                <Button
                  type="text"
                  icon={<SlidersOutlined />}
                  aria-label="Opções de telemetria"
                  onClick={() => setOptionsDrawerOpen(true)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Segmented<TelemetryWindowKey>
                  className="ps-pill-switcher"
                  value={mobileWindowValue}
                  onChange={(next) => {
                    state.resetZoom();
                    props.onTimeWindowChange?.(next);
                  }}
                  options={[
                    { value: '6h', label: '6h' },
                    { value: '24h', label: '24h' },
                    { value: '7d', label: '7d' },
                  ]}
                />
                {state.zoomRange && (
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<ZoomOutOutlined />}
                    onClick={state.resetZoom}
                  >
                    Resetar zoom
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15.5, fontWeight: 700 }}>
                  Telemetria Sincronizada de Causa-Raiz
                </span>
                {state.zoomRange && (
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<ZoomOutOutlined />}
                    onClick={state.resetZoom}
                  >
                    Resetar zoom ({state.chartData.length} leituras)
                  </Button>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--ps-text-secondary)' }}>
                Passe o cursor para cruzar Temperatura, Pressão e Relés no mesmo eixo temporal · Clique para fixar ou arraste para dar zoom
              </div>
            </div>
          )
        }
        extra={isMobilePhone ? undefined : controlsNode}
      >
        {cfg.isRawRangeOver90Days && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 14 }}
            message="Limite de 90 dias para dados brutos (raw)"
            description="Para exportar períodos acima de 90 dias em CSV, alterne o seletor acima para 5 min, 1h ou 1d."
          />
        )}

        {cfg.telemetryLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : state.chartData.length === 0 ? (
          <Empty description="Nenhuma leitura registrada para o período selecionado." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, userSelect: 'none' }}>
            {state.activePoint && (
              <TelemetryInspectionRibbon
                activePoint={state.activePoint}
                lockedPlotIdx={state.lockedPlotIdx}
                compare24h={cfg.compare24h}
                interval={cfg.interval}
                isTempBreached={state.isTempBreached}
                onClearLock={() => props.onLockedMsChange?.(null)}
              />
            )}

            <TelemetryTemperatureChart
              chartData={state.chartData}
              safeTempCorridor={cfg.safeTempCorridor}
              effectiveTempRules={cfg.effectiveTempRules}
              compare24h={cfg.compare24h}
              correlationInsight={state.correlationInsight}
              doorOpenSpans={state.doorOpenSpans}
              defrostSpans={state.defrostSpans}
              visiblePins={state.visiblePins}
              activePlotIdx={state.activePlotIdx}
              dragX1={state.dragX1}
              dragX2={state.dragX2}
              interval={cfg.interval}
              isTempBreached={state.isTempBreached}
              onMouseDown={state.handleChartMouseDown}
              onMouseMove={state.handleChartMouseMove}
              onMouseUp={state.handleChartMouseUp}
              onMouseLeave={state.handleChartMouseLeave}
            />

            {state.showPressureChart && (
              <TelemetryPressureChart
                chartData={state.chartData}
                pressureMetaLabel={cfg.pressureMetaLabel}
                effectivePressureRules={cfg.effectivePressureRules}
                activePlotIdx={state.activePlotIdx}
                dragX1={state.dragX1}
                dragX2={state.dragX2}
                onMouseDown={state.handleChartMouseDown}
                onMouseMove={state.handleChartMouseMove}
                onMouseUp={state.handleChartMouseUp}
                onMouseLeave={state.handleChartMouseLeave}
              />
            )}

            {cfg.interval === 'raw' && (
              <DutyCycleSwimlane
                data={state.chartData}
                activeIdx={state.activePlotIdx}
                lockedIdx={state.lockedPlotIdx}
                onHoverIdx={state.setHoverPlotIdx}
                onToggleLockIdx={state.toggleLockAtPlotIdx}
              />
            )}
          </div>
        )}
      </Card>

      <Drawer
        open={optionsDrawerOpen}
        onClose={() => setOptionsDrawerOpen(false)}
        placement="bottom"
        height="auto"
        title="Opções de Telemetria"
        styles={{ body: { padding: '16px 18px 28px' } }}
      >
        {controlsNode}
      </Drawer>
    </div>
  );
}
