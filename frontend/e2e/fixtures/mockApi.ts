import type { Page, Route } from '@playwright/test';
import type {
  AlertItem,
  AlertRule,
  AuditLogItem,
  Branch,
  Company,
  Equipment,
  MaintenanceRecord,
  PaginationMeta,
  User,
  UserRole,
} from '../../src/types/models';
import type { components } from '../../src/types/openapi';

type OpenApiSchemas = components['schemas'];
type TelemetryDataPoint = OpenApiSchemas['TelemetryDataPoint'];

export interface MockSessionOptions {
  role?: UserRole;
  restrictedBranchId?: string;
}

const IDS = {
  companyA: '11111111-1111-4111-8111-111111111111',
  companyB: '22222222-2222-4222-8222-222222222222',
  branchCentro: '33333333-3333-4333-8333-333333333333',
  branchIguatemi: '44444444-4444-4444-8444-444444444444',
  eqCam002: '55555555-5555-4555-8555-555555555555',
  eqFrz003: '66666666-6666-4666-8666-666666666666',
  eqCam004: '55555555-5555-4555-8555-555555555556',
  eqBal005: '55555555-5555-4555-8555-555555555557',
  eqRefOffline: '77777777-7777-4777-8777-777777777777',
  alertCrit: '88888888-8888-4888-8888-888888888888',
  alertWarn: '99999999-9999-4999-8999-999999999999',
  ruleHighTemp: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userAdmin: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userViewer: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  audit1: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};

