import { useSearchParams } from 'react-router-dom';
import { AlertOutlined, ControlOutlined } from '@ant-design/icons';
import { Segmented } from 'antd';
import { useAuth } from '../context/authContextObject';
import AlertRulesPage from './AlertRulesPage';
import AlertsPage from './AlertsPage';

type AlertsHubTab = 'incidents' | 'rules';

/**
 * Hub Unificado por Tarefa — ALERTAS (/alerts):
 * Agrupa o tratamento de incidentes ("Ocorrências") e a calibração de limites ("Regras e Limites")
 * em um único nó de topo. Para Visualizadores, exibe diretamente Ocorrências sem abas extras.
 */
export default function AlertsHubPage() {
  const { canWriteOperations } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get('tab');
  const activeTab: AlertsHubTab = canWriteOperations && rawTab === 'rules' ? 'rules' : 'incidents';
  const inspectEquipmentId = searchParams.get('equipment') || undefined;

  if (!canWriteOperations) {
    return <AlertsPage />;
  }

  const tabSwitcher = (
    <Segmented<AlertsHubTab>
      className="ps-pill-switcher"
      value={activeTab}
      onChange={(nextTab) => {
        if (nextTab === 'incidents') {
          setSearchParams({}, { replace: true });
        } else {
          setSearchParams({ tab: 'rules' }, { replace: true });
        }
      }}
      options={[
        {
          value: 'incidents',
          icon: <AlertOutlined />,
          label: 'Ocorrências',
        },
        {
          value: 'rules',
          icon: <ControlOutlined />,
          label: 'Regras e Limites',
        },
      ]}
    />
  );

  return (
    <div key={activeTab} className="ps-view-enter">
      {activeTab === 'rules' ? (
        <AlertRulesPage
          headerNav={tabSwitcher}
          initialInspectEquipmentId={inspectEquipmentId}
        />
      ) : (
        <AlertsPage
          headerNav={tabSwitcher}
          onJumpToRules={(eqId) => {
            const next: Record<string, string> = { tab: 'rules' };
            if (eqId) next.equipment = eqId;
            setSearchParams(next);
          }}
        />
      )}
    </div>
  );
}
