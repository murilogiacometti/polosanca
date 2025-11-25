import type {
  Branch,
  Company,
  EquipmentStatus,
  EquipmentWithLive,
} from '../../types/models';

function parseEquipmentStatusParam(raw: string | null): EquipmentStatus | undefined {
  if (raw === 'operational' || raw === 'warning' || raw === 'critical' || raw === 'offline') {
    return raw;
  }
  return undefined;
}

function resolveScopeTitle(params: {
  equipmentId?: string;
  currentEquipment: EquipmentWithLive | null;
  branchId?: string;
  isSingleBranchCompany: boolean;
  effectiveBranch: Branch | null;
  companyId?: string;
  currentCompany: Company | null;
}): string {
  const {
    equipmentId,
    currentEquipment,
    branchId,
    isSingleBranchCompany,
    effectiveBranch,
    companyId,
    currentCompany,
  } = params;

  if (equipmentId) return `Equipamento: ${currentEquipment?.serial || equipmentId}`;
  if (branchId && !isSingleBranchCompany) return `Filial: ${effectiveBranch?.name || branchId}`;
  if (companyId) return `Empresa: ${currentCompany?.name || companyId}`;
  return 'Todas as Empresas (Frota Global)';
}

export function resolveWorkspaceMeta(params: {
  isGlobalAdmin: boolean;
  isRestrictedViewer: boolean;
  isSingleBranchCompany: boolean;
  branchesLength: number;
  scopedCompanyDetail: Company | null;
  currentCompany: Company | null;
  effectiveBranch: Branch | null;
  companyId?: string;
  branchId?: string;
  equipmentId?: string;
  currentEquipment: EquipmentWithLive | null;
  branchEquipments: EquipmentWithLive[];
  statusParam: string | null;
}) {
  const {
    isGlobalAdmin,
    isRestrictedViewer,
    isSingleBranchCompany,
    branchesLength,
    scopedCompanyDetail,
    currentCompany,
    effectiveBranch,
    companyId,
    branchId,
    equipmentId,
    currentEquipment,
    branchEquipments,
    statusParam,
  } = params;

  return {
    canGoUpFromBranch: isSingleBranchCompany
      ? isGlobalAdmin
      : !(isRestrictedViewer && branchesLength <= 1),
    branchBackLabel: isSingleBranchCompany
      ? 'Voltar para Empresas'
      : `Voltar para ${currentCompany?.name || 'Empresa'}`,
    equipmentBackLabel: isSingleBranchCompany
      ? `Voltar para ${currentCompany?.name || 'Unidade'}`
      : `Voltar para ${effectiveBranch?.name || 'Filial'}`,
    permittedBranchCount: isRestrictedViewer ? branchesLength : null,
    totalCompanyBranchCount: isRestrictedViewer
      ? scopedCompanyDetail?.branches_count || null
      : null,
    currentSiblingIdx: equipmentId
      ? branchEquipments.findIndex((e) => e.id === equipmentId)
      : -1,
    scopeTitle: resolveScopeTitle({
      equipmentId,
      currentEquipment,
      branchId,
      isSingleBranchCompany,
      effectiveBranch,
      companyId,
      currentCompany,
    }),
    branchInitialStatus: parseEquipmentStatusParam(statusParam),
  };
}