export { IDS as MOCK_IDS };

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function makePagination(total: number, limit = 100, page = 1): PaginationMeta {
  return {
    page,
    limit,
    total,
    total_pages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

export interface MockBackendController {
  setForceSessionExpired: (expired: boolean) => void;
  getManualSubmissionsCount: () => number;
}

export async function installMockApi(
  page: Page,
  options: MockSessionOptions = {}
): Promise<MockBackendController> {
  const role: UserRole = options.role ?? 'global_admin';
  const restrictedBranchId = options.restrictedBranchId ?? IDS.branchCentro;

  let forceSessionExpired = false;
  let manualSubmissionsCount = 0;

  const currentUser: User =
    role === 'global_admin'
      ? {
          id: IDS.userAdmin,
          name: 'Carlos Silva',
          email: 'admin@polosanca.com',
          role: 'global_admin',
          status: 'active',
          company_id: null,
          branch_access_type: 'full',
          branch_access: { type: 'full', branches: null },
        }
      : role === 'company_admin'
        ? {
            id: IDS.userAdmin,
            name: 'Fernanda Lima',
            email: 'fernanda@supermercados.com',
            role: 'company_admin',
            status: 'active',
            company_id: IDS.companyA,
            branch_access_type: 'full',
            branch_access: { type: 'full', branches: null },
          }
        : {
            id: IDS.userViewer,
            name: 'João Operador',
            email: 'joao@supermercados.com',
            role: 'company_viewer',
            status: 'active',
            company_id: IDS.companyA,
            branch_access_type: 'restricted',
            branch_access: { type: 'restricted', branches: [restrictedBranchId] },
          };

  const companies: Company[] = [
    {
      id: IDS.companyA,
      name: 'Supermercados São Carlos',
      status: 'active',
      contact_email: 'operacoes@supermercados.com',
      contact_phone: '(16) 3333-1000',
      branches_count: 2,
      equipment_count: 5,
    },
    {
      id: IDS.companyB,
      name: 'Frigorífico Serra Azul',
      status: 'active',
      contact_email: 'contato@serraazul.com',
      contact_phone: '(16) 3333-2000',
      branches_count: 1,
      equipment_count: 0,
    },
  ];

  const allBranches: Branch[] = [
    {
      id: IDS.branchCentro,
      company_id: IDS.companyA,
      name: 'Filial Centro',
      address: 'Av. São Carlos, 1200',
      manager_contact: '(16) 99100-1111',
      equipment_count: 4,
    },
    {
      id: IDS.branchIguatemi,
      company_id: IDS.companyA,
      name: 'Filial Iguatemi',
      address: 'Passeio dos Flamboyants, 200',
      manager_contact: '(16) 99100-2222',
      equipment_count: 1,
    },
  ];

  const visibleBranches =
    role === 'company_viewer'
      ? allBranches.filter((b) => b.id === restrictedBranchId)
      : allBranches;

  const recentTs = isoMinutesAgo(1);
  const offlineTs = isoMinutesAgo(17 * 60);

  const equipments: Equipment[] = [
    {
      id: IDS.eqCam002,
      serial: 'CAM-CENTRO-002',
      model: 'Danfoss Optyma Plus 2.5HP',
      manufacturer: 'Danfoss',
      type: 'cold_room',
      status: 'critical',
      company_id: IDS.companyA,
      branch_id: IDS.branchCentro,
      branch_name: 'Filial Centro',
      is_active: true,
      last_seen_at: recentTs,
      last_maintenance_date: '2026-10-15',
      next_maintenance_date: '2026-12-15',
      current_data: {
        temperature: 4.8,
        pressure: 118.2,
        door: 'open',
        compressor: 'on',
        fan: 'on',
        heater: 'off',
        last_update: recentTs,
      },
    },
    {
      id: IDS.eqFrz003,
      serial: 'FRZ-CENTRO-003',
      model: 'Hussmann Excel Low-Temp',
      manufacturer: 'Hussmann',
      type: 'freezer',
      status: 'operational',
      company_id: IDS.companyA,
      branch_id: IDS.branchCentro,
      branch_name: 'Filial Centro',
      is_active: true,
      last_seen_at: recentTs,
      last_maintenance_date: '2026-11-01',
      next_maintenance_date: '2027-01-01',
      current_data: {
        temperature: -20.4,
        pressure: 78.2,
        door: 'closed',
        compressor: 'on',
        fan: 'on',
        heater: 'off',
        last_update: recentTs,
      },
    },
    {
      id: IDS.eqCam004,
      serial: 'CAM-CENTRO-004',
      model: 'Elgin Monobloco 2HP',
      manufacturer: 'Elgin',
      type: 'cold_room',
      status: 'operational',
      company_id: IDS.companyA,
      branch_id: IDS.branchCentro,
      branch_name: 'Filial Centro',
      is_active: true,
      last_seen_at: recentTs,
      last_maintenance_date: '2026-10-20',
      next_maintenance_date: '2026-12-20',
      current_data: {
        temperature: 1.2,
        pressure: 101.4,
        door: 'closed',
        compressor: 'on',
        fan: 'on',
        heater: 'off',
        last_update: recentTs,
      },
    },
    {
      id: IDS.eqBal005,
      serial: 'BAL-CENTRO-005',
      model: 'Gelopar Expositor Açougue',
      manufacturer: 'Gelopar',
      type: 'refrigerator',
      status: 'operational',
      company_id: IDS.companyA,
      branch_id: IDS.branchCentro,
      branch_name: 'Filial Centro',
      is_active: true,
      last_seen_at: recentTs,
      last_maintenance_date: '2026-10-25',
      next_maintenance_date: '2026-12-25',
      current_data: {
        temperature: 1.8,
        pressure: 98.6,
        door: 'closed',
        compressor: 'on',
        fan: 'on',
        heater: 'off',
        last_update: recentTs,
      },
    },
    {
      id: IDS.eqRefOffline,
      serial: 'REF-IGUATEMI-001',
      model: 'Gelopar GREP-4P Laticínios',
      manufacturer: 'Gelopar',
      type: 'refrigerator',
      status: 'offline',
      company_id: IDS.companyA,
      branch_id: IDS.branchIguatemi,
      branch_name: 'Filial Iguatemi',
      is_active: true,
      last_seen_at: offlineTs,
      last_maintenance_date: null,
      next_maintenance_date: null,
      current_data: {
        temperature: 2.6,
        pressure: 99.8,
        door: 'closed',
        compressor: 'off',
        fan: 'off',
        heater: 'off',
        last_update: offlineTs,
      },
    },
  ];

  const alertTime = isoMinutesAgo(30);
  const alerts: AlertItem[] = [
    {
      id: IDS.alertCrit,
      type: 'temperature_high',
      severity: 'critical',
      status: 'active',
      message:
        'Temperatura crítica em CAM-CENTRO-002: leitura atual de 4,8 °C acima do limite de 2,0 °C.',
      equipment_id: IDS.eqCam002,
      serial: 'CAM-CENTRO-002',
      branch_id: IDS.branchCentro,
      company_id: IDS.companyA,
      created_at: alertTime,
      acknowledged_at: null,
      acknowledgment_notes: null,
      resolved_at: null,
    },
    {
      id: IDS.alertWarn,
      type: 'door_open',
      severity: 'warning',
      status: 'active',
      message: 'Porta da câmara CAM-CENTRO-002 aberta há mais de 10 minutos.',
      equipment_id: IDS.eqCam002,
      serial: 'CAM-CENTRO-002',
      branch_id: IDS.branchCentro,
      company_id: IDS.companyA,
      created_at: isoMinutesAgo(45),
      acknowledged_at: null,
      acknowledgment_notes: null,
      resolved_at: null,
    },
  ];

  const telemetryByEquipment: Record<string, TelemetryDataPoint[]> = {
    [IDS.eqCam002]: [
      {
        id: 't-4',
        equipment_id: IDS.eqCam002,
        timestamp: isoMinutesAgo(10),
        temperature: 4.8,
        pressure: 118.2,
        door: 'open',
        compressor: 'on',
        fan: 'on',
        heater: 'off',
        source: 'device',
      },
      {
        id: 't-3',
        equipment_id: IDS.eqCam002,
        timestamp: alertTime,
        temperature: 3.4,
        pressure: 112.0,
        door: 'open',
        compressor: 'on',
        fan: 'on',
        heater: 'off',
        source: 'device',
      },
      {
        id: 't-2',
        equipment_id: IDS.eqCam002,
        timestamp: isoMinutesAgo(60),
        temperature: 0.4,
        pressure: 102.5,
        door: 'closed',
        compressor: 'on',
        fan: 'on',
        heater: 'off',
        source: 'device',
      },
      {
        id: 't-1',
        equipment_id: IDS.eqCam002,
        timestamp: isoMinutesAgo(90),
        temperature: -0.2,
        pressure: 100.1,
        door: 'closed',
        compressor: 'on',
        fan: 'on',
        heater: 'off',
        source: 'device',
      },
    ],
    [IDS.eqFrz003]: [
      {
        id: 'tf-2',
        equipment_id: IDS.eqFrz003,
        timestamp: isoMinutesAgo(10),
        temperature: -20.4,
        pressure: 78.2,
        door: 'closed',
        compressor: 'on',
        fan: 'on',
        heater: 'off',
        source: 'device',
      },
      {
        id: 'tf-1',
        equipment_id: IDS.eqFrz003,
        timestamp: isoMinutesAgo(40),
        temperature: -20.1,
        pressure: 79.0,
        door: 'closed',
        compressor: 'on',
        fan: 'on',
        heater: 'off',
        source: 'device',
      },
    ],
    [IDS.eqRefOffline]: [
      {
        id: 'to-2',
        equipment_id: IDS.eqRefOffline,
        timestamp: offlineTs,
        temperature: 2.6,
        pressure: 99.8,
        door: 'closed',
        compressor: 'off',
        fan: 'off',
        heater: 'off',
        source: 'device',
      },
      {
        id: 'to-1',
        equipment_id: IDS.eqRefOffline,
        timestamp: isoMinutesAgo(18 * 60),
        temperature: 2.1,
        pressure: 100.2,
        door: 'closed',
        compressor: 'on',
        fan: 'on',
        heater: 'off',
        source: 'device',
      },
    ],
  };

  const alertRules: AlertRule[] = [
    {
      id: IDS.ruleHighTemp,
      name: 'Temperatura Alta Câmara Fria',
      description: 'Limite sanitário de 2,0 °C',
      rule_type: 'temperature_high',
      severity: 'critical',
      scope: 'equipment',
      scope_id: IDS.eqCam002,
      comparison_operator: '>',
      threshold_value: 2.0,
      duration_seconds: 300,
      is_active: true,
      is_effective: true,
      priority: 1,
    },
  ];

  const maintenanceRecords: MaintenanceRecord[] = [
    {
      id: 'm-1',
      equipment_id: IDS.eqCam002,
      type: 'preventive',
      performed_at: '2026-10-15T14:00:00Z',
      performed_by: 'Equipe PoloSanca',
      description: 'Limpeza de condensador e aferição de sensores',
      notes: 'Operação normalizada',
      next_maintenance_date: '2026-12-15',
    },
  ];

  const users: User[] = [
    currentUser,
    {
      id: IDS.userViewer,
      name: 'João Operador',
      email: 'joao@supermercados.com',
      role: 'company_viewer',
      status: 'active',
      company_id: IDS.companyA,
      branch_access_type: 'restricted',
      branch_access: { type: 'restricted', branches: [IDS.branchCentro] },
    },
  ];

  const auditLogs: AuditLogItem[] = [
    {
      id: IDS.audit1,
      action: 'update_equipment',
      entity_type: 'equipment',
      entity_id: IDS.eqCam002,
      user_id: IDS.userAdmin,
      ip_address: '127.0.0.1',
      user_agent: 'Playwright',
      changes: {
        model: { old: 'Danfoss v1', new: 'Danfoss Optyma Plus 2.5HP' },
      },
      created_at: isoMinutesAgo(15),
    },
  ];

  const fulfillJson = <T>(route: Route, body: T, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  const parseManualTelemetryBody = (
    rawBody: unknown
  ): { temperature: number; notes: string | null } => {
    if (typeof rawBody !== 'object' || rawBody === null) {
      return { temperature: 0, notes: null };
    }
    const temperature =
      'temperature' in rawBody && typeof rawBody.temperature === 'number'
        ? rawBody.temperature
        : 0;
    const notes =
      'notes' in rawBody && typeof rawBody.notes === 'string' && rawBody.notes
        ? rawBody.notes
        : null;
    return { temperature, notes };
  };

  const handleAuthPreSessionRoute = async (
    route: Route,
    path: string,
    method: string
  ): Promise<boolean> => {
    if (path === '/auth/login' && method === 'POST') {
      const response: OpenApiSchemas['LoginResponse'] = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        user: currentUser,
      };
      await fulfillJson(route, response);
      return true;
    }
    if (path === '/auth/logout' && method === 'POST') {
      const response: OpenApiSchemas['MessageResponse'] = {
        success: true,
        message: 'Logout realizado com sucesso.',
      };
      await fulfillJson(route, response);
      return true;
    }
    return false;
  };

  const handleOrgRoute = async (route: Route, path: string, method: string): Promise<boolean> => {
    if (method !== 'GET') return false;
    if (path === '/auth/me') {
      await fulfillJson<User>(route, currentUser);
      return true;
    }
    if (path === '/companies') {
      const response: OpenApiSchemas['CompaniesListResponse'] = {
        companies,
        pagination: makePagination(companies.length),
      };
      await fulfillJson(route, response);
      return true;
    }
    const companyMatch = path.match(/^\/companies\/([^/]+)$/);
    if (companyMatch) {
      const found = companies.find((c) => c.id === companyMatch[1]) || companies[0];
      await fulfillJson<Company>(route, found);
      return true;
    }
    if (path === '/branches') {
      const response: OpenApiSchemas['BranchesListResponse'] = {
        branches: visibleBranches,
        pagination: makePagination(visibleBranches.length),
      };
      await fulfillJson(route, response);
      return true;
    }
    return false;
  };

  const handleEquipmentRoute = async (
    route: Route,
    path: string,
    method: string
  ): Promise<boolean> => {
    if (path === '/equipments' && method === 'GET') {
      const filtered =
        role === 'company_viewer'
          ? equipments.filter((e) => e.branch_id === restrictedBranchId)
          : equipments;
      const response: OpenApiSchemas['EquipmentsListResponse'] = {
        equipment: filtered,
        pagination: makePagination(filtered.length),
      };
      await fulfillJson(route, response);
      return true;
    }

    const eqDetailMatch = path.match(/^\/equipments\/([^/]+)$/);
    if (eqDetailMatch && method === 'GET') {
      const found = equipments.find((e) => e.id === eqDetailMatch[1]) || equipments[0];
      await fulfillJson<Equipment>(route, found);
      return true;
    }

    const eqRulesMatch = path.match(/^\/equipments\/([^/]+)\/alert-rules$/);
    if (eqRulesMatch && method === 'GET') {
      const response: OpenApiSchemas['EquipmentAlertRulesResponse'] = {
        equipment_id: eqRulesMatch[1] ?? '',
        applicable_rules: alertRules,
      };
      await fulfillJson(route, response);
      return true;
    }

    const eqMaintMatch = path.match(/^\/equipments\/([^/]+)\/maintenance-records$/);
    if (eqMaintMatch && method === 'GET') {
      const eqId = eqMaintMatch[1] ?? '';
      const filtered = maintenanceRecords.filter((m) => m.equipment_id === eqId);
      const response: OpenApiSchemas['MaintenanceRecordsListResponse'] = {
        equipment_id: eqId,
        maintenance_records: filtered,
        pagination: makePagination(filtered.length),
      };
      await fulfillJson(route, response);
      return true;
    }

    return false;
  };

  const handleEquipmentTelemetryRoute = async (
    route: Route,
    path: string,
    method: string
  ): Promise<boolean> => {
    const eqManualMatch = path.match(/^\/equipments\/([^/]+)\/telemetry\/manual$/);
    if (eqManualMatch && method === 'POST') {
      const eqId = eqManualMatch[1] ?? '';
      const { temperature, notes } = parseManualTelemetryBody(route.request().postDataJSON());
      manualSubmissionsCount += 1;
      const nowIso = new Date().toISOString();
      const storedPoint: TelemetryDataPoint = {
        id: `manual-${manualSubmissionsCount}`,
        equipment_id: eqId,
        timestamp: nowIso,
        temperature,
        pressure: null,
        source: 'manual',
        recorded_by: currentUser.id,
        notes,
      };
      telemetryByEquipment[eqId] = [storedPoint, ...(telemetryByEquipment[eqId] || [])];
      const response: OpenApiSchemas['ManualTelemetryResponse'] = {
        success: true,
        equipment_id: eqId,
        timestamp: nowIso,
        temperature,
        source: 'manual',
        recorded_by: currentUser.id,
        notes,
      };
      await fulfillJson(route, response, 201);
      return true;
    }

    const eqTelemetryMatch = path.match(/^\/equipments\/([^/]+)\/telemetry$/);
    if (eqTelemetryMatch && method === 'GET') {
      const eqId = eqTelemetryMatch[1] ?? '';
      const rows = telemetryByEquipment[eqId] || [];
      const foundEq = equipments.find((e) => e.id === eqId);
      const response: OpenApiSchemas['TelemetryHistoryResponse'] = {
        equipment_id: eqId,
        serial: foundEq?.serial ?? null,
        interval: 'raw',
        count: rows.length,
        data: rows,
      };
      await fulfillJson(route, response);
      return true;
    }

    return false;
  };

  const handleTelemetryRoute = async (
    route: Route,
    path: string,
    method: string
  ): Promise<boolean> => {
    if (method !== 'GET') return false;
    if (path === '/telemetry/realtime') {
      const response: OpenApiSchemas['RealtimeTelemetryListResponse'] = {
        equipment: equipments.map((e) => ({
          equipment_id: e.id,
          serial: e.serial,
          branch_id: e.branch_id,
          company_id: e.company_id,
          status: e.status,
          temperature: e.current_data?.temperature ?? null,
          pressure: e.current_data?.pressure ?? null,
          door: e.current_data?.door ?? null,
          compressor: e.current_data?.compressor ?? null,
          fan: e.current_data?.fan ?? null,
          heater: e.current_data?.heater ?? null,
          last_update: e.current_data?.last_update ?? null,
        })),
      };
      await fulfillJson(route, response);
      return true;
    }
    if (path === '/telemetry/overview') {
      const response: OpenApiSchemas['TelemetryOverviewResponse'] = {
        overview: {
          [IDS.eqCam002]: {
            sparkline_24h: [
              { t: isoMinutesAgo(90), v: -0.2 },
              { t: isoMinutesAgo(60), v: 0.4 },
              { t: isoMinutesAgo(10), v: 4.8 },
            ],
            threshold: { low: 0.0, high: 2.0, label: 'Meta: 0,0 a 2,0 °C' },
          },
          [IDS.eqFrz003]: {
            sparkline_24h: [
              { t: isoMinutesAgo(60), v: -20.1 },
              { t: isoMinutesAgo(10), v: -20.4 },
            ],
            threshold: { low: -23.0, high: -18.0, label: 'Meta: -23,0 a -18,0 °C' },
          },
          [IDS.eqRefOffline]: {
            sparkline_24h: [
              { t: isoMinutesAgo(18 * 60), v: 2.1 },
              { t: offlineTs, v: 2.6 },
            ],
            threshold: { low: 0.0, high: 2.0, label: 'Meta: 0,0 a 2,0 °C' },
          },
        },
      };
      await fulfillJson(route, response);
      return true;
    }
    return false;
  };

  const handleAlertRoute = async (
    route: Route,
    url: URL,
    path: string,
    method: string
  ): Promise<boolean> => {
    if (path === '/alerts/statistics' && method === 'GET') {
      const active = alerts.filter((a) => a.status === 'active');
      const byType: Record<string, number> = {};
      for (const item of active) {
        byType[item.type] = (byType[item.type] ?? 0) + 1;
      }
      const response: OpenApiSchemas['AlertStatisticsResponse'] = {
        total_active: active.length,
        by_severity: {
          critical: active.filter((a) => a.severity === 'critical').length,
          warning: active.filter((a) => a.severity === 'warning').length,
        },
        by_type: byType,
      };
      await fulfillJson(route, response);
      return true;
    }

    if (path === '/alerts' && method === 'GET') {
      const statusParam = url.searchParams.get('status');
      const eqIdParam = url.searchParams.get('equipment_id');
      let list = [...alerts];
      if (statusParam) {
        const allowed = statusParam.split(',');
        list = list.filter((a) => allowed.includes(a.status));
      }
      if (eqIdParam) {
        list = list.filter((a) => a.equipment_id === eqIdParam);
      }
      const response: OpenApiSchemas['AlertsListResponse'] = {
        alerts: list,
        pagination: makePagination(list.length, 20),
      };
      await fulfillJson(route, response);
      return true;
    }

    const ackMatch = path.match(/^\/alerts\/([^/]+)\/acknowledge$/);
    if (ackMatch && method === 'POST') {
      const found = alerts.find((a) => a.id === ackMatch[1]);
      if (found) {
        found.status = 'acknowledged';
        found.acknowledged_at = new Date().toISOString();
      }
      await fulfillJson(route, found || {});
      return true;
    }

    const resolveMatch = path.match(/^\/alerts\/([^/]+)\/resolve$/);
    if (resolveMatch && method === 'POST') {
      const found = alerts.find((a) => a.id === resolveMatch[1]);
      if (found) {
        found.status = 'resolved';
        found.resolved_at = new Date().toISOString();
      }
      await fulfillJson(route, found || {});
      return true;
    }

    return false;
  };

  const handleAdminRoute = async (route: Route, path: string, method: string): Promise<boolean> => {
    if (method !== 'GET') return false;
    if (path === '/alert-rules') {
      const response: OpenApiSchemas['AlertRulesListResponse'] = {
        alert_rules: alertRules,
        pagination: makePagination(alertRules.length, 20),
      };
      await fulfillJson(route, response);
      return true;
    }
    if (path === '/users') {
      const response: OpenApiSchemas['UsersListResponse'] = {
        users,
        pagination: makePagination(users.length, 20),
      };
      await fulfillJson(route, response);
      return true;
    }
    if (path === '/audit-logs') {
      const response: OpenApiSchemas['AuditLogsListResponse'] = {
        audit_logs: auditLogs,
        next_page_token: null,
        pagination: makePagination(auditLogs.length, 20),
      };
      await fulfillJson(route, response);
      return true;
    }
    return false;
  };

  await page.route('**/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/v1/, '');
    const method = req.method();

    if (await handleAuthPreSessionRoute(route, path, method)) return;

    if (forceSessionExpired) {
      const err: OpenApiSchemas['Error'] = { error: 'Token Expired' };
      await fulfillJson(route, err, 401);
      return;
    }

    if (await handleOrgRoute(route, path, method)) return;
    if (await handleEquipmentRoute(route, path, method)) return;
    if (await handleEquipmentTelemetryRoute(route, path, method)) return;
    if (await handleTelemetryRoute(route, path, method)) return;
    if (await handleAlertRoute(route, url, path, method)) return;
    if (await handleAdminRoute(route, path, method)) return;

    await fulfillJson(route, {});
  });

  return {
    setForceSessionExpired: (expired: boolean) => {
      forceSessionExpired = expired;
    },
    getManualSubmissionsCount: () => manualSubmissionsCount,
  };
}

export async function loginViaUi(page: Page, email = 'admin@polosanca.com'): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('nome@empresa.com.br').fill(email);
  await page.getByPlaceholder('Digite sua senha').fill('SenhaForte123!');
  await page.getByRole('button', { name: /entrar na plataforma/i }).click();
  await page.waitForURL(/\/operacao/);
}
