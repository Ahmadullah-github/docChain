import { getJson, postJson } from "./http";
import type { DocumentWorkflowEvent, EntityId, ExecuteWorkflowActionInput, WorkflowAction } from "./types";

export const workflowApi = {
  listActions(documentId: EntityId) {
    return getJson<WorkflowAction[]>(`/api/documents/${documentId}/workflow-actions`);
  },

  execute(documentId: EntityId, input: ExecuteWorkflowActionInput) {
    return postJson<DocumentWorkflowEvent>(`/api/documents/${documentId}/workflow-actions`, input);
  },

  createEvent(documentId: EntityId, input: ExecuteWorkflowActionInput) {
    return postJson<DocumentWorkflowEvent>(`/api/documents/${documentId}/events`, input);
  }
};
