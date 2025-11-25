import type { PlottedTelemetryPoint } from './telemetryChartTypes';

export function isPlottedPoint(value: unknown): value is PlottedTelemetryPoint {
  return (
    typeof value === 'object' &&
    value !== null &&
    'plotIdx' in value &&
    typeof value.plotIdx === 'number'
  );
}
