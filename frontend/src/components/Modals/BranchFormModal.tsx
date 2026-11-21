import { useState } from 'react';
import { App as AntdApp, Button, Form, Input, Modal, Select, Space } from 'antd';
import { createBranch, updateBranch } from '../../api';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';
import type { Branch, Company, CreateBranchPayload } from '../../types/models';
import { extractApiError } from '../../utils/formatters';

interface BranchFormValues {
  company_id?: string;
  name: string;
  address: string;
  manager_contact?: string;
}

interface BranchFormBodyProps {
  branch?: Branch | null;
  companies?: Company[];
  isGlobalAdmin?: boolean;
  defaultCompanyId?: string;
  lockCompany?: boolean;
  onCancel: () => void;
  onSaved: (saved: Branch) => void | Promise<void>;
}

function BranchFormBody({
  branch,
  companies = [],
  isGlobalAdmin = false,
  defaultCompanyId,
  lockCompany = false,
  onCancel,
  onSaved,
}: BranchFormBodyProps) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<BranchFormValues>();
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(branch);

  const handleFinish = async (values: BranchFormValues): Promise<void> => {
    setSaving(true);
    try {
      const payload: CreateBranchPayload = {
        name: values.name.trim(),
        address: values.address.trim(),
        manager_contact: values.manager_contact?.trim() || null,
      };
      if (!branch && isGlobalAdmin) {
        payload.company_id = lockCompany ? defaultCompanyId : values.company_id;
      }

      const saved = branch
        ? await updateBranch(branch.id, payload)
        : await createBranch(payload);

      message.success(isEdit ? 'Filial atualizada com sucesso.' : 'Filial criada com sucesso.');
      await onSaved(saved);
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao salvar filial.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        company_id: branch?.company_id || defaultCompanyId || undefined,
        name: branch?.name || '',
        address: branch?.address || '',
        manager_contact: branch?.manager_contact || '',
      }}
      onFinish={(values) => {
        void handleFinish(values);
      }}
    >
      {!isEdit && isGlobalAdmin && !lockCompany && (
        <Form.Item
          name="company_id"
          label="Empresa"
          rules={[{ required: true, message: 'Selecione a empresa proprietária.' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Selecione uma empresa"
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Form.Item>
      )}

      <Form.Item
        name="name"
        label="Nome da Filial / Unidade"
        rules={[{ required: true, whitespace: true, message: 'Informe o nome da filial.' }]}
      >
        <Input placeholder="Ex.: Filial 01 — Centro" maxLength={255} />
      </Form.Item>

      <Form.Item
        name="address"
        label="Endereço Completo"
        rules={[{ required: true, whitespace: true, message: 'Informe o endereço da unidade.' }]}
      >
        <Input placeholder="Ex.: Av. São Carlos, 1500 — São Carlos/SP" />
      </Form.Item>

      <Form.Item name="manager_contact" label="Responsável Local / Telefone">
        <Input placeholder="Ex.: Carlos Silva — (16) 99999-0101" maxLength={255} />
      </Form.Item>

      <Space style={{ width: '100%', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="primary" htmlType="submit" loading={saving}>
          {isEdit ? 'Salvar Alterações' : 'Criar Filial'}
        </Button>
      </Space>
    </Form>
  );
}

export interface BranchFormModalProps {
  open: boolean;
  branch?: Branch | null;
  companies?: Company[];
  isGlobalAdmin?: boolean;
  defaultCompanyId?: string | null;
  companyId?: string | null;
  lockCompany?: boolean;
  onClose: () => void;
  onSuccess: (saved: Branch) => void | Promise<void>;
}

export default function BranchFormModal({
  open,
  branch,
  companies = [],
  isGlobalAdmin = false,
  defaultCompanyId,
  companyId,
  lockCompany = false,
  onClose,
  onSuccess,
}: BranchFormModalProps) {
  useSuspendShortcuts(Boolean(open));

  const effectiveDefaultCompanyId = defaultCompanyId || companyId || undefined;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      title={branch ? 'Editar Filial' : 'Nova Filial'}
    >
      {open && (
        <BranchFormBody
          branch={branch}
          companies={companies}
          isGlobalAdmin={isGlobalAdmin}
          defaultCompanyId={effectiveDefaultCompanyId}
          lockCompany={lockCompany}
          onCancel={onClose}
          onSaved={onSuccess}
        />
      )}
    </Modal>
  );
}
