import type { MouseEvent, ReactNode } from 'react';
import { Tooltip } from 'antd';
import { SEMANTIC_HEX } from '../../theme/tokens';
import type { StatusTone } from '../../types/models';

type NormalizedTone = Exclude<StatusTone, 'normal'>;

const TONE_STYLES: Record<
  NormalizedTone,
  {
    bg: string;
    border: string;
    color: string;
    dot: string;
    pulseClass: string;
  }
> = {
  operational: {
    bg: 'var(--ps-ok-tint)',
    border: 'var(--ps-ok-border)',
    color: SEMANTIC_HEX.operationalText,
    dot: SEMANTIC_HEX.operational,
    pulseClass: 'ps-dot-pulse-green',
  },
  warning: {
    bg: 'var(--ps-warn-tint)',
    border: 'var(--ps-warn-border)',
    color: SEMANTIC_HEX.warningText,
    dot: SEMANTIC_HEX.warning,
    pulseClass: 'ps-dot-pulse-amber',
  },
  critical: {
    bg: 'var(--ps-crit-tint)',
    border: 'var(--ps-crit-border)',
    color: SEMANTIC_HEX.criticalText,
    dot: SEMANTIC_HEX.critical,
    pulseClass: 'ps-dot-pulse-red',
  },
  offline: {
    bg: 'var(--ps-subtle-divider)',
    border: 'transparent',
    color: 'var(--ps-text-secondary)',
    dot: SEMANTIC_HEX.offline,
    pulseClass: '',
  },
  brand: {
    bg: 'rgba(59, 130, 246, 0.1)',
    border: 'rgba(59, 130, 246, 0.22)',
    color: SEMANTIC_HEX.brand,
    dot: SEMANTIC_HEX.brand,
    pulseClass: '',
  },
  neutral: {
    bg: 'var(--ps-subtle-divider)',
    border: 'transparent',
    color: 'var(--ps-text-secondary)',
    dot: SEMANTIC_HEX.offline,
    pulseClass: '',
  },
};

const resolveToneStyle = (tone: StatusTone | (string & {})) => {
  switch (tone) {
    case 'normal':
    case 'operational':
      return TONE_STYLES.operational;
    case 'warning':
      return TONE_STYLES.warning;
    case 'critical':
      return TONE_STYLES.critical;
    case 'offline':
      return TONE_STYLES.offline;
    case 'brand':
      return TONE_STYLES.brand;
    default:
      return TONE_STYLES.neutral;
  }
};

export interface StatusPillProps {
  tone?: StatusTone | (string & {});
  dot?: boolean;
  pulse?: boolean;
  icon?: ReactNode;
  tooltip?: ReactNode;
  bordered?: boolean;
  size?: 'sm' | 'md';
  onClick?: ((e: MouseEvent<HTMLSpanElement>) => void) | null;
  children: ReactNode;
}

/**
 * Pílula semântica unificada para status operacionais, severidades e frescor de sinal.
 */
export default function StatusPill({
  tone = 'neutral',
  dot = false,
  pulse = false,
  icon = null,
  tooltip = null,
  bordered = false,
  size = 'sm',
  onClick = null,
  children,
}: StatusPillProps) {
  const cfg = resolveToneStyle(tone);
  const padding = size === 'md' ? '4px 11px' : '3px 9px';
  const fontSize = size === 'md' ? 12 : 11;

  const pillStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding,
    borderRadius: 999,
    background: cfg.bg,
    border: bordered ? `1px solid ${cfg.border}` : '1px solid transparent',
    color: cfg.color,
    fontSize,
    fontWeight: 600,
    lineHeight: 1.35,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    cursor: onClick ? 'pointer' : 'default',
  } as const;

  const pillContent = (
    <>
      {dot && (
        <span
          className={pulse ? cfg.pulseClass : ''}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: cfg.dot,
            flexShrink: 0,
          }}
        />
      )}
      {icon}
      <span>{children}</span>
    </>
  );

  const pillNode = onClick ? (
    <button type="button" className="ps-tabular" onClick={onClick} style={pillStyle}>
      {pillContent}
    </button>
  ) : (
    <span className="ps-tabular" style={pillStyle}>
      {pillContent}
    </span>
  );

  if (!tooltip) return pillNode;
  return <Tooltip title={tooltip}>{pillNode}</Tooltip>;
}
