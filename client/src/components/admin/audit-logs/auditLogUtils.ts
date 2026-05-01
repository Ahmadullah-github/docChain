import type { AuditLog, JsonRecord } from "../../../api";
import type { AuditLogRow, AuditRiskLevel } from "./types";

type BadgeTone = "green" | "amber" | "red" | "blue" | "slate";

export function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function formatLabel(value?: string | null, fallback = "-") {
  if (!value) {
    return fallback;
  }

  return value
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return String(value).replace("T", " ").slice(0, 16);
}

export function riskTone(riskLevel: AuditRiskLevel): BadgeTone {
  switch (riskLevel) {
    case "high":
      return "red";
    case "medium":
      return "amber";
    case "low":
      return "blue";
  }
}

export function groupTone(group: string): BadgeTone {
  switch (group) {
    case "auth":
      return "amber";
    case "admin":
      return "blue";
    case "signature":
    case "serial":
      return "green";
    case "verification":
    case "integration":
      return "red";
    default:
      return "slate";
  }
}

function stringifyMetadata(metadata: AuditLog["metadata"]) {
  if (!metadata) {
    return "{}";
  }

  if (typeof metadata === "string") {
    return metadata;
  }

  try {
    return JSON.stringify(metadata);
  } catch {
    return "{}";
  }
}

function actionGroup(action: string) {
  const group = action.split(".")[0] || "system";
  if (group === "admin") {
    return "admin";
  }
  return group;
}

function riskFor(action: string, entityType: string): AuditRiskLevel {
  const normalized = `${action}.${entityType}`.toLowerCase();

  if (
    normalized.includes("delete")
    || normalized.includes("disable")
    || normalized.includes("status_update")
    || normalized.includes("role")
    || normalized.includes("permission")
    || normalized.includes("api_client")
    || normalized.includes("verification")
  ) {
    return "high";
  }

  if (
    normalized.includes("update")
    || normalized.includes("create")
    || normalized.includes("sign")
    || normalized.includes("serial")
    || normalized.includes("transmission")
    || normalized.includes("assignment")
  ) {
    return "medium";
  }

  return "low";
}

function actorFor(log: AuditLog) {
  return log.actorDisplayName || log.actorUsername || (log.actorUserId ? `User #${log.actorUserId}` : "System");
}

function actorAssignmentFor(log: AuditLog) {
  return [log.actorPositionTitle, log.actorUnitName].filter(Boolean).join(" · ") || "-";
}

export function buildAuditLogRows(logs: AuditLog[]): AuditLogRow[] {
  return logs.map((log) => {
    const metadata = stringifyMetadata(log.metadata);
    const group = actionGroup(log.action);
    const entityType = log.entityType || "system";
    const entityId = log.entityId || "-";

    return {
      action: log.action,
      actionGroup: group,
      actor: actorFor(log),
      actorAssignment: actorAssignmentFor(log),
      actorUserId: log.actorUserId ?? null,
      createdAt: formatDateTime(log.createdAt),
      entityId,
      entityType,
      id: log.id,
      ipAddress: log.ipAddress || "-",
      metadataPreview: metadata.length > 180 ? `${metadata.slice(0, 180)}...` : metadata,
      raw: log,
      riskLevel: riskFor(log.action, entityType),
      summary: `${formatLabel(log.action)} · ${formatLabel(entityType)} ${entityId !== "-" ? `#${entityId}` : ""}`.trim(),
      userAgent: log.userAgent || "-"
    };
  });
}

export function metadataObject(log: AuditLogRow): JsonRecord | null {
  const metadata = log.raw.metadata;
  if (!metadata) {
    return null;
  }

  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : null;
    } catch {
      return null;
    }
  }

  return metadata;
}

export function rowMatchesSearch(row: AuditLogRow, search: string) {
  if (!search) {
    return true;
  }

  return [
    row.action,
    row.actionGroup,
    row.actor,
    row.actorAssignment,
    row.entityId,
    row.entityType,
    row.ipAddress,
    row.metadataPreview,
    row.riskLevel,
    row.summary,
    row.userAgent
  ].some((value) => value.toLowerCase().includes(search));
}
