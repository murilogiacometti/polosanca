import {
  ClockCircleOutlined,
  CloseOutlined,
  FireOutlined,
  PushpinOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import type { TelemetryInterval } from '../../../types/models';
import {
  formatDateTimePtBR,
  formatPressure,
  formatTemperature,
} from '../../../utils/formatters';
import { isSignalActive } from './isSignalActive';
import type { PlottedTelemetryPoint } from './telemetryChartTypes';

interface TelemetryInspectionRibbonProps {
  activePoint: PlottedTelemetryPoint;
  lockedPlotIdx: number | null;
  compare24h: boolean;
  interval: TelemetryInterval;
  isTempBreached: (val: number | null | undefined) => boolean;
  onClearLock: () => void;
}

function RelayStatusBadges({ point }: { point: PlottedTelemetryPoint }) {
  const doorActive = isSignalActive(point.door);
  const compressorActive = isSignalActive(point.compressor);
  const fanActive = isSignalActive(point.fan);
  const heaterActive = isSignalActive(point.heater);

  return (
    <>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          background: doorActive ? 'rgba(245, 158, 11, 0.25)' : '#1e293b',
          color: doorActive ? '#fcd34d' : '#94a3b8',
          border: doorActive ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid transparent',
        }}
      >
        <UnlockOutlined style={{ fontSize: 10.5 }} />
        Porta: {doorActive ? 'ABERTA' : 'Fechada'}
      </span>

      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          background: compressorActive ? 'rgba(16, 185, 129, 0.2)' : '#1e293b',
          color: compressorActive ? '#6ee7b7' : '#94a3b8',
        }}
      >
        <ThunderboltOutlined style={{ fontSize: 10.5 }} />
        Comp: {compressorActive ? 'ON' : 'OFF'}
      </span>

      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          background: fanActive ? 'rgba(59, 130, 246, 0.22)' : '#1e293b',
          color: fanActive ? '#93c5fd' : '#94a3b8',
        }}
      >
        <SyncOutlined style={{ fontSize: 10.5 }} />
        Vent: {fanActive ? 'ON' : 'OFF'}
      </span>

      {heaterActive && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(14, 165, 233, 0.24)',
            color: '#7dd3fc',
          }}
        >
          <FireOutlined style={{ fontSize: 10.5 }} />
          Degelo: ON
        </span>
      )}
    </>
  );
}

function TimelineEventsStrip({ point }: { point: PlottedTelemetryPoint }) {
  const hasEvents = Array.isArray(point.timelineEvents) && point.timelineEvents.length > 0;
  if (!hasEvents && !point.notes) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        paddingTop: 5,
        borderTop: '1px solid rgba(148, 163, 184, 0.16)',
        fontSize: 11.5,
      }}
    >
      {point.timelineEvents?.map((ev, i) => (
        <span
          key={`${ev.kind}-${i}`}
          style={{
            color: ev.kind === 'alert' ? '#fca5a5' : '#93c5fd',
            fontWeight: 600,
          }}
        >
          {ev.kind === 'alert' ? '● ' : '🔧 '}
          {ev.label}
        </span>
      ))}
      {point.notes && <span style={{ color: '#fde68a' }}>Nota: {point.notes}</span>}
    </div>
  );
}

export default function TelemetryInspectionRibbon({
  activePoint,
  lockedPlotIdx,
  compare24h,
  interval,
  isTempBreached,
  onClearLock,
}: TelemetryInspectionRibbonProps) {
  const showPrevDay =
    compare24h && activePoint.prevDayTemp !== null && activePoint.prevDayTemp !== undefined;
  const showMinMax =
    activePoint.min_temperature !== undefined && activePoint.min_temperature !== null;

  return (
    <div
      style={{
        background: '#0f172a',
        color: '#e2e8f0',
        borderRadius: 12,
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.14)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
          <span
            className="ps-tabular"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ClockCircleOutlined style={{ color: '#60a5fa', fontSize: 13 }} />
            <strong style={{ color: '#ffffff' }}>
              {formatDateTimePtBR(activePoint.timestamp)}
            </strong>
            {lockedPlotIdx !== null && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '1px 7px',
                  borderRadius: 6,
                  background: 'rgba(59, 130, 246, 0.28)',
                  color: '#bfdbfe',
                  fontSize: 10.5,
                  fontWeight: 700,
                }}
              >
                <PushpinOutlined style={{ fontSize: 10 }} />
                Fixado
              </span>
            )}
            {activePoint.source === 'manual' && (
              <span
                style={{
                  padding: '1px 7px',
                  borderRadius: 6,
                  background: 'rgba(249, 115, 22, 0.25)',
                  color: '#fdba74',
                  fontSize: 10.5,
                  fontWeight: 700,
                }}
              >
                ◆ Aferição Manual
              </span>
            )}
          </span>

          <span className="ps-tabular">
            <span style={{ color: '#94a3b8' }}>Temp: </span>
            <strong
              style={{
                color: isTempBreached(activePoint.temperature) ? '#fb7185' : '#34d399',
              }}
            >
              {formatTemperature(activePoint.temperature)}
            </strong>
            {showPrevDay && (
              <span style={{ color: '#94a3b8', marginLeft: 5 }}>
                (Ontem: {formatTemperature(activePoint.prevDayTemp)})
              </span>
            )}
            {showMinMax && (
              <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>
                [Mín {formatTemperature(activePoint.min_temperature)} · Máx{' '}
                {formatTemperature(activePoint.max_temperature)}]
              </span>
            )}
          </span>

          <span className="ps-tabular">
            <span style={{ color: '#94a3b8' }}>Pressão: </span>
            <strong style={{ color: '#5eead4' }}>{formatPressure(activePoint.pressure)}</strong>
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {interval === 'raw' && activePoint.source !== 'manual' && (
            <RelayStatusBadges point={activePoint} />
          )}

          {lockedPlotIdx !== null && (
            <button
              type="button"
              onClick={onClearLock}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 6,
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#cbd5e1',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <CloseOutlined style={{ fontSize: 9.5 }} />
              Limpar foco
            </button>
          )}
        </div>
      </div>

      <TimelineEventsStrip point={activePoint} />
    </div>
  );
}
