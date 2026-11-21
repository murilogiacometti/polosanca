import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { resolveStatusAccentColor } from '../../theme/tokens';
import type { AccentStatus } from '../../types/models';

export interface AccentCardProps {
  status?: AccentStatus | (string & {});
  onClick?: ((e?: MouseEvent<HTMLButtonElement>) => void) | null;
  ariaLabel?: string;
  selected?: boolean;
  dimmed?: boolean;
  padding?: string | number;
  gap?: number;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Cartão operacional canônico de 14px com barra semântica esquerda de 4px,
 * suporte opcional a clique/teclado acessível sem controles interativos aninhados
 * (`nested-interactive`) e elevação sutil no hover.
 */
export default function AccentCard({
  status = null,
  onClick = null,
  ariaLabel = 'Abrir detalhes',
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
      className={`ps-clean-card ${clickable ? 'ps-clean-card-clickable' : ''}`}
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
      {clickable && onClick && (
        <button
          type="button"
          className="ps-card-stretch-btn"
          aria-label={ariaLabel}
          onClick={(e) => onClick(e)}
        />
      )}
      {clickable ? (
        <div
          className="ps-card-stretch-content"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap,
            flex: 1,
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
