import WorkspaceSkeleton from '../../components/Common/WorkspaceSkeleton';
import type {
  Branch,
  Company,
  EquipmentStatus,
  EquipmentWithLive,
  RealtimeSnapshot,
} from '../../types/models';
import Level0GlobalView, { type ScopedAlertsOverride } from './Level0GlobalView';
import Level1CompanyView from './Level1CompanyView';
import Level2BranchView from './Level2BranchView';
import Level3EquipmentView from './Level3EquipmentView';

interface OperationsLevelContentProps {
  loading: boolean;
  companies: Company[];
  equipmentsCount: number;
  companyId?: string;
  branchId?: string;
  equipmentId?: string;
  effectiveBranchId: string | null;
  currentCompany: Company | null;
  effectiveBranch: Branch | null;
  companyBranches: Branch[];
  mergedEquipments: EquipmentWithLive[];
  branchEquipments: EquipmentWithLive[];
  realtimeById: Record<string, RealtimeSnapshot>;
  branchInitialStatus?: EquipmentStatus;
  currentSiblingIdx: number;
  isSingleBranchCompany: boolean;
  isGlobalAdmin: boolean;
  canWriteOperations: boolean;
  canGoUpFromBranch: boolean;
  branchBackLabel: string;
  equipmentBackLabel: string;
  onZoomRoot: () => void;
  onSelectCompany: (companyId?: string | null) => void;
  onSelectBranch: (branchId?: string | null, status?: EquipmentStatus) => void;
  onSelectEquipment: (equipmentId?: string | null) => void;
  onBackFromBranch: () => void;
  onStepEquipmentSibling: (delta: number) => void;
  onEquipmentDeactivated: () => void;
  onDirectJumpEquipment: (
    companyId?: string | null,
    branchId?: string | null,
    equipmentId?: string | null,
    statusFilter?: EquipmentStatus
  ) => void;
  onOpenCompanyConfig: () => void;
  onOpenScopedAlerts: (override: ScopedAlertsOverride) => void;
  onReloadWorkspace: () => Promise<void>;
  onInvalidateOperationalQueries: () => void;
}

export default function OperationsLevelContent(props: OperationsLevelContentProps) {
  const {
    loading,
    companies,
    equipmentsCount,
    companyId,
    branchId,
    equipmentId,
    effectiveBranchId,
    currentCompany,
    effectiveBranch,
    companyBranches,
    mergedEquipments,
    branchEquipments,
    realtimeById,
    branchInitialStatus,
    currentSiblingIdx,
    isSingleBranchCompany,
    isGlobalAdmin,
    canWriteOperations,
    canGoUpFromBranch,
    branchBackLabel,
    equipmentBackLabel,
    onZoomRoot,
    onSelectCompany,
    onSelectBranch,
    onSelectEquipment,
    onBackFromBranch,
    onStepEquipmentSibling,
    onEquipmentDeactivated,
    onDirectJumpEquipment,
    onOpenCompanyConfig,
    onOpenScopedAlerts,
    onReloadWorkspace,
    onInvalidateOperationalQueries,
  } = props;

  if (loading && companies.length === 0 && equipmentsCount === 0) {
    return <WorkspaceSkeleton variant={equipmentId ? 'detail' : 'grid'} />;
  }

  let levelView;
  if (equipmentId) {
    levelView = (
      <Level3EquipmentView
        key={equipmentId}
        equipmentId={equipmentId}
        liveSnapshot={realtimeById[equipmentId] || null}
        branches={companyBranches}
        siblingIndex={currentSiblingIdx}
        siblingCount={branchEquipments.length}
        isGlobalAdmin={isGlobalAdmin}
        canWriteOperations={canWriteOperations}
        backLabel={equipmentBackLabel}
        onBack={() => onSelectEquipment(null)}
        onStepSibling={onStepEquipmentSibling}
        onEquipmentDeactivated={onEquipmentDeactivated}
        onMutated={onInvalidateOperationalQueries}
      />
    );
  } else if (branchId || isSingleBranchCompany) {
    levelView = (
      <Level2BranchView
        key={`${effectiveBranchId}-${branchInitialStatus || 'all'}`}
        company={currentCompany}
        branch={effectiveBranch}
        branches={companyBranches}
        companies={companies}
        equipments={branchEquipments}
        initialStatusFilter={branchInitialStatus}
        isSingleBranchCompany={isSingleBranchCompany}
        isGlobalAdmin={isGlobalAdmin}
        canWriteOperations={canWriteOperations}
        backLabel={canGoUpFromBranch ? branchBackLabel : null}
        onBack={canGoUpFromBranch ? onBackFromBranch : null}
        onZoomEquipment={(eqId) => onSelectEquipment(eqId)}
        onOpenCompanyConfig={onOpenCompanyConfig}
        onMutated={() => {
          void onReloadWorkspace();
        }}
      />
    );
  } else if (companyId) {
    levelView = (
      <Level1CompanyView
        company={currentCompany}
        branches={companyBranches}
        equipments={mergedEquipments.filter((e) => e.company_id === companyId)}
        isGlobalAdmin={isGlobalAdmin}
        canWriteOperations={canWriteOperations}
        onZoomRoot={onZoomRoot}
        onOpenCompanyConfig={onOpenCompanyConfig}
        onZoomBranch={(bid, statusKey) => onSelectBranch(bid, statusKey)}
        onDirectJumpEquipment={onDirectJumpEquipment}
        onMutated={() => {
          void onReloadWorkspace();
        }}
      />
    );
  } else {
    levelView = (
      <Level0GlobalView
        companies={companies}
        equipments={mergedEquipments}
        onZoomCompany={(cid) => onSelectCompany(cid)}
        onDirectJumpEquipment={onDirectJumpEquipment}
        onOpenScopedAlerts={onOpenScopedAlerts}
        onMutated={() => {
          void onReloadWorkspace();
        }}
      />
    );
  }

  return (
    <div
      key={`${companyId || 'root'}-${effectiveBranchId || ''}-${equipmentId || ''}`}
      className="ps-view-enter"
    >
      {levelView}
    </div>
  );
}
