import { getJson, postJson } from "./http";
import type { Assignment, EntityId, SelectActiveAssignmentResponse } from "./types";

export const assignmentApi = {
  listMine() {
    return getJson<Assignment[]>("/api/assignments/my");
  },

  selectActive(assignmentId: EntityId) {
    return postJson<SelectActiveAssignmentResponse>("/api/assignments/select-active", { assignmentId });
  }
};
