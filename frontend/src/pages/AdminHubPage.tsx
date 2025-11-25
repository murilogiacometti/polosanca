import { useSearchParams } from 'react-router-dom';
import { AuditOutlined, TeamOutlined } from '@ant-design/icons';
import { Segmented } from 'antd';
import { useAuth } from '../context/authContextObject';
import AuditLogsPage from './AuditLogsPage';
import UsersPage from './UsersPage';

type AdminHubTab = 'users' | 'audit';

/**
 * Hub Unificado por Tarefa — ADMINISTRAÇÃO (/admin):
 * Consolida Governança de Acessos ("Usuários e Permissões") e Conformidade ("Trilha de Auditoria")
 * em um único destino discreto para Administradores.
 */
export default function AdminHubPage() {
  const { isGlobalAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get('tab');
  const activeTab: AdminHubTab = isGlobalAdmin && rawTab === 'audit' ? 'audit' : 'users';

  if (!isGlobalAdmin) {
    return <UsersPage />;
  }

  const tabSwitcher = (
    <Segmented<AdminHubTab>
      className="ps-pill-switcher"
      value={activeTab}
      onChange={(nextTab) => {
        if (nextTab === 'users') {
          setSearchParams({}, { replace: true });
        } else {
          setSearchParams({ tab: 'audit' }, { replace: true });
        }
      }}
      options={[
        {
          value: 'users',
          icon: <TeamOutlined />,
          label: 'Usuários e Permissões',
        },
        {
          value: 'audit',
          icon: <AuditOutlined />,
          label: 'Trilha de Auditoria',
        },
      ]}
    />
  );

  return (
    <div key={activeTab} className="ps-view-enter">
      {activeTab === 'audit' ? (
        <AuditLogsPage headerNav={tabSwitcher} />
      ) : (
        <UsersPage headerNav={tabSwitcher} />
      )}
    </div>
  );
}
