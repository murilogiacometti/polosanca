import type { ChartTelemetryPoint, StatusTone, TimelinePin } from '../../../types/models';

export type PlottedTelemetryPoint = Omit<ChartTelemetryPoint, 'plotIdx'> & {
  plotIdx: number;
};

export type PlottedTimelinePin = Omit<TimelinePin, 'plotIdx'> & {
  plotIdx: number;
};

export interface ContiguousSpan {
  startPlotIdx: number;
  endPlotIdx: number;
  startPoint: PlottedTelemetryPoint;
  endPoint: PlottedTelemetryPoint;
}

export interface ZoomRange {
  start: number;
  end: number;
}

export interface CorrelationInsight {
  tone: StatusTone;
  label: string;
}

export interface SafeTempCorridor {
  low: number;
  high: number;
}
