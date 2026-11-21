import { type ComponentType, type CSSProperties, type MouseEvent, useMemo } from 'react';
import {
  FireOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { Tooltip, Typography } from 'antd';
import { SEMANTIC_HEX } from '../../theme/tokens';
import type { BinaryRawState, DoorRawState, TelemetryRow } from '../../types/models';
import { formatDateTimePtBR, formatTemperature } from '../../utils/formatters';

const { Text } = Typography;

type TrackKey = 'heater' | 'door' | 'compressor' | 'fan';
type SegmentState = 'active' | 'idle' | 'unknown';

type SwimlaneDataPoint = TelemetryRow & {
  shortTime?: string;
};

interface TrackConfig {
  key: TrackKey;
  label: string;
  activeLabel: string;
  idleLabel: string;
  color: string;
  Icon: ComponentType<{ style?: CSSProperties }>;
}

interface SwimlaneSegment {
  state: SegmentState;
  startIdx: number;
  endIdx: number;
  startPoint: SwimlaneDataPoint;
  endPoint: SwimlaneDataPoint;
  count: number;
}

interface TrackSummary {
  segments: SwimlaneSegment[];
  dutyPct: number;
}

const TRACKS: readonly TrackConfig[] = [
  {
    key: 'heater',
    label: 'Degelo / Resist.',
    activeLabel: 'Em Degelo (Ativa)',
    idleLabel: 'Desligada',
    color: SEMANTIC_HEX.info,
    Icon: FireOutlined,
  },
  {
    key: 'door',
    label: 'Porta da Câmara',
    activeLabel: 'Aberta',
    idleLabel: 'Fechada',
    color: SEMANTIC_HEX.warning,
    Icon: UnlockOutlined,
  },
  {
    key: 'compressor',
    label: 'Compressor',
    activeLabel: 'Ligado (Resfriando)',
    idleLabel: 'Em Repouso',
    color: SEMANTIC_HEX.operational,
    Icon: ThunderboltOutlined,
  },
  {
    key: 'fan',
    label: 'Ventilador Evap.',
    activeLabel: 'Ligado',
    idleLabel: 'Parado',
    color: SEMANTIC_HEX.brand,
    Icon: SyncOutlined,
  },
];

const isSignalActive = (val: DoorRawState | BinaryRawState): boolean =>
  val === 'on' || val === 'open';

export interface DutyCycleSwimlaneProps {
  data?: SwimlaneDataPoint[];
  activeIdx?: number | null;
  lockedIdx?: number | null;
  onHoverIdx?: (idx: number | null) => void;
  onToggleLockIdx?: (idx: number) => void;
}

function resolveSegmentState(
  pt: SwimlaneDataPoint,
  trackKey: TrackKey
): SegmentState {
  const rawVal = pt[trackKey];
  if (pt.source === 'manual' || rawVal === null || rawVal === undefined) {
    return 'unknown';
  }
  return isSignalActive(rawVal) ? 'active' : 'idle';
}

function buildTrackSummary(
  data: SwimlaneDataPoint[],
  trackKey: TrackKey
): { summary: TrackSummary; firstDoorOpen: number } {
  const segments: SwimlaneSegment[] = [];
  let activeCount = 0;
  let firstDoorOpen = -1;

  data.forEach((pt, idx) => {
    const state = resolveSegmentState(pt, trackKey);

    if (state === 'active') {
      activeCount += 1;
      if (trackKey === 'door' && firstDoorOpen === -1) {
        firstDoorOpen = idx;
      }
    }

    const prev = segments[segments.length - 1];
    if (prev && prev.state === state) {
      prev.endIdx = idx;
      prev.endPoint = pt;
      prev.count += 1;
    } else {
      segments.push({
        state,
        startIdx: idx,
        endIdx: idx,
        startPoint: pt,
        endPoint: pt,
        count: 1,
      });
    }
  });

  const dutyPct = Math.round((activeCount / data.length) * 100);
  return { summary: { segments, dutyPct }, firstDoorOpen };
}

function buildSwimlaneTracks(data: SwimlaneDataPoint[]): {
  trackSegments: Partial<Record<TrackKey, TrackSummary>>;
  notableDoorIdx: number;
} {
  if (!Array.isArray(data) || data.length === 0) {
    return { trackSegments: {}, notableDoorIdx: -1 };
  }
  const result: Partial<Record<TrackKey, TrackSummary>> = {};
  let notableDoorIdx = -1;

  TRACKS.forEach((track) => {
    const { summary, firstDoorOpen } = buildTrackSummary(data, track.key);
    result[track.key] = summary;
    if (track.key === 'door') {
      notableDoorIdx = firstDoorOpen;
    }
  });

  return { trackSegments: result, notableDoorIdx };
}

function resolveCursorPct(activeIdx: number | null, length: number): number | null {
  if (activeIdx === null || activeIdx < 0 || activeIdx >= length) {
    return null;
  }
  return length > 1 ? (activeIdx / (length - 1)) * 100 : 50;
}

function buildAxisLabels(data: SwimlaneDataPoint[], notableDoorIdx: number) {
  const firstTs = data[0]?.shortTime || '';
  const q1Ts = data[Math.floor(data.length * 0.33)]?.shortTime || '';
  const q2Ts =
    notableDoorIdx > 0 && notableDoorIdx < data.length - 1
      ? `${data[notableDoorIdx]?.shortTime} (Abertura Porta)`
      : data[Math.floor(data.length * 0.66)]?.shortTime || '';
  const lastTs = data[data.length - 1]?.shortTime || '';
  return { firstTs, q1Ts, q2Ts, lastTs };
}

interface SwimlaneTrackRowProps {
  track: TrackConfig;
  info: TrackSummary;
  totalPoints: number;
  activeIdx: number | null;
  lockedIdx: number | null;
  cursorPct: number | null;
  onResolveMouseIndex: (e: MouseEvent<HTMLDivElement>) => number | null;
  onHoverIdx?: (idx: number | null) => void;
  onToggleLockIdx?: (idx: number) => void;
}

function SwimlaneTrackRow({
  track,
  info,
  totalPoints,
  activeIdx,
  lockedIdx,
  cursorPct,
  onResolveMouseIndex,
  onHoverIdx,
  onToggleLockIdx,
}: SwimlaneTrackRowProps) {
  const IconComponent = track.Icon;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '148px 1fr 46px',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--ps-text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          whiteSpace: 'nowrap',
        }}
      >
        <IconComponent style={{ fontSize: 13, color: track.color, flexShrink: 0 }} />
        <span>{track.label}</span>
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label={`Linha do tempo de ${track.label}`}
        aria-valuenow={activeIdx ?? 0}
        onMouseMove={(e) => {
          const idx = onResolveMouseIndex(e);
          if (idx !== null) onHoverIdx?.(idx);
        }}
        onClick={(e) => {
          const idx = onResolveMouseIndex(e);
          if (idx !== null) onToggleLockIdx?.(idx);
        }}
        style={{
          position: 'relative',
          display: 'flex',
          width: '100%',
          height: 15,
          borderRadius: 5,
          background: 'var(--ps-chip-bg)',
          border: '1px solid var(--ps-subtle-divider)',
          cursor: 'crosshair',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          {info.segments.map((seg) => {
            const widthPct = (seg.count / totalPoints) * 100;
            const bg =
              seg.state === 'active'
                ? track.color
                : seg.state === 'unknown'
                  ? 'transparent'
                  : 'rgba(148, 163, 184, 0.16)';

            const statusLabel =
              seg.state === 'active'
                ? track.activeLabel
                : seg.state === 'unknown'
                  ? 'Sem telemetria binária (Manual)'
                  : track.idleLabel;

            const timeSpan =
              seg.startIdx === seg.endIdx
                ? formatDateTimePtBR(seg.startPoint.timestamp)
                : `${formatDateTimePtBR(seg.startPoint.timestamp)} → ${formatDateTimePtBR(
                    seg.endPoint.timestamp
                  )}`;

            return (
              <Tooltip
                key={`${track.key}-${seg.startIdx}`}
                title={`${track.label}: ${statusLabel} • ${timeSpan} (Temp: ${formatTemperature(
                  seg.endPoint.temperature
                )})`}
              >
                <div
                  style={{
                    width: `${widthPct}%`,
                    height: '100%',
                    background: bg,
                    opacity: seg.state === 'active' ? 0.92 : 1,
                    borderRight:
                      seg.state === 'active' ? '1px solid rgba(255, 255, 255, 0.22)' : 'none',
                  }}
                />
              </Tooltip>
            );
          })}
        </div>

        {cursorPct !== null && (
          <div
            style={{
              position: 'absolute',
              left: `${cursorPct}%`,
              top: -2,
              bottom: -2,
              width: lockedIdx !== null ? 8 : 3,
              transform: 'translateX(-50%)',
              borderRadius: 3,
              border: '2px solid #0f172a',
              background: lockedIdx !== null ? 'rgba(255, 255, 255, 0.45)' : '#0f172a',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        )}
      </div>

      <span
        className="ps-tabular"
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          textAlign: 'right',
          color: info.dutyPct > 0 ? track.color : 'var(--ps-text-secondary)',
        }}
      >
        {info.dutyPct}%
      </span>
    </div>
  );
}

