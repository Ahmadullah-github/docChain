import { useEffect, useMemo, useState } from "react";
import { adminApi, documentApi, routingRulesApi, signatureApi } from "../../api";
import type {
  AdminAssignment,
  AuditLog,
  DocumentListItem,
  DocumentType,
  JsonRecord,
  Organization,
  Position,
  RoutingRule,
  Unit,
  UserListItem
} from "../../api";
import { AdminPageHeader } from "../../components/admin";
import {
  buildReportIssues,
  buildReportRows,
  ReportBuilder,
  ReportCatalog,
  ReportGovernanceReminder,
  ReportInsightPanel,
  ReportInspector,
  ReportIssueQueue,
  ReportStats
} from "../../components/admin/reports";
import type { ReportsPageData } from "../../components/admin/reports";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";

const emptyData: ReportsPageData = {
  assignments: [],
  auditLogs: [],
  documentTypes: [],
  documents: [],
  organizations: [],
  positions: [],
  routingRules: [],
  serialRules: [],
  signatureRules: [],
  units: [],
  users: [],
  visibilityRules: []
};

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function chooseDefaultReport(rows: ReturnType<typeof buildReportRows>) {
  return rows.find((row) => row.status === "ready")
    || rows.find((row) => row.status === "review")
    || rows[0]
    || null;
}

export function AdminReportsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<ReportsPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState("last_30_days");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadReports() {
      setLoading(true);

      const [
        assignments,
        auditLogs,
        documentTypes,
        documents,
        organizations,
        positions,
        routingRules,
        serialRules,
        signatureRules,
        units,
        users,
        visibilityRules
      ] = await Promise.all([
        safe(adminApi.assignments.list(), [] as AdminAssignment[]),
        safe(adminApi.auditLogs.list({ limit: 300 }), [] as AuditLog[]),
        safe(adminApi.documentTypes.list(), [] as DocumentType[]),
        safe(documentApi.list({ limit: 300 }), [] as DocumentListItem[]),
        safe(adminApi.organizations.list(), [] as Organization[]),
        safe(adminApi.positions.list(), [] as Position[]),
        safe(routingRulesApi.list({ limit: 300 }), [] as RoutingRule[]),
        safe(signatureApi.listSerialRules(), [] as JsonRecord[]),
        safe(signatureApi.listSignatureRules(), [] as JsonRecord[]),
        safe(adminApi.units.list(), [] as Unit[]),
        safe(adminApi.users.list(), [] as UserListItem[]),
        safe(adminApi.visibilityRules.list(), [] as JsonRecord[])
      ]);

      if (alive) {
        setData({
          assignments,
          auditLogs,
          documentTypes,
          documents,
          organizations,
          positions,
          routingRules,
          serialRules,
          signatureRules,
          units,
          users,
          visibilityRules
        });
        setLoading(false);
      }
    }

    void loadReports();

    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const reportRows = useMemo(() => buildReportRows(data), [data]);
  const issues = useMemo(() => buildReportIssues(data, reportRows), [data, reportRows]);

  useEffect(() => {
    const selectedStillExists = selectedReportId ? reportRows.some((row) => row.id === selectedReportId) : false;
    if (!selectedStillExists) {
      setSelectedReportId(chooseDefaultReport(reportRows)?.id || null);
    }
  }, [reportRows, selectedReportId]);

  const selectedReport = reportRows.find((row) => row.id === selectedReportId) || null;
  const stats = {
    activeAssignments: data.assignments.filter((assignment) => assignment.status === "active").length,
    auditEvents: data.auditLogs.length,
    documents: data.documents.length,
    reportPacks: reportRows.length,
    signatureRules: data.signatureRules.length,
    workflowRules: data.routingRules.length
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="reset" onClick={() => setRefreshKey((value) => value + 1)} variant="primary">
              {t("admin.reports.actions.refresh")}
            </Button>
            <Button icon="reports">{t("admin.reports.actions.newReport")}</Button>
            <Button icon="clock">{t("admin.reports.actions.schedule")}</Button>
            <Button icon="export">{t("admin.reports.actions.export")}</Button>
          </>
        )}
        description={t("admin.reports.description")}
        title={t("admin.reports.title")}
      />

      <ReportStats
        labels={{
          activeAssignments: t("admin.reports.stats.activeAssignments"),
          auditEvents: t("admin.reports.stats.auditEvents"),
          documents: t("admin.reports.stats.documents"),
          reportPacks: t("admin.reports.stats.reportPacks"),
          signatureRules: t("admin.reports.stats.signatureRules"),
          workflowRules: t("admin.reports.stats.workflowRules")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,.72fr)] min-[1800px]:grid-cols-[minmax(0,1.05fr)_minmax(24rem,.72fr)_minmax(27rem,.72fr)]">
        <div className="min-w-0">
          <ReportBuilder
            onSelectPeriod={setSelectedPeriod}
            onSelectReport={setSelectedReportId}
            reports={reportRows}
            selectedPeriod={selectedPeriod}
            selectedReport={selectedReport}
          />
        </div>
        <div className="min-w-0">
          <ReportInsightPanel reports={reportRows} selectedReport={selectedReport} />
        </div>
        <div className="min-w-0 xl:col-span-2 min-[1800px]:col-span-1">
          <ReportInspector selectedReport={selectedReport} />
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <ReportCatalog
          onSelectReport={setSelectedReportId}
          reports={reportRows}
          selectedReportId={selectedReportId}
        />
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <ReportGovernanceReminder />
          <ReportIssueQueue issues={issues} />
        </div>
      </section>
    </div>
  );
}
