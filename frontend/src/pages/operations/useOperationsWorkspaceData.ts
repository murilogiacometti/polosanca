import { useCallback, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  getBranches,
  getCompanies,
  getCompany,
  getEquipments,
  getRealtimeTelemetry,
  getTelemetryOverview,
} from '../../api';
import { invalidateOperationalQueries, queryKeys } from '../../query/queryClient';
import type {
  Branch,
  Company,
  Equipment,
  EquipmentOverviewItem,
  EquipmentStatus,
  EquipmentWithLive,
  RealtimeSnapshot,
} from '../../types/models';

interface WorkspaceSnapshot {
  companies: Company[];
  scopedCompanyDetail: Company | null;
  branches: Branch[];
  equipments: Equipment[];
  realtimeById: Record<string, RealtimeSnapshot>;
  overviewById: Record<string, EquipmentOverviewItem>;
}

interface ScopedConnectivity {
  onlineCount: number;
  offlineCount: number;
  lastSignalIso: string | null;
}

const EMPTY_COMPANIES: Company[] = [];
const EMPTY_BRANCHES: Branch[] = [];
const EMPTY_EQUIPMENTS: Equipment[] = [];
const EMPTY_REALTIME: Record<string, RealtimeSnapshot> = {};
const EMPTY_OVERVIEW: Record<string, EquipmentOverviewItem> = {};

function buildRealtimeMap(items: RealtimeSnapshot[] | undefined): Record<string, RealtimeSnapshot> {
  const rtMap: Record<string, RealtimeSnapshot> = {};
  (items || []).forEach((snap) => {
    rtMap[snap.equipment_id] = snap;
  });
  return rtMap;
}

function resolveWorkspaceCompanies(
  isGlobalAdmin: boolean,
  companyId: string | null,
  companiesList: Company[] | null,
  singleCompany: Company | null
): { companies: Company[]; scopedCompanyDetail: Company | null } {
  if (isGlobalAdmin && companiesList) {
    return {
      companies: companiesList,
      scopedCompanyDetail: companyId
        ? companiesList.find((c) => c.id === companyId) || null
        : null,
    };
  }
  if (!isGlobalAdmin && singleCompany) {
    return {
      companies: [singleCompany],
      scopedCompanyDetail: singleCompany,
    };
  }
  return { companies: [], scopedCompanyDetail: null };
}

async function fetchWorkspaceSnapshot(params: {
  isGlobalAdmin: boolean;
  companyId: string | null;
  activeCompanyId: string | null;
}): Promise<WorkspaceSnapshot> {
  const { isGlobalAdmin, companyId, activeCompanyId } = params;
  const scopedFilter = isGlobalAdmin && companyId ? { company_id: companyId } : {};

  const [eqRes, brRes, rtRes, ovRes, companiesRes, singleCompanyRes] = await Promise.all([
    getEquipments({ limit: 100, ...scopedFilter }),
    getBranches({ limit: 100, ...scopedFilter }),
    getRealtimeTelemetry(scopedFilter),
    getTelemetryOverview(scopedFilter),
    isGlobalAdmin ? getCompanies({ limit: 100 }) : Promise.resolve(null),
    !isGlobalAdmin && activeCompanyId ? getCompany(activeCompanyId) : Promise.resolve(null),
  ]);

  const { companies, scopedCompanyDetail } = resolveWorkspaceCompanies(
    isGlobalAdmin,
    companyId,
    companiesRes ? companiesRes.companies || [] : null,
    singleCompanyRes
  );

  return {
    companies,
    scopedCompanyDetail,
    branches: brRes?.branches || [],
    equipments: eqRes?.equipment || [],
    realtimeById: buildRealtimeMap(rtRes?.equipment),
    overviewById: ovRes?.overview || {},
  };
}

