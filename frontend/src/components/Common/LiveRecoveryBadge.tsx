import type { EquipmentStatus } from '../../types/models';
import { formatTemperature } from '../../utils/formatters';

interface LiveRecoverySnapshot {
  status?: EquipmentStatus;
  temperature?: number | string | null;
}

export interface LiveRecoveryBadgeProps {
  snapshot?: LiveRecoverySnapshot | null;
}

/**
 * Selo compacto de Situação Ao Vivo dentro de linhas/cartões de Alerta:
 * Permite ao operador distinguir imediatamente se a câmara já recuperou a faixa segura
 * ("Agora: -18,2 °C • Normalizado ✓") ou se permanece em violação térmica / offline.
 */
export default function LiveRecoveryBadge({ snapshot }: LiveRecoveryBadgeProps) {
  if (!snapshot) return null;

  const hasTemp =
    snapshot.temperature !== null &&
    snapshot.temperature !== undefined &&
    snapshot.temperature !== '';
  const tempLabel = hasTemp ? formatTemperature(snapshot.temperature) : null;
  const st = snapshot.status || 'offline';

  if (st === 'operational') {
    return (
      <span
        className="ps-tabular"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '1px 8px',
          borderRadius: 999,
          fontSize: 11.5,
          fontWeight: 600,
          color: '#15803d',
          background: 'rgba(22, 163, 74, 0.12)',
          border: '1px solid rgba(22, 163, 74, 0.3)',
        }}
      >
        Agora: {tempLabel ? `${tempLabel} • ` : ''}Normalizado ✓
      </span>
    );
  }

  if (st === 'critical') {
    return (
      <span
        className="ps-tabular"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '1px 8px',
          borderRadius: 999,
          fontSize: 11.5,
          fontWeight: 600,
          color: '#b91c1c',
          background: 'var(--ps-crit-tint)',
          border: '1px solid var(--ps-crit-border)',
        }}
      >
        Agora: {tempLabel ? `${tempLabel} • ` : ''}Em violação
      </span>
    );
  }

  if (st === 'warning') {
    return (
      <span
        className="ps-tabular"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '1px 8px',
          borderRadius: 999,
          fontSize: 11.5,
          fontWeight: 600,
          color: '#b45309',
          background: 'var(--ps-warn-tint)',
          border: '1px solid var(--ps-warn-border)',
        }}
      >
        Agora: {tempLabel ? `${tempLabel} • ` : ''}Em atenção
      </span>
    );
  }

  return (
    <span className="ps-neutral-pill ps-tabular">
      Agora: Offline{tempLabel ? ` (últ. ${tempLabel})` : ''}
    </span>
  );
}
