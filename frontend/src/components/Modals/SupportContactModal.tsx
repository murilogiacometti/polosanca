import {
  CopyOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  MailOutlined,
  PhoneOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import { App as AntdApp, Button, Card, Divider, Modal, Space, Tag, Typography } from 'antd';
import { useSuspendShortcuts } from '../../context/uiShellContextObject';
import { POLOSANCA_CONTACT } from '../../utils/companyContact';

const { Text, Paragraph } = Typography;

interface KeyboardShortcutItem {
  keys: string[];
  description: string;
}

const KEYBOARD_SHORTCUTS: readonly KeyboardShortcutItem[] = [
  { keys: ['⌘K', '/'], description: 'Busca rápida de empresas, filiais, câmaras frias e telas' },
  { keys: ['Esc'], description: 'Subir um nível na hierarquia de monitoramento' },
  { keys: ['J', 'K'], description: 'Alternar para a próxima / anterior câmara fria da mesma filial' },
  { keys: ['?'], description: 'Abrir esta janela de Ajuda, Atalhos e Suporte' },
];

export interface SupportContactModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SupportContactModal({ open, onClose }: SupportContactModalProps) {
  useSuspendShortcuts(Boolean(open));

  const { message } = AntdApp.useApp();

  const handleCopyEmail = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(POLOSANCA_CONTACT.email);
      message.success('E-mail copiado para a área de transferência.');
    } catch {
      message.info(POLOSANCA_CONTACT.email);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Ajuda, Atalhos & Suporte — PoloSanca Refrigeração"
      footer={[
        <Button key="close" onClick={onClose}>
          Fechar
        </Button>,
        <Button
          key="site"
          type="primary"
          icon={<GlobalOutlined />}
          href={POLOSANCA_CONTACT.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Acessar Site Oficial
        </Button>,
      ]}
      width={560}
      destroyOnHidden
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small" title="Atalhos Rápidos de Teclado (Sala de Controle)">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {KEYBOARD_SHORTCUTS.map((sc) => (
              <div
                key={sc.description}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 12.5 }}>{sc.description}</Text>
                <Space size={4} style={{ flexShrink: 0 }}>
                  {sc.keys.map((k) => (
                    <kbd
                      key={k}
                      className="ps-mono"
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 7px',
                        borderRadius: 5,
                        border: '1px solid var(--ps-border)',
                        background: 'var(--ps-kbd-bg)',
                        color: 'var(--ps-text-primary)',
                      }}
                    >
                      {k}
                    </kbd>
                  ))}
                </Space>
              </div>
            ))}
          </Space>
        </Card>

        <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12.5 }}>
          Precisa de assistência técnica em câmaras frias, manutenção preventiva/corretiva, peças ou
          apoio no monitoramento de sensores? Fale diretamente com a equipe da{' '}
          <strong>{POLOSANCA_CONTACT.brandName}</strong>.
        </Paragraph>

        <Card size="small" title="Canais Diretos via WhatsApp">
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {POLOSANCA_CONTACT.whatsappChannels.map((ch, idx) => (
              <div
                key={ch.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <Space size={8}>
                  <PhoneOutlined style={{ color: 'var(--ps-text-secondary)' }} />
                  <span className="ps-tabular" style={{ fontWeight: 600 }}>
                    {ch.label}
                  </span>
                  <Tag color={idx === 0 ? 'green' : 'default'} style={{ margin: 0 }}>
                    {ch.contactName}
                  </Tag>
                </Space>

                <Button
                  size="small"
                  type={idx === 0 ? 'primary' : 'default'}
                  icon={<WhatsAppOutlined />}
                  href={ch.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={
                    idx === 0
                      ? { backgroundColor: '#16a34a', borderColor: '#16a34a' }
                      : undefined
                  }
                >
                  Iniciar conversa
                </Button>
              </div>
            ))}
          </Space>
        </Card>

        <Card size="small" title="E-mail Corporativo e Portal Institucional">
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <Space size={8}>
                <MailOutlined style={{ color: '#2563eb' }} />
                <a href={`mailto:${POLOSANCA_CONTACT.email}`}>{POLOSANCA_CONTACT.email}</a>
              </Space>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => {
                  void handleCopyEmail();
                }}
              >
                Copiar
              </Button>
            </div>

            <Divider style={{ margin: '4px 0' }} />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <Space size={8}>
                <GlobalOutlined style={{ color: '#2563eb' }} />
                <a
                  href={POLOSANCA_CONTACT.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {POLOSANCA_CONTACT.websiteLabel}
                </a>
              </Space>
              <Space size={4}>
                <EnvironmentOutlined style={{ color: 'var(--ps-text-secondary)', fontSize: 12 }} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {POLOSANCA_CONTACT.location}
                </Text>
              </Space>
            </div>
          </Space>
        </Card>
      </Space>
    </Modal>
  );
}
