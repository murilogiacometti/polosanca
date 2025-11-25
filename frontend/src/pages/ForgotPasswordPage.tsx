import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftOutlined, MailOutlined, WhatsAppOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Result, Space, Typography } from 'antd';
import { forgotPassword } from '../api';
import { POLOSANCA_CONTACT } from '../utils/companyContact';
import { extractApiError } from '../utils/formatters';

const { Title, Text } = Typography;

interface ForgotPasswordFormValues {
  email: string;
}

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleFinish = async (values: ForgotPasswordFormValues) => {
    setErrorMessage('');
    setLoading(true);
    try {
      const cleanEmail = values.email.trim();
      await forgotPassword(cleanEmail);
      setSubmittedEmail(cleanEmail);
    } catch (err) {
      setErrorMessage(
        extractApiError(err, 'Não foi possível processar a solicitação no momento.')
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
        {submittedEmail ? (
          <Result
            status="success"
            title="Instruções enviadas!"
            subTitle={`Se existir uma conta ativa vinculada a ${submittedEmail}, você receberá um link válido por 1 hora para redefinir sua senha.`}
            extra={[
              <Link key="reset" to="/reset-password">
                <Button type="default">Já tenho um token de redefinição</Button>
              </Link>,
              <Link key="login" to="/login">
                <Button type="primary">Voltar para o Login</Button>
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
                Recuperar Senha
              </Title>
              <Text type="secondary">
                Informe seu e-mail cadastrado. Enviaremos um link de uso único com validade de 1 hora.
              </Text>
            </div>

            {errorMessage && <Alert type="error" showIcon message={errorMessage} />}

            <Form<ForgotPasswordFormValues>
              layout="vertical"
              size="large"
              onFinish={(values) => {
                void handleFinish(values);
              }}
            >
              <Form.Item
                name="email"
                label="E-mail cadastrado"
                rules={[
                  { required: true, message: 'Informe seu e-mail' },
                  { type: 'email', message: 'Informe um e-mail válido' },
                ]}
              >
                <Input
                  prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                  placeholder="nome@empresa.com.br"
                  autoComplete="email"
                />
              </Form.Item>

              <Button type="primary" htmlType="submit" block loading={loading}>
                Enviar Link de Redefinição
              </Button>
            </Form>

            <div style={{ textAlign: 'center', paddingTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Precisa de ajuda com seu acesso?{' '}
                <a
                  href={POLOSANCA_CONTACT.primaryWhatsapp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#16a34a', fontWeight: 600 }}
                >
                  <WhatsAppOutlined /> Falar no WhatsApp {POLOSANCA_CONTACT.primaryWhatsapp.label}
                </a>
              </Text>
            </div>
          </Space>
        )}
      </Card>
    </div>
  );
}
