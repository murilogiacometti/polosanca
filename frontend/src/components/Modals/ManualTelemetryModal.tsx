import { useEffect, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { submitManualTelemetry } from '../../api';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';
import type {
  Equipment,
  EquipmentType,
  ManualTelemetryPayload,
  ManualTelemetryResponse,
} from '../../types/models';
import { extractApiError } from '../../utils/formatters';

const { TextArea } = Input;
const { Text } = Typography;

const PRESET_FIELD_NOTES: readonly string[] = [
  'Queda de Wi-Fi na loja',
  'Degelo manual programado',
  'Abastecimento de mercadoria',
  'Queda de energia elétrica',
  'Controlador em manutenção',
];

const DEFAULT_TEMP_BY_TYPE: Record<EquipmentType, number> = {
  freezer: -18.0,
  cold_room: 0.0,
  refrigerator: 3.0,
};

interface ManualTelemetryEquipment extends Equipment {
  liveTemperature?: number | null;
}

interface ManualTelemetryFormValues {
  temperature: number;
  notes?: string;
  recorded_at?: Dayjs | null;
}

export interface ManualTelemetryModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (created: ManualTelemetryResponse) => void | Promise<void>;
  equipment?: ManualTelemetryEquipment | null;
}

/**
 * Modal de Registro Manual Otimizado para Operação em Campo (1 Mão / Celular):
 * - Botões táteis de incremento rápido (-1,0 / -0,5 / +0,5 / +1,0 °C)
 * - Chips de observação rápida em 1 toque para lançamento em 3 segundos
 */
export default function ManualTelemetryModal({
  open,
  onClose,
  onSuccess,
  equipment,
}: ManualTelemetryModalProps) {
  useSuspendShortcuts(Boolean(open));

  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<ManualTelemetryFormValues>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const defaultByType = equipment?.type ? DEFAULT_TEMP_BY_TYPE[equipment.type] : undefined;
    const seedTemp =
      equipment?.liveTemperature !== null &&
      equipment?.liveTemperature !== undefined &&
      !Number.isNaN(Number(equipment.liveTemperature))
        ? Number(Number(equipment.liveTemperature).toFixed(1))
        : equipment?.current_data?.temperature !== null &&
            equipment?.current_data?.temperature !== undefined
          ? Number(Number(equipment.current_data.temperature).toFixed(1))
          : defaultByType ?? -18.0;

    form.resetFields();
    form.setFieldsValue({
      temperature: seedTemp,
      notes: '',
    });
  }, [open, equipment, form]);

  const adjustTemperature = (delta: number): void => {
    const current = Number(form.getFieldValue('temperature') ?? 0);
    const base = Number.isNaN(current) ? 0 : current;
    const next = Math.max(-100, Math.min(100, Number((base + delta).toFixed(1))));
    form.setFieldValue('temperature', next);
  };

  const appendPresetNote = (preset: string): void => {
    const rawNotes: unknown = form.getFieldValue('notes');
    const existing = (typeof rawNotes === 'string' ? rawNotes : '').trim();
    const next = existing
      ? existing.includes(preset)
        ? existing
        : `${existing} • ${preset}`
      : preset;
    form.setFieldValue('notes', next.slice(0, 500));
  };

  const handleFinish = async (values: ManualTelemetryFormValues): Promise<void> => {
    if (!equipment?.id) return;
    setSubmitting(true);
    try {
      const payload: ManualTelemetryPayload = {
        temperature: values.temperature,
      };
      if (values.recorded_at) {
        payload.recorded_at = values.recorded_at.toISOString();
      }
      if (values.notes?.trim()) {
        payload.notes = values.notes.trim();
      }
      const created = await submitManualTelemetry(equipment.id, payload);
      message.success('Leitura manual de temperatura registrada com sucesso!');
      await onSuccess(created);
    } catch (err) {
      message.error(
        extractApiError(
          err,
          'Não foi possível registrar a leitura manual. Verifique se o equipamento continua offline.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Registrar Leitura Manual"
      cancelText="Cancelar"
      title={
        <span>
          Termômetro Manual — <span className="ps-mono">{equipment?.serial || ''}</span>
        </span>
      }
      destroyOnHidden
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Contingência Sanitária (Offline)"
          description="Salva com origem 'manual' vinculada ao seu usuário. Use os botões rápidos abaixo para ajuste imediato em campo."
        />

        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            void handleFinish(values);
          }}
        >
          <Form.Item
            name="temperature"
            label="Temperatura Aferida (°C)"
            style={{ marginBottom: 8 }}
            rules={[
              {
                required: true,
                message: 'Informe a temperatura aferida em graus Celsius (°C)',
              },
            ]}
          >
            <InputNumber<number>
              size="large"
              className="ps-tabular"
              style={{ width: '100%', fontSize: 18, fontWeight: 700 }}
              step={0.1}
              precision={1}
              min={-100}
              max={100}
              addonAfter="°C"
              placeholder="Ex.: -18,0 ou 0,0"
            />
          </Form.Item>

          {/* Steppers táteis de 1 mão para celular/tablet */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              marginBottom: 16,
            }}
          >
            {[-1.0, -0.5, 0.5, 1.0].map((step) => (
              <Button
                key={step}
                size="middle"
                className="ps-tabular"
                style={{ fontWeight: 600 }}
                onClick={() => adjustTemperature(step)}
              >
                {step > 0
                  ? `+${step.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}`
                  : step.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}{' '}
                °C
              </Button>
            ))}
          </div>

          <Form.Item
            name="notes"
            label="Contexto Rápido em Campo (1 toque)"
            style={{ marginBottom: 8 }}
          >
            <TextArea
              rows={2}
              maxLength={500}
              showCount
              placeholder="Toque em um motivo abaixo ou digite uma observação..."
            />
          </Form.Item>

          <Space size={[6, 6]} wrap style={{ marginBottom: 16 }}>
            {PRESET_FIELD_NOTES.map((preset) => (
              <Button
                key={preset}
                size="small"
                style={{ borderRadius: 999, fontSize: 11.5 }}
                onClick={() => appendPresetNote(preset)}
              >
                + {preset}
              </Button>
            ))}
          </Space>

          <Form.Item
            name="recorded_at"
            label={
              <Text type="secondary" style={{ fontSize: 12 }}>
                Data/Hora da aferição (opcional — padrão: agora)
              </Text>
            }
            style={{ marginBottom: 0 }}
          >
            <DatePicker
              showTime
              style={{ width: '100%' }}
              format="DD/MM/YYYY HH:mm:ss"
              placeholder="Usar horário atual do servidor"
            />
          </Form.Item>
        </Form>
      </Space>
    </Modal>
  );
}
