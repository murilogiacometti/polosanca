import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { paths } from './types/openapi';
import type {
  CreateAlertRulePayload,
  CreateBranchPayload,
  CreateCompanyPayload,
  CreateEquipmentPayload,
  CreateMaintenancePayload,
  InviteUserPayload,
  ManualTelemetryPayload,
  UpdateAlertRulePayload,
  UpdateBranchPayload,
  UpdateCompanyPayload,
  UpdateEquipmentPayload,
  UpdateMaintenancePayload,
  UpdateUserPayload,
  User,
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
// Cliente HTTP tipado por caminho OpenAPI (`paths` em openapi.d.ts)
// Garante em tempo de compilação que URL, método, path params, query params,
// corpo da requisição e tipo da resposta correspondem ao contrato gerado.
// ---------------------------------------------------------------------------

type HttpMethod = 'get' | 'post' | 'patch' | 'delete';

type PathsWithMethod<M extends HttpMethod> = {
  [P in keyof paths]: paths[P] extends Record<M, object> ? P : never;
}[keyof paths];

type OperationOf<M extends HttpMethod, P extends PathsWithMethod<M>> = paths[P][M];

type PathParamsOf<Op> = Op extends { parameters: { path: infer PP } } ? PP : undefined;
type QueryParamsOf<Op> = Op extends { parameters: { query?: infer QP } } ? QP : undefined;
type RequestBodyOf<Op> = Op extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : undefined;

type SuccessJsonOf<Op> = Op extends { responses: infer R }
  ? R extends { 200: { content: { 'application/json': infer D } } }
    ? D
    : R extends { 201: { content: { 'application/json': infer D } } }
      ? D
      : void
  : void;

type PathOption<Op> =
  PathParamsOf<Op> extends undefined ? { path?: never } : { path: PathParamsOf<Op> };
type QueryOption<Op> =
  QueryParamsOf<Op> extends undefined ? { query?: never } : { query?: QueryParamsOf<Op> };
type BodyOption<Op> =
  RequestBodyOf<Op> extends undefined ? { body?: never } : { body: RequestBodyOf<Op> };

type RequestOptions<Op> = PathOption<Op> &
  QueryOption<Op> &
  BodyOption<Op> & {
    skipAuthInterceptor?: boolean;
  };

function interpolatePath(template: string, params?: object): string {
  if (!params) return template;
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number') {
      entries.set(key, String(value));
    }
  }
  return template.replace(/\{([^}]+)\}/g, (_, key: string) =>
    encodeURIComponent(entries.get(key) ?? '')
  );
}

async function requestJson<M extends HttpMethod, P extends PathsWithMethod<M>>(
  method: M,
  pathTemplate: P,
  options?: RequestOptions<OperationOf<M, P>>
): Promise<SuccessJsonOf<OperationOf<M, P>>> {
  const pathParams = options?.path;
  const url = interpolatePath(
    pathTemplate,
    pathParams && typeof pathParams === 'object' ? pathParams : undefined
  );
  const response = await api.request<SuccessJsonOf<OperationOf<M, P>>>({
    method,
    url,
    params: options?.query,
    data: options?.body,
    skipAuthInterceptor: options?.skipAuthInterceptor,
  });
  return response.data;
}

async function requestBlob<P extends PathsWithMethod<'get'>>(
  pathTemplate: P,
  options?: RequestOptions<OperationOf<'get', P>>
): Promise<AxiosResponse<Blob>> {
  const pathParams = options?.path;
  const url = interpolatePath(
    pathTemplate,
    pathParams && typeof pathParams === 'object' ? pathParams : undefined
  );
  return api.get<Blob>(url, {
    params: options?.query,
    responseType: 'blob',
  });
}

// ---------------------------------------------------------------------------
// Contratos de Query Parameters (derivados diretamente de openapi.d.ts)
// ---------------------------------------------------------------------------

type OpenApiQuery<P extends keyof paths> = paths[P] extends {
  get: { parameters: { query?: infer Q } };
}
  ? NonNullable<Q>
  : never;

type GetCompaniesParams = OpenApiQuery<'/companies'>;
export type GetBranchesParams = OpenApiQuery<'/branches'>;
export type GetUsersParams = OpenApiQuery<'/users'>;
type GetEquipmentsParams = OpenApiQuery<'/equipments'>;
type GetMaintenanceRecordsParams = OpenApiQuery<'/equipments/{equipment_id}/maintenance-records'>;
type GetRealtimeTelemetryParams = OpenApiQuery<'/telemetry/realtime'>;
type GetTelemetryOverviewParams = OpenApiQuery<'/telemetry/overview'>;
type GetTelemetryParams = OpenApiQuery<'/equipments/{equipment_id}/telemetry'>;
type ExportTelemetryParams = OpenApiQuery<'/equipments/{equipment_id}/telemetry/export'>;
export type GetAlertsParams = OpenApiQuery<'/alerts'>;
export type GetAlertStatisticsParams = OpenApiQuery<'/alerts/statistics'>;
export type GetAlertRulesParams = OpenApiQuery<'/alert-rules'>;
export type GetAuditLogsParams = OpenApiQuery<'/audit-logs'>;

