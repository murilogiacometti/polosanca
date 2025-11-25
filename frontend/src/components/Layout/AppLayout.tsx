import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BellOutlined,
  CustomerServiceOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Dropdown,
  Grid,
  Layout,
  Menu,
  Space,
  Tag,
  Tooltip,
  Typography,
  type MenuProps,
} from 'antd';
import { getAlerts } from '../../api';
import { useAuth } from '../../context/authContextObject';
import { useTheme } from '../../context/themeContextObject';
import { useSuspendShortcuts, useUiShell } from '../../context/uiShellContextObject';
import { queryKeys } from '../../query/queryClient';
import type { User } from '../../types/models';
import { ROLE_LABELS } from '../../utils/formatters';
import ProfileModal from '../Modals/ProfileModal';
import QuickJumpModal from '../Modals/QuickJumpModal';
import SupportContactModal from '../Modals/SupportContactModal';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

const ROUTE_TITLES: Record<string, string> = {
  '/alerts': 'Alertas',
  '/admin': 'Administração',
};

const GENERIC_ROLE_NAMES = new Set([
  'global admin',
  'administrador global',
  'company admin',
  'administrador da empresa',
  'company viewer',
  'visualizador',
  'restricted viewer',
  'visualizador restrito',
]);

interface UserHeaderIdentity {
  primaryName: string;
  secondaryRole: string;
  initials: string;
}

function ActivityPulseIcon() {
  return (
    <span role="img" className="anticon" style={{ display: 'inline-flex', alignItems: 'center' }}>
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    </span>
  );
}

function resolveUserHeaderIdentity(user: User | null, roleLabel: string): UserHeaderIdentity {
  if (!user) {
    return { primaryName: '', secondaryRole: '', initials: 'U' };
  }
  const rawName = (user.name || '').trim();
  const normalizedName = rawName.toLowerCase();
  const isGenericRoleName =
    !rawName ||
    normalizedName === (roleLabel || '').trim().toLowerCase() ||
    GENERIC_ROLE_NAMES.has(normalizedName);

  let primaryName = rawName;
  if (isGenericRoleName && user.email) {
    const handle = user.email.split('@')[0] || '';
    const parts = handle
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
    const humanizedHandle = parts.join(' ');
    if (
      humanizedHandle &&
      !['Admin', 'Viewer', 'Restricted', 'User'].includes(humanizedHandle)
    ) {
      primaryName = humanizedHandle;
    } else {
      primaryName = user.email;
    }
  }

  const initialsSource = isGenericRoleName
    ? ((user.email || rawName || 'U').split('@')[0] ?? 'U')
    : rawName;
  const initials =
    initialsSource
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || 'U';

  return {
    primaryName: primaryName || user.email || 'Operador',
    secondaryRole: roleLabel,
    initials,
  };
}

function getSelectedMenuKey(pathname: string): string {
  if (pathname.startsWith('/alerts')) return '/alerts';
  if (pathname.startsWith('/admin')) return '/admin';
  return '/operacao';
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toUpperCase();
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    Boolean(target.isContentEditable)
  );
}

function hasKeyboardModifier(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey || e.altKey;
}

function buildPrimaryMenuItems(params: {
  collapsed: boolean;
  isMobile: boolean;
  activeAlertCount: number;
  canWriteOperations: boolean;
}): MenuProps['items'] {
  const { collapsed, isMobile, activeAlertCount, canWriteOperations } = params;
  const showInlineAlertPill = (!collapsed || isMobile) && activeAlertCount > 0;
  return [
    {
      key: '/operacao',
      icon: <ActivityPulseIcon />,
      label: 'Monitoramento',
    },
    {
      key: '/alerts',
      icon: (
        <Badge count={collapsed && !isMobile ? activeAlertCount : 0} size="small" offset={[6, -2]}>
          <BellOutlined style={{ color: 'inherit' }} />
        </Badge>
      ),
      label: (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <span>Alertas</span>
          {showInlineAlertPill && (
            <span className="ps-sidebar-alert-pill ps-tabular">{activeAlertCount}</span>
          )}
        </span>
      ),
    },
    ...(canWriteOperations
      ? [
          {
            key: '/admin',
            icon: <SafetyCertificateOutlined />,
            label: 'Administração',
          },
        ]
      : []),
  ];
}

