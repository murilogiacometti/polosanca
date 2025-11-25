import type { CSSProperties } from 'react';
import {
  FireOutlined,
  LockOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { BinaryRawState, DoorRawState, SubsystemLayout } from '../../types/models';
import { formatComponentState, formatDoorState } from '../../utils/formatters';

export interface SubsystemStackProps {
  door?: DoorRawState;
  compressor?: BinaryRawState;
  fan?: BinaryRawState;
  heater?: BinaryRawState;
  isOffline?: boolean;
  showClosedDoor?: boolean;
  layout?: SubsystemLayout;
}

interface SubsystemComputedStates {
  doorState: ReturnType<typeof formatDoorState>;
  compState: ReturnType<typeof formatComponentState>;
  fanState: ReturnType<typeof formatComponentState>;
  heaterState: ReturnType<typeof formatComponentState>;
  compActive: boolean;
  fanActive: boolean;
  doorOpenActive: boolean;
  doorClosedActive: boolean;
  heaterActive: boolean;
}

function formatBinaryLabel(isOn: boolean | null, onText: string, offText: string): string {
  if (isOn === true) return onText;
  if (isOn === false) return offText;
  return '—';
}

function buildTooltipTitle(isOffline: boolean, states: SubsystemComputedStates): string {
  const prefix = isOffline ? 'Último estado antes de desconectar — ' : '';
  return `${prefix}Porta: ${states.doorState.label} • Compressor: ${states.compState.label} • Ventilador: ${states.fanState.label} • Degelo: ${states.heaterState.label}`;
}

const GRID_CELL_BASE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 9px',
  borderRadius: 8,
  fontSize: 11.5,
  fontWeight: 600,
  lineHeight: 1.3,
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

function SubsystemGrid({
  tooltipTitle,
  states,
}: {
  tooltipTitle: string;
  states: SubsystemComputedStates;
}) {
  const {
    doorState,
    compState,
    fanState,
    heaterState,
    compActive,
    fanActive,
    doorOpenActive,
    heaterActive,
  } = states;

  return (
    <Tooltip title={tooltipTitle}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          width: '100%',
        }}
      >
        <div
          style={{
            ...GRID_CELL_BASE,
            background: doorOpenActive ? 'var(--ps-warn-tint)' : 'var(--ps-subtle-divider)',
            color: doorOpenActive ? '#d97706' : 'var(--ps-text-secondary)',
            border: doorOpenActive
              ? '1px solid var(--ps-warn-border)'
              : '1px solid transparent',
          }}
        >
          {doorState.isOpen === true ? (
            <UnlockOutlined style={{ fontSize: 12, flexShrink: 0 }} />
          ) : (
            <LockOutlined style={{ fontSize: 12, flexShrink: 0 }} />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Porta: {doorState.label}
          </span>
        </div>

        <div
          style={{
            ...GRID_CELL_BASE,
            background: compActive ? 'var(--ps-ok-tint)' : 'var(--ps-subtle-divider)',
            color: compActive ? '#059669' : 'var(--ps-text-secondary)',
          }}
        >
          <ThunderboltOutlined style={{ fontSize: 12, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Comp: {formatBinaryLabel(compState.isOn, 'Ligado', 'Off')}
          </span>
        </div>

        <div
          style={{
            ...GRID_CELL_BASE,
            background: fanActive ? 'rgba(59, 130, 246, 0.1)' : 'var(--ps-subtle-divider)',
            color: fanActive ? '#2563eb' : 'var(--ps-text-secondary)',
          }}
        >
          <SyncOutlined style={{ fontSize: 12, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Vent: {formatBinaryLabel(fanState.isOn, 'Ligado', 'Off')}
          </span>
        </div>

        <div
          style={{
            ...GRID_CELL_BASE,
            background: heaterActive ? 'rgba(14, 165, 233, 0.12)' : 'var(--ps-subtle-divider)',
            color: heaterActive ? '#0284c7' : 'var(--ps-text-secondary)',
          }}
        >
          <FireOutlined style={{ fontSize: 12, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Degelo: {formatBinaryLabel(heaterState.isOn, 'Ativo', 'Off')}
          </span>
        </div>
      </div>
    </Tooltip>
  );
}

function SubsystemDoorPill({
  pillBase,
  isOffline,
  showClosedDoor,
  doorState,
  doorClosedActive,
}: {
  pillBase: CSSProperties;
  isOffline: boolean;
  showClosedDoor: boolean;
  doorState: SubsystemComputedStates['doorState'];
  doorClosedActive: boolean;
}) {
  if (doorState.isOpen === true) {
    return (
      <span
        style={{
          ...pillBase,
          background: isOffline ? 'var(--ps-subtle-divider)' : 'var(--ps-warn-tint)',
          color: isOffline ? 'var(--ps-text-secondary)' : '#d97706',
          border: `1px solid ${isOffline ? 'var(--ps-border)' : 'var(--ps-warn-border)'}`,
        }}
      >
        Porta ABERTA
      </span>
    );
  }

  if (!showClosedDoor) {
    return null;
  }

  return (
    <span
      style={{
        ...pillBase,
        background: doorClosedActive ? 'var(--ps-ok-tint)' : 'var(--ps-subtle-divider)',
        color: doorClosedActive ? '#059669' : 'var(--ps-text-secondary)',
      }}
    >
      Porta {doorState.label}
    </span>
  );
}

function SubsystemPills({
  tooltipTitle,
  isOffline,
  showClosedDoor,
  isHorizontal,
  states,
}: {
  tooltipTitle: string;
  isOffline: boolean;
  showClosedDoor: boolean;
  isHorizontal: boolean;
  states: SubsystemComputedStates;
}) {
  const {
    doorState,
    compState,
    fanState,
    heaterState,
    compActive,
    fanActive,
    doorClosedActive,
    heaterActive,
  } = states;

  const pillBase: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: isHorizontal ? '4px 10px' : '2px 8px',
    borderRadius: isHorizontal ? 8 : 6,
    fontSize: isHorizontal ? 12 : 10.5,
    fontWeight: 600,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
  };

  const containerStyle: CSSProperties = isHorizontal
    ? { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 5,
        flexShrink: 0,
      };

  const iconFontSize = isHorizontal ? 11.5 : 10;

  return (
    <Tooltip title={tooltipTitle}>
      <div style={containerStyle}>
        <SubsystemDoorPill
          pillBase={pillBase}
          isOffline={isOffline}
          showClosedDoor={showClosedDoor}
          doorState={doorState}
          doorClosedActive={doorClosedActive}
        />

        {(heaterState.isOn === true || showClosedDoor) && (
          <span
            style={{
              ...pillBase,
              background: heaterActive ? 'rgba(14, 165, 233, 0.12)' : 'var(--ps-subtle-divider)',
              color: heaterActive ? '#0284c7' : 'var(--ps-text-secondary)',
            }}
          >
            Degelo {formatBinaryLabel(heaterState.isOn, 'ON', 'OFF')}
          </span>
        )}

        <span
          style={{
            ...pillBase,
            background: compActive ? 'var(--ps-ok-tint)' : 'var(--ps-subtle-divider)',
            color: compActive ? '#059669' : 'var(--ps-text-secondary)',
          }}
        >
          <ThunderboltOutlined style={{ fontSize: iconFontSize }} />
          <span>Comp. {formatBinaryLabel(compState.isOn, 'ON', 'OFF')}</span>
        </span>

        <span
          style={{
            ...pillBase,
            background: fanActive ? 'rgba(59, 130, 246, 0.1)' : 'var(--ps-subtle-divider)',
            color: fanActive ? '#2563eb' : 'var(--ps-text-secondary)',
          }}
        >
          <SyncOutlined style={{ fontSize: iconFontSize }} />
          <span>Vent. {formatBinaryLabel(fanState.isOn, 'ON', 'OFF')}</span>
        </span>
      </div>
    </Tooltip>
  );
}

/**
 * Grupo compacto de subsistemas eletromecânicos (Compressor, Ventilador, Porta, Degelo).
 */
export default function SubsystemStack({
  door,
  compressor,
  fan,
  heater,
  isOffline = false,
  showClosedDoor = false,
  layout = 'vertical',
}: SubsystemStackProps) {
  const doorState = formatDoorState(door);
  const compState = formatComponentState(compressor);
  const fanState = formatComponentState(fan);
  const heaterState = formatComponentState(heater, true);

  const states: SubsystemComputedStates = {
    doorState,
    compState,
    fanState,
    heaterState,
    compActive: !isOffline && compState.isOn === true,
    fanActive: !isOffline && fanState.isOn === true,
    doorOpenActive: !isOffline && doorState.isOpen === true,
    doorClosedActive: !isOffline && doorState.isOpen === false,
    heaterActive: !isOffline && heaterState.isOn === true,
  };

  const tooltipTitle = buildTooltipTitle(isOffline, states);

  if (layout === 'grid') {
    return <SubsystemGrid tooltipTitle={tooltipTitle} states={states} />;
  }

  return (
    <SubsystemPills
      tooltipTitle={tooltipTitle}
      isOffline={isOffline}
      showClosedDoor={showClosedDoor}
      isHorizontal={layout === 'horizontal'}
      states={states}
    />
  );
}
