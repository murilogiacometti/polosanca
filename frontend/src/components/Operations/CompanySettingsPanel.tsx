import { useEffect, useState } from 'react';
import { CheckCircleOutlined, SaveOutlined, StopOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Popconfirm,
  Row,
  Space,
  Tag,
} from 'antd';
import { deactivateCompany, updateCompany } from '../../api';
import { useAuth } from '../../context/authContextObject';
import type { Company } from '../../types/models';
import {
  COMPANY_STATUS_CONFIG,
  extractApiError,
  formatDateTimePtBR,
} from '../../utils/formatters';

interface CompanyRecord extends Company {
  equipment_count?: number;
}

interface CompanyProfileFormValues {
  name: string;
  contact_email?: string;
  contact_phone?: string;
}

export interface CompanySettingsPanelProps {
  company?: Company | null;
  onCompanyUpdated?: (updated?: Company) => void;
}

export default function CompanySettingsPanel({
  company,
  onCompanyUpdated,
}: CompanySettingsPanelProps) {
  const { message } = AntdApp.useApp();
  const { isGlobalAdmin, canWriteOperations } = useAuth();
  const [form] = Form.useForm<CompanyProfileFormValues>();
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  useEffect(() => {
    if (!company) return;
    form.setFieldsValue({
      name: company.name || '',
      contact_email: company.contact_email || '',
      contact_phone: company.contact_phone || '',
    });
  }, [company, form]);

  if (!company) return null;

  const companyRecord: CompanyRecord = company;
  const statusCfg = (company.status ? COMPANY_STATUS_CONFIG[company.status] : undefined) || {
    label: company.status || '—',
    color: 'default',
  };

  const handleSaveProfile = async (values: CompanyProfileFormValues): Promise<void> => {
    setSaving(true);
    try {
      const updated = await updateCompany(company.id, {
        name: values.name.trim(),
        contact_email: values.contact_email?.trim() || null,
        contact_phone: values.contact_phone?.trim() || null,
      });
      message.success('Dados cadastrais da empresa atualizados.');
      onCompanyUpdated?.(updated);
    } catch (err) {
      message.error(extractApiError(err, 'Não foi possível atualizar os dados da empresa.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (): Promise<void> => {
    setStatusBusy(true);
    try {
      await deactivateCompany(company.id);
      message.success('Empresa desativada. Todo o histórico foi preservado.');
      onCompanyUpdated?.();
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao desativar empresa.'));
    } finally {
      setStatusBusy(false);
    }
  };

  const handleReactivate = async (): Promise<void> => {
    setStatusBusy(true);
    try {
      const updated = await updateCompany(company.id, { status: 'active' });
      message.success('Empresa reativada com sucesso.');
      onCompanyUpdated?.(updated);
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao reativar empresa.'));
    } finally {
      setStatusBusy(false);
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={15}>
        <Card title="Cadastro e Contatos Operacionais da Empresa">
          <Form<CompanyProfileFormValues>
            form={form}
            layout="vertical"
            disabled={!canWriteOperations}
            onFinish={(values) => {
              void handleSaveProfile(values);
            }}
          >
            <Form.Item
              name="name"
              label="Razão Social / Nome Fantasia"
              rules={[{ required: true, whitespace: true, message: 'Informe o nome da empresa.' }]}
            >
              <Input maxLength={255} />
            </Form.Item>

            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="contact_email"
                  label="E-mail de Contato Operacional"
                  rules={[{ type: 'email', message: 'Informe um e-mail válido.' }]}
                >
                  <Input placeholder="operacoes@empresa.com.br" maxLength={255} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="contact_phone" label="Telefone / Plantão">
                  <Input placeholder="(16) 3333-0000" maxLength={50} />
                </Form.Item>
              </Col>
            </Row>

            {canWriteOperations && (
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                Salvar Dados da Empresa
              </Button>
            )}
          </Form>
        </Card>
      </Col>

      <Col xs={24} lg={9}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Card title="Metadados da Conta Multitenant" size="small">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Status">
                <Tag color={statusCfg.color}>{statusCfg.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="ID Interno">
                <span className="ps-tabular" style={{ fontSize: 12 }}>
                  {company.id}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Filiais Cadastradas">
                <span className="ps-tabular">{company.branches_count ?? '—'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Equipamentos Ativos">
                <span className="ps-tabular">
                  {companyRecord.equipment_count ?? company.equipments_count ?? '—'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Cadastrada em">
                <span className="ps-tabular">{formatDateTimePtBR(company.created_at)}</span>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {isGlobalAdmin && (
            <Card title="Ciclo de Vida do Cliente (Admin Global)" size="small">
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Alert
                  type={company.status === 'active' ? 'warning' : 'info'}
                  showIcon
                  message={
                    company.status === 'active'
                      ? 'Desativar suspende logins de operadores desta empresa sem apagar telemetria.'
                      : 'Esta empresa encontra-se inativa no momento.'
                  }
                />

                {company.status === 'active' ? (
                  <Popconfirm
                    title="Desativar esta empresa?"
                    description="Os usuários vinculados terão o acesso suspenso, mantendo 100% do histórico."
                    okText="Desativar Empresa"
                    okButtonProps={{ danger: true }}
                    cancelText="Cancelar"
                    onConfirm={() => {
                      void handleDeactivate();
                    }}
                  >
                    <Button danger block icon={<StopOutlined />} loading={statusBusy}>
                      Desativar Empresa
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button
                    type="primary"
                    block
                    icon={<CheckCircleOutlined />}
                    loading={statusBusy}
                    onClick={() => {
                      void handleReactivate();
                    }}
                  >
                    Reativar Empresa
                  </Button>
                )}
              </Space>
            </Card>
          )}
        </Space>
      </Col>
    </Row>
  );
}