function HeaderUserProfileButton({
  isMobile,
  profileMenuItems,
  profileMenuOpen,
  setProfileMenuOpen,
  identity,
}: {
  isMobile: boolean;
  profileMenuItems: MenuProps['items'];
  profileMenuOpen: boolean;
  setProfileMenuOpen: (open: boolean) => void;
  identity: UserHeaderIdentity;
}) {
  const { primaryName, secondaryRole, initials } = identity;

  return (
    <Dropdown
      menu={{ items: profileMenuItems }}
      trigger={['click']}
      placement="bottomRight"
      open={profileMenuOpen}
      onOpenChange={setProfileMenuOpen}
    >
      <button
        type="button"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 9,
          padding: '4px 12px 4px 5px',
          borderRadius: 999,
          border: '1px solid var(--ps-border)',
          background: 'var(--ps-chip-bg)',
          color: 'var(--ps-text-primary)',
          cursor: 'pointer',
          textAlign: 'left',
          maxWidth: isMobile ? 165 : 250,
        }}
      >
        <Avatar
          size={28}
          style={{
            backgroundColor: '#2563eb',
            color: '#ffffff',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initials}
        </Avatar>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            lineHeight: 1.2,
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: 12,
              color: 'var(--ps-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {primaryName}
          </span>
          {!isMobile && secondaryRole && (
            <span
              style={{
                fontSize: 10.5,
                color: 'var(--ps-text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {secondaryRole}
            </span>
          )}
        </div>
      </button>
    </Dropdown>
  );
}

function AppTopHeader({
  isMobile,
  isOperationsRoute,
  nonOperationTitle,
  user,
  identity,
  profileMenuItems,
  profileMenuOpen,
  setProfileMenuOpen,
  setMobileNavOpen,
  setQuickJumpOpen,
  setTopBarLeftNode,
  setTopBarRightNode,
}: {
  isMobile: boolean;
  isOperationsRoute: boolean;
  nonOperationTitle: string;
  user: User | null;
  identity: UserHeaderIdentity;
  profileMenuItems: MenuProps['items'];
  profileMenuOpen: boolean;
  setProfileMenuOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  setQuickJumpOpen: (open: boolean) => void;
  setTopBarLeftNode: (node: HTMLDivElement | null) => void;
  setTopBarRightNode: (node: HTMLDivElement | null) => void;
}) {
  const isRestrictedViewer =
    user?.role === 'company_viewer' && user.branch_access_type === 'restricted';

  return (
    <Header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--ps-header-bg)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        padding: isMobile ? '0 12px' : '0 26px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--ps-border)',
        height: 58,
        lineHeight: 'normal',
        gap: 12,
        flexWrap: 'nowrap',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          flex: '1 1 auto',
          overflow: 'hidden',
        }}
      >
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setMobileNavOpen(true)}
            aria-label="Abrir navegação"
            style={{ flexShrink: 0 }}
          />
        )}

        <div
          ref={setTopBarLeftNode}
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'nowrap',
            gap: 6,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          {!isOperationsRoute && (
            <Space size={8} wrap={false}>
              <Text strong style={{ fontSize: 15, color: 'var(--ps-text-primary)' }}>
                {nonOperationTitle}
              </Text>
              {isRestrictedViewer && (
                <Tag
                  icon={<LockOutlined />}
                  color="orange"
                  style={{ margin: 0, borderRadius: 999 }}
                >
                  Acesso Restrito
                </Tag>
              )}
            </Space>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div
          ref={setTopBarRightNode}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        />

        <Tooltip title="Saltar direto para Empresa, Filial ou Câmara Fria (⌘K ou /)">
          <button
            type="button"
            onClick={() => setQuickJumpOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 9px 5px 11px',
              borderRadius: 999,
              border: '1px solid var(--ps-border)',
              background: 'var(--ps-chip-bg)',
              color: 'var(--ps-text-secondary)',
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <SearchOutlined style={{ fontSize: 12.5 }} />
            {!isMobile && <span>Ir para...</span>}
            <kbd
              className="ps-mono"
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                padding: '1px 5px',
                borderRadius: 4,
                border: '1px solid var(--ps-border)',
                background: 'var(--ps-kbd-bg)',
                color: 'var(--ps-text-secondary)',
              }}
            >
              ⌘K
            </kbd>
          </button>
        </Tooltip>

        {user && (
          <HeaderUserProfileButton
            isMobile={isMobile}
            profileMenuItems={profileMenuItems}
            profileMenuOpen={profileMenuOpen}
            setProfileMenuOpen={setProfileMenuOpen}
            identity={identity}
          />
        )}
      </div>
    </Header>
  );
}

