import { useId, type ReactNode } from 'react';
import { Tooltip, Typography } from 'antd';
import type { EquipmentStatus, SparklinePoint, ThresholdBounds } from '../../types/models';
import { formatTemperature } from '../../utils/formatters';
import { buildSparklineGeometry, type SparklineGeometry } from './sparklineGeometry';

const { Text } = Typography;

const STATUS_STROKE: Record<EquipmentStatus, string> = {
  operational: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
  offline: '#94a3b8',
};

export interface SparklineMiniProps {
  points?: SparklinePoint[] | null;
  status?: EquipmentStatus;
  threshold?: ThresholdBounds | null;
  showHeader?: boolean;
  withTopBorder?: boolean;
  rightMeta?: ReactNode;
  height?: number;
}

function getLimitStroke(status: EquipmentStatus, breached: boolean): string {
  if (status === 'offline') return '#94a3b8';
  return breached ? '#ef4444' : '#10b981';
}

function SparklineEmptyState({
  withTopBorder,
  showHeader,
  rightMeta,
}: {
  withTopBorder: boolean;
  showHeader: boolean;
  rightMeta: ReactNode;
}) {
  return (
    <div
      style={{
        paddingTop: withTopBorder ? 8 : 2,
        borderTop: withTopBorder ? '1px solid var(--ps-subtle-divider)' : 'none',
      }}
    >
      {showHeader ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <Text type="secondary" style={{ fontSize: 11 }}>
            Tendência 24h
          </Text>
          {rightMeta || (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Sem histórico 24h
            </Text>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--ps-text-secondary)', padding: '4px 0' }}>
          Sem histórico nas últimas 24h
        </div>
      )}
    </div>
  );
}

function SparklineLimitLine({
  y,
  width,
  stroke,
  opacity,
  strokeWidth,
}: {
  y: number;
  width: number;
  stroke: string;
  opacity: number;
  strokeWidth: string;
}) {
  return (
    <line
      x1={0}
      y1={y}
      x2={width}
      y2={y}
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={strokeWidth}
      strokeDasharray="3 3"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function SparklineSvg({
  geometry,
  height,
  gradId,
  stroke,
  status,
}: {
  geometry: SparklineGeometry;
  height: number;
  gradId: string;
  stroke: string;
  status: EquipmentStatus;
}) {
  const { width, safeBandTop, safeBandHeight, highLineY, lowLineY, lastPt } = geometry;
  const bandFill =
    status === 'critical' || status === 'warning'
      ? 'rgba(148, 163, 184, 0.13)'
      : 'rgba(16, 185, 129, 0.08)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block', overflow: 'visible' }}
      aria-label="Curva de temperatura nas últimas 24 horas"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0.01} />
        </linearGradient>
      </defs>

      {safeBandTop !== null && safeBandHeight !== null && safeBandHeight > 1 && (
        <rect x={0} y={safeBandTop} width={width} height={safeBandHeight} fill={bandFill} />
      )}

      {highLineY !== null && (
        <SparklineLimitLine
          y={highLineY}
          width={width}
          stroke={getLimitStroke(status, geometry.isHighBreached)}
          opacity={0.55}
          strokeWidth="1.15"
        />
      )}

      {lowLineY !== null && (
        <SparklineLimitLine
          y={lowLineY}
          width={width}
          stroke={getLimitStroke(status, geometry.isLowBreached)}
          opacity={0.5}
          strokeWidth="1.1"
        />
      )}

      <path d={geometry.areaPath} fill={`url(#${gradId})`} />
      <path
        d={geometry.linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={status === 'offline' ? '4 3' : undefined}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastPt.x} cy={lastPt.y} r="2.6" fill={stroke} />
    </svg>
  );
}

/**
 * Mini curva de tendência (sparkline) de 24 horas renderizada em SVG vetorial leve,
 * com faixa segura sombreada + linhas tracejadas de limite e cabeçalho enxuto.
 */
export default function SparklineMini({
  points = [],
  status = 'operational',
  threshold = null,
  showHeader = true,
  withTopBorder = true,
  rightMeta = null,
  height = 34,
}: SparklineMiniProps) {
  const rawId = useId();
  const gradId = `ps-spark-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const stroke = STATUS_STROKE[status] || STATUS_STROKE.operational;

  if (!Array.isArray(points) || points.length === 0) {
    return (
      <SparklineEmptyState
        withTopBorder={withTopBorder}
        showHeader={showHeader}
        rightMeta={rightMeta}
      />
    );
  }

  const geometry = buildSparklineGeometry(points, threshold, height);
  if (!geometry) {
    return null;
  }

  return (
    <Tooltip title={geometry.tooltipTitle}>
      <div
        style={{
          paddingTop: withTopBorder ? 8 : 0,
          borderTop: withTopBorder ? '1px solid var(--ps-subtle-divider)' : 'none',
        }}
      >
        {showHeader && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              marginBottom: 6,
            }}
          >
            <Text type="secondary" style={{ fontSize: 11 }}>
              Tendência 24h
            </Text>

            {rightMeta || (
              <span
                className="ps-tabular"
                style={{
                  fontSize: 10.5,
                  color: 'var(--ps-text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatTemperature(geometry.dataMin)} a {formatTemperature(geometry.dataMax)}
              </span>
            )}
          </div>
        )}

        <SparklineSvg
          geometry={geometry}
          height={height}
          gradId={gradId}
          stroke={stroke}
          status={status}
        />
      </div>
    </Tooltip>
  );
}