// ---------------------------------------------------------------------------
// Autenticação, Perfil e Recuperação de Conta
// ---------------------------------------------------------------------------

export const login = async (email: string, password: string): Promise<User> => {
  const { access_token, refresh_token, user } = await requestJson('post', '/auth/login', {
    body: { email, password },
  });
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
      await requestJson('post', '/auth/logout');
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
  const user = await requestJson('get', '/auth/me');
  localStorage.setItem('user', JSON.stringify(user));
  return user;
};

export const updateProfile = async (name: string): Promise<User> => {
  const user = await requestJson('patch', '/auth/me', { body: { name } });
  localStorage.setItem('user', JSON.stringify(user));
  return user;
};

export const changePassword = async (currentPassword: string, newPassword: string) =>
  requestJson('post', '/auth/change-password', {
    body: { current_password: currentPassword, new_password: newPassword },
  });

export const forgotPassword = async (email: string) =>
  requestJson('post', '/auth/forgot-password', {
    body: { email },
    skipAuthInterceptor: true,
  });

export const resetPassword = async (token: string, newPassword: string) =>
  requestJson('post', '/auth/reset-password', {
    body: { token, new_password: newPassword },
    skipAuthInterceptor: true,
  });

export const acceptInvitation = async (token: string, password: string) =>
  requestJson('post', '/users/accept-invitation', {
    body: { token, password },
    skipAuthInterceptor: true,
  });

// ---------------------------------------------------------------------------
// Empresas, Filiais e Usuários
// ---------------------------------------------------------------------------

export const getCompanies = async (params: GetCompaniesParams = {}) =>
  requestJson('get', '/companies', { query: params });

export const getCompany = async (companyId: string) =>
  requestJson('get', '/companies/{company_id}', { path: { company_id: companyId } });

export const createCompany = async (payload: CreateCompanyPayload) =>
  requestJson('post', '/companies', { body: payload });

export const updateCompany = async (companyId: string, payload: UpdateCompanyPayload) =>
  requestJson('patch', '/companies/{company_id}', {
    path: { company_id: companyId },
    body: payload,
  });

export const deactivateCompany = async (companyId: string) =>
  requestJson('delete', '/companies/{company_id}', { path: { company_id: companyId } });

export const getBranches = async (params: GetBranchesParams = {}) =>
  requestJson('get', '/branches', { query: params });

export const createBranch = async (payload: CreateBranchPayload) =>
  requestJson('post', '/branches', { body: payload });

export const updateBranch = async (branchId: string, payload: UpdateBranchPayload) =>
  requestJson('patch', '/branches/{branch_id}', {
    path: { branch_id: branchId },
    body: payload,
  });

export const deleteBranch = async (branchId: string) =>
  requestJson('delete', '/branches/{branch_id}', { path: { branch_id: branchId } });

export const getUsers = async (params: GetUsersParams = {}) =>
  requestJson('get', '/users', { query: params });

export const inviteUser = async (userData: InviteUserPayload) =>
  requestJson('post', '/users/invite', { body: userData });

export const resendInvitation = async (userId: string) =>
  requestJson('post', '/users/{user_id}/resend-invitation', { path: { user_id: userId } });

export const updateUser = async (userId: string, payload: UpdateUserPayload) =>
  requestJson('patch', '/users/{user_id}', { path: { user_id: userId }, body: payload });

export const deactivateUser = async (userId: string) =>
  requestJson('delete', '/users/{user_id}', { path: { user_id: userId } });

// ---------------------------------------------------------------------------
// Equipamentos e Regras Aplicáveis
// ---------------------------------------------------------------------------

export const getEquipments = async (params: GetEquipmentsParams = {}) =>
  requestJson('get', '/equipments', { query: params });

export const getEquipment = async (equipmentId: string) =>
  requestJson('get', '/equipments/{equipment_id}', { path: { equipment_id: equipmentId } });

export const createEquipment = async (payload: CreateEquipmentPayload) =>
  requestJson('post', '/equipments', { body: payload });

export const updateEquipment = async (equipmentId: string, payload: UpdateEquipmentPayload) =>
  requestJson('patch', '/equipments/{equipment_id}', {
    path: { equipment_id: equipmentId },
    body: payload,
  });

export const deactivateEquipment = async (equipmentId: string) =>
  requestJson('delete', '/equipments/{equipment_id}', { path: { equipment_id: equipmentId } });

