import { useState } from 'react';
import { App as AntdApp, Button, DatePicker, Form, Input, Modal, Select, Space } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { createMaintenanceRecord, updateMaintenanceRecord } from '../../api';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';
import type {
  CreateMaintenancePayload,
  MaintenanceRecord,
  MaintenanceType,
  UpdateMaintenancePayload,
} from '../../types/models';
import { extractApiError, MAINTENANCE_TYPE_OPTIONS } from '../../utils/formatters';

const { TextArea } = Input;

interface MaintenanceFormValues {
  type: MaintenanceType;
  performed_by: string;
  performed_at: Dayjs | null;
  next_maintenance_date?: Dayjs | null;
  description: string;
  notes?: string;
}

interface MaintenanceFormBodyProps {
  record?: MaintenanceRecord | null;
  equipmentId?: string;
  onCancel: () => void;
  onSuccess: (saved: MaintenanceRecord) => void | Promise<void>;
}

function MaintenanceFormBody({
  record,
  equipmentId,
  onCancel,
  onSuccess,
}: MaintenanceFormBodyProps) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<MaintenanceFormValues>();
  const [submitting, setSubmitting] = useState(false);

  const isEdit = Boolean(record);

  const initialValues: MaintenanceFormValues = record
    ? {
        type: record.type,
        performed_by: record.performed_by,
        performed_at: record.performed_at ? dayjs(record.performed_at) : dayjs(),
        next_maintenance_date: record.next_maintenance_date
          ? dayjs(record.next_maintenance_date)
          : null,
        description: record.description,
        notes: record.notes || '',
      }
    : {
        type: 'routine_inspection',
        performed_by: '',
        performed_at: dayjs(),
        next_maintenance_date: null,
        description: '',
        notes: '',
      };

  const handleFinish = async (values: MaintenanceFormValues): Promise<void> => {
    setSubmitting(true);
    try {
      const normalizedNotes = values.notes?.trim() ? values.notes.trim() : null;
      const normalizedNextDate = values.next_maintenance_date
        ? values.next_maintenance_date.format('YYYY-MM-DD')
        : null;

      if (record) {
        const updatePayload: UpdateMaintenancePayload = {
          type: values.type,
          performed_by: values.performed_by.trim(),
          performed_at: values.performed_at ? values.performed_at.toISOString() : undefined,
          description: values.description.trim(),
          notes: normalizedNotes,
          next_maintenance_date: normalizedNextDate,
        };
        const updated = await updateMaintenanceRecord(record.id, updatePayload);
        message.success('Registro de manutenção atualizado com sucesso.');
        await onSuccess(updated);
      } else {
        if (!equipmentId) return;
        const createPayload: CreateMaintenancePayload = {
          type: values.type,
          performed_by: values.performed_by.trim(),
          performed_at: values.performed_at
            ? values.performed_at.toISOString()
            : new Date().toISOString(),
          description: values.description.trim(),
          notes: normalizedNotes,
          next_maintenance_date: normalizedNextDate,
        };
        const created = await createMaintenanceRecord(equipmentId, createPayload);
        message.success('Manutenção registrada com sucesso.');
        await onSuccess(created);
      }
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao salvar registro de manutenção.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initialValues}
      onFinish={(values) => {
        void handleFinish(values);
      }}
    >
      <Form.Item
        name="type"
        label="Tipo de Intervenção"
        rules={[{ required: true, message: 'Selecione o tipo de manutenção.' }]}
      >
        <Select options={MAINTENANCE_TYPE_OPTIONS} />
      </Form.Item>

      <Form.Item
        name="performed_by"
        label="Técnico / Empresa Responsável"
        rules={[{ required: true, whitespace: true, message: 'Informe quem realizou o serviço.' }]}
      >
        <Input placeholder="Ex.: João Pereira — Refrigeração Técnica" maxLength={255} />
      </Form.Item>

      <Form.Item
        name="performed_at"
        label="Data e Hora da Execução"
        rules={[{ required: true, message: 'Informe a data e hora da manutenção.' }]}
      >
        <DatePicker showTime style={{ width: '100%' }} format="DD/MM/YYYY HH:mm" />
      </Form.Item>

      <Form.Item
        name="description"
        label="Descrição do Serviço Realizado"
        rules={[
          { required: true, whitespace: true, message: 'Descreva o procedimento executado.' },
        ]}
      >
        <TextArea
          rows={3}
          placeholder="Ex.: Limpeza do condensador, reaperto elétrico e verificação de vedação da porta."
        />
      </Form.Item>

      <Form.Item name="next_maintenance_date" label="Próxima Manutenção Preventiva (Opcional)">
        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Selecione a data" />
      </Form.Item>

      <Form.Item name="notes" label="Observações Adicionais (Opcional)">
        <TextArea rows={2} placeholder="Peças substituídas, recomendações técnicas ou número de OS" />
      </Form.Item>

      <Space style={{ width: '100%', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="primary" htmlType="submit" loading={submitting}>
          {isEdit ? 'Salvar Alterações' : 'Registrar Manutenção'}
        </Button>
      </Space>
    </Form>
  );
}

export interface MaintenanceFormModalProps {
  open: boolean;
  onClose: () => void;
  equipmentId?: string;
  record?: MaintenanceRecord | null;
  onSuccess: (saved: MaintenanceRecord) => void | Promise<void>;
}

export default function MaintenanceFormModal({
  open,
  onClose,
  equipmentId,
  record,
  onSuccess,
}: MaintenanceFormModalProps) {
  useSuspendShortcuts(Boolean(open));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      title={record ? 'Editar Registro de Manutenção' : 'Registrar Nova Manutenção'}
      width={560}
    >
      {open && (
        <MaintenanceFormBody
          record={record}
          equipmentId={equipmentId}
          onCancel={onClose}
          onSuccess={onSuccess}
        />
      )}
    </Modal>
  );
}