function resolveLiveTelemetryFields(
  eq: Equipment,
  snap: RealtimeSnapshot | undefined
): Pick<
  EquipmentWithLive,
  | 'liveTemperature'
  | 'livePressure'
  | 'liveDoor'
  | 'liveHeater'
  | 'liveCompressor'
  | 'liveFan'
  | 'liveLastUpdate'
> {
  const cd = eq.current_data || {};
  const source = snap !== undefined ? snap : cd;
  return {
    liveTemperature: source.temperature,
    livePressure: source.pressure,
    liveDoor: source.door,
    liveHeater: source.heater,
    liveCompressor: source.compressor,
    liveFan: source.fan,
    liveLastUpdate: snap?.last_update || cd.last_update || eq.last_seen_at,
  };
}

function mergeEquipmentWithLive(
  eq: Equipment,
  realtimeById: Record<string, RealtimeSnapshot>,
  overviewById: Record<string, EquipmentOverviewItem>,
  branchMap: Record<string, Branch>
): EquipmentWithLive {
  const snap = realtimeById[eq.id];
  const ov = overviewById[eq.id];
  const status: EquipmentStatus = snap?.status || eq.status || 'offline';

  return {
    ...eq,
    effectiveStatus: status,
    branchDisplayName: eq.branch_name || branchMap[eq.branch_id]?.name || 'Filial',
    ...resolveLiveTelemetryFields(eq, snap),
    sparkline24h: ov?.sparkline_24h || [],
    threshold: ov?.threshold || null,
    thresholdLabel: ov?.threshold?.label || null,
  };
}

function selectScopedUnits(params: {
  equipmentId?: string;
  currentEquipment: EquipmentWithLive | null;
  branchId?: string;
  isSingleBranchCompany: boolean;
  branchEquipments: EquipmentWithLive[];
  companyId?: string;
  mergedEquipments: EquipmentWithLive[];
}): EquipmentWithLive[] {
  const {
    equipmentId,
    currentEquipment,
    branchId,
    isSingleBranchCompany,
    branchEquipments,
    companyId,
    mergedEquipments,
  } = params;

  if (equipmentId) return currentEquipment ? [currentEquipment] : [];
  if (branchId || isSingleBranchCompany) return branchEquipments;
  if (companyId) return mergedEquipments.filter((e) => e.company_id === companyId);
  return mergedEquipments;
}

function computeScopedConnectivity(params: {
  equipmentId?: string;
  currentEquipment: EquipmentWithLive | null;
  branchId?: string;
  isSingleBranchCompany: boolean;
  branchEquipments: EquipmentWithLive[];
  companyId?: string;
  mergedEquipments: EquipmentWithLive[];
}): ScopedConnectivity {
  const units = selectScopedUnits(params);
  let onlineCount = 0;
  let offlineCount = 0;
  let latestUpdate: string | null = null;

  units.forEach((eq) => {
    if ((eq.effectiveStatus || 'offline') === 'offline') {
      offlineCount += 1;
    } else {
      onlineCount += 1;
    }
    if (eq.liveLastUpdate && (!latestUpdate || new Date(eq.liveLastUpdate) > new Date(latestUpdate))) {
      latestUpdate = eq.liveLastUpdate;
    }
  });

  return { onlineCount, offlineCount, lastSignalIso: latestUpdate };
}

interface UseOperationsWorkspaceDataParams {
  isGlobalAdmin: boolean;
  isRestrictedViewer: boolean;
  companyId?: string;
  branchId?: string;
  equipmentId?: string;
  activeCompanyId: string | null;
}