/**
 * Camada 3 da Telemetria Sincronizada:
 * Raia de Ciclo de Trabalho & Degelo (Swimlane) com ícones vetoriais limpos,
 * cursor vertical sincronizado com Temperatura/Pressão e suporte a clique para fixar foco (`Fixado`).
 */
export default function DutyCycleSwimlane({
  data = [],
  activeIdx = null,
  lockedIdx = null,
  onHoverIdx,
  onToggleLockIdx,
}: DutyCycleSwimlaneProps) {
  const { trackSegments, notableDoorIdx } = useMemo(() => buildSwimlaneTracks(data), [data]);

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const { firstTs, q1Ts, q2Ts, lastTs } = buildAxisLabels(data, notableDoorIdx);
  const cursorPct = resolveCursorPct(activeIdx, data.length);

  const resolveIndexFromMouseEvent = (e: MouseEvent<HTMLDivElement>): number | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return null;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return Math.round(ratio * Math.max(data.length - 1, 0));
  };

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid var(--ps-border)',
        background: 'var(--ps-card-bg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div>
          <Text strong style={{ fontSize: 12.5 }}>
            3. Raia Sincronizada de Degelo, Porta e Ciclo de Trabalho
          </Text>
          <Text type="secondary" style={{ fontSize: 11.5, marginLeft: 8 }}>
            Passe o cursor ou clique para travar o instante exato nas curvas acima
          </Text>
        </div>
        <Text type="secondary" className="ps-tabular" style={{ fontSize: 11 }}>
          {data.length} janelas sincronizadas
        </Text>
      </div>

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 7 }}
        onMouseLeave={() => onHoverIdx?.(null)}
      >
        {TRACKS.map((track) => (
          <SwimlaneTrackRow
            key={track.key}
            track={track}
            info={trackSegments[track.key] || { segments: [], dutyPct: 0 }}
            totalPoints={data.length}
            activeIdx={activeIdx}
            lockedIdx={lockedIdx}
            cursorPct={cursorPct}
            onResolveMouseIndex={resolveIndexFromMouseEvent}
            onHoverIdx={onHoverIdx}
            onToggleLockIdx={onToggleLockIdx}
          />
        ))}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '148px 1fr 46px',
            gap: 10,
            marginTop: 2,
          }}
        >
          <span />
          <div
            className="ps-tabular"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10.5,
              color: 'var(--ps-text-secondary)',
            }}
          >
            <span>{firstTs}</span>
            {data.length >= 6 && <span>{q1Ts}</span>}
            {data.length >= 4 && <span>{q2Ts}</span>}
            <span>{lastTs}</span>
          </div>
          <span />
        </div>
      </div>
    </div>
  );
}
