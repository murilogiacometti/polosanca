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
import { SEMANTIC_HEX } from '../../../theme/tokens';
import type { AlertRule } from '../../../types/models';
import { isPlottedPoint } from './isPlottedPoint';
import type { PlottedTelemetryPoint } from './telemetryChartTypes';

const { Text } = Typography;

interface TelemetryPressureChartProps {
  chartData: PlottedTelemetryPoint[];
  pressureMetaLabel: string | null;
  effectivePressureRules: AlertRule[];
  activePlotIdx: number | null;
  dragX1: number | null;
  dragX2: number | null;
  onMouseDown: (state: MouseHandlerDataParam) => void;
  onMouseMove: (state: MouseHandlerDataParam) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
}

export default function TelemetryPressureChart({
  chartData,
  pressureMetaLabel,
  effectivePressureRules,
  activePlotIdx,
  dragX1,
  dragX2,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
}: TelemetryPressureChartProps) {
  const renderPressDot = (props: DotItemDotProps) => {
    const cx = props?.cx;
    const cy = props?.cy;
    const rawPayload: unknown = props?.payload;
    if (
      typeof cx !== 'number' ||
      typeof cy !== 'number' ||
      !isPlottedPoint(rawPayload) ||
      rawPayload.pressure === null ||
      rawPayload.pressure === undefined
    ) {
      return null;
    }
    const payload = rawPayload;
    const isCurrent = payload.plotIdx === activePlotIdx;
    if (!isCurrent && chartData.length > 42) {
      return null;
    }
    return (
      <circle
        key={`press-dot-${payload.plotIdx}`}
        cx={cx}
        cy={cy}
        r={isCurrent ? 4.8 : 2.5}
        fill="#ffffff"
        stroke={SEMANTIC_HEX.teal}
        strokeWidth={isCurrent ? 2.4 : 1.8}
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <Text strong style={{ fontSize: 12.5 }}>
          2. Curva de Pressão de Sucção (kPa) — Ciclo do Compressor
        </Text>
        {pressureMetaLabel && (
          <span
            className="ps-tabular"
            style={{ fontSize: 11, color: SEMANTIC_HEX.teal, fontWeight: 600 }}
          >
            {pressureMetaLabel}
          </span>
        )}
      </div>

      <div style={{ width: '100%', height: 155 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 16, left: 4, bottom: 0 }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
          >
            <defs>
              <linearGradient id="psLv3PressGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SEMANTIC_HEX.teal} stopOpacity={0.18} />
                <stop offset="100%" stopColor={SEMANTIC_HEX.teal} stopOpacity={0.01} />
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
              domain={['auto', 'auto']}
            />

            {effectivePressureRules.map((rule) =>
              rule.threshold_value !== null && rule.threshold_value !== undefined ? (
                <ReferenceLine
                  key={rule.id}
                  y={rule.threshold_value}
                  stroke={
                    rule.severity === 'critical' ? SEMANTIC_HEX.critical : SEMANTIC_HEX.warning
                  }
                  strokeDasharray="4 4"
                />
              ) : null
            )}

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
                fill={SEMANTIC_HEX.teal}
                fillOpacity={0.16}
              />
            )}

            <Area
              type="monotone"
              dataKey="pressure"
              stroke="none"
              fill="url(#psLv3PressGrad)"
              connectNulls
              isAnimationActive={false}
            />

            <Line
              type="monotone"
              dataKey="pressure"
              stroke={SEMANTIC_HEX.teal}
              strokeWidth={2}
              connectNulls
              dot={renderPressDot}
              activeDot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