export function useOperationsWorkspaceData({
  isGlobalAdmin,
  isRestrictedViewer,
  companyId,
  branchId,
  equipmentId,
  activeCompanyId,
}: UseOperationsWorkspaceDataParams) {
  const workspaceQuery = useQuery<WorkspaceSnapshot>({
    queryKey: queryKeys.workspace({
      isGlobalAdmin,
      companyId: companyId || null,
      activeCompanyId,
    }),
    queryFn: () =>
      fetchWorkspaceSnapshot({
        isGlobalAdmin,
        companyId: companyId || null,
        activeCompanyId,
      }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });

  const companies = workspaceQuery.data?.companies ?? EMPTY_COMPANIES;
  const scopedCompanyDetail = workspaceQuery.data?.scopedCompanyDetail ?? null;
  const branches = workspaceQuery.data?.branches ?? EMPTY_BRANCHES;
  const equipments = workspaceQuery.data?.equipments ?? EMPTY_EQUIPMENTS;
  const realtimeById = workspaceQuery.data?.realtimeById ?? EMPTY_REALTIME;
  const overviewById = workspaceQuery.data?.overviewById ?? EMPTY_OVERVIEW;

  const reloadWorkspace = useCallback(async () => {
    await invalidateOperationalQueries();
  }, []);

  const branchMap = useMemo<Record<string, Branch>>(
    () => Object.fromEntries(branches.map((b) => [b.id, b])),
    [branches]
  );

  const mergedEquipments = useMemo<EquipmentWithLive[]>(
    () =>
      equipments.map((eq) => mergeEquipmentWithLive(eq, realtimeById, overviewById, branchMap)),
    [equipments, realtimeById, overviewById, branchMap]
  );

  const currentCompany = useMemo<Company | null>(() => {
    if (!companyId) return null;
    return companies.find((c) => c.id === companyId) || scopedCompanyDetail || null;
  }, [companyId, companies, scopedCompanyDetail]);

  const companyBranches = useMemo<Branch[]>(() => {
    if (!companyId) return branches;
    return branches
      .filter((b) => b.company_id === companyId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [branches, companyId]);

  const isSingleBranchCompany = Boolean(
    companyId && !isRestrictedViewer && companyBranches.length === 1
  );

  const effectiveBranch = useMemo<Branch | null>(() => {
    if (branchId) {
      return companyBranches.find((b) => b.id === branchId) || branchMap[branchId] || null;
    }
    return isSingleBranchCompany ? companyBranches[0] || null : null;
  }, [branchId, companyBranches, branchMap, isSingleBranchCompany]);

  const effectiveBranchId = branchId || effectiveBranch?.id || null;

  const branchEquipments = useMemo<EquipmentWithLive[]>(() => {
    if (!effectiveBranchId) return [];
    return mergedEquipments
      .filter((eq) => eq.branch_id === effectiveBranchId)
      .sort((a, b) => a.serial.localeCompare(b.serial, 'pt-BR'));
  }, [mergedEquipments, effectiveBranchId]);

  const currentEquipment = useMemo<EquipmentWithLive | null>(() => {
    if (!equipmentId) return null;
    return (
      branchEquipments.find((eq) => eq.id === equipmentId) ||
      mergedEquipments.find((eq) => eq.id === equipmentId) ||
      null
    );
  }, [equipmentId, branchEquipments, mergedEquipments]);

  const scopedConnectivity = useMemo(
    () =>
      computeScopedConnectivity({
        equipmentId,
        currentEquipment,
        branchId,
        isSingleBranchCompany,
        branchEquipments,
        companyId,
        mergedEquipments,
      }),
    [
      equipmentId,
      currentEquipment,
      branchId,
      isSingleBranchCompany,
      branchEquipments,
      companyId,
      mergedEquipments,
    ]
  );

  return {
    workspaceQuery,
    companies,
    scopedCompanyDetail,
    branches,
    equipments,
    realtimeById,
    loading: workspaceQuery.isPending,
    isRefreshing: workspaceQuery.isFetching,
    hasSingleError: workspaceQuery.isError,
    isUnstable: workspaceQuery.failureCount >= 2 || workspaceQuery.isError,
    reloadWorkspace,
    mergedEquipments,
    currentCompany,
    companyBranches,
    isSingleBranchCompany,
    effectiveBranch,
    effectiveBranchId,
    branchEquipments,
    currentEquipment,
    scopedConnectivity,
  };
}
