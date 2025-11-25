import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type {
  AlertItem,
  AlertRule,
  AlertRuleStatistics,
  AlertScope,
  AlertSeverity,
  AlertStatistics,
  AlertStatus,
  AlertType,
  AuditLogItem,
  Branch,
  Company,
  CompanyStatus,
  CreateAlertRulePayload,
  CreateBranchPayload,
  CreateCompanyPayload,
  CreateEquipmentPayload,
  CreateMaintenancePayload,
  Equipment,
  EquipmentOverviewItem,
  EquipmentStatus,
  EquipmentType,
  InviteUserPayload,
  MaintenanceRecord,
  ManualTelemetryPayload,
  PaginationMeta,
  RealtimeSnapshot,
  RotateApiKeyResponse,
  TelemetryInterval,
  TelemetryRow,
  UpdateAlertRulePayload,
  UpdateBranchPayload,
  UpdateCompanyPayload,
  UpdateEquipmentPayload,
  UpdateMaintenancePayload,
  UpdateUserPayload,
  User,
  UserRole,
  UserStatus,
} from './types/models';

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipAuthInterceptor?: boolean;
  }
  export interface InternalAxiosRequestConfig {
    skipAuthInterceptor?: boolean;
    _retry?: boolean;
  }
}

export const API_URL: string =
  typeof import.meta.env.VITE_API_URL === 'string' && import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : 'http://localhost:5000/v1';

const toRejectionError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Erro na requisição');

const PUBLIC_AUTH_PATHS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/change-password',
  '/users/accept-invitation',
];

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface QueuedRequest {
  resolve: (token: string | null) => void;
  reject: (err: unknown) => void;
}

let isRefreshing = false;
let failedQueue: QueuedRequest[] = [];

const processQueue = (error: unknown, token: string | null = null): void => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

export const clearStoredSession = (): void => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
};

