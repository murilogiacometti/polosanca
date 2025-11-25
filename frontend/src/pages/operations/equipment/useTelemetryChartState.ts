import { useCallback, useMemo, useState } from 'react';
import type { MouseHandlerDataParam } from 'recharts';
import type {
  ChartTelemetryPoint,
  TelemetryInterval,
  ThresholdBounds,
  TimelinePin,
} from '../../../types/models';
import { formatTemperature } from '../../../utils/formatters';
import { isSignalActive } from './isSignalActive';
import type {
  ContiguousSpan,
  CorrelationInsight,
  PlottedTelemetryPoint,
  PlottedTimelinePin,
  ZoomRange,
} from './telemetryChartTypes';

function buildContiguousSpans(
  data: PlottedTelemetryPoint[],
  predicate: (pt: PlottedTelemetryPoint) => boolean
): ContiguousSpan[] {
  const spans: ContiguousSpan[] = [];
  data.forEach((pt, i) => {
    if (!predicate(pt)) return;
    const prev = spans[spans.length - 1];
    if (prev && prev.endPlotIdx === i - 1) {
      prev.endPlotIdx = i;
      prev.endPoint = pt;
    } else {
      spans.push({
        startPlotIdx: i,
        endPlotIdx: i,
        startPoint: pt,
        endPoint: pt,
      });
    }
  });
  return spans;
}

function findClosestPlotIdx(
  chartData: PlottedTelemetryPoint[],
  lockedMs: number | null | undefined
): number | null {
  if (lockedMs === null || lockedMs === undefined || chartData.length === 0) return null;
  let bestPlotIdx: number | null = null;
  let bestDiff = Infinity;
  for (let i = 0; i < chartData.length; i += 1) {
    const pt = chartData[i];
    if (!pt) continue;
    const ms = pt.ms;
    if (!Number.isNaN(ms)) {
      const diff = Math.abs(ms - lockedMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestPlotIdx = i;
      }
    }
  }
  return bestPlotIdx;
}

function resolveActivePlotIdx(
  chartData: PlottedTelemetryPoint[],
  hoverPlotIdx: number | null,
  lockedPlotIdx: number | null
): number | null {
  if (hoverPlotIdx !== null && chartData[hoverPlotIdx]) return hoverPlotIdx;
  if (lockedPlotIdx !== null && chartData[lockedPlotIdx]) return lockedPlotIdx;
  return chartData.length > 0 ? chartData.length - 1 : null;
}

function getVisibleTimelinePins(
  timelinePins: TimelinePin[],
  zoomRange: ZoomRange | null,
  chartDataLength: number,
  fullChartDataLength: number
): PlottedTimelinePin[] {
  if (chartDataLength === 0) return [];
  const baseStart = zoomRange ? zoomRange.start : 0;
  const baseEnd = zoomRange ? zoomRange.end : fullChartDataLength - 1;
  return timelinePins
    .filter((p) => p.idx >= baseStart && p.idx <= baseEnd)
    .map((p) => ({
      ...p,
      plotIdx: p.idx - baseStart,
    }));
}

function isTempValueBreached(
  val: number | null | undefined,
  tempBounds: ThresholdBounds | null
): boolean {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return false;
  const num = Number(val);
  if (tempBounds?.high !== null && tempBounds?.high !== undefined && num > tempBounds.high) {
    return true;
  }
  if (tempBounds?.low !== null && tempBounds?.low !== undefined && num < tempBounds.low) {
    return true;
  }
  return false;
}

function detectCorrelationInsight(
  chartData: PlottedTelemetryPoint[],
  doorOpenSpans: ContiguousSpan[],
  defrostSpans: ContiguousSpan[],
  interval: TelemetryInterval,
  isTempBreached: (val: number | null | undefined) => boolean
): CorrelationInsight | null {
  if (interval !== 'raw' || chartData.length < 2) return null;
  const breachedPoints = chartData.filter((pt) => isTempBreached(pt.temperature));
  const firstBreached = breachedPoints[0];
  if (!firstBreached) return null;

  const peakPt = breachedPoints.reduce(
    (acc, cur) => (Number(cur.temperature) > Number(acc.temperature) ? cur : acc),
    firstBreached
  );

  const matchingDoorSpan = doorOpenSpans.find(
    (sp) => peakPt.plotIdx >= sp.startPlotIdx && peakPt.plotIdx <= sp.endPlotIdx + 3
  );
  if (matchingDoorSpan) {
    return {
      tone: 'warning',
      label: `Correlação: Porta aberta (${matchingDoorSpan.startPoint.shortTime}) associada ao pico de ${formatTemperature(peakPt.temperature)}`,
    };
  }

  const matchingDefrostSpan = defrostSpans.find(
    (sp) => peakPt.plotIdx >= sp.startPlotIdx && peakPt.plotIdx <= sp.endPlotIdx + 3
  );
  if (matchingDefrostSpan) {
    return {
      tone: 'brand',
      label: `Correlação: Degelo ativo (${matchingDefrostSpan.startPoint.shortTime}) durante elevação para ${formatTemperature(peakPt.temperature)}`,
    };
  }

  return null;
}

