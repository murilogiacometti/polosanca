import { type ReactNode, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Space } from 'antd';
import LivePulseBadge from '../components/Common/LivePulseBadge';
import WorkspaceSkeleton from '../components/Common/WorkspaceSkeleton';
import CompanyConfigDrawer from '../components/Operations/CompanyConfigDrawer';
import ContextScopeBar from '../components/Operations/ContextScopeBar';
import ScopedAlertsDrawer from '../components/Operations/ScopedAlertsDrawer';
import { useAuth } from '../context/authContextObject';
import { useUiShell } from '../context/uiShellContextObject';
import { invalidateOperationalQueries } from '../query/queryClient';
import type { AlertItem, Branch } from '../types/models';
import type { ScopedAlertsOverride } from './operations/Level0GlobalView';
import OperationsLevelContent from './operations/OperationsLevelContent';
import { useOperationsWorkspaceData } from './operations/useOperationsWorkspaceData';
import { useWorkspaceNavigation } from './operations/useWorkspaceNavigation';
import { useWorkspaceShortcuts } from './operations/useWorkspaceShortcuts';
import { resolveWorkspaceMeta } from './operations/resolveWorkspaceMeta';

const CONFIG_TABS = new Set(['settings', 'users', 'rules']);

function resolveWorkspaceSessionContext(params: {
  userRole?: string | null;
  branchAccessType?: string | null;
  userCompanyId?: string | null;
  isGlobalAdmin: boolean;
  canWriteOperations: boolean;
  companyId?: string;
  tabParam: string | null;
}) {
  const {
    userRole,
    branchAccessType,
    userCompanyId,
    isGlobalAdmin,
    canWriteOperations,
    companyId,
    tabParam,
  } = params;
  const isRestrictedViewer = userRole === 'company_viewer' && branchAccessType === 'restricted';
  const activeCompanyId = isGlobalAdmin ? companyId || null : userCompanyId || companyId || null;
  const currentTab = tabParam || 'operations';
  const isCompanyConfigOpen =
    Boolean(companyId) && canWriteOperations && CONFIG_TABS.has(currentTab);

  return { isRestrictedViewer, activeCompanyId, currentTab, isCompanyConfigOpen };
}

function resolveEffectiveDrawerScope(params: {
  override: ScopedAlertsOverride | null;
  companyId?: string;
  branchId?: string;
  equipmentId?: string;
  title: string;
}): ScopedAlertsOverride {
  const { override, companyId, branchId, equipmentId, title } = params;
  return (
    override || {
      companyId: companyId || null,
      branchId: branchId || null,
      equipmentId: equipmentId || null,
      title,
    }
  );
}

function resolveRoleAdaptiveGuard(params: {
  isGlobalAdmin: boolean;
  isRestrictedViewer: boolean;
  companyId?: string;
  userCompanyId?: string | null;
  loading: boolean;
  branches: Branch[];
}): ReactNode | null {
  const { isGlobalAdmin, isRestrictedViewer, companyId, userCompanyId, loading, branches } = params;
  if (isGlobalAdmin) return null;

  if (companyId && userCompanyId && companyId !== userCompanyId) {
    return <Navigate to="/operacao" replace />;
  }

  if (!companyId && userCompanyId) {
    if (isRestrictedViewer) {
      if (loading) return <WorkspaceSkeleton variant="grid" />;
      const soleBranch = branches.length === 1 ? branches[0] : undefined;
      if (soleBranch) {
        return (
          <Navigate
            to={`/operacao/empresas/${userCompanyId}/filiais/${soleBranch.id}`}
            replace
          />
        );
      }
    }
    return <Navigate to={`/operacao/empresas/${userCompanyId}`} replace />;
  }

  return null;
}

