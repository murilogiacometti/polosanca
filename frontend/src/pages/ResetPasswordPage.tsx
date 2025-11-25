import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftOutlined, KeyOutlined, LockOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Result, Space, Typography } from 'antd';
import { resetPassword } from '../api';
import { extractApiError } from '../utils/formatters';

const { Title, Text } = Typography;

interface ResetPasswordFormValues {
  token: string;
  new_password: string;
  confirm_password: string;
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleFinish = async (values: ResetPasswordFormValues) => {
    setErrorMessage('');
    setLoading(true);
    try {
      await resetPassword(values.token.trim(), values.new_password);
      setCompleted(true);
    } catch (err) {
      setErrorMessage(
        extractApiError(
          err,
          'Token inválido ou expirado. Solicite um novo link de redefinição de senha.'
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
        {completed ? (
          <Result
            status="success"
            title="Senha redefinida com sucesso!"
            subTitle="Sua nova senha já está ativa. Você pode acessar a plataforma normalmente."
            extra={[
              <Link key="login" to="/login">
                <Button type="primary" size="large">
                  Ir para o Login
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
                Definir Nova Senha
              </Title>
              <Text type="secondary">
                Escolha uma nova senha com pelo menos 8 caracteres para sua conta Polo Sanca.
              </Text>
            </div>

            {errorMessage && <Alert type="error" showIcon message={errorMessage} />}

            <Form<ResetPasswordFormValues>
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
                  label="Token de Redefinição"
                  rules={[{ required: true, message: 'Informe o token recebido por e-mail' }]}
                >
                  <Input
                    prefix={<KeyOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="Cole o token recebido por e-mail"
                  />
                </Form.Item>
              ) : (
                <Form.Item name="token" hidden>
                  <Input />
                </Form.Item>
              )}

              <Form.Item
                name="new_password"
                label="Nova Senha"
                rules={[
                  { required: true, message: 'Informe sua nova senha' },
                  { min: 8, message: 'A senha deve conter no mínimo 8 caracteres' },
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
                label="Confirmar Nova Senha"
                dependencies={['new_password']}
                rules={[
                  { required: true, message: 'Confirme sua nova senha' },
                  ({ getFieldValue }) => ({
                    validator(_, value: string | undefined) {
                      if (!value || getFieldValue('new_password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('As senhas digitadas não coincidem'));
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                />
              </Form.Item>

              <Button type="primary" htmlType="submit" block loading={loading}>
                Salvar Nova Senha
              </Button>
            </Form>
          </Space>
        )}
      </Card>
    </div>
  );
}
