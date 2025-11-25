import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftOutlined, KeyOutlined, LockOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Result, Space, Typography } from 'antd';
import { acceptInvitation } from '../api';
import { extractApiError } from '../utils/formatters';

const { Title, Text } = Typography;

interface AcceptInvitationFormValues {
  token: string;
  password: string;
  confirm_password: string;
}

export default function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [loading, setLoading] = useState(false);
  const [activated, setActivated] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleFinish = async (values: AcceptInvitationFormValues) => {
    setErrorMessage('');
    setLoading(true);
    try {
      await acceptInvitation(values.token.trim(), values.password);
      setActivated(true);
    } catch (err) {
      setErrorMessage(
        extractApiError(
          err,
          'Convite inválido, expirado ou já utilizado. Solicite o reenvio do convite ao administrador.'
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 460,
          borderRadius: 12,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        }}
      >
        {activated ? (
          <Result
            status="success"
            title="Conta ativada com sucesso!"
            subTitle="Seu convite foi aceito e sua senha foi configurada. Faça login para acessar os painéis de monitoramento."
            extra={[
              <Link key="login" to="/login">
                <Button type="primary" size="large">
                  Acessar Plataforma
                </Button>
              </Link>,
            ]}
          />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Link to="/login">
                <Space size={4}>
                  <ArrowLeftOutlined />
                  <span>Voltar para o login</span>
                </Space>
              </Link>
            </div>

            <div>
              <Title level={3} style={{ marginBottom: 4 }}>
                Aceitar Convite — Polo Sanca
              </Title>
              <Text type="secondary">
                Defina sua senha de acesso (mínimo de 8 caracteres) para ativar sua conta na plataforma.
              </Text>
            </div>

            {errorMessage && <Alert type="error" showIcon message={errorMessage} />}

            <Form<AcceptInvitationFormValues>
              layout="vertical"
              size="large"
              initialValues={{ token: tokenFromUrl }}
              onFinish={(values) => {
                void handleFinish(values);
              }}
            >
              {!tokenFromUrl ? (
                <Form.Item
                  name="token"
                  label="Token de Convite"
                  rules={[{ required: true, message: 'Informe o token de convite recebido por e-mail' }]}
                >
                  <Input
                    prefix={<KeyOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="Cole o token de convite"
                  />
                </Form.Item>
              ) : (
                <Form.Item name="token" hidden>
                  <Input />
                </Form.Item>
              )}

              <Form.Item
                name="password"
                label="Criar Senha de Acesso"
                rules={[
                  { required: true, message: 'Crie uma senha para sua conta' },
                  { min: 8, message: 'A senha deve ter no mínimo 8 caracteres' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                  placeholder="Mínimo de 8 caracteres"
                  autoComplete="new-password"
                />
              </Form.Item>

              <Form.Item
                name="confirm_password"
                label="Confirmar Senha"
                dependencies={['password']}
                rules={[
                  { required: true, message: 'Confirme sua senha' },
                  ({ getFieldValue }) => ({
                    validator(_, value: string | undefined) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('As senhas não coincidem'));
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                  placeholder="Repita sua senha"
                  autoComplete="new-password"
                />
              </Form.Item>

              <Button type="primary" htmlType="submit" block loading={loading}>
                Ativar Conta
              </Button>
            </Form>
          </Space>
        )}
      </Card>
    </div>
  );
}
