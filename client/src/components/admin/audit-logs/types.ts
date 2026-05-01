import type { AuditLog, EntityId } from "../../../api";

export type AuditRiskLevel = "low" | "medium" | "high";

export type AuditLogRow = {
  action: string;
  actionGroup: string;
  actor: string;
  actorAssignment: string;
  actorUserId: EntityId | null;
  createdAt: string;
  entityId: string;
  entityType: string;
  id: EntityId;
  ipAddress: string;
  metadataPreview: string;
  raw: AuditLog;
  riskLevel: AuditRiskLevel;
  summary: string;
  userAgent: string;
};

export type AuditLogStats = {
  adminChanges: number;
  documentEvents: number;
  highRisk: number;
  today: number;
  total: number;
  uniqueActors: number;
};