const handleSessionExpired = (): void => {
  clearStoredSession();
  window.dispatchEvent(new CustomEvent('auth:session-expired'));
};

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!config.skipAuthInterceptor) {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const axiosErr = axios.isAxiosError(error) ? error : null;
    const originalRequest = axiosErr?.config;
    const status = axiosErr?.response?.status;
    const requestUrl = originalRequest?.url || '';
    const isAuthBypassPath = PUBLIC_AUTH_PATHS.some((p) => requestUrl.includes(p));

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthBypassPath) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        handleSessionExpired();
        return Promise.reject(toRejectionError(error));
      }

      if (isRefreshing) {
        return new Promise<string | null>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await axios.post<{ access_token: string }>(
          `${API_URL}/auth/refresh`,
          {},
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${refreshToken}`,
            },
          }
        );

        const newAccessToken = refreshResponse.data.access_token;
        localStorage.setItem('accessToken', newAccessToken);
        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        handleSessionExpired();
        return Promise.reject(toRejectionError(refreshError));
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(toRejectionError(error));
  }
);

// ---------------------------------------------------------------------------
// Autenticação, Perfil e Recuperação de Conta
// ---------------------------------------------------------------------------

interface LoginApiResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export const login = async (email: string, password: string): Promise<User> => {
  const response = await api.post<LoginApiResponse>('/auth/login', { email, password });
  const { access_token, refresh_token, user } = response.data;
  localStorage.setItem('accessToken', access_token);
  localStorage.setItem('refreshToken', refresh_token);
  localStorage.setItem('user', JSON.stringify(user));
  return user;
};

export const logout = async (): Promise<void> => {
  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');
  try {
    if (accessToken) {
      await api.post('/auth/logout');
    }
    if (refreshToken) {
      await axios.post(
        `${API_URL}/auth/logout`,
        {},
        {
          headers: {
            Authorization: `Bearer ${refreshToken}`,
          },
        }
      );
    }
  } catch {
    // Ignore errors if token already expired/revoked
  } finally {
    clearStoredSession();
  }
};

export const getCurrentUser = async (): Promise<User> => {
  const response = await api.get<User>('/auth/me');
  localStorage.setItem('user', JSON.stringify(response.data));
  return response.data;
};

export const updateProfile = async (name: string): Promise<User> => {
  const response = await api.patch<User>('/auth/me', { name });
  localStorage.setItem('user', JSON.stringify(response.data));
  return response.data;
};

export const changePassword = async (
  currentPassword: string,
  newPassword: string
): Promise<{ message?: string }> => {
  const response = await api.post<{ message?: string }>('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return response.data;
};

export const forgotPassword = async (email: string): Promise<{ message?: string }> => {
  const response = await api.post<{ message?: string }>(
    '/auth/forgot-password',
    { email },
    { skipAuthInterceptor: true }
  );
  return response.data;
};

export const resetPassword = async (
  token: string,
  newPassword: string
): Promise<{ message?: string }> => {
  const response = await api.post<{ message?: string }>(
    '/auth/reset-password',
    { token, new_password: newPassword },
    { skipAuthInterceptor: true }
  );
  return response.data;
};

export const acceptInvitation = async (
  token: string,
  password: string
): Promise<{ message?: string; user?: User }> => {
  const response = await api.post<{ message?: string; user?: User }>(
    '/users/accept-invitation',
    { token, password },
    { skipAuthInterceptor: true }
  );
  return response.data;
};

// ---------------------------------------------------------------------------
// Contratos de Query Parameters (tipagem estrita alinhada às rotas Flask)
// ---------------------------------------------------------------------------

interface GetCompaniesParams {
  page?: number;
  limit?: number;
  status?: CompanyStatus;
}

export interface GetBranchesParams {
  page?: number;
  limit?: number;
  company_id?: string;
}

export interface GetUsersParams {
  page?: number;
  limit?: number;
  company_id?: string;
  role?: UserRole;
  status?: UserStatus;
}

interface GetEquipmentsParams {
  page?: number;
  limit?: number;
  company_id?: string;
  branch_id?: string;
  type?: EquipmentType;
  status?: EquipmentStatus;
  search?: string;
  include_inactive?: boolean;
}

interface GetMaintenanceRecordsParams {
  page?: number;
  limit?: number;
}

interface GetRealtimeTelemetryParams {
  company_id?: string;
  branch_id?: string;
  equipment_ids?: string;
}

interface GetTelemetryOverviewParams {
  company_id?: string;
  branch_id?: string;
  equipment_ids?: string;
}

interface GetTelemetryParams {
  page?: number;
  limit?: number;
  page_size?: number;
  page_token?: string;
  interval?: TelemetryInterval;
  start_date?: string;
  end_date?: string;
  fields?: string;
}

interface ExportTelemetryParams {
  interval?: TelemetryInterval;
  start_date?: string;
  end_date?: string;
}

export interface GetAlertsParams {
  page?: number;
  limit?: number;
  company_id?: string;
  branch_id?: string;
  equipment_id?: string;
  status?: AlertStatus | 'active,acknowledged';
  severity?: AlertSeverity;
  start_date?: string;
  end_date?: string;
}

export interface GetAlertStatisticsParams {
  company_id?: string;
  branch_id?: string;
  equipment_id?: string;
}

export interface GetAlertRulesParams {
  page?: number;
  limit?: number;
  company_id?: string;
  scope?: AlertScope;
  equipment_id?: string;
  rule_type?: AlertType;
  is_active?: boolean | 'true' | 'false';
}

export interface GetAuditLogsParams {
  page?: number;
  limit?: number;
  page_size?: number;
  page_token?: string;
  user_id?: string;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  start_date?: string;
  end_date?: string;
}

// ---------------------------------------------------------------------------
// Empresas, Filiais e Usuários
// ---------------------------------------------------------------------------

export const getCompanies = async (
  params: GetCompaniesParams = {}
): Promise<{ companies: Company[]; pagination?: PaginationMeta }> => {
  const response = await api.get<{ companies: Company[]; pagination?: PaginationMeta }>(
    '/companies',
    { params }
  );
  return response.data;
};

export const getCompany = async (companyId: string): Promise<Company> => {
  const response = await api.get<Company>(`/companies/${companyId}`);
  return response.data;
};

export const createCompany = async (payload: CreateCompanyPayload): Promise<Company> => {
  const response = await api.post<Company>('/companies', payload);
  return response.data;
};

export const updateCompany = async (
  companyId: string,
  payload: UpdateCompanyPayload
): Promise<Company> => {
  const response = await api.patch<Company>(`/companies/${companyId}`, payload);
  return response.data;
};

export const deactivateCompany = async (companyId: string): Promise<{ message?: string }> => {
  const response = await api.delete<{ message?: string }>(`/companies/${companyId}`);
  return response.data;
};

export const getBranches = async (
  params: GetBranchesParams = {}
): Promise<{ branches: Branch[]; pagination?: PaginationMeta }> => {
  const response = await api.get<{ branches: Branch[]; pagination?: PaginationMeta }>('/branches', {
    params,
  });
  return response.data;
};

export const createBranch = async (payload: CreateBranchPayload): Promise<Branch> => {
  const response = await api.post<Branch>('/branches', payload);
  return response.data;
};

export const updateBranch = async (
  branchId: string,
  payload: UpdateBranchPayload
): Promise<Branch> => {
  const response = await api.patch<Branch>(`/branches/${branchId}`, payload);
  return response.data;
};

export const deleteBranch = async (branchId: string): Promise<{ message?: string }> => {
  const response = await api.delete<{ message?: string }>(`/branches/${branchId}`);
  return response.data;
};

export const getUsers = async (
  params: GetUsersParams = {}
): Promise<{ users: User[]; pagination?: PaginationMeta }> => {
  const response = await api.get<{ users: User[]; pagination?: PaginationMeta }>('/users', {
    params,
  });
  return response.data;
};

export const inviteUser = async (
  userData: InviteUserPayload
): Promise<{ user?: User; message?: string }> => {
  const response = await api.post<{ user?: User; message?: string }>('/users/invite', userData);
  return response.data;
};

export const resendInvitation = async (userId: string): Promise<{ message?: string }> => {
  const response = await api.post<{ message?: string }>(`/users/${userId}/resend-invitation`);
  return response.data;
};

export const updateUser = async (userId: string, payload: UpdateUserPayload): Promise<User> => {
  const response = await api.patch<User>(`/users/${userId}`, payload);
  return response.data;
};

export const deactivateUser = async (userId: string): Promise<void> => {
  await api.delete(`/users/${userId}`);
};

// ---------------------------------------------------------------------------
// Equipamentos e Regras Aplicáveis
// ---------------------------------------------------------------------------

export const getEquipments = async (
  params: GetEquipmentsParams = {}
): Promise<{ equipment: Equipment[]; pagination?: PaginationMeta }> => {
  const response = await api.get<{ equipment: Equipment[]; pagination?: PaginationMeta }>(
    '/equipments',
    { params }
  );
  return response.data;
};

export const getEquipment = async (equipmentId: string): Promise<Equipment> => {
  const response = await api.get<Equipment>(`/equipments/${equipmentId}`);
  return response.data;
};

export const createEquipment = async (
  payload: CreateEquipmentPayload
): Promise<{ equipment?: Equipment; id?: string; serial?: string; api_key?: string } & Partial<Equipment>> => {
  const response = await api.post<
    { equipment?: Equipment; id?: string; serial?: string; api_key?: string } & Partial<Equipment>
  >('/equipments', payload);
  return response.data;
};

export const updateEquipment = async (
  equipmentId: string,
  payload: UpdateEquipmentPayload
): Promise<Equipment> => {
  const response = await api.patch<Equipment>(`/equipments/${equipmentId}`, payload);
  return response.data;
};

export const deactivateEquipment = async (equipmentId: string): Promise<void> => {
  await api.delete(`/equipments/${equipmentId}`);
};

export const rotateEquipmentApiKey = async (
  equipmentId: string
): Promise<RotateApiKeyResponse> => {
  const response = await api.post<RotateApiKeyResponse>(
    `/equipments/${equipmentId}/rotate-api-key`
  );
  return response.data;
};

export const getEquipmentAlertRules = async (
  equipmentId: string
): Promise<{ applicable_rules: AlertRule[] }> => {
  const response = await api.get<{ applicable_rules: AlertRule[] }>(
    `/equipments/${equipmentId}/alert-rules`
  );
  return response.data;
};

export const getEquipmentMaintenanceRecords = async (
  equipmentId: string,
  params: GetMaintenanceRecordsParams = {}
): Promise<{ maintenance_records: MaintenanceRecord[]; pagination?: PaginationMeta }> => {
  const response = await api.get<{
    maintenance_records: MaintenanceRecord[];
    pagination?: PaginationMeta;
  }>(`/equipments/${equipmentId}/maintenance-records`, { params });
  return response.data;
};

export const createMaintenanceRecord = async (
  equipmentId: string,
  payload: CreateMaintenancePayload
): Promise<MaintenanceRecord> => {
  const response = await api.post<MaintenanceRecord>(
    `/equipments/${equipmentId}/maintenance-records`,
    payload
  );
  return response.data;
};

export const updateMaintenanceRecord = async (
  recordId: string,
  payload: UpdateMaintenancePayload
): Promise<MaintenanceRecord> => {
  const response = await api.patch<MaintenanceRecord>(`/maintenance-records/${recordId}`, payload);
  return response.data;
};

export const deleteMaintenanceRecord = async (
  recordId: string
): Promise<{ message?: string }> => {
  const response = await api.delete<{ message?: string }>(`/maintenance-records/${recordId}`);
  return response.data;
};

// ---------------------------------------------------------------------------
// Telemetria em Tempo Real, Histórico, Exportação CSV e Entrada Manual Offline
// ---------------------------------------------------------------------------

export const getRealtimeTelemetry = async (
  params: GetRealtimeTelemetryParams = {}
): Promise<{ equipment: RealtimeSnapshot[] }> => {
  const response = await api.get<{ equipment: RealtimeSnapshot[] }>('/telemetry/realtime', {
    params,
  });
  return response.data;
};

export const getTelemetryOverview = async (
  params: GetTelemetryOverviewParams = {}
): Promise<{ overview: Record<string, EquipmentOverviewItem> }> => {
  const response = await api.get<{ overview: Record<string, EquipmentOverviewItem> }>(
    '/telemetry/overview',
    { params }
  );
  return response.data;
};

export const getEquipmentTelemetry = async (
  equipmentId: string,
  params: GetTelemetryParams = {}
): Promise<{ data: TelemetryRow[]; count?: number }> => {
  const response = await api.get<{ data: TelemetryRow[]; count?: number }>(
    `/equipments/${equipmentId}/telemetry`,
    { params }
  );
  return response.data;
};

export const exportEquipmentTelemetryCsv = async (
  equipmentId: string,
  params: ExportTelemetryParams = {}
): Promise<AxiosResponse<Blob>> => {
  const response = await api.get<Blob>(`/equipments/${equipmentId}/telemetry/export`, {
    params,
    responseType: 'blob',
  });
  return response;
};

export const submitManualTelemetry = async (
  equipmentId: string,
  payload: ManualTelemetryPayload
): Promise<TelemetryRow> => {
  const response = await api.post<TelemetryRow>(
    `/equipments/${equipmentId}/telemetry/manual`,
    payload
  );
  return response.data;
};

// ---------------------------------------------------------------------------
// Alertas, Estatísticas e Regras de Alerta
// ---------------------------------------------------------------------------

export const getAlerts = async (
  params: GetAlertsParams = {}
): Promise<{ alerts: AlertItem[]; pagination?: PaginationMeta }> => {
  const response = await api.get<{ alerts: AlertItem[]; pagination?: PaginationMeta }>('/alerts', {
    params,
  });
  return response.data;
};

export const getAlertStatistics = async (
  params: GetAlertStatisticsParams = {}
): Promise<AlertStatistics> => {
  const response = await api.get<AlertStatistics>('/alerts/statistics', { params });
  return response.data;
};

export const exportAlertsCsv = async (
  params: GetAlertsParams = {}
): Promise<AxiosResponse<Blob>> => {
  const response = await api.get<Blob>('/alerts/export', {
    params,
    responseType: 'blob',
  });
  return response;
};

export const getAlert = async (alertId: string): Promise<AlertItem> => {
  const response = await api.get<AlertItem>(`/alerts/${alertId}`);
  return response.data;
};

export const acknowledgeAlert = async (alertId: string, notes = ''): Promise<AlertItem> => {
  const response = await api.post<AlertItem>(`/alerts/${alertId}/acknowledge`, {
    notes: notes?.trim() ? notes.trim() : null,
  });
  return response.data;
};

export const resolveAlert = async (alertId: string): Promise<AlertItem> => {
  const response = await api.post<AlertItem>(`/alerts/${alertId}/resolve`);
  return response.data;
};

export const getAlertRules = async (
  params: GetAlertRulesParams = {}
): Promise<{ alert_rules: AlertRule[]; pagination?: PaginationMeta }> => {
  const response = await api.get<{ alert_rules: AlertRule[]; pagination?: PaginationMeta }>(
    '/alert-rules',
    { params }
  );
  return response.data;
};

export const createAlertRule = async (payload: CreateAlertRulePayload): Promise<AlertRule> => {
  const response = await api.post<AlertRule>('/alert-rules', payload);
  return response.data;
};

export const updateAlertRule = async (
  ruleId: string,
  payload: UpdateAlertRulePayload
): Promise<AlertRule> => {
  const response = await api.patch<AlertRule>(`/alert-rules/${ruleId}`, payload);
  return response.data;
};

export const deleteAlertRule = async (ruleId: string): Promise<void> => {
  await api.delete(`/alert-rules/${ruleId}`);
};

export const getAlertRuleStatistics = async (ruleId: string): Promise<AlertRuleStatistics> => {
  const response = await api.get<AlertRuleStatistics>(`/alert-rules/${ruleId}/statistics`);
  return response.data;
};

// ---------------------------------------------------------------------------
// Trilha de Auditoria Imutável (Global Admin)
// ---------------------------------------------------------------------------

export const getAuditLogs = async (
  params: GetAuditLogsParams = {}
): Promise<{ audit_logs: AuditLogItem[]; next_page_token?: string | null }> => {
  const response = await api.get<{ audit_logs: AuditLogItem[]; next_page_token?: string | null }>(
    '/audit-logs',
    { params }
  );
  return response.data;
};