export default function AppLayout() {
  const { user, isGlobalAdmin, canWriteOperations, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { setTopBarLeftNode, setTopBarRightNode } = useUiShell();
  const location = useLocation();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.lg;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickJumpOpen, setQuickJumpOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  useSuspendShortcuts(mobileNavOpen || profileMenuOpen);

  const isOperationsRoute = location.pathname.startsWith('/operacao');

  const { data: activeAlertCount = 0 } = useQuery({
    queryKey: queryKeys.alerts.activeCount(),
    queryFn: async () => {
      const res = await getAlerts({ status: 'active', limit: 1 });
      return res?.pagination?.total || 0;
    },
    enabled: Boolean(user),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  // Atalhos globais de teclado: ⌘K / Ctrl+K, "/" ou "?" fora de campos de texto
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickJumpOpen((prev) => !prev);
        return;
      }

      if (isEditableKeyboardTarget(e.target) || hasKeyboardModifier(e)) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        setQuickJumpOpen(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setSupportOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const selectedKey = getSelectedMenuKey(location.pathname);

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    await signOut();
    void navigate('/login', { replace: true });
  };

  // Navegação primária coesa no topo (Monitoramento, Alertas, Administração) + Ajuda no rodapé
  const primaryMenuItems = buildPrimaryMenuItems({
    collapsed,
    isMobile,
    activeAlertCount,
    canWriteOperations,
  });

  const bottomMenuItems: MenuProps['items'] = [
    {
      key: '__support__',
      icon: <QuestionCircleOutlined />,
      label: 'Ajuda e Suporte',
    },
  ];

  const profileMenuItems: MenuProps['items'] = [
    {
      key: 'account',
      icon: <UserOutlined />,
      label: 'Configurações da Conta',
      onClick: () => setProfileOpen(true),
    },
    {
      key: 'theme',
      icon: isDark ? <SunOutlined /> : <MoonOutlined />,
      label: isDark ? 'Tema Claro Padrão' : 'Tema Sala de Controle (Escuro)',
      onClick: toggleTheme,
    },
    {
      key: 'support',
      icon: <CustomerServiceOutlined />,
      label: 'Ajuda & Suporte PoloSanca',
      onClick: () => setSupportOpen(true),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      danger: true,
      label: 'Sair da Sessão',
      onClick: () => {
        void handleLogout();
      },
    },
  ];

  const roleLabel = user ? ROLE_LABELS[user.role] || user.role : '';
  const identity = resolveUserHeaderIdentity(user, roleLabel);

  const nonOperationTitle =
    Object.entries(ROUTE_TITLES).find(([prefix]) => location.pathname.startsWith(prefix))?.[1] ||
    'Monitoramento';

  const brandBlock = (compact: boolean) => (
    <div
      style={{
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: compact ? 'center' : 'flex-start',
        padding: compact ? '0 8px' : '0 18px',
        cursor: 'pointer',
        flexShrink: 0,
      }}
      onClick={() => {
        setMobileNavOpen(false);
        void navigate('/operacao');
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: '#2563eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize: 13,
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
        }}
      >
        PS
      </div>
      {!compact && (
        <div style={{ marginLeft: 11, overflow: 'hidden' }}>
          <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>
            Polo Sanca
          </div>
          <div style={{ color: '#64748b', fontSize: 11, lineHeight: 1.2 }}>
            Refrigeração Industrial
          </div>
        </div>
      )}
    </div>
  );

  const handleSidebarClick = (key: string, closeMobile: boolean) => {
    if (key === '__support__') {
      if (closeMobile) setMobileNavOpen(false);
      setSupportOpen(true);
      return;
    }
    if (closeMobile) setMobileNavOpen(false);
    void navigate(key);
  };

  const renderNavColumn = (compact: boolean, closeMobile = false) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {brandBlock(compact)}
      <div style={{ flex: 1, marginTop: 4 }}>
        <Menu
          theme="dark"
          mode="inline"
          className="ps-sidebar-menu"
          selectedKeys={[selectedKey]}
          items={primaryMenuItems}
          onClick={({ key }) => handleSidebarClick(key, closeMobile)}
        />
      </div>
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          paddingTop: 4,
          paddingBottom: 6,
        }}
      >
        <Menu
          theme="dark"
          mode="inline"
          className="ps-sidebar-menu"
          selectedKeys={[selectedKey]}
          items={bottomMenuItems}
          onClick={({ key }) => handleSidebarClick(key, closeMobile)}
        />
      </div>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={220}
          collapsedWidth={64}
          style={{
            background: '#0b1120',
            borderRight: isDark ? '1px solid #26334d' : 'none',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflow: 'hidden',
          }}
        >
          {renderNavColumn(collapsed, false)}
        </Sider>
      )}

      <Drawer
        open={isMobile && mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        placement="left"
        width={248}
        closable={false}
        styles={{
          body: { padding: 0, background: '#0b1120', height: '100%' },
        }}
      >
        {renderNavColumn(false, true)}
      </Drawer>

      <Layout>
        {/* Barra Superior de Linha Única: [Trilha de Escopo] ── [Status Pill | ⌘K | Perfil] */}
        <AppTopHeader
          isMobile={isMobile}
          isOperationsRoute={isOperationsRoute}
          nonOperationTitle={nonOperationTitle}
          user={user}
          identity={identity}
          profileMenuItems={profileMenuItems}
          profileMenuOpen={profileMenuOpen}
          setProfileMenuOpen={setProfileMenuOpen}
          setMobileNavOpen={setMobileNavOpen}
          setQuickJumpOpen={setQuickJumpOpen}
          setTopBarLeftNode={setTopBarLeftNode}
          setTopBarRightNode={setTopBarRightNode}
        />

        <Content
          style={{
            padding: isMobile ? '16px 12px 24px' : '24px 28px 32px',
            background: 'var(--ps-bg)',
            flex: 1,
          }}
        >
          <Outlet />
        </Content>
      </Layout>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <SupportContactModal open={supportOpen} onClose={() => setSupportOpen(false)} />
      <QuickJumpModal
        open={quickJumpOpen}
        onClose={() => setQuickJumpOpen(false)}
        isGlobalAdmin={isGlobalAdmin}
      />
    </Layout>
  );
}
