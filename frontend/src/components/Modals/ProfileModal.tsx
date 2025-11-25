import { useEffect, useState } from 'react';
import { App as AntdApp, Button, Descriptions, Form, Input, Modal, Space, Tabs, Tag } from 'antd';
import { changePassword } from '../../api';
import { useAuth } from '../../context/authContextObject';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';
import {
  extractApiError,
  ROLE_COLORS,
  ROLE_LABELS,
} from '../../utils/formatters';

interface ProfileFormValues {
  name: string;
}

interface ChangePasswordFormValues {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ProfileModal({ open, onClose }: ProfileModalProps) {
  useSuspendShortcuts(Boolean(open));

  const { message } = AntdApp.useApp();
  const { user, saveProfileName } = useAuth();
  const [profileForm] = Form.useForm<ProfileFormValues>();
  const [passwordForm] = Form.useForm<ChangePasswordFormValues>();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (open && user) {
      profileForm.setFieldsValue({ name: user.name });
      passwordForm.resetFields();
    }
  }, [open, user, profileForm, passwordForm]);

  const handleSaveProfile = async (values: ProfileFormValues): Promise<void> => {
    setSavingProfile(true);
    try {
      await saveProfileName(values.name.trim());
      message.success('Nome do perfil atualizado com sucesso!');
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao atualizar perfil.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (values: ChangePasswordFormValues): Promise<void> => {
    setSavingPassword(true);
    try {
      await changePassword(values.current_password, values.new_password);
      message.success('Senha alterada com sucesso!');
      passwordForm.resetFields();
    } catch (err) {
      message.error(extractApiError(err, 'Erro ao alterar senha.'));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title="Meu Perfil e Segurança"
      width={520}
      destroyOnHidden
    >
      <Tabs
        items={[
          {
            key: 'profile',
            label: 'Dados da Conta',
            children: (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {user && (
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="E-mail">{user.email}</Descriptions.Item>
                    <Descriptions.Item label="Perfil de Acesso">
                      <Tag color={ROLE_COLORS[user.role] || 'default'}>
                        {ROLE_LABELS[user.role] || user.role}
                      </Tag>
                    </Descriptions.Item>
                    {user.role === 'company_viewer' && (
                      <Descriptions.Item label="Escopo de Filiais">
                        <Tag color={user.branch_access_type === 'restricted' ? 'orange' : 'green'}>
                          {user.branch_access_type === 'restricted'
                            ? 'Acesso Restrito às Filiais Designadas'
                            : 'Acesso Completo (Todas as Filiais)'}
                        </Tag>
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                )}

                <Form
                  form={profileForm}
                  layout="vertical"
                  onFinish={(values) => {
                    void handleSaveProfile(values);
                  }}
                >
                  <Form.Item
                    name="name"
                    label="Nome de Exibição"
                    rules={[{ required: true, message: 'Informe seu nome' }]}
                  >
                    <Input placeholder="Seu nome completo" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={savingProfile}>
                    Salvar Nome
                  </Button>
                </Form>
              </Space>
            ),
          },
          {
            key: 'password',
            label: 'Alterar Senha',
            children: (
              <Form
                form={passwordForm}
                layout="vertical"
                onFinish={(values) => {
                  void handleChangePassword(values);
                }}
              >
                <Form.Item
                  name="current_password"
                  label="Senha Atual"
                  rules={[{ required: true, message: 'Informe sua senha atual' }]}
                >
                  <Input.Password placeholder="Digite sua senha atual" />
                </Form.Item>
                <Form.Item
                  name="new_password"
                  label="Nova Senha"
                  rules={[
                    { required: true, message: 'Informe a nova senha' },
                    { min: 8, message: 'A nova senha deve ter no mínimo 8 caracteres' },
                  ]}
                >
                  <Input.Password placeholder="Mínimo de 8 caracteres" />
                </Form.Item>
                <Form.Item
                  name="confirm_password"
                  label="Confirmar Nova Senha"
                  dependencies={['new_password']}
                  rules={[
                    { required: true, message: 'Confirme a nova senha' },
                    ({ getFieldValue }) => ({
                      validator(_rule, value: string | undefined) {
                        if (!value || getFieldValue('new_password') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('As senhas não coincidem'));
                      },
                    }),
                  ]}
                >
                  <Input.Password placeholder="Repita a nova senha" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={savingPassword}>
                  Atualizar Senha
                </Button>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
}
