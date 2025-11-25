import type { SparklinePoint, ThresholdBounds } from '../../types/models';
import { formatTemperature } from '../../utils/formatters';

interface SparklineCoordinate {
  x: number;
  y: number;
}

export interface SparklineGeometry {
  width: number;
  dataMin: number;
  dataMax: number;
  linePath: string;
  areaPath: string;
  lastPt: SparklineCoordinate;
  highLineY: number | null;
  lowLineY: number | null;
  isHighBreached: boolean;
  isLowBreached: boolean;
  safeBandTop: number | null;
  safeBandHeight: number | null;
  tooltipTitle: string;
}

function parseOptionalLimit(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function computeDomain(
  dataMin: number,
  dataMax: number,
  lowLimit: number | null,
  highLimit: number | null
): { domainMin: number; domainMax: number; span: number } {
  const candidates = [dataMin, dataMax];
  if (highLimit !== null && Math.abs(highLimit - dataMax) <= 25) {
    candidates.push(highLimit);
  }
  if (lowLimit !== null && Math.abs(lowLimit - dataMin) <= 25) {
    candidates.push(lowLimit);
  }

  const rawMin = Math.min(...candidates);
  const rawMax = Math.max(...candidates);
  const rawSpan = rawMax - rawMin;
  const padVal = rawSpan === 0 ? 1.5 : rawSpan * 0.14;
  const domainMin = rawMin - padVal;
  const domainMax = rawMax + padVal;

  return {
    domainMin,
    domainMax,
    span: domainMax - domainMin || 1,
  };
}

function formatLimitSummary(lowLimit: number | null, highLimit: number | null): string | null {
  if (highLimit !== null && lowLimit !== null) {
    return `Faixa ${formatTemperature(lowLimit)} a ${formatTemperature(highLimit)}`;
  }
  if (highLimit !== null) {
    return `Limite ≤ ${formatTemperature(highLimit)}`;
  }
  if (lowLimit !== null) {
    return `Limite ≥ ${formatTemperature(lowLimit)}`;
  }
  return null;
}

function buildTooltipTitle(
  dataMin: number,
  dataMax: number,
  delta: number,
  lowLimit: number | null,
  highLimit: number | null
): string {
  const deltaFormatted = `${delta >= 0 ? '+' : ''}${delta.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} °C`;
  const limitSummary = formatLimitSummary(lowLimit, highLimit);
  const suffix = limitSummary ? ` • ${limitSummary}` : '';
  return `Últimas 24h: Mín ${formatTemperature(dataMin)} • Máx ${formatTemperature(
    dataMax
  )} (${deltaFormatted})${suffix}`;
}

function computeLimitY(
  limit: number | null,
  domainMin: number,
  domainMax: number,
  valueToY: (val: number) => number
): number | null {
  if (limit === null || limit < domainMin || limit > domainMax) return null;
  return valueToY(limit);
}

export function buildSparklineGeometry(
  points: SparklinePoint[],
  threshold: ThresholdBounds | null,
  height: number,
  width = 200
): SparklineGeometry | null {
  const values = points.map((p) => Number(p.v)).filter((v) => !Number.isNaN(v));
  const firstVal = values[0];
  const lastVal = values[values.length - 1];
  if (firstVal === undefined || lastVal === undefined) return null;

  const highLimit = parseOptionalLimit(threshold?.high);
  const lowLimit = parseOptionalLimit(threshold?.low);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const { domainMin, domainMax, span } = computeDomain(dataMin, dataMax, lowLimit, highLimit);

  const padY = 4;
  const usableH = height - padY * 2;
  const valueToY = (val: number): number => {
    const clamped = Math.max(domainMin, Math.min(domainMax, val));
    const norm = (clamped - domainMin) / span;
    return Number((padY + (1 - norm) * usableH).toFixed(1));
  };

  const coords: SparklineCoordinate[] =
    values.length === 1
      ? [
          { x: 0, y: valueToY(firstVal) },
          { x: width, y: valueToY(firstVal) },
        ]
      : values.map((val, idx) => ({
          x: Number(((idx / (values.length - 1)) * width).toFixed(1)),
          y: valueToY(val),
        }));

  const lastPt = coords[coords.length - 1];
  if (!lastPt) return null;

  const linePath = coords.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const highLineY = computeLimitY(highLimit, domainMin, domainMax, valueToY);
  const lowLineY = computeLimitY(lowLimit, domainMin, domainMax, valueToY);
  const hasBand = highLineY !== null && lowLineY !== null;

  return {
    width,
    dataMin,
    dataMax,
    linePath,
    areaPath,
    lastPt,
    highLineY,
    lowLineY,
    isHighBreached: highLimit !== null && dataMax > highLimit,
    isLowBreached: lowLimit !== null && dataMin < lowLimit,
    safeBandTop: hasBand ? Math.min(highLineY, lowLineY) : null,
    safeBandHeight: hasBand ? Math.abs(lowLineY - highLineY) : null,
    tooltipTitle: buildTooltipTitle(
      dataMin,
      dataMax,
      lastVal - firstVal,
      lowLimit,
      highLimit
    ),
  };
}
