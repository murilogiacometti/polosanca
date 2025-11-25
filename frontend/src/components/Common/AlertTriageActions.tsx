import type { ReactNode } from 'react';
import { CheckCircleOutlined, CheckOutlined, FormOutlined, LockOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Space, Tooltip } from 'antd';
import { SEMANTIC_HEX } from '../../theme/tokens';
import type { AlertItem } from '../../types/models';

export interface AlertTriageActionsProps {
  alertItem?: AlertItem | null;
  canWriteOperations?: boolean;
  busy?: boolean;
  onQuickAck?: (alertItem: AlertItem) => void | Promise<void>;
  onAckWithNote?: (alertItem: AlertItem) => void;
  onResolve?: (alertItem: AlertItem) => void | Promise<void>;
  extraActions?: ReactNode;
  showReadOnlyLock?: boolean;
  resolveConfirmTitle?: ReactNode;
  resolveConfirmDescription?: ReactNode;
}

/**
 * Barra compartilhada de triagem rápida de alertas (1 clique Reconhecer, Reconhecer com nota e Resolver).
 * Reutilizada em AlertsPage, ScopedAlertsDrawer e Level3EquipmentView.
 */
export default function AlertTriageActions({
  alertItem,
  canWriteOperations = false,
  busy = false,
  onQuickAck,
  onAckWithNote,
  onResolve,
  extraActions = null,
  showReadOnlyLock = false,
  resolveConfirmTitle = 'Resolver alerta manualmente?',
  resolveConfirmDescription = undefined,
}: AlertTriageActionsProps) {
  if (!alertItem) return null;

  const isActive = alertItem.status === 'active';
  const isResolved = alertItem.status === 'resolved';

  return (
    <Space size={6} wrap>
      {canWriteOperations && isActive && (
        <>
          <Tooltip title="Reconhecer imediatamente (1 clique)">
            <Button
              size="small"
              type="primary"
              ghost
              icon={<CheckOutlined />}
              loading={busy}
              onClick={() => {
                void onQuickAck?.(alertItem);
              }}
            >
              Reconhecer
            </Button>
          </Tooltip>

          {onAckWithNote && (
            <Tooltip title="Reconhecer com observação operacional">
              <Button
                size="small"
                icon={<FormOutlined />}
                onClick={() => onAckWithNote(alertItem)}
                aria-label="Reconhecer com nota"
              />
            </Tooltip>
          )}
        </>
      )}

      {canWriteOperations && !isResolved && onResolve && (
        <Popconfirm
          title={resolveConfirmTitle}
          description={resolveConfirmDescription}
          okText="Resolver"
          cancelText="Cancelar"
          onConfirm={() => {
            void onResolve(alertItem);
          }}
        >
          <Tooltip title="Resolver alerta">
            <Button
              size="small"
              loading={busy && !isActive}
              icon={<CheckCircleOutlined style={{ color: SEMANTIC_HEX.operationalText }} />}
              aria-label="Resolver alerta"
            />
          </Tooltip>
        </Popconfirm>
      )}

      {extraActions}

      {!canWriteOperations && showReadOnlyLock && !isResolved && (
        <Tooltip title="Modo Visualizador (somente leitura): reconhecimento e resolução requerem perfil Administrador.">
          <LockOutlined style={{ color: 'var(--ps-text-secondary)', fontSize: 13 }} />
        </Tooltip>
      )}
    </Space>
  );
}
