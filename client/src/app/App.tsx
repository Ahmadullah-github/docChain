import { Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { BrandLogo } from "../components/BrandLogo";
import { AppShell } from "../components/app";
import { AdminShell, LanguageSwitcher } from "../components/admin";
import { I18nProvider, useI18n } from "../i18n";
import { AdminAssignmentsPage } from "../pages/admin/AdminAssignmentsPage";
import { AdminDocumentSettingsPage } from "../pages/admin/AdminDocumentSettingsPage";
import { AdminDocumentTypesPage } from "../pages/admin/AdminDocumentTypesPage";
import { AdminOrganizationsPage } from "../pages/admin/AdminOrganizationsPage";
import { AdminPositionsPage } from "../pages/admin/AdminPositionsPage";
import { AdminSearchPage } from "../pages/admin/AdminSearchPage";
import { AdminSerialSettingsPage } from "../pages/admin/AdminSerialSettingsPage";
import {
  AdminTemplateBuilderPage,
  AdminTemplatesPage
} from "../pages/admin/AdminTemplatesPage";
import { AdminTemplateAdminPage } from "../pages/admin/templates/AdminTemplateAdminPage";
import { AdminTemplateLibraryPage } from "../pages/admin/templates/AdminTemplateLibraryPage";
import { AdminTemplatePublishPage } from "../pages/admin/templates/AdminTemplatePublishPage";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage";
import { ChangePasswordPage } from "../pages/ChangePasswordPage";
import { DocumentCreatePage } from "../pages/app/DocumentCreatePage";
import { DocumentDetailPage } from "../pages/app/DocumentDetailPage";
import { DocumentEditPage } from "../pages/app/DocumentEditPage";
import { DocumentsPage } from "../pages/app/DocumentsPage";
import { SignatureProfilePage } from "../pages/app/SignatureProfilePage";
import { WorkPage } from "../pages/app/WorkPage";
import { LoginPage } from "../pages/LoginPage";
import { SignatureUploadPage } from "../pages/SignatureUploadPage";
import { VerifyDocumentPage } from "../pages/VerifyDocumentPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { t } = useI18n();

  if (auth.loading) {
    return <div className="p-8 text-sm text-slate-600">{t("app.loadingSession")}</div>;
  }

  if (!auth.user) {
    return <Navigate to="/login" replace />;
  }

  if (auth.user.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
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

  if (auth.user.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
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
        path="/change-password"
        element={(
          <PublicShell>
            <ChangePasswordPage />
          </PublicShell>
        )}
      />
      <Route
        path="/verify/:token"
        element={(
          <PublicShell>
            <VerifyDocumentPage />
          </PublicShell>
        )}
      />
      <Route
        path="/signature-upload/:token"
        element={(
          <PublicShell>
            <SignatureUploadPage />
          </PublicShell>
        )}
      />
      <Route
        path="/"
        element={(
          <ProtectedRoute>
            <Navigate to="/app/work" replace />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/app"
        element={(
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        )}
      >
        <Route index element={<Navigate to="/app/work" replace />} />
        <Route path="work" element={<WorkPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="documents/new" element={<DocumentCreatePage />} />
        <Route path="documents/:documentId/edit" element={<DocumentEditPage />} />
        <Route path="documents/:documentId" element={<DocumentDetailPage />} />
        <Route path="signature-profile" element={<SignatureProfilePage />} />
      </Route>
      <Route
        path="/admin"
        element={(
          <AdminRoute>
            <AdminShell />
          </AdminRoute>
        )}
      >
        <Route index element={<Navigate to="/admin/organizations" replace />} />
        <Route path="dashboard" element={<Navigate to="/admin/organizations" replace />} />
        <Route path="organizations" element={<AdminOrganizationsPage />} />
        <Route path="units" element={<Navigate to="/admin/organizations" replace />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="positions" element={<AdminPositionsPage />} />
        <Route path="assignments" element={<AdminAssignmentsPage />} />
        <Route path="serial-settings" element={<AdminSerialSettingsPage />} />
        <Route path="document-types" element={<AdminDocumentTypesPage />} />
        <Route path="document-settings" element={<AdminDocumentSettingsPage />} />
        <Route path="templates" element={<AdminTemplatesPage />}>
          <Route index element={<Navigate to="/admin/templates/library" replace />} />
          <Route path="library" element={<AdminTemplateLibraryPage />} />
          <Route path="builder/new" element={<AdminTemplateBuilderPage />} />
          <Route path="builder/:templateId" element={<AdminTemplateBuilderPage />} />
          <Route path="publish/:templateId" element={<AdminTemplatePublishPage />} />
          <Route path="admin" element={<AdminTemplateAdminPage />} />
        </Route>
        <Route path="audit-logs" element={<Navigate to="/admin/organizations" replace />} />
        <Route path="reports" element={<Navigate to="/admin/organizations" replace />} />
        <Route path="settings" element={<Navigate to="/admin/organizations" replace />} />
        <Route path="search" element={<AdminSearchPage />} />
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
