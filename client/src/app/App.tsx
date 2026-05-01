import { Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { BrandLogo } from "../components/BrandLogo";
import { AdminShell, adminNavItems, LanguageSwitcher } from "../components/admin";
import { I18nProvider, useI18n } from "../i18n";
import { AdminAssignmentsPage } from "../pages/admin/AdminAssignmentsPage";
import { AdminAuditLogsPage } from "../pages/admin/AdminAuditLogsPage";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
import { AdminDocumentTypesPage } from "../pages/admin/AdminDocumentTypesPage";
import { AdminOrganizationsPage } from "../pages/admin/AdminOrganizationsPage";
import { AdminPositionsPage } from "../pages/admin/AdminPositionsPage";
import { AdminReportsPage } from "../pages/admin/AdminReportsPage";
import { AdminSearchPage } from "../pages/admin/AdminSearchPage";
import { AdminSerialSettingsPage } from "../pages/admin/AdminSerialSettingsPage";
import { AdminSignatureRulesPage } from "../pages/admin/AdminSignatureRulesPage";
import { AdminTemplatesPage } from "../pages/admin/AdminTemplatesPage";
import { AdminUnitsPage } from "../pages/admin/AdminUnitsPage";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage";
import { AdminWorkflowRulesPage } from "../pages/admin/AdminWorkflowRulesPage";
import { AdminPlaceholderPage } from "../pages/admin/AdminPlaceholderPage";
import { LoginPage } from "../pages/LoginPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { t } = useI18n();

  if (auth.loading) {
    return <div className="p-8 text-sm text-slate-600">{t("app.loadingSession")}</div>;
  }

  if (!auth.user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { t } = useI18n();

  if (auth.loading) {
    return <div className="p-8 text-sm text-slate-600">{t("app.loadingSession")}</div>;
  }

  if (!auth.user) {
    return <Navigate to="/login" replace />;
  }

  if (!auth.isAdmin) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-950">{t("admin.accessDenied.title")}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("admin.accessDenied.description")}</p>
        </div>
      </PublicShell>
    );
  }

  return children;
}

function PublicShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e8dcc8,transparent_35%),linear-gradient(135deg,#f6f1e8,#e8eef2)] text-slate-900">
      <header className="border-b border-black/10 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <BrandLogo alt={t("app.name")} className="h-10 w-10 rounded-xl" />
            <span>{t("app.name")}</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">
        {children}
      </main>
    </div>
  );
}

function AppRoutes() {
  const { t } = useI18n();

  return (
    <Routes>
      <Route
        path="/login"
        element={(
          <PublicShell>
            <LoginPage />
          </PublicShell>
        )}
      />
      <Route
        path="/"
        element={(
          <ProtectedRoute>
            <Navigate to="/admin/dashboard" replace />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin"
        element={(
          <AdminRoute>
            <AdminShell />
          </AdminRoute>
        )}
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="organizations" element={<AdminOrganizationsPage />} />
        <Route path="units" element={<AdminUnitsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="positions" element={<AdminPositionsPage />} />
        <Route path="assignments" element={<AdminAssignmentsPage />} />
        <Route path="workflow-rules" element={<AdminWorkflowRulesPage />} />
        <Route path="signature-rules" element={<AdminSignatureRulesPage />} />
        <Route path="serial-settings" element={<AdminSerialSettingsPage />} />
        <Route path="document-types" element={<AdminDocumentTypesPage />} />
        <Route path="templates" element={<AdminTemplatesPage />} />
        <Route path="audit-logs" element={<AdminAuditLogsPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="search" element={<AdminSearchPage />} />
        {adminNavItems
          .filter((item) => !["/admin/dashboard", "/admin/organizations", "/admin/units", "/admin/users", "/admin/positions", "/admin/assignments", "/admin/workflow-rules", "/admin/signature-rules", "/admin/serial-settings", "/admin/document-types", "/admin/templates", "/admin/audit-logs", "/admin/reports"].includes(item.to))
          .map((item) => (
            <Route
              element={<AdminPlaceholderPage title={t(item.labelKey)} />}
              key={item.to}
              path={item.to.replace("/admin/", "")}
            />
          ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </I18nProvider>
  );
}
