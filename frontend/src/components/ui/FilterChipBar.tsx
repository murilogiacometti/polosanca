import type { ReactNode } from 'react';

export interface FilterChipOption<T extends string | undefined = string | undefined> {
  key: T;
  label: ReactNode;
  count?: number | null;
  icon?: ReactNode;
}

export interface FilterChipBarProps<T extends string | undefined = string | undefined> {
  options?: FilterChipOption<T>[];
  value: T;
  onChange?: (next: T) => void;
  hideZero?: boolean;
  allowToggleReset?: boolean;
  resetValue: T;
}

/**
 * Barra de pílulas de filtro com contadores tabulares.
 * Oculta opcionalmente estados com contagem 0 (`hideZero`) para evitar ruído visual.
 */
export default function FilterChipBar<T extends string | undefined = string | undefined>({
  options = [],
  value,
  onChange,
  hideZero = false,
  allowToggleReset = true,
  resetValue,
}: FilterChipBarProps<T>) {
  const visible = hideZero
    ? options.filter(
        (opt) => opt.key === resetValue || (opt.count ?? 1) > 0 || value === opt.key
      )
    : options;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {visible.map((pill) => {
        const active = value === pill.key;
        return (
          <button
            key={String(pill.key ?? 'all')}
            type="button"
            className={`ps-filter-chip ${active ? 'ps-filter-chip-active' : ''}`}
            onClick={() => {
              if (!onChange) return;
              if (pill.key === resetValue) {
                onChange(resetValue);
              } else if (allowToggleReset && active) {
                onChange(resetValue);
              } else {
                onChange(pill.key);
              }
            }}
          >
            {pill.icon}
            <span>{pill.label}</span>
            {pill.count !== undefined && pill.count !== null && (
              <span className="ps-filter-chip-count ps-tabular">{pill.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
