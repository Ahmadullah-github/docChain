import type { JsonRecord } from "../../../api";
import type { ReportCategory, ReportIssue, ReportRow, ReportStatus, ReportsPageData } from "./types";

type BadgeTone = "green" | "amber" | "red" | "blue" | "slate";

export function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return String(value).replace("T", " ").slice(0, 16);
}

export function categoryTone(category: ReportCategory): BadgeTone {
  switch (category) {
    case "documents":
      return "blue";
    case "workflow":
      return "amber";
    case "structure":
      return "slate";
    case "authority":
      return "green";
    case "security":
      return "red";
    case "serial":
      return "blue";
  }
}

export function statusTone(status: ReportStatus): BadgeTone {
  switch (status) {
    case "ready":
      return "green";
    case "review":
      return "amber";
    case "empty":
      return "slate";
  }
}

function stringField(record: JsonRecord | null | undefined, key: string, fallback = "") {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function booleanField(record: JsonRecord | null | undefined, key: string) {
  const value = record?.[key];
  return value === true || value === 1 || value === "1" || value === "true";
}

function activeStatus(record: { status?: string }) {
  return record.status === "active";
}

function highRiskAuditCount(data: ReportsPageData) {
  return data.auditLogs.filter((log) => {
    const normalized = `${log.action}.${log.entityType}`.toLowerCase();
    return normalized.includes("delete")
      || normalized.includes("disable")
      || normalized.includes("status_update")
      || normalized.includes("role")
      || normalized.includes("permission")
      || normalized.includes("api_client")
      || normalized.includes("verification");
  }).length;
}

function latestDate(data: ReportsPageData) {
  const dates = [
    ...data.auditLogs.map((log) => log.createdAt),
    ...data.documents.map((document) => document.updatedAt || document.createdAt)
  ].filter(Boolean).sort().reverse();

  return formatDateTime(dates[0]);
}

function reportStatus(input: { primary: number; review?: boolean }) {
  if (!input.primary) {
    return "empty" as const;
  }

  return input.review ? "review" as const : "ready" as const;
}

export function buildReportRows(data: ReportsPageData): ReportRow[] {
  const activeAssignments = data.assignments.filter(activeStatus).length;
  const activeUsers = data.users.filter(activeStatus).length;
  const activeRoutingRules = data.routingRules.filter(activeStatus).length;
  const activeSignatureRules = data.signatureRules.filter((rule) => stringField(rule, "status", "draft") === "active").length;
  const serialRequiredTypes = data.documentTypes.filter((documentType) => documentType.requires_serial).length;
  const activeSerialRules = data.serialRules.filter((rule) => stringField(rule, "status", "draft") === "active").length;
  const defaultSerialRules = data.serialRules.filter((rule) => booleanField(rule, "is_default")).length;
  const workflowWarnings = Math.max(0, data.documentTypes.length - new Set(data.routingRules.map((rule) => rule.document_type_id).filter(Boolean)).size);
  const highRiskAuditEvents = highRiskAuditCount(data);
  const updatedAt = latestDate(data);

  return [
    {
      category: "documents",
      checks: [
        { labelKey: "dataAvailable", ok: data.documents.length > 0 },
        { labelKey: "coverageReady", ok: data.documentTypes.length > 0 },
        { labelKey: "auditReady", ok: data.auditLogs.length > 0 },
        { labelKey: "exportReady", ok: true }
      ],
      descriptionKey: "admin.reports.catalog.documents.description",
      id: "document-operations",
      metric: data.documents.length,
      metricLabelKey: "admin.reports.catalog.documents.metric",
      nameKey: "admin.reports.catalog.documents.name",
      secondaryMetric: data.documentTypes.length,
      secondaryMetricLabelKey: "admin.reports.catalog.documents.secondary",
      status: reportStatus({ primary: data.documents.length }),
      updatedAt
    },
    {
      category: "workflow",
      checks: [
        { labelKey: "dataAvailable", ok: data.routingRules.length > 0 },
        { labelKey: "coverageReady", ok: activeRoutingRules > 0 && activeSignatureRules > 0 },
        { labelKey: "auditReady", ok: data.auditLogs.length > 0 },
        { labelKey: "exportReady", ok: true }
      ],
      descriptionKey: "admin.reports.catalog.workflow.description",
      id: "workflow-coverage",
      metric: activeRoutingRules,
      metricLabelKey: "admin.reports.catalog.workflow.metric",
      nameKey: "admin.reports.catalog.workflow.name",
      secondaryMetric: activeSignatureRules,
      secondaryMetricLabelKey: "admin.reports.catalog.workflow.secondary",
      status: reportStatus({ primary: data.routingRules.length + data.signatureRules.length, review: workflowWarnings > 0 }),
      updatedAt
    },
    {
      category: "structure",
      checks: [
        { labelKey: "dataAvailable", ok: data.organizations.length > 0 || data.units.length > 0 },
        { labelKey: "coverageReady", ok: data.units.length > 0 && data.positions.length > 0 },
        { labelKey: "auditReady", ok: data.auditLogs.length > 0 },
        { labelKey: "exportReady", ok: true }
      ],
      descriptionKey: "admin.reports.catalog.structure.description",
      id: "structure-inventory",
      metric: data.units.length,
      metricLabelKey: "admin.reports.catalog.structure.metric",
      nameKey: "admin.reports.catalog.structure.name",
      secondaryMetric: data.positions.length,
      secondaryMetricLabelKey: "admin.reports.catalog.structure.secondary",
      status: reportStatus({ primary: data.organizations.length + data.units.length }),
      updatedAt
    },
    {
      category: "authority",
      checks: [
        { labelKey: "dataAvailable", ok: data.assignments.length > 0 },
        { labelKey: "coverageReady", ok: activeAssignments > 0 && data.positions.length > 0 },
        { labelKey: "auditReady", ok: data.auditLogs.length > 0 },
        { labelKey: "exportReady", ok: true }
      ],
      descriptionKey: "admin.reports.catalog.authority.description",
      id: "authority-assignments",
      metric: activeAssignments,
      metricLabelKey: "admin.reports.catalog.authority.metric",
      nameKey: "admin.reports.catalog.authority.name",
      secondaryMetric: data.positions.filter((position) => position.is_signing_authority).length,
      secondaryMetricLabelKey: "admin.reports.catalog.authority.secondary",
      status: reportStatus({ primary: data.assignments.length }),
      updatedAt
    },
    {
      category: "security",
      checks: [
        { labelKey: "dataAvailable", ok: data.auditLogs.length > 0 },
        { labelKey: "coverageReady", ok: activeUsers > 0 },
        { labelKey: "auditReady", ok: data.auditLogs.length > 0 },
        { labelKey: "exportReady", ok: true }
      ],
      descriptionKey: "admin.reports.catalog.security.description",
      id: "security-audit",
      metric: data.auditLogs.length,
      metricLabelKey: "admin.reports.catalog.security.metric",
      nameKey: "admin.reports.catalog.security.name",
      secondaryMetric: highRiskAuditEvents,
      secondaryMetricLabelKey: "admin.reports.catalog.security.secondary",
      status: reportStatus({ primary: data.auditLogs.length, review: highRiskAuditEvents > 0 }),
      updatedAt
    },
    {
      category: "serial",
      checks: [
        { labelKey: "dataAvailable", ok: data.serialRules.length > 0 },
        { labelKey: "coverageReady", ok: !serialRequiredTypes || (activeSerialRules > 0 && defaultSerialRules > 0) },
        { labelKey: "auditReady", ok: data.auditLogs.length > 0 },
        { labelKey: "exportReady", ok: true }
      ],
      descriptionKey: "admin.reports.catalog.serial.description",
      id: "serial-governance",
      metric: serialRequiredTypes,
      metricLabelKey: "admin.reports.catalog.serial.metric",
      nameKey: "admin.reports.catalog.serial.name",
      secondaryMetric: activeSerialRules,
      secondaryMetricLabelKey: "admin.reports.catalog.serial.secondary",
      status: reportStatus({ primary: serialRequiredTypes + data.serialRules.length, review: serialRequiredTypes > 0 && (!activeSerialRules || !defaultSerialRules) }),
      updatedAt
    }
  ];
}

export function buildReportIssues(data: ReportsPageData, rows: ReportRow[]): ReportIssue[] {
  const issues: ReportIssue[] = [];
  const workflowReport = rows.find((row) => row.id === "workflow-coverage");
  const serialReport = rows.find((row) => row.id === "serial-governance");

  if (!data.documents.length) {
    issues.push({ category: "documents", id: "no-documents", issue: "no_documents", severity: "medium" });
  }
  if (!data.assignments.some(activeStatus)) {
    issues.push({ category: "authority", id: "no-active-assignments", issue: "no_active_assignments", severity: "high" });
  }
  if (workflowReport?.status === "review") {
    issues.push({ category: "workflow", id: "workflow-warnings", issue: "workflow_warnings", severity: "medium" });
  }
  if (serialReport?.status === "review") {
    issues.push({ category: "serial", id: "serial-not-ready", issue: "serial_not_ready", severity: "medium" });
  }
  if (data.auditLogs.length < 5) {
    issues.push({ category: "security", id: "audit-sparse", issue: "audit_sparse", severity: "low" });
  }

  return issues;
}

export function rowMatchesSearch(row: ReportRow, search: string, labels: { name: string; description: string; category: string }) {
  if (!search) {
    return true;
  }

  return [
    labels.name,
    labels.description,
    labels.category,
    row.id,
    row.status
  ].some((value) => value.toLowerCase().includes(search));
}
