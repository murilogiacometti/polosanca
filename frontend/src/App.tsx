import { lazy, type ReactNode, Suspense } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from './components/Layout/AppLayout';
import { useAuth } from './context/authContextObject';
import type { UserRole } from './types/models';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const AcceptInvitationPage = lazy(() => import('./pages/AcceptInvitationPage'));
const OperationsWorkspacePage = lazy(() => import('./pages/OperationsWorkspacePage'));
const LegacyEquipmentRedirect = lazy(() => import('./pages/LegacyEquipmentRedirect'));
const AlertsHubPage = lazy(() => import('./pages/AlertsHubPage'));
const AdminHubPage = lazy(() => import('./pages/AdminHubPage'));

function FullScreenLoader() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Spin size="large" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, initializing } = useAuth();

  if (initializing) {
    return <FullScreenLoader />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function RoleRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[];
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/operacao" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <Router>
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invitation" element={<AcceptInvitationPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            {/* 1. MONITORAMENTO — Zoom Semântico em 4 Níveis */}
            <Route path="/operacao" element={<OperationsWorkspacePage />} />
            <Route
              path="/operacao/empresas/:companyId"
              element={<OperationsWorkspacePage />}
            />
            <Route
              path="/operacao/empresas/:companyId/filiais/:branchId"
              element={<OperationsWorkspacePage />}
            />
            <Route
              path="/operacao/empresas/:companyId/filiais/:branchId/equipamentos/:equipmentId"
              element={<OperationsWorkspacePage />}
            />

            {/* 2. ALERTAS — Ocorrências + Regras e Limites */}
            <Route path="/alerts" element={<AlertsHubPage />} />

            {/* 3. ADMINISTRAÇÃO — Usuários e Permissões + Trilha de Auditoria */}
            <Route
              path="/admin"
              element={
                <RoleRoute allowedRoles={['global_admin', 'company_admin']}>
                  <AdminHubPage />
                </RoleRoute>
              }
            />

            {/* Redirecionamentos limpos de rotas legadas */}
            <Route path="/dashboard" element={<Navigate to="/operacao" replace />} />
            <Route path="/companies" element={<Navigate to="/operacao" replace />} />
            <Route path="/branches" element={<Navigate to="/operacao" replace />} />
            <Route path="/alert-rules" element={<Navigate to="/alerts?tab=rules" replace />} />
            <Route path="/users" element={<Navigate to="/admin?tab=users" replace />} />
            <Route path="/audit-logs" element={<Navigate to="/admin?tab=audit" replace />} />
            <Route path="/equipments/:id" element={<LegacyEquipmentRedirect />} />
          </Route>

          <Route path="*" element={<Navigate to="/operacao" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
