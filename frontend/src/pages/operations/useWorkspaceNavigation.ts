import { useCallback } from 'react';
import type { NavigateFunction, SetURLSearchParams } from 'react-router-dom';
import type { EquipmentStatus, EquipmentWithLive } from '../../types/models';

interface UseWorkspaceNavigationParams {
  isGlobalAdmin: boolean;
  userCompanyId?: string | null;
  companyId?: string;
  equipmentId?: string;
  effectiveBranchId: string | null;
  isSingleBranchCompany: boolean;
  branchEquipments: EquipmentWithLive[];
  mergedEquipments: EquipmentWithLive[];
  navigate: NavigateFunction;
  setSearchParams: SetURLSearchParams;
  reloadWorkspace: () => Promise<void>;
}

export function useWorkspaceNavigation({
  isGlobalAdmin,
  userCompanyId,
  companyId,
  equipmentId,
  effectiveBranchId,
  isSingleBranchCompany,
  branchEquipments,
  mergedEquipments,
  navigate,
  setSearchParams,
  reloadWorkspace,
}: UseWorkspaceNavigationParams) {
  const handleZoomRoot = useCallback(() => {
    if (isGlobalAdmin) {
      void navigate('/operacao');
    } else if (userCompanyId) {
      void navigate(`/operacao/empresas/${userCompanyId}`);
    }
  }, [isGlobalAdmin, userCompanyId, navigate]);

  const handleSelectCompany = useCallback(
    (nextCompanyId?: string | null) => {
      if (!nextCompanyId) {
        handleZoomRoot();
        return;
      }
      void navigate(`/operacao/empresas/${nextCompanyId}`);
    },
    [navigate, handleZoomRoot]
  );

  const handleSelectBranch = useCallback(
    (nextBranchId?: string | null, statusQuery: EquipmentStatus | undefined = undefined) => {
      if (!companyId) return;
      if (!nextBranchId) {
        void navigate(`/operacao/empresas/${companyId}`);
        return;
      }
      const suffix = statusQuery ? `?status=${encodeURIComponent(statusQuery)}` : '';
      void navigate(`/operacao/empresas/${companyId}/filiais/${nextBranchId}${suffix}`);
    },
    [companyId, navigate]
  );

  const handleSelectEquipment = useCallback(
    (nextEquipmentId?: string | null) => {
      if (!companyId || !effectiveBranchId) return;
      if (!nextEquipmentId) {
        const backPath = isSingleBranchCompany
          ? `/operacao/empresas/${companyId}`
          : `/operacao/empresas/${companyId}/filiais/${effectiveBranchId}`;
        void navigate(backPath);
        return;
      }
      void navigate(
        `/operacao/empresas/${companyId}/filiais/${effectiveBranchId}/equipamentos/${nextEquipmentId}`
      );
    },
    [companyId, effectiveBranchId, isSingleBranchCompany, navigate]
  );

  const handleDirectJumpEquipment = useCallback(
    (
      targetCompanyId?: string | null,
      targetBranchId?: string | null,
      targetEquipmentId?: string | null,
      statusFilter: EquipmentStatus | undefined = undefined
    ) => {
      const cid = targetCompanyId || companyId || userCompanyId;
      if (!cid) return;
      if (targetBranchId && targetEquipmentId) {
        void navigate(
          `/operacao/empresas/${cid}/filiais/${targetBranchId}/equipamentos/${targetEquipmentId}`
        );
        return;
      }
      if (targetBranchId) {
        const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
        void navigate(`/operacao/empresas/${cid}/filiais/${targetBranchId}${qs}`);
        return;
      }
      const found = targetEquipmentId
        ? mergedEquipments.find((e) => e.id === targetEquipmentId)
        : undefined;
      if (found) {
        void navigate(
          `/operacao/empresas/${found.company_id}/filiais/${found.branch_id}/equipamentos/${found.id}`
        );
        return;
      }
      void navigate(`/operacao/empresas/${cid}`);
    },
    [companyId, userCompanyId, mergedEquipments, navigate]
  );

  const handleStepEquipmentSibling = useCallback(
    (delta: number) => {
      if (!equipmentId || !effectiveBranchId || branchEquipments.length <= 1) return;
      const idx = branchEquipments.findIndex((e) => e.id === equipmentId);
      if (idx === -1) return;
      const nextEq =
        branchEquipments[(idx + delta + branchEquipments.length) % branchEquipments.length];
      if (!nextEq) return;
      void navigate(
        `/operacao/empresas/${companyId}/filiais/${effectiveBranchId}/equipamentos/${nextEq.id}`
      );
    },
    [equipmentId, effectiveBranchId, branchEquipments, companyId, navigate]
  );

  const handleEquipmentDeactivated = useCallback(() => {
    void reloadWorkspace();
    const targetPath = isSingleBranchCompany
      ? `/operacao/empresas/${companyId}`
      : `/operacao/empresas/${companyId}/filiais/${effectiveBranchId}`;
    void navigate(targetPath, { replace: true });
  }, [reloadWorkspace, isSingleBranchCompany, companyId, effectiveBranchId, navigate]);

  const setCompanyConfigTab = useCallback(
    (nextTab?: string | null) => {
      if (!nextTab || nextTab === 'operations') {
        setSearchParams({}, { replace: true });
      } else {
        setSearchParams({ tab: nextTab }, { replace: true });
      }
    },
    [setSearchParams]
  );

  return {
    handleZoomRoot,
    handleSelectCompany,
    handleSelectBranch,
    handleSelectEquipment,
    handleDirectJumpEquipment,
    handleStepEquipmentSibling,
    handleEquipmentDeactivated,
    setCompanyConfigTab,
  };
}
