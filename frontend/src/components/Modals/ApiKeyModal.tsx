import { useState } from 'react';
import { Alert, App as AntdApp, Button, Modal, Space, Typography } from 'antd';
import { CheckOutlined, CopyOutlined, KeyOutlined } from '@ant-design/icons';
import { API_URL } from '../../api';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';

const { Paragraph, Text } = Typography;

export interface ApiKeyModalData {
  apiKey?: string;
  serial?: string;
  isRotation?: boolean;
}

export interface ApiKeyModalProps {
  open: boolean;
  onClose: () => void;
  apiKeyData?: ApiKeyModalData | null;
}

export default function ApiKeyModal({ open, onClose, apiKeyData }: ApiKeyModalProps) {
  useSuspendShortcuts(Boolean(open));

  const { message } = AntdApp.useApp();
  const [copied, setCopied] = useState(false);

  const apiKey = apiKeyData?.apiKey || '';
  const serial = apiKeyData?.serial || 'EQUIPAMENTO';
  const isRotation = Boolean(apiKeyData?.isRotation);

  const handleCopy = async (): Promise<void> => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      message.success('Chave de API copiada para a área de transferência!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      message.warning('Não foi possível copiar automaticamente. Selecione e copie o texto abaixo.');
    }
  };

  const samplePayload = JSON.stringify(
    {
      serial,
      temperature: -18.5,
      pressure: 101.3,
      door: 0,
      heater: 0,
      compressor: 1,
      fan: 1,
    },
    null,
    2
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="Já copiei e salvei em local seguro"
      cancelButtonProps={{ style: { display: 'none' } }}
      closable={false}
      maskClosable={false}
      width={640}
      title={
        <Space>
          <KeyOutlined style={{ color: '#d97706' }} />
          <span>
            {isRotation
              ? `Nova Chave de API Gerada — ${serial}`
              : `Chave de API do Equipamento — ${serial}`}
          </span>
        </Space>
      }
      destroyOnHidden
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="Atenção: Exibição única!"
          description="Por segurança, o servidor armazena apenas o hash SHA-256 desta credencial. Copie e configure no controlador físico agora — ela não poderá ser visualizada novamente."
        />

        <div>
          <Text strong>Cabeçalho X-API-Key:</Text>
          <div
            style={{
              marginTop: 8,
              padding: '12px 14px',
              background: '#0f172a',
              color: '#f8fafc',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}
          >
            <span data-testid="plaintext-api-key">{apiKey}</span>
            <Button
              type="primary"
              icon={copied ? <CheckOutlined /> : <CopyOutlined />}
              onClick={() => {
                void handleCopy();
              }}
            >
              {copied ? 'Copiada!' : 'Copiar'}
            </Button>
          </div>
        </div>

        <div>
          <Text strong>Exemplo de envio de telemetria pelo hardware:</Text>
          <Paragraph
            style={{
              marginTop: 8,
              marginBottom: 0,
              padding: 12,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
            }}
          >
            {`curl -X POST "${API_URL}/equipments/telemetry" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${apiKey}" \\\n  -d '${samplePayload}'`}
          </Paragraph>
        </div>
      </Space>
    </Modal>
  );
}