interface UseTelemetryChartStateParams {
  fullChartData: ChartTelemetryPoint[];
  timelinePins: TimelinePin[];
  tempBounds: ThresholdBounds | null;
  interval: TelemetryInterval;
  lockedMs: number | null;
  onLockedMsChange?: (nextMs: number | null) => void;
}

export function useTelemetryChartState({
  fullChartData,
  timelinePins,
  tempBounds,
  interval,
  lockedMs,
  onLockedMsChange,
}: UseTelemetryChartStateParams) {
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragEndIdx, setDragEndIdx] = useState<number | null>(null);
  const [hoverPlotIdx, setHoverPlotIdx] = useState<number | null>(null);
  const [showPressureChart, setShowPressureChart] = useState(true);

  const chartData = useMemo<PlottedTelemetryPoint[]>(() => {
    const sliced = zoomRange
      ? fullChartData.slice(zoomRange.start, zoomRange.end + 1)
      : fullChartData;
    return sliced.map((pt, plotIdx) => ({ ...pt, plotIdx }));
  }, [fullChartData, zoomRange]);

  const lockedPlotIdx = useMemo<number | null>(
    () => findClosestPlotIdx(chartData, lockedMs),
    [chartData, lockedMs]
  );

  const activePlotIdx = resolveActivePlotIdx(chartData, hoverPlotIdx, lockedPlotIdx);
  const activePoint = activePlotIdx !== null ? chartData[activePlotIdx] : null;

  const visiblePins = useMemo<PlottedTimelinePin[]>(
    () => getVisibleTimelinePins(timelinePins, zoomRange, chartData.length, fullChartData.length),
    [timelinePins, zoomRange, chartData.length, fullChartData.length]
  );

  const doorOpenSpans = useMemo<ContiguousSpan[]>(
    () =>
      interval === 'raw'
        ? buildContiguousSpans(chartData, (pt) => pt.source !== 'manual' && isSignalActive(pt.door))
        : [],
    [chartData, interval]
  );

  const defrostSpans = useMemo<ContiguousSpan[]>(
    () =>
      interval === 'raw'
        ? buildContiguousSpans(
            chartData,
            (pt) => pt.source !== 'manual' && isSignalActive(pt.heater)
          )
        : [],
    [chartData, interval]
  );

  const isTempBreached = useCallback(
    (val: number | null | undefined): boolean => isTempValueBreached(val, tempBounds),
    [tempBounds]
  );

  const correlationInsight = useMemo<CorrelationInsight | null>(
    () => detectCorrelationInsight(chartData, doorOpenSpans, defrostSpans, interval, isTempBreached),
    [chartData, doorOpenSpans, defrostSpans, interval, isTempBreached]
  );

  const toggleLockAtPlotIdx = (plotIdx: number) => {
    const pt = chartData[plotIdx];
    if (!pt || Number.isNaN(pt.ms)) return;
    onLockedMsChange?.(lockedPlotIdx === plotIdx ? null : pt.ms);
  };

  const handleChartMouseDown = (state: MouseHandlerDataParam) => {
    if (state?.activeTooltipIndex === undefined || state?.activeTooltipIndex === null) return;
    const idx = Number(state.activeTooltipIndex);
    if (!Number.isNaN(idx)) {
      setDragStartIdx(idx);
      setDragEndIdx(idx);
    }
  };

  const handleChartMouseMove = (state: MouseHandlerDataParam) => {
    if (state?.activeTooltipIndex === undefined || state?.activeTooltipIndex === null) return;
    const idx = Number(state.activeTooltipIndex);
    if (!Number.isNaN(idx)) {
      setHoverPlotIdx(idx);
      if (dragStartIdx !== null) {
        setDragEndIdx(idx);
      }
    }
  };

  const handleChartMouseLeave = () => {
    setHoverPlotIdx(null);
    setDragStartIdx(null);
    setDragEndIdx(null);
  };

  const handleChartMouseUp = () => {
    if (dragStartIdx !== null && dragEndIdx !== null) {
      if (Math.abs(dragEndIdx - dragStartIdx) >= 2) {
        const baseOffset = zoomRange ? zoomRange.start : 0;
        setZoomRange({
          start: baseOffset + Math.min(dragStartIdx, dragEndIdx),
          end: baseOffset + Math.max(dragStartIdx, dragEndIdx),
        });
      } else {
        toggleLockAtPlotIdx(dragStartIdx);
      }
    }
    setDragStartIdx(null);
    setDragEndIdx(null);
  };

  const dragX1 = dragStartIdx !== null && chartData[dragStartIdx] ? dragStartIdx : null;
  const dragX2 = dragEndIdx !== null && chartData[dragEndIdx] ? dragEndIdx : null;

  return {
    zoomRange,
    resetZoom: () => setZoomRange(null),
    showPressureChart,
    setShowPressureChart,
    setHoverPlotIdx,
    chartData,
    lockedPlotIdx,
    activePlotIdx,
    activePoint,
    visiblePins,
    doorOpenSpans,
    defrostSpans,
    isTempBreached,
    correlationInsight,
    dragX1,
    dragX2,
    toggleLockAtPlotIdx,
    handleChartMouseDown,
    handleChartMouseMove,
    handleChartMouseLeave,
    handleChartMouseUp,
  };
}
