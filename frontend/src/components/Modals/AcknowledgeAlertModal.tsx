import { useEffect, useState } from 'react';
import { App as AntdApp, Descriptions, Form, Input, Modal, Space, Tag } from 'antd';
import { acknowledgeAlert } from '../../api';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';
import type { AlertItem } from '../../types/models';
import {
  ALERT_SEVERITY_CONFIG,
  ALERT_TYPE_LABELS,
  extractApiError,
} from '../../utils/formatters';

const { TextArea } = Input;

interface AcknowledgeAlertFormValues {
  notes?: string;
}

export interface AcknowledgeAlertModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (updated: AlertItem) => void | Promise<void>;
  alertItem?: AlertItem | null;
}

export default function AcknowledgeAlertModal({
  open,
  onClose,
  onSuccess,
  alertItem,
}: AcknowledgeAlertModalProps) {
  useSuspendShortcuts(Boolean(open));

  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<AcknowledgeAlertFormValues>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        notes: alertItem?.acknowledgment_notes || '',
      });
    }
  }, [open, alertItem, form]);

  const handleFinish = async (values: AcknowledgeAlertFormValues): Promise<void> => {
    if (!alertItem?.id) return;
    setSubmitting(true);
    try {
      const updated = await acknowledgeAlert(alertItem.id, values.notes);
      message.success('Alerta reconhecido com sucesso.');
      await onSuccess(updated);
    } catch (err) {
      message.error(extractApiError(err, 'Não foi possível reconhecer o alerta.'));
    } finally {
      setSubmitting(false);
    }
  };

  const sev = (alertItem?.severity ? ALERT_SEVERITY_CONFIG[alertItem.severity] : undefined) || {
    label: alertItem?.severity,
    color: 'default',
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Confirmar Reconhecimento"
      cancelText="Cancelar"
      title="Reconhecer Alerta"
      destroyOnHidden
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {alertItem && (
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Equipamento">
              <strong>{alertItem.serial || alertItem.equipment_id}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Tipo / Severidade">
              <Space>
                <span>{ALERT_TYPE_LABELS[alertItem.type] || alertItem.type}</span>
                <Tag color={sev.color}>{sev.label}</Tag>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Mensagem">{alertItem.message}</Descriptions.Item>
          </Descriptions>
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            void handleFinish(values);
          }}
        >
          <Form.Item
            name="notes"
            label="Notas de Acompanhamento / Providências"
            rules={[
              {
                max: 1000,
                message: 'As notas podem ter no máximo 1000 caracteres',
              },
            ]}
          >
            <TextArea
              rows={4}
              maxLength={1000}
              showCount
              placeholder="Descreva a verificação realizada ou o chamado técnico aberto (ex.: Técnico acionado para verificar vedação da porta)."
            />
          </Form.Item>
        </Form>
      </Space>
    </Modal>
  );
}
