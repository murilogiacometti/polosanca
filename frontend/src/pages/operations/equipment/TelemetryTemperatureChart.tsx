import { WarningOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  type DotItemDotProps,
  Line,
  type MouseHandlerDataParam,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { StatusPill } from '../../../components/ui';
import { SEMANTIC_HEX } from '../../../theme/tokens';
import type { AlertRule, TelemetryInterval } from '../../../types/models';
import { formatTemperature } from '../../../utils/formatters';
import { isPlottedPoint } from './isPlottedPoint';
import type {
  ContiguousSpan,
  CorrelationInsight,
  PlottedTelemetryPoint,
  PlottedTimelinePin,
  SafeTempCorridor,
} from './telemetryChartTypes';

const { Text } = Typography;

interface TelemetryTemperatureChartProps {
  chartData: PlottedTelemetryPoint[];
  safeTempCorridor: SafeTempCorridor | null;
  effectiveTempRules: AlertRule[];
  compare24h: boolean;
  correlationInsight: CorrelationInsight | null;
  doorOpenSpans: ContiguousSpan[];
  defrostSpans: ContiguousSpan[];
  visiblePins: PlottedTimelinePin[];
  activePlotIdx: number | null;
  dragX1: number | null;
  dragX2: number | null;
  interval: TelemetryInterval;
  isTempBreached: (val: number | null | undefined) => boolean;
  onMouseDown: (state: MouseHandlerDataParam) => void;
  onMouseMove: (state: MouseHandlerDataParam) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
}

function TemperatureChartHeader({
  safeTempCorridor,
  effectiveTempRules,
  compare24h,
  correlationInsight,
}: {
  safeTempCorridor: SafeTempCorridor | null;
  effectiveTempRules: AlertRule[];
  compare24h: boolean;
  correlationInsight: CorrelationInsight | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <Text strong style={{ fontSize: 12.5 }}>
          1. Curva de Temperatura (°C)
        </Text>

        {safeTempCorridor ? (
          <span
            className="ps-tabular"
            style={{ fontSize: 11, color: SEMANTIC_HEX.operationalText, fontWeight: 600 }}
          >
            ▊ Faixa segura: {formatTemperature(safeTempCorridor.low)} a{' '}
            {formatTemperature(safeTempCorridor.high)}
          </span>
        ) : (
          effectiveTempRules[0] && (
            <span
              className="ps-tabular"
              style={{ fontSize: 11, color: SEMANTIC_HEX.criticalText, fontWeight: 600 }}
            >
              --- Limite: {formatTemperature(effectiveTempRules[0].threshold_value)}
            </span>
          )
        )}

        {compare24h && (
          <span style={{ fontSize: 11, color: 'var(--ps-text-muted)' }}>--- Ontem (-24h)</span>
        )}
      </div>

      {correlationInsight && (
        <StatusPill
          tone={correlationInsight.tone}
          icon={<WarningOutlined style={{ fontSize: 11 }} />}
          bordered
        >
          {correlationInsight.label}
        </StatusPill>
      )}
    </div>
  );
}

export default function TelemetryTemperatureChart({
  chartData,
  safeTempCorridor,
  effectiveTempRules,
  compare24h,
  correlationInsight,
  doorOpenSpans,
  defrostSpans,
  visiblePins,
  activePlotIdx,
  dragX1,
  dragX2,
  interval,
  isTempBreached,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
}: TelemetryTemperatureChartProps) {
  const renderTempDot = (props: DotItemDotProps) => {
    const cx = props?.cx;
    const cy = props?.cy;
    const rawPayload: unknown = props?.payload;
    if (typeof cx !== 'number' || typeof cy !== 'number' || !isPlottedPoint(rawPayload)) {
      return null;
    }
    const payload = rawPayload;
    const isCurrent = payload.plotIdx === activePlotIdx;
    if (payload.source === 'manual') {
      const size = isCurrent ? 8 : 6.5;
      return (
        <polygon
          key={`temp-manual-${payload.plotIdx}`}
          points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
          fill="#ea580c"
          stroke="#ffffff"
          strokeWidth={1.8}
        />
      );
    }

    const breached = isTempBreached(payload.temperature);
    if (!isCurrent && !breached && chartData.length > 42) {
      return null;
    }

    return (
      <circle
        key={`temp-dot-${payload.plotIdx}`}
        cx={cx}
        cy={cy}
        r={isCurrent ? 5 : breached ? 3.5 : 2.6}
        fill={breached ? SEMANTIC_HEX.critical : '#ffffff'}
        stroke={breached ? SEMANTIC_HEX.critical : SEMANTIC_HEX.brand}
        strokeWidth={isCurrent ? 2.5 : 1.8}
      />
    );
  };

  return (
    <div
      style={{
        padding: '12px 14px 8px',
        borderRadius: 12,
        border: '1px solid var(--ps-border)',
        background: 'var(--ps-card-bg)',
      }}
    >
      <TemperatureChartHeader
        safeTempCorridor={safeTempCorridor}
        effectiveTempRules={effectiveTempRules}
        compare24h={compare24h}
        correlationInsight={correlationInsight}
      />

      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 14, right: 16, left: 4, bottom: 0 }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
          >
            <defs>
              <linearGradient id="psLv3TempGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SEMANTIC_HEX.brand} stopOpacity={0.18} />
                <stop offset="100%" stopColor={SEMANTIC_HEX.brand} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ps-chart-grid)" />
            <XAxis
              dataKey="plotIdx"
              type="number"
              domain={[0, Math.max(chartData.length - 1, 0)]}
              tickFormatter={(idx: number | string) =>
                chartData[Math.round(Number(idx))]?.shortTime || ''
              }
              tick={{ fontSize: 11, fill: 'var(--ps-text-secondary)' }}
              minTickGap={28}
            />
            <YAxis
              width={54}
              tick={{ fontSize: 11, fill: 'var(--ps-text-secondary)' }}
              unit="°C"
              domain={['auto', 'auto']}
            />

            {safeTempCorridor && (
              <ReferenceArea
                y1={safeTempCorridor.low}
                y2={safeTempCorridor.high}
                fill={SEMANTIC_HEX.operational}
                fillOpacity={0.07}
                ifOverflow="extendDomain"
              />
            )}

            {doorOpenSpans.map((sp) => (
              <ReferenceArea
                key={`door-span-${sp.startPlotIdx}`}
                x1={sp.startPlotIdx}
                x2={Math.max(sp.endPlotIdx, sp.startPlotIdx + 0.35)}
                fill={SEMANTIC_HEX.warning}
                fillOpacity={0.09}
              />
            ))}

            {defrostSpans.map((sp) => (
              <ReferenceArea
                key={`defrost-span-${sp.startPlotIdx}`}
                x1={sp.startPlotIdx}
                x2={Math.max(sp.endPlotIdx, sp.startPlotIdx + 0.35)}
                fill={SEMANTIC_HEX.info}
                fillOpacity={0.08}
              />
            ))}

            {effectiveTempRules.map((rule) =>
              rule.threshold_value !== null && rule.threshold_value !== undefined ? (
                <ReferenceLine
                  key={rule.id}
                  y={rule.threshold_value}
                  stroke={
                    rule.severity === 'critical' ? SEMANTIC_HEX.critical : SEMANTIC_HEX.warning
                  }
                  strokeOpacity={0.8}
                  strokeDasharray="4 4"
                />
              ) : null
            )}

            {visiblePins.map((pin) => (
              <ReferenceLine
                key={`pin-${pin.kind}-${pin.plotIdx}`}
                x={pin.plotIdx}
                stroke={pin.kind === 'alert' ? SEMANTIC_HEX.critical : SEMANTIC_HEX.brand}
                strokeDasharray="2 3"
                strokeOpacity={0.55}
                label={{
                  value: pin.kind === 'alert' ? '!' : '🔧',
                  position: 'top',
                  fill: pin.kind === 'alert' ? SEMANTIC_HEX.criticalText : SEMANTIC_HEX.brand,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              />
            ))}

            {activePlotIdx !== null && (
              <ReferenceLine
                x={activePlotIdx}
                stroke="#0f172a"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            )}

            {dragX1 !== null && dragX2 !== null && dragX1 !== dragX2 && (
              <ReferenceArea
                x1={dragX1}
                x2={dragX2}
                strokeOpacity={0.3}
                fill={SEMANTIC_HEX.brand}
                fillOpacity={0.16}
              />
            )}

            {compare24h && (
              <Line
                type="monotone"
                dataKey="prevDayTemp"
                stroke="#94a3b8"
                strokeOpacity={0.55}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}

            <Area
              type="monotone"
              dataKey="temperature"
              stroke="none"
              fill="url(#psLv3TempGrad)"
              isAnimationActive={false}
            />

            <Line
              type="monotone"
              dataKey="temperature"
              stroke={SEMANTIC_HEX.brand}
              strokeWidth={2.2}
              dot={renderTempDot}
              activeDot={false}
              isAnimationActive={false}
            />

            {interval !== 'raw' && (
              <>
                <Line
                  type="monotone"
                  dataKey="max_temperature"
                  stroke={SEMANTIC_HEX.critical}
                  strokeDasharray="3 3"
                  strokeWidth={1.4}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="min_temperature"
                  stroke="#06b6d4"
                  strokeDasharray="3 3"
                  strokeWidth={1.4}
                  dot={false}
                  isAnimationActive={false}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
