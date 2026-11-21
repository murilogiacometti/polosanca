export interface StatMiniCardProps {
  label: string;
  value: number | string;
  tone?: 'default' | 'critical' | 'warning';
  selected?: boolean;
  onClick?: (() => void) | null;
}

/**
 * Mini-cartão interativo de KPI para cabeçalhos (ex.: TOTAL EQUIPAMENTOS, CRÍTICOS, EM ATENÇÃO).
 */
export default function StatMiniCard({
  label,
  value,
  tone = 'default',
  selected = false,
  onClick = null,
}: StatMiniCardProps) {
  const isCritical = tone === 'critical' && Number(value) > 0;
  const isWarning = tone === 'warning' && Number(value) > 0;

  const labelColor = isCritical
    ? '#b91c1c'
    : isWarning
      ? '#b45309'
      : 'var(--ps-text-secondary)';
  const valueColor = isCritical
    ? '#b91c1c'
    : isWarning
      ? '#b45309'
      : 'var(--ps-text-primary)';

  const toneClass = isCritical
    ? 'ps-stat-mini-card-critical'
    : isWarning
      ? 'ps-stat-mini-card-warning'
      : '';

  return (
    <button
      type="button"
      className={`ps-stat-mini-card ${toneClass} ${
        selected ? 'ps-stat-mini-card-selected' : ''
      }`}
      onClick={onClick || undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: labelColor,
        }}
      >
        {label}
      </span>
      <span
        className="ps-tabular"
        style={{
          marginTop: 2,
          fontSize: 20,
          fontWeight: 700,
          color: valueColor,
          lineHeight: 1.15,
        }}
      >
        {value}
      </span>
    </button>
  );
}
