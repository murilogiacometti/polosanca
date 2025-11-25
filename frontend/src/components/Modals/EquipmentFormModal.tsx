import { useEffect, useMemo, useState } from 'react';
import { App as AntdApp, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { createEquipment, updateEquipment } from '../../api';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';
import type {
  Branch,
  Company,
  CreateEquipmentPayload,
  Equipment,
  EquipmentType,
  UpdateEquipmentPayload,
} from '../../types/models';
import { EQUIPMENT_TYPE_LABELS, extractApiError } from '../../utils/formatters';

export interface EquipmentRecord extends Equipment {
  manufacturer?: string | null;
  installed_at?: string | null;
}

interface EquipmentCreatePayload extends CreateEquipmentPayload {
  manufacturer?: string;
  installed_at?: string;
}

interface EquipmentUpdatePayload extends UpdateEquipmentPayload {
  manufacturer?: string | null;
  installed_at?: string | null;
}

interface EquipmentFormValues {
  company_id?: string;
  branch_id?: string;
  serial: string;
  type: EquipmentType;
  manufacturer?: string;
  model?: string;
  installed_at?: Dayjs | null;
}

export interface EquipmentFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (saved: Equipment, apiKey?: string | null) => void | Promise<void>;
  equipment?: EquipmentRecord | null;
  branches?: Branch[];
  companies?: Company[];
  isGlobalAdmin?: boolean;
  defaultCompanyId?: string | null;
  defaultBranchId?: string | null;
}

function buildEquipmentUpdatePayload(
  values: EquipmentFormValues,
  resolvedBranchId: string | undefined
): EquipmentUpdatePayload {
  return {
    branch_id: resolvedBranchId,
    type: values.type,
    manufacturer: values.manufacturer?.trim() || null,
    model: values.model?.trim() || null,
    installed_at: values.installed_at ? values.installed_at.toISOString() : null,
  };
}

function buildEquipmentCreatePayload(
  values: EquipmentFormValues,
  resolvedBranchId: string | undefined,
  isGlobalAdmin: boolean
): EquipmentCreatePayload {
  const payload: EquipmentCreatePayload = {
    serial: values.serial.trim(),
    type: values.type,
    branch_id: resolvedBranchId || '',
    manufacturer: values.manufacturer?.trim() || undefined,
    model: values.model?.trim() || undefined,
    installed_at: values.installed_at ? values.installed_at.toISOString() : undefined,
  };
  if (isGlobalAdmin && values.company_id) {
    payload.company_id = values.company_id;
  }
  return payload;
}

function resolveCreatedEquipment(
  created: Awaited<ReturnType<typeof createEquipment>>,
  payload: EquipmentCreatePayload
): Equipment {
  if (created.equipment) {
    return created.equipment;
  }
  return {
    ...created,
    id: created.id ?? '',
    serial: created.serial ?? payload.serial,
    type: created.type ?? payload.type,
    company_id: created.company_id ?? payload.company_id ?? '',
    branch_id: created.branch_id ?? payload.branch_id,
  };
}

