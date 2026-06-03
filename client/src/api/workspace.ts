import { getJson } from "./http";
import type {
  EntityId,
  WorkspaceReference,
  WorkspaceSummary,
  WorkspaceTargets,
  WorkspaceTransmissionTargets,
  WorkspaceWorkItem
} from "./types";

export type WorkItemTypeFilter = "activity" | "all" | "notifications" | "signatures" | "tasks" | "unit";

export type WorkspaceTargetsQuery = {
  action?: string;
  document_id: EntityId;
  q?: string;
};

export type WorkspaceTransmissionTargetsQuery = {
  limit?: number;
  q?: string;
};

export const workspaceApi = {
  summary() {
    return getJson<WorkspaceSummary>("/api/workspace/summary");
  },

  workItems(query?: { type?: WorkItemTypeFilter; limit?: number }) {
    return getJson<WorkspaceWorkItem[]>("/api/workspace/work-items", query);
  },

  reference() {
    return getJson<WorkspaceReference>("/api/workspace/reference");
  },

  targets(query: WorkspaceTargetsQuery) {
    return getJson<WorkspaceTargets>("/api/workspace/targets", query);
  },

  transmissionTargets(query?: WorkspaceTransmissionTargetsQuery) {
    return getJson<WorkspaceTransmissionTargets>("/api/workspace/transmission-targets", query);
  }
};
