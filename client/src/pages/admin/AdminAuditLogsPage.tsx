import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../api";
import type { AuditLog, EntityId } from "../../api";
import { AdminPageHeader } from "../../components/admin";
import {
  AuditActorPanel,
  AuditGovernanceReminder,
  AuditLogDirectory,
  AuditLogInspector,
  AuditLogStats,
  AuditLogTimeline,
  buildAuditLogRows
} from "../../components/admin/audit-logs";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function isToday(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function chooseDefaultLog(rows: ReturnType<typeof buildAuditLogRows>) {
  return rows[0] || null;
}

export function AdminAuditLogsPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedLogId, setSelectedLogId] = useState<EntityId | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadAuditLogs() {
      setLoading(true);
      const nextLogs = await safe(adminApi.auditLogs.list({ limit: 300 }), [] as AuditLog[]);

      if (alive) {
        setLogs(nextLogs);
        setLoading(false);
      }
    }

    void loadAuditLogs();

    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const rows = useMemo(() => buildAuditLogRows(logs), [logs]);

  useEffect(() => {
    const selectedStillExists = selectedLogId ? rows.some((row) => row.id === selectedLogId) : false;
    if (!selectedStillExists) {
      setSelectedLogId(chooseDefaultLog(rows)?.id || null);
    }
  }, [rows, selectedLogId]);

  const selectedLog = rows.find((row) => row.id === selectedLogId) || null;
  const stats = {
    adminChanges: rows.filter((row) => row.actionGroup === "admin").length,
    documentEvents: rows.filter((row) => ["document", "workflow", "transmission"].includes(row.actionGroup)).length,
    highRisk: rows.filter((row) => row.riskLevel === "high").length,
    today: logs.filter((log) => isToday(log.createdAt)).length,
    total: rows.length,
    uniqueActors: new Set(rows.map((row) => row.actorUserId || row.actor).filter(Boolean)).size
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="reset" onClick={() => setRefreshKey((value) => value + 1)} variant="primary">
              {t("admin.auditLogs.actions.refresh")}
            </Button>
            <Button icon="filter">{t("admin.auditLogs.actions.advancedFilters")}</Button>
            <Button icon="export">{t("admin.auditLogs.actions.exportLogs")}</Button>
          </>
        )}
        description={t("admin.auditLogs.description")}
        title={t("admin.auditLogs.title")}
      />

      <AuditLogStats
        labels={{
          adminChanges: t("admin.auditLogs.stats.adminChanges"),
          documentEvents: t("admin.auditLogs.stats.documentEvents"),
          highRisk: t("admin.auditLogs.stats.highRisk"),
          today: t("admin.auditLogs.stats.today"),
          total: t("admin.auditLogs.stats.total"),
          uniqueActors: t("admin.auditLogs.stats.uniqueActors")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,.72fr)] min-[1800px]:grid-cols-[minmax(0,1.05fr)_minmax(24rem,.72fr)_minmax(27rem,.72fr)]">
        <div className="min-w-0">
          <AuditLogDirectory
            onSelectLog={setSelectedLogId}
            rows={rows}
            selectedLogId={selectedLogId}
          />
        </div>
        <div className="min-w-0">
          <AuditActorPanel rows={rows} selectedLog={selectedLog} />
        </div>
        <div className="min-w-0 xl:col-span-2 min-[1800px]:col-span-1">
          <AuditLogInspector selectedLog={selectedLog} />
        </div>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,.55fr)]">
        <div className="min-w-0">
          <AuditLogTimeline rows={rows} />
        </div>
        <div className="min-w-0">
          <AuditGovernanceReminder />
        </div>
      </section>
    </div>
  );
}
