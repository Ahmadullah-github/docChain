import { useEffect, useState } from "react";
import { assignmentApi, documentApi, signatureApi } from "../api";
import type { Assignment, DocumentListItem, SignatureProfile } from "../api";
import { useAuth } from "../app/AuthContext";
import { useI18n } from "../i18n";

export function DashboardPage() {
  const auth = useAuth();
  const { t } = useI18n();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [signatureProfile, setSignatureProfile] = useState<SignatureProfile | null>(null);

  useEffect(() => {
    assignmentApi.listMine()
      .then(setAssignments)
      .catch(() => setAssignments([]));
    documentApi.list()
      .then(setDocuments)
      .catch(() => setDocuments([]));
    signatureApi.getProfile()
      .then(setSignatureProfile)
      .catch(() => setSignatureProfile(null));
  }, []);

  return (
    <section>
      <div className="rounded-[2rem] border border-black/10 bg-white/75 p-8 shadow-xl shadow-slate-900/10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">{t("dashboard.badge")}</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          {t("dashboard.description", { name: auth.user?.displayName })}
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-slate-900 p-6 text-white">
          <h2 className="text-lg font-semibold">{t("dashboard.backend.title")}</h2>
          <p className="mt-2 text-sm text-slate-300">{t("dashboard.backend.description")}</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t("dashboard.database.title")}</h2>
          <p className="mt-2 text-sm text-slate-600">{t("dashboard.database.description")}</p>
        </div>
        <div className="rounded-3xl bg-amber-700 p-6 text-white">
          <h2 className="text-lg font-semibold">{t("dashboard.signatureProfile.title")}</h2>
          <p className="mt-2 text-sm text-amber-50">
            {signatureProfile
              ? `${signatureProfile.status} - ${signatureProfile.activeOriginalFilename || t("dashboard.signatureProfile.assetEnrolled")}`
              : t("dashboard.signatureProfile.notEnrolled")}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-black/10 bg-white/80 p-6">
        <h2 className="text-xl font-semibold">{t("dashboard.assignments.title")}</h2>
        <div className="mt-4 space-y-3">
          {assignments.length ? assignments.map((assignment) => (
            <div className="rounded-2xl border border-slate-200 p-4" key={assignment.id}>
              <p className="font-medium">{assignment.positionTitle}</p>
              <p className="text-sm text-slate-600">{assignment.unitName} - {assignment.status}</p>
            </div>
          )) : (
            <p className="text-sm text-slate-600">{t("dashboard.assignments.empty")}</p>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-black/10 bg-white/80 p-6">
        <h2 className="text-xl font-semibold">{t("dashboard.documents.title")}</h2>
        <div className="mt-4 space-y-3">
          {documents.length ? documents.map((document) => (
            <div className="rounded-2xl border border-slate-200 p-4" key={document.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{document.subject}</p>
                  <p className="text-sm text-slate-600">
                    {document.officialSerial || document.internalReference} - {document.documentTypeName} - {document.currentHolderUnitName}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  {document.status}
                </span>
              </div>
            </div>
          )) : (
            <p className="text-sm text-slate-600">{t("dashboard.documents.empty")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
