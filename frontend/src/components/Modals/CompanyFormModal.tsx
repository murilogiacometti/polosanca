import { useState } from 'react';
import { App as AntdApp, Button, Form, Input, Modal, Space, Typography } from 'antd';
import { createBranch, createCompany, updateCompany } from '../../api';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';
import type { Company, CreateCompanyPayload } from '../../types/models';
import { extractApiError } from '../../utils/formatters';

const { Text } = Typography;

interface CompanyFormValues {
  name: string;
  contact_email?: string;
  contact_phone?: string;
  default_address?: string;
}

interface CompanyFormBodyProps {
  company?: Company | null;
  onCancel: () => void;
  onSaved: (saved: Company) => void | Promise<void>;
}

function CompanyFormBody({ company, onCancel, onSaved }: CompanyFormBodyProps) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<CompanyFormValues>();
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(company);

  const handleFinish = async (values: CompanyFormValues): Promise<void> => {
    setSaving(true);
    try {
      const payload: CreateCompanyPayload = {
        name: values.name.trim(),
        contact_email: values.contact_email?.trim() || null,
        contact_phone: values.contact_phone?.trim() || null,
      };
      const result = company
        ? await updateCompany(company.id, payload)
        : await createCompany(payload);

      // Provisiona automaticamente a "Unidade Principal" para que empresas sem filiais
      // possam cadastrar câmaras frias imediatamente no modo simplificado.
      if (!company && result?.id) {
        try {
          await createBranch({
            company_id: result.id,
            name: 'Unidade Principal',
            address: values.default_address?.trim() || null,
          });
        } catch {
          // Mantém empresa criada mesmo se houver falha transitória na filial padrão
        }
      }

      message.success(
        isEdit
          ? 'Empresa atualizada com sucesso.'
          : 'Empresa cadastrada com unidade principal pronta para uso.'
      );
      await onSaved(result);
    } catch (err) {
      message.error(extractApiError(err, 'Não foi possível salvar a empresa.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        name: company?.name || '',
        contact_email: company?.contact_email || '',
        contact_phone: company?.contact_phone || '',
        default_address: '',
      }}
      onFinish={(values) => {
        void handleFinish(values);
      }}
    >
      <Form.Item
        name="name"
        label="Razão Social / Nome Fantasia"
        rules={[{ required: true, whitespace: true, message: 'Informe o nome da empresa.' }]}
      >
        <Input placeholder="Ex.: Padaria & Confeitaria São Carlos Ltda." maxLength={255} />
      </Form.Item>

      <Form.Item
        name="contact_email"
        label="E-mail de Contato"
        rules={[{ type: 'email', message: 'Informe um e-mail válido.' }]}
      >
        <Input placeholder="operacoes@empresa.com.br" maxLength={255} />
      </Form.Item>

      <Form.Item name="contact_phone" label="Telefone Comercial">
        <Input placeholder="(16) 3333-0000" maxLength={50} />
      </Form.Item>

      {!isEdit && (
        <>
          <Form.Item
            name="default_address"
            label="Endereço da Unidade Principal (Opcional)"
            style={{ marginBottom: 6 }}
          >
            <Input placeholder="Ex.: Av. São Carlos, 1500 - Centro" maxLength={255} />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            Uma unidade padrão será criada automaticamente. Caso o cliente possua múltiplas lojas, novas filiais podem ser adicionadas depois em Configurar Empresa.
          </Text>
        </>
      )}

      <Space style={{ width: '100%', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="primary" htmlType="submit" loading={saving}>
          {isEdit ? 'Salvar Alterações' : 'Cadastrar Empresa'}
        </Button>
      </Space>
    </Form>
  );
}

export interface CompanyFormModalProps {
  open: boolean;
  company?: Company | null;
  onClose: () => void;
  onSuccess: (saved: Company) => void | Promise<void>;
}

export default function CompanyFormModal({
  open,
  company,
  onClose,
  onSuccess,
}: CompanyFormModalProps) {
  useSuspendShortcuts(Boolean(open));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      title={company ? 'Editar Empresa' : 'Nova Empresa'}
    >
      {open && (
        <CompanyFormBody
          company={company}
          onCancel={onClose}
          onSaved={onSuccess}
        />
      )}
    </Modal>
  );
}
