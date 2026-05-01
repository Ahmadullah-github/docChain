import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../../api";
import type { AuditLog, EntityId } from "../../api";
import { AdminModal, AdminPageHeader } from "../../components/admin";
import {
  AuditActorPanel,
  AuditGovernanceReminder,
  AuditLogDirectory,
  AuditLogInspector,
  AuditLogStats,
  AuditLogTimeline,
  buildAuditLogRows
} from "../../components/admin/audit-logs";
import type { AuditLogRow } from "../../components/admin/audit-logs";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";
import { downloadWorkbook } from "../../lib/workbook";

type AuditFilterForm = {
  action: string;
  actorUserId: string;
  dateFrom: string;
  dateTo: string;
  entityType: string;
  limit: string;
  q: string;
};

const defaultAuditFilters: AuditFilterForm = {
  action: "",
  actorUserId: "",
  dateFrom: "",
  dateTo: "",
  entityType: "",
  limit: "300",
  q: ""
};

const fieldClassName = "min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10";
const labelClassName = "space-y-1 text-sm font-semibold text-slate-700";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
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

function normalizeDateTimeForQuery(value: string, endOfMinute = false) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.replace("T", " ");
  return normalized.length === 16 ? `${normalized}:${endOfMinute ? "59" : "00"}` : normalized;
}

function toAuditLogQuery(filters: AuditFilterForm) {
  return {
    action: filters.action.trim() || undefined,
    actor_user_id: filters.actorUserId.trim() || undefined,
    date_from: normalizeDateTimeForQuery(filters.dateFrom),
    date_to: normalizeDateTimeForQuery(filters.dateTo, true),
    entity_type: filters.entityType.trim() || undefined,
    limit: filters.limit.trim() || defaultAuditFilters.limit,
    q: filters.q.trim() || undefined
  };
}

function metadataForExport(row: AuditLogRow) {
  const metadata = row.raw.metadata;
  if (!metadata) {
    return "";
  }

  return typeof metadata === "string" ? metadata : JSON.stringify(metadata);
}

function auditRowsForExport(rows: AuditLogRow[]) {
  return rows.map((row) => ({
    Action: row.action,
    Actor: row.actor,
    "Actor Assignment": row.actorAssignment,
    "Actor User ID": row.actorUserId || "",
    Entity: row.entityType,
    "Entity ID": row.entityId,
    Group: row.actionGroup,
    IP: row.ipAddress,
    Metadata: metadataForExport(row),
    Risk: row.riskLevel,
    Summary: row.summary,
    Time: row.createdAt,
    "User Agent": row.userAgent
  }));
}

function exportFilename(prefix: string) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `${prefix}-${stamp}.xlsx`;
}

function routeForEntity(row: AuditLogRow) {
  const entityId = row.entityId === "-" ? "" : row.entityId;
  const encodedId = encodeURIComponent(entityId);
  const entityType = row.entityType.toLowerCase().replaceAll("-", "_");
  const query = encodeURIComponent(entityId || row.entityType || row.action);

  if (entityType.includes("document_type")) {
    return `/admin/document-types${encodedId ? `?id=${encodedId}` : ""}`;
  }

  if (entityType.includes("document")) {
    return `/admin/search?q=${query}&type=document${encodedId ? `&id=${encodedId}` : ""}`;
  }

  if (entityType.includes("assignment")) {
    return `/admin/assignments${encodedId ? `?id=${encodedId}` : ""}`;
  }

  if (entityType.includes("position")) {
    return `/admin/positions${encodedId ? `?id=${encodedId}` : ""}`;
  }

  if (entityType.includes("unit")) {
    return `/admin/units${encodedId ? `?id=${encodedId}` : ""}`;
  }

  if (entityType.includes("organization")) {
    return `/admin/organizations${encodedId ? `?id=${encodedId}` : ""}`;
  }

  if (entityType.includes("user") || entityType.includes("person") || entityType.includes("role")) {
    return `/admin/users${encodedId ? `?id=${encodedId}` : ""}`;
  }

  if (entityType.includes("workflow")) {
    return "/admin/workflow-rules";
  }

  if (entityType.includes("signature")) {
    return "/admin/signature-rules";
  }

  if (entityType.includes("serial")) {
    return "/admin/serial-settings";
  }

  if (entityType.includes("template")) {
    return `/admin/templates${encodedId ? `?id=${encodedId}` : ""}`;
  }

  return `/admin/search?q=${query}`;
}

