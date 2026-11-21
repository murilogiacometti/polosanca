import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { Tooltip } from 'antd';
import type { EquipmentStatus } from '../../types/models';

interface SegmentConfig {
  key: EquipmentStatus;
  color: string;
  singular: string;
  plural: string;
}

const SEGMENTS: SegmentConfig[] = [
  { key: 'operational', color: '#10b981', singular: 'Operando', plural: 'Operando' },
  { key: 'warning', color: '#f59e0b', singular: 'Atenção', plural: 'Atenção' },
  { key: 'critical', color: '#ef4444', singular: 'Crítico', plural: 'Críticos' },
  { key: 'offline', color: '#94a3b8', singular: 'Offline', plural: 'Offline' },
];

export interface HealthRollupBarProps {
  operational?: number;
  warning?: number;
  critical?: number;
  offline?: number;
  topLeftLabel?: ReactNode;
  topRightLabel?: ReactNode;
  onSegmentClick?: ((status: EquipmentStatus, event: ReactMouseEvent<HTMLButtonElement>) => void) | null;
}

/**
 * Barra proporcional de Saúde da Operação (estilo multi-segmento limpo) + legenda de pontos
 * compartilhada entre os cartões de Empresas (Nível 0) e Filiais (Nível 1).
 */
export default function HealthRollupBar({
  operational = 0,
  warning = 0,
  critical = 0,
  offline = 0,
  topLeftLabel = null,
  topRightLabel = null,
  onSegmentClick = null,
}: HealthRollupBarProps) {
  const counts: Record<EquipmentStatus, number> = { operational, warning, critical, offline };
  const activeSegments = SEGMENTS.filter((seg) => (counts[seg.key] || 0) > 0);
  const total = operational + warning + critical + offline;

  return (
    <div>
      {(topLeftLabel || topRightLabel) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            marginBottom: 7,
            fontSize: 12,
            color: 'var(--ps-text-secondary)',
          }}
        >
          <span>{topLeftLabel}</span>
          {topRightLabel && (
            <span className="ps-tabular" style={{ fontSize: 11.5 }}>
              {topRightLabel}
            </span>
          )}
        </div>
      )}

      {/* Barra proporcional multi-segmento */}
      <div
        style={{
          height: 6,
          width: '100%',
          borderRadius: 999,
          background: 'var(--ps-subtle-divider)',
          display: 'flex',
          gap: activeSegments.length > 1 ? 2 : 0,
          overflow: 'hidden',
        }}
      >
        {activeSegments.map((seg) => {
          const val = counts[seg.key];
          return (
            <div
              key={seg.key}
              style={{
                flex: val,
                backgroundColor: seg.color,
                borderRadius: 999,
                minWidth: 6,
                transition: 'flex 0.25s ease',
              }}
            />
          );
        })}
      </div>

      {/* Legenda enxuta (exibe apenas estados com contagem > 0) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px 14px',
          marginTop: 9,
          fontSize: 12,
        }}
      >
        {total === 0 ? (
          <span style={{ color: 'var(--ps-text-secondary)', fontSize: 12 }}>
            Sem equipamentos ativos cadastrados
          </span>
        ) : (
          activeSegments.map((seg) => {
            const val = counts[seg.key];
            const label = `${val} ${val === 1 ? seg.singular : seg.plural}`;
            const clickable = Boolean(onSegmentClick) && seg.key !== 'operational';

            const content = (
              <>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: seg.color,
                    flexShrink: 0,
                  }}
                />
                <span className="ps-tabular">{label}</span>
              </>
            );

            const commonStyle = {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--ps-text-primary)',
              fontWeight: seg.key === 'critical' ? 600 : 500,
              fontSize: 'inherit',
            } as const;

            const itemNode =
              clickable && onSegmentClick ? (
                <button
                  key={seg.key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSegmentClick(seg.key, e);
                  }}
                  style={{
                    ...commonStyle,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  {content}
                </button>
              ) : (
                <span key={seg.key} style={commonStyle}>
                  {content}
                </span>
              );

            if (!clickable) return itemNode;

            return (
              <Tooltip
                key={seg.key}
                title={`Atalho rápido: inspecionar ${label.toLowerCase()}`}
              >
                {itemNode}
              </Tooltip>
            );
          })
        )}
      </div>
    </div>
  );
}