/**
 * Orquestrador Unificado de Zoom Semântico em 4 Níveis (/operacao):
 * - Nível 0: /operacao (Todas as Empresas — global_admin)
 * - Nível 1: /operacao/empresas/:companyId (Empresa — company_admin / multi-filial)
 * - Nível 2: /operacao/empresas/:companyId/filiais/:branchId (Filial — viewer restrito a 1 filial)
 * - Nível 3: /operacao/empresas/:companyId/filiais/:branchId/equipamentos/:equipmentId (Unidade)
 *
 * Inclui Polling Resiliente (Page Visibility API + banner instável), Triagem por Teclado (Esc + J/K),
 * Gaveta Contextual de Alertas e Exportação CSV herdando automaticamente o escopo atual.
 */
export default function OperationsWorkspacePage() {
  const { companyId, branchId, equipmentId } = useParams<{
    companyId?: string;
    branchId?: string;
    equipmentId?: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isGlobalAdmin, canWriteOperations } = useAuth();
  const { areShortcutsSuspended } = useUiShell();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerOverrideScope, setDrawerOverrideScope] = useState<ScopedAlertsOverride | null>(null);

  const { isRestrictedViewer, activeCompanyId, currentTab, isCompanyConfigOpen } =
    resolveWorkspaceSessionContext({
      userRole: user?.role,
      branchAccessType: user?.branch_access_type,
      userCompanyId: user?.company_id,
      isGlobalAdmin,
      canWriteOperations,
      companyId,
      tabParam: searchParams.get('tab'),
    });

  const data = useOperationsWorkspaceData({
    isGlobalAdmin,
    isRestrictedViewer,
    companyId,
    branchId,
    equipmentId,
    activeCompanyId,
  });

  const nav = useWorkspaceNavigation({
    isGlobalAdmin,
    userCompanyId: user?.company_id,
    companyId,
    equipmentId,
    effectiveBranchId: data.effectiveBranchId,
    isSingleBranchCompany: data.isSingleBranchCompany,
    branchEquipments: data.branchEquipments,
    mergedEquipments: data.mergedEquipments,
    navigate,
    setSearchParams,
    reloadWorkspace: data.reloadWorkspace,
  });

  useWorkspaceShortcuts({
    suspended: areShortcutsSuspended || drawerOpen || isCompanyConfigOpen,
    equipmentId,
    branchId,
    companyId,
    isSingleBranchCompany: data.isSingleBranchCompany,
    isGlobalAdmin,
    isRestrictedViewer,
    branchCount: data.branches.length,
    branchEquipments: data.branchEquipments,
    companyBranches: data.companyBranches,
    onStepEquipmentSibling: nav.handleStepEquipmentSibling,
    navigate,
  });

  const roleGuardNode = resolveRoleAdaptiveGuard({
    isGlobalAdmin,
    isRestrictedViewer,
    companyId,
    userCompanyId: user?.company_id,
    loading: data.loading,
    branches: data.branches,
  });
  if (roleGuardNode) return roleGuardNode;

  const viewMeta = resolveWorkspaceMeta({
    isGlobalAdmin,
    isRestrictedViewer,
    isSingleBranchCompany: data.isSingleBranchCompany,
    branchesLength: data.branches.length,
    scopedCompanyDetail: data.scopedCompanyDetail,
    currentCompany: data.currentCompany,
    effectiveBranch: data.effectiveBranch,
    companyId,
    branchId,
    equipmentId,
    currentEquipment: data.currentEquipment,
    branchEquipments: data.branchEquipments,
    statusParam: searchParams.get('status'),
  });

  const effectiveDrawerScope = resolveEffectiveDrawerScope({
    override: drawerOverrideScope,
    companyId,
    branchId,
    equipmentId,
    title: viewMeta.scopeTitle,
  });

  const handleManualRefresh = () => {
    void data.workspaceQuery.refetch();
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <ContextScopeBar
        isGlobalAdmin={isGlobalAdmin}
        isRestrictedViewer={isRestrictedViewer}
        hideBranchTier={data.isSingleBranchCompany}
        permittedBranchCount={viewMeta.permittedBranchCount}
        totalCompanyBranchCount={viewMeta.totalCompanyBranchCount}
        companies={data.companies}
        currentCompany={data.currentCompany}
        branches={data.companyBranches}
        currentBranch={data.effectiveBranch}
        equipments={data.branchEquipments}
        currentEquipment={data.currentEquipment}
        rightSlotNode={
          <LivePulseBadge
            compact
            hasError={data.hasSingleError}
            isUnstable={data.isUnstable}
            lastSyncedAt={data.workspaceQuery.dataUpdatedAt || null}
            onlineCount={data.scopedConnectivity.onlineCount}
            offlineCount={data.scopedConnectivity.offlineCount}
            lastSignalIso={data.scopedConnectivity.lastSignalIso}
            onRefresh={handleManualRefresh}
            isRefreshing={data.isRefreshing}
          />
        }
        isRefreshing={data.isRefreshing}
        isUnstable={data.isUnstable}
        onZoomRoot={nav.handleZoomRoot}
        onSelectCompany={nav.handleSelectCompany}
        onSelectBranch={nav.handleSelectBranch}
        onSelectEquipment={nav.handleSelectEquipment}
        onManualRefresh={handleManualRefresh}
      />

      <OperationsLevelContent
        loading={data.loading}
        companies={data.companies}
        equipmentsCount={data.equipments.length}
        companyId={companyId}
        branchId={branchId}
        equipmentId={equipmentId}
        effectiveBranchId={data.effectiveBranchId}
        currentCompany={data.currentCompany}
        effectiveBranch={data.effectiveBranch}
        companyBranches={data.companyBranches}
        mergedEquipments={data.mergedEquipments}
        branchEquipments={data.branchEquipments}
        realtimeById={data.realtimeById}
        branchInitialStatus={viewMeta.branchInitialStatus}
        currentSiblingIdx={viewMeta.currentSiblingIdx}
        isSingleBranchCompany={data.isSingleBranchCompany}
        isGlobalAdmin={isGlobalAdmin}
        canWriteOperations={canWriteOperations}
        canGoUpFromBranch={viewMeta.canGoUpFromBranch}
        branchBackLabel={viewMeta.branchBackLabel}
        equipmentBackLabel={viewMeta.equipmentBackLabel}
        onZoomRoot={nav.handleZoomRoot}
        onSelectCompany={nav.handleSelectCompany}
        onSelectBranch={nav.handleSelectBranch}
        onSelectEquipment={nav.handleSelectEquipment}
        onBackFromBranch={
          data.isSingleBranchCompany ? nav.handleZoomRoot : () => nav.handleSelectBranch(null)
        }
        onStepEquipmentSibling={nav.handleStepEquipmentSibling}
        onEquipmentDeactivated={nav.handleEquipmentDeactivated}
        onDirectJumpEquipment={nav.handleDirectJumpEquipment}
        onOpenCompanyConfig={() => nav.setCompanyConfigTab('settings')}
        onOpenScopedAlerts={(override) => {
          setDrawerOverrideScope(override);
          setDrawerOpen(true);
        }}
        onReloadWorkspace={data.reloadWorkspace}
        onInvalidateOperationalQueries={() => {
          void invalidateOperationalQueries();
        }}
      />

      <CompanyConfigDrawer
        open={isCompanyConfigOpen}
        onClose={() => nav.setCompanyConfigTab('operations')}
        company={data.currentCompany}
        branches={data.companyBranches}
        isGlobalAdmin={isGlobalAdmin}
        activeSection={currentTab}
        onSectionChange={nav.setCompanyConfigTab}
        onMutated={() => {
          void data.reloadWorkspace();
        }}
      />

      <ScopedAlertsDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerOverrideScope(null);
        }}
        scopeTitle={effectiveDrawerScope.title}
        companyId={effectiveDrawerScope.companyId}
        branchId={effectiveDrawerScope.branchId}
        equipmentId={effectiveDrawerScope.equipmentId}
        realtimeById={data.realtimeById}
        canWriteOperations={canWriteOperations}
        onJumpToEquipment={(al: AlertItem) =>
          nav.handleDirectJumpEquipment(al.company_id, al.branch_id, al.equipment_id)
        }
        onAlertMutated={() => {
          void invalidateOperationalQueries();
        }}
      />
    </Space>
  );
}
