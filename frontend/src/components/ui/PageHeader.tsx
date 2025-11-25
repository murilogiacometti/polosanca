import { type CSSProperties, type ReactNode, useState } from 'react';
import { InfoCircleOutlined, LeftOutlined } from '@ant-design/icons';
import { Popover } from 'antd';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';

export interface PageHeaderProps {
  backLabel?: string | null;
  onBack?: (() => void) | null;
  title: ReactNode;
  monoTitle?: boolean;
  titleBadges?: ReactNode;
  infoTitle?: ReactNode;
  infoContent?: ReactNode;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
  align?: CSSProperties['alignItems'];
}

/**
 * Cabeçalho canônico sem caixa (de-boxed) do Design System Polo Sanca.
 */
export default function PageHeader({
  backLabel = null,
  onBack = null,
  title,
  monoTitle = false,
  titleBadges = null,
  infoTitle = 'Informações',
  infoContent = null,
  subtitle = null,
  rightSlot = null,
  align = 'flex-end',
}: PageHeaderProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  useSuspendShortcuts(infoOpen);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: align,
        gap: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {onBack && backLabel && (
          <button type="button" className="ps-back-link" onClick={onBack}>
            <LeftOutlined style={{ fontSize: 10 }} />
            <span>{backLabel}</span>
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1
            className={monoTitle ? 'ps-mono' : undefined}
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--ps-text-primary)',
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
            }}
          >
            {title}
          </h1>

          {infoContent && (
            <Popover
              content={infoContent}
              title={infoTitle}
              trigger="click"
              placement="bottomLeft"
              open={infoOpen}
              onOpenChange={setInfoOpen}
            >
              <button
                type="button"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 9px',
                  borderRadius: 999,
                  border: '1px solid var(--ps-border)',
                  background: 'var(--ps-card-bg)',
                  color: '#2563eb',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <InfoCircleOutlined style={{ fontSize: 12 }} />
                <span>Info</span>
              </button>
            </Popover>
          )}

          {titleBadges}
        </div>

        {subtitle && (
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--ps-text-secondary)' }}>
            {subtitle}
          </div>
        )}
      </div>

      {rightSlot && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {rightSlot}
        </div>
      )}
    </div>
  );
}
