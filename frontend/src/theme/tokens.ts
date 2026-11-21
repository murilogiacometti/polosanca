/**
 * Tokens visuais canônicos do Design System Polo Sanca ("Calm Industrial Precision")
 * Fonte única da verdade para paleta semântica, tipografia e raios de borda.
 */
import type { AccentStatus, AlertSeverity, AlertStatus, StatusTone } from '../types/models';

export const SEMANTIC_HEX = {
  brand: '#2563eb',
  operational: '#10b981',
  operationalText: '#047857',
  warning: '#f59e0b',
  warningText: '#b45309',
  critical: '#ef4444',
  criticalText: '#b91c1c',
  offline: '#94a3b8',
  offlineText: '#475569',
  info: '#0284c7',
  teal: '#0d9488',
} as const;

export const FONT_STACKS = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
} as const;

export const RADII = {
  sm: 8,
  md: 10,
  card: 14,
  pill: 999,
} as const;

export function resolveStatusAccentColor(status: AccentStatus | (string & {})): string | null {
  switch (status) {
    case 'critical':
      return SEMANTIC_HEX.critical;
    case 'warning':
      return SEMANTIC_HEX.warning;
    case 'operational':
    case 'normal':
      return SEMANTIC_HEX.operational;
    case 'offline':
      return SEMANTIC_HEX.offline;
    case 'brand':
      return SEMANTIC_HEX.brand;
    case 'teal':
      return SEMANTIC_HEX.teal;
    default:
      return null;
  }
}

export function resolveAlertSeverityTone(
  severity?: AlertSeverity | (string & {}) | null
): StatusTone {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  return 'neutral';
}

export function resolveAlertStatusTone(status?: AlertStatus | (string & {}) | null): StatusTone {
  if (status === 'active') return 'critical';
  if (status === 'acknowledged') return 'warning';
  if (status === 'resolved') return 'operational';
  return 'neutral';
}