export default function EquipmentFormModal({
  open,
  onClose,
  onSuccess,
  equipment = null,
  branches = [],
  companies = [],
  isGlobalAdmin = false,
  defaultCompanyId = undefined,
  defaultBranchId = undefined,
}: EquipmentFormModalProps) {
  useSuspendShortcuts(Boolean(open));

  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<EquipmentFormValues>();
  const [submitting, setSubmitting] = useState(false);

  const isEdit = Boolean(equipment);
  const selectedCompanyId = Form.useWatch('company_id', form);

  const filteredBranches = useMemo(() => {
    if (isEdit && equipment?.company_id) {
      return branches.filter((b) => b.company_id === equipment.company_id);
    }
    if (isGlobalAdmin && selectedCompanyId) {
      return branches.filter((b) => b.company_id === selectedCompanyId);
    }
    return branches;
  }, [branches, isEdit, equipment, isGlobalAdmin, selectedCompanyId]);

  const hasSingleBranch = filteredBranches.length === 1;

  useEffect(() => {
    if (!open) return;
    if (equipment) {
      form.setFieldsValue({
        company_id: equipment.company_id,
        branch_id: equipment.branch_id,
        serial: equipment.serial,
        type: equipment.type,
        manufacturer: equipment.manufacturer || '',
        model: equipment.model || '',
        installed_at: equipment.installed_at ? dayjs(equipment.installed_at) : null,
      });
    } else {
      form.resetFields();
      const initialCompanyId =
        defaultCompanyId || (companies.length === 1 ? companies[0]?.id : undefined);
      const initialScopedBranches = initialCompanyId
        ? branches.filter((b) => b.company_id === initialCompanyId)
        : branches;
      const autoBranchId =
        defaultBranchId ||
        (initialScopedBranches.length === 1 ? initialScopedBranches[0]?.id : undefined);

      form.setFieldsValue({
        type: 'freezer',
        company_id: initialCompanyId,
        branch_id: autoBranchId,
      });
    }
  }, [open, equipment, companies, branches, defaultCompanyId, defaultBranchId, form]);

  // Se o Admin Global trocar a empresa no seletor e ela tiver apenas 1 filial, seleciona silenciosamente
  useEffect(() => {
    if (!open || isEdit) return;
    const soleBranch = filteredBranches.length === 1 ? filteredBranches[0] : undefined;
    if (soleBranch) {
      form.setFieldValue('branch_id', soleBranch.id);
    }
  }, [open, isEdit, filteredBranches, form]);

  const handleFinish = async (values: EquipmentFormValues): Promise<void> => {
    setSubmitting(true);
    try {
      const resolvedBranchId =
        values.branch_id || (filteredBranches.length === 1 ? filteredBranches[0]?.id : undefined);

      if (equipment) {
        const updated = await updateEquipment(
          equipment.id,
          buildEquipmentUpdatePayload(values, resolvedBranchId)
        );
        message.success('Equipamento atualizado com sucesso.');
        await onSuccess(updated, null);
      } else {
        const payload = buildEquipmentCreatePayload(values, resolvedBranchId, isGlobalAdmin);
        const created = await createEquipment(payload);
        const savedEquipment = resolveCreatedEquipment(created, payload);
        message.success('Equipamento cadastrado com sucesso!');
        await onSuccess(savedEquipment, created.api_key);
      }
    } catch (err) {
      message.error(extractApiError(err, 'Não foi possível salvar o equipamento.'));
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
      okText={isEdit ? 'Salvar Alterações' : 'Cadastrar e Gerar Chave'}
      cancelText="Cancelar"
      title={equipment ? `Editar Equipamento — ${equipment.serial}` : 'Cadastrar Novo Equipamento'}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => {
          void handleFinish(values);
        }}
      >
        {isGlobalAdmin && !isEdit && (
          <Form.Item
            name="company_id"
            label="Empresa"
            rules={[{ required: true, message: 'Selecione a empresa proprietária' }]}
          >
            <Select<string>
              placeholder="Selecione a empresa"
              showSearch
              optionFilterProp="label"
              onChange={(nextCompId) => {
                const nextBranches = branches.filter((b) => b.company_id === nextCompId);
                form.setFieldValue(
                  'branch_id',
                  nextBranches.length === 1 ? nextBranches[0]?.id : undefined
                );
              }}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
        )}

        {/* Oculta o seletor de filial quando a empresa opera em unidade única */}
        <Form.Item
          name="branch_id"
          label="Filial / Unidade"
          hidden={hasSingleBranch}
          rules={[{ required: true, message: 'Selecione a filial de instalação' }]}
        >
          <Select
            placeholder="Selecione a filial"
            showSearch
            optionFilterProp="label"
            options={filteredBranches.map((b) => ({
              value: b.id,
              label: b.address ? `${b.name} — ${b.address}` : b.name,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="serial"
          label="Número de Série"
          rules={[{ required: true, message: 'Informe o número de série único do equipamento' }]}
        >
          <Input placeholder="Ex.: FRZ-SP-001" disabled={isEdit} />
        </Form.Item>

        <Form.Item
          name="type"
          label="Tipo de Equipamento"
          rules={[{ required: true, message: 'Selecione o tipo de equipamento' }]}
        >
          <Select
            options={Object.entries(EQUIPMENT_TYPE_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </Form.Item>

        <Form.Item name="manufacturer" label="Fabricante">
          <Input placeholder="Ex.: Metalfrio, Gelopar, Danfoss" />
        </Form.Item>

        <Form.Item name="model" label="Modelo">
          <Input placeholder="Ex.: VF50F / Câmara Modular" />
        </Form.Item>

        <Form.Item name="installed_at" label="Data de Instalação">
          <DatePicker
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            placeholder="Selecione a data de instalação"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
