import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  GlobalOutlined,
  LockOutlined,
  MailOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Divider, Form, Input, Space, Typography } from 'antd';
import axios from 'axios';
import { useAuth } from '../context/authContextObject';
import { POLOSANCA_CONTACT } from '../utils/companyContact';
import { extractApiError } from '../utils/formatters';

const { Title, Text } = Typography;

interface LoginFormValues {
  email: string;
  password: string;
}

export default function LoginPage() {
  const { isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginFormValues>();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (isAuthenticated) {
    return <Navigate to="/operacao" replace />;
  }

  const performLogin = async (email: string, password: string) => {
    setErrorMessage('');
    setLoading(true);
    try {
      await signIn(email, password);
      void navigate('/operacao', { replace: true });
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401) {
        setErrorMessage('E-mail ou senha inválidos. Verifique suas credenciais.');
      } else if (status === 403) {
        setErrorMessage(
          'Sua conta ou empresa está pendente ou inativa. Entre em contato com o administrador.'
        );
      } else if (status === 429) {
        setErrorMessage('Muitas tentativas de acesso. Aguarde um minuto antes de tentar novamente.');
      } else {
        setErrorMessage(extractApiError(err, 'Falha ao realizar login. Tente novamente.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async (values: LoginFormValues) => {
    await performLogin(values.email.trim(), values.password);
  };

  const handleQuickLogin = async (demoEmail: string, demoPassword: string) => {
    form.setFieldsValue({ email: demoEmail, password: demoPassword });
    await performLogin(demoEmail, demoPassword);
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
          maxWidth: 440,
          borderRadius: 12,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 48,
                height: 48,
                margin: '0 auto 12px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: 20,
              }}
            >
              PS
            </div>
            <Title level={3} style={{ marginBottom: 4 }}>
              Polo Sanca
            </Title>
            <Text type="secondary">Monitoramento de Equipamentos de Refrigeração</Text>
          </div>

          {errorMessage && <Alert type="error" showIcon message={errorMessage} />}

          <Form<LoginFormValues>
            form={form}
            layout="vertical"
            size="large"
            onFinish={(values) => {
              void handleFinish(values);
            }}
          >
            <Form.Item
              name="email"
              label="E-mail"
              rules={[
                { required: true, message: 'Informe seu e-mail corporativo' },
                { type: 'email', message: 'Informe um endereço de e-mail válido' },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                placeholder="nome@empresa.com.br"
                autoComplete="email"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Senha"
              rules={[{ required: true, message: 'Informe sua senha' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Digite sua senha"
                autoComplete="current-password"
              />
            </Form.Item>

            <div style={{ textAlign: 'right', marginBottom: 16 }}>
              <Link to="/forgot-password">Esqueceu sua senha?</Link>
            </div>

            <Button type="primary" htmlType="submit" block loading={loading}>
              Entrar na Plataforma
            </Button>
          </Form>

          <Divider plain style={{ margin: '8px 0' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Acesso Rápido (Ambiente de Demonstração)
            </Text>
          </Divider>

          <Space wrap style={{ justifyContent: 'center', width: '100%' }}>
            <Button
              size="small"
              disabled={loading}
              onClick={() => {
                void handleQuickLogin('admin@polosanca.com', 'admin123');
              }}
            >
              Admin Global
            </Button>
            <Button
              size="small"
              disabled={loading}
              onClick={() => {
                void handleQuickLogin('admin@testcompany.com', 'password123');
              }}
            >
              Admin Empresa
            </Button>
            <Button
              size="small"
              disabled={loading}
              onClick={() => {
                void handleQuickLogin('viewer@testcompany.com', 'viewer123');
              }}
            >
              Visualizador
            </Button>
          </Space>

          <div style={{ textAlign: 'center', marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Recebeu um token de convite?{' '}
              <Link to="/accept-invitation">Ativar minha conta</Link>
            </Text>
          </div>

          <div
            style={{
              borderTop: '1px solid var(--ps-subtle-divider)',
              paddingTop: 12,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 11.5, color: 'var(--ps-text-secondary)', marginBottom: 8 }}>
              Suporte Técnico — <strong>{POLOSANCA_CONTACT.brandName}</strong> (São Carlos - SP)
            </div>
            <Space size={[12, 6]} wrap style={{ justifyContent: 'center', fontSize: 12 }}>
              <a
                href={POLOSANCA_CONTACT.primaryWhatsapp.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#16a34a',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <WhatsAppOutlined /> {POLOSANCA_CONTACT.primaryWhatsapp.label}
              </a>
              <span style={{ color: 'var(--ps-border)' }}>•</span>
              <a
                href={`mailto:${POLOSANCA_CONTACT.email}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <MailOutlined /> E-mail
              </a>
              <span style={{ color: 'var(--ps-border)' }}>•</span>
              <a
                href={POLOSANCA_CONTACT.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <GlobalOutlined /> {POLOSANCA_CONTACT.websiteLabel}
              </a>
            </Space>
          </div>
        </Space>
      </Card>
    </div>
  );
}