export function AdminAuditLogsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedLogId, setSelectedLogId] = useState<EntityId | null>(null);
  const [filters, setFilters] = useState<AuditFilterForm>(defaultAuditFilters);
  const [draftFilters, setDraftFilters] = useState<AuditFilterForm>(defaultAuditFilters);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inspectorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadAuditLogs() {
      setLoading(true);
      setLoadError(null);

      try {
        const nextLogs = await adminApi.auditLogs.list(toAuditLogQuery(filters));

        if (alive) {
          setLogs(nextLogs);
        }
      } catch (error) {
        if (alive) {
          setLoadError(errorMessage(error));
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    void loadAuditLogs();

    return () => {
      alive = false;
    };
  }, [filters, refreshKey]);

  const rows = useMemo(() => buildAuditLogRows(logs), [logs]);
  const actionOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.action))).filter(Boolean).sort(), [logs]);
  const entityTypeOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.entityType))).filter(Boolean).sort(), [logs]);
  const activeFilterCount = useMemo(() => {
    const variableFilters = [
      filters.action,
      filters.actorUserId,
      filters.dateFrom,
      filters.dateTo,
      filters.entityType,
      filters.q
    ].filter((value) => value.trim()).length;

    return variableFilters + (filters.limit !== defaultAuditFilters.limit ? 1 : 0);
  }, [filters]);

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

  function scrollInspectorIntoView() {
    window.setTimeout(() => {
      inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function handleViewLog(logId: EntityId) {
    setSelectedLogId(logId);
    scrollInspectorIntoView();
  }

  async function exportAuditLogs(exportRows: AuditLogRow[], filename = "docchain-audit-logs.xlsx") {
    if (!exportRows.length) {
      return;
    }

    setExporting(true);
    try {
      await downloadWorkbook(filename, [
        {
          name: "Audit Logs",
          rows: auditRowsForExport(exportRows)
        }
      ]);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ ...draftFilters });
    setFilterModalOpen(false);
  }

  function handleClearFilters() {
    setDraftFilters({ ...defaultAuditFilters });
    setFilters({ ...defaultAuditFilters });
  }

  function openFilterModal() {
    setDraftFilters({ ...filters });
    setFilterModalOpen(true);
  }

  function viewEntity(row: AuditLogRow) {
    navigate(routeForEntity(row));
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button disabled={loading} icon="reset" onClick={() => setRefreshKey((value) => value + 1)} variant="primary">
              {t("admin.auditLogs.actions.refresh")}
            </Button>
            <Button icon="filter" onClick={openFilterModal}>
              {activeFilterCount ? `${t("admin.auditLogs.actions.advancedFilters")} (${activeFilterCount})` : t("admin.auditLogs.actions.advancedFilters")}
            </Button>
            <Button disabled={exporting || !rows.length} icon="export" onClick={() => void exportAuditLogs(rows, exportFilename("docchain-audit-logs"))}>
              {t("admin.auditLogs.actions.exportLogs")}
            </Button>
          </>
        )}
        description={t("admin.auditLogs.description")}
        title={t("admin.auditLogs.title")}
      />

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {loadError}
        </div>
      ) : null}

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
            onExportLog={(row) => void exportAuditLogs([row], exportFilename(`docchain-audit-event-${row.id}`))}
            onSelectLog={setSelectedLogId}
            onViewLog={handleViewLog}
            rows={rows}
            selectedLogId={selectedLogId}
          />
        </div>
        <div className="min-w-0">
          <AuditActorPanel onSelectLog={setSelectedLogId} rows={rows} selectedLog={selectedLog} />
        </div>
        <div className="min-w-0 xl:col-span-2 min-[1800px]:col-span-1" ref={inspectorRef}>
          <AuditLogInspector
            onExportLog={(row) => void exportAuditLogs([row], exportFilename(`docchain-audit-event-${row.id}`))}
            onViewEntity={viewEntity}
            selectedLog={selectedLog}
          />
        </div>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,.55fr)]">
        <div className="min-w-0">
          <AuditLogTimeline onSelectLog={setSelectedLogId} rows={rows} selectedLogId={selectedLogId} />
        </div>
        <div className="min-w-0">
          <AuditGovernanceReminder />
        </div>
      </section>

      <AdminModal
        description={t("admin.auditLogs.filters.description")}
        footer={(
          <>
            <Button onClick={() => setFilterModalOpen(false)}>{t("admin.auditLogs.filters.close")}</Button>
            <Button disabled={loading} icon="reset" onClick={handleClearFilters}>{t("admin.auditLogs.filters.clear")}</Button>
            <Button disabled={loading} form="audit-log-filter-form" icon="filter" type="submit" variant="primary">{t("admin.auditLogs.filters.apply")}</Button>
          </>
        )}
        onClose={() => setFilterModalOpen(false)}
        open={filterModalOpen}
        title={t("admin.auditLogs.filters.title")}
      >
        <form className="grid gap-4 sm:grid-cols-2" id="audit-log-filter-form" onSubmit={handleApplyFilters}>
          <label className={`${labelClassName} sm:col-span-2`}>
            {t("admin.auditLogs.filters.q")}
            <input
              className={fieldClassName}
              maxLength={160}
              onChange={(event) => setDraftFilters({ ...draftFilters, q: event.target.value })}
              value={draftFilters.q}
            />
          </label>
          <label className={labelClassName}>
            {t("admin.auditLogs.filters.action")}
            <input
              className={`${fieldClassName} force-ltr text-start`}
              list="audit-log-action-options"
              maxLength={120}
              onChange={(event) => setDraftFilters({ ...draftFilters, action: event.target.value })}
              value={draftFilters.action}
            />
          </label>
          <label className={labelClassName}>
            {t("admin.auditLogs.filters.entityType")}
            <input
              className={`${fieldClassName} force-ltr text-start`}
              list="audit-log-entity-type-options"
              maxLength={120}
              onChange={(event) => setDraftFilters({ ...draftFilters, entityType: event.target.value })}
              value={draftFilters.entityType}
            />
          </label>
          <label className={labelClassName}>
            {t("admin.auditLogs.filters.actorUserId")}
            <input
              className={`${fieldClassName} force-ltr text-start`}
              min={1}
              onChange={(event) => setDraftFilters({ ...draftFilters, actorUserId: event.target.value })}
              type="number"
              value={draftFilters.actorUserId}
            />
          </label>
          <label className={labelClassName}>
            {t("admin.auditLogs.filters.limit")}
            <input
              className={`${fieldClassName} force-ltr text-start`}
              max={500}
              min={1}
              onChange={(event) => setDraftFilters({ ...draftFilters, limit: event.target.value })}
              required
              type="number"
              value={draftFilters.limit}
            />
          </label>
          <label className={labelClassName}>
            {t("admin.auditLogs.filters.dateFrom")}
            <input
              className={`${fieldClassName} force-ltr text-start`}
              onChange={(event) => setDraftFilters({ ...draftFilters, dateFrom: event.target.value })}
              type="datetime-local"
              value={draftFilters.dateFrom}
            />
          </label>
          <label className={labelClassName}>
            {t("admin.auditLogs.filters.dateTo")}
            <input
              className={`${fieldClassName} force-ltr text-start`}
              onChange={(event) => setDraftFilters({ ...draftFilters, dateTo: event.target.value })}
              type="datetime-local"
              value={draftFilters.dateTo}
            />
          </label>
          <datalist id="audit-log-action-options">
            {actionOptions.map((action) => (
              <option key={action} value={action} />
            ))}
          </datalist>
          <datalist id="audit-log-entity-type-options">
            {entityTypeOptions.map((entityType) => (
              <option key={entityType} value={entityType} />
            ))}
          </datalist>
        </form>
      </AdminModal>
    </div>
  );
}