export const rotateEquipmentApiKey = async (equipmentId: string) =>
  requestJson('post', '/equipments/{equipment_id}/rotate-api-key', {
    path: { equipment_id: equipmentId },
  });

export const getEquipmentAlertRules = async (equipmentId: string) =>
  requestJson('get', '/equipments/{equipment_id}/alert-rules', {
    path: { equipment_id: equipmentId },
  });

export const getEquipmentMaintenanceRecords = async (
  equipmentId: string,
  params: GetMaintenanceRecordsParams = {}
) =>
  requestJson('get', '/equipments/{equipment_id}/maintenance-records', {
    path: { equipment_id: equipmentId },
    query: params,
  });

export const createMaintenanceRecord = async (
  equipmentId: string,
  payload: CreateMaintenancePayload
) =>
  requestJson('post', '/equipments/{equipment_id}/maintenance-records', {
    path: { equipment_id: equipmentId },
    body: payload,
  });

export const updateMaintenanceRecord = async (
  recordId: string,
  payload: UpdateMaintenancePayload
) =>
  requestJson('patch', '/maintenance-records/{record_id}', {
    path: { record_id: recordId },
    body: payload,
  });

export const deleteMaintenanceRecord = async (recordId: string) =>
  requestJson('delete', '/maintenance-records/{record_id}', { path: { record_id: recordId } });

// ---------------------------------------------------------------------------
// Telemetria em Tempo Real, Histórico, Exportação CSV e Entrada Manual Offline
// ---------------------------------------------------------------------------

export const getRealtimeTelemetry = async (params: GetRealtimeTelemetryParams = {}) =>
  requestJson('get', '/telemetry/realtime', { query: params });

export const getTelemetryOverview = async (params: GetTelemetryOverviewParams = {}) =>
  requestJson('get', '/telemetry/overview', { query: params });

export const getEquipmentTelemetry = async (
  equipmentId: string,
  params: GetTelemetryParams = {}
) =>
  requestJson('get', '/equipments/{equipment_id}/telemetry', {
    path: { equipment_id: equipmentId },
    query: params,
  });

export const exportEquipmentTelemetryCsv = async (
  equipmentId: string,
  params: ExportTelemetryParams = {}
): Promise<AxiosResponse<Blob>> =>
  requestBlob('/equipments/{equipment_id}/telemetry/export', {
    path: { equipment_id: equipmentId },
    query: params,
  });

export const submitManualTelemetry = async (
  equipmentId: string,
  payload: ManualTelemetryPayload
) =>
  requestJson('post', '/equipments/{equipment_id}/telemetry/manual', {
    path: { equipment_id: equipmentId },
    body: payload,
  });

// ---------------------------------------------------------------------------
// Alertas, Estatísticas e Regras de Alerta
// ---------------------------------------------------------------------------

export const getAlerts = async (params: GetAlertsParams = {}) =>
  requestJson('get', '/alerts', { query: params });

export const getAlertStatistics = async (params: GetAlertStatisticsParams = {}) =>
  requestJson('get', '/alerts/statistics', { query: params });

export const exportAlertsCsv = async (
  params: GetAlertsParams = {}
): Promise<AxiosResponse<Blob>> =>
  requestBlob('/alerts/export', { query: params });

export const getAlert = async (alertId: string) =>
  requestJson('get', '/alerts/{alert_id}', { path: { alert_id: alertId } });

export const acknowledgeAlert = async (alertId: string, notes = '') =>
  requestJson('post', '/alerts/{alert_id}/acknowledge', {
    path: { alert_id: alertId },
    body: { notes: notes?.trim() ? notes.trim() : null },
  });

export const resolveAlert = async (alertId: string) =>
  requestJson('post', '/alerts/{alert_id}/resolve', { path: { alert_id: alertId } });

export const getAlertRules = async (params: GetAlertRulesParams = {}) =>
  requestJson('get', '/alert-rules', { query: params });

export const createAlertRule = async (payload: CreateAlertRulePayload) =>
  requestJson('post', '/alert-rules', { body: payload });

export const updateAlertRule = async (ruleId: string, payload: UpdateAlertRulePayload) =>
  requestJson('patch', '/alert-rules/{rule_id}', {
    path: { rule_id: ruleId },
    body: payload,
  });

export const deleteAlertRule = async (ruleId: string) =>
  requestJson('delete', '/alert-rules/{rule_id}', { path: { rule_id: ruleId } });

export const getAlertRuleStatistics = async (ruleId: string) =>
  requestJson('get', '/alert-rules/{rule_id}/statistics', { path: { rule_id: ruleId } });

// ---------------------------------------------------------------------------
// Trilha de Auditoria Imutável (Global Admin)
// ---------------------------------------------------------------------------

export const getAuditLogs = async (params: GetAuditLogsParams = {}) =>
  requestJson('get', '/audit-logs', { query: params });
