import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { resolveStatusAccentColor } from '../../theme/tokens';
import type { AccentStatus } from '../../types/models';

export interface AccentCardProps {
  status?: AccentStatus | (string & {});
  onClick?: ((e?: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => void) | null;
  selected?: boolean;
  dimmed?: boolean;
  padding?: string | number;
  gap?: number;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Cartão operacional canônico de 14px com barra semântica esquerda de 4px,
 * suporte opcional a clique/teclado (Enter/Space) e elevação sutil no hover.
 */
export default function AccentCard({
  status = null,
  onClick = null,
  selected = false,
  dimmed = false,
  padding = '20px 22px',
  gap = 16,
  style = undefined,
  children,
}: AccentCardProps) {
  const accentColor = resolveStatusAccentColor(status);
  const clickable = typeof onClick === 'function';

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={`ps-clean-card ${clickable ? 'ps-clean-card-clickable' : ''}`}
      onClick={clickable && onClick ? (e) => onClick(e) : undefined}
      onKeyDown={
        clickable && onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
      style={{
        borderColor: selected ? '#2563eb' : undefined,
        borderLeft: accentColor ? `4px solid ${accentColor}` : undefined,
        padding,
        display: 'flex',
        flexDirection: 'column',
        gap,
        opacity: dimmed ? 0.72 : 1,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
