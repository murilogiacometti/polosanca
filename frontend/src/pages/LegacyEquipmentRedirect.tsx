import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Spin } from 'antd';
import { getEquipment } from '../api';

/**
 * Redirecionador limpo para links/favoritos legados (/equipments/:id) ->
 * /operacao/empresas/:companyId/filiais/:branchId/equipamentos/:equipmentId
 */
export default function LegacyEquipmentRedirect() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    if (!id) return undefined;

    void (async () => {
      try {
        const eq = await getEquipment(id);
        if (!active) return;
        if (eq?.company_id && eq?.branch_id) {
          void navigate(
            `/operacao/empresas/${eq.company_id}/filiais/${eq.branch_id}/equipamentos/${eq.id}`,
            { replace: true }
          );
        } else {
          void navigate('/operacao', { replace: true });
        }
      } catch {
        if (active) {
          void navigate('/operacao', { replace: true });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [id, navigate]);

  if (!id) {
    return <Navigate to="/operacao" replace />;
  }

  return (
    <div style={{ textAlign: 'center', padding: 64 }}>
      <Spin size="large" />
    </div>
  );
}
