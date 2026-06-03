import type { AdminAssignment, EntityId, Person, Position, Unit, UserListItem } from "../../../api";

export type UserSetupStatus = "ready" | "pending" | "not_required" | "not_tracked";

export type UserAdminRow = {
  activeAssignments: AdminAssignment[];
  assignments: AdminAssignment[];
  canSign: boolean;
  id: EntityId;
  person: Person | null;
  position: Position | null;
  primaryAssignment: AdminAssignment | null;
  primaryUnit: Unit | null;
  roleLabel: string;
  setupStatus: UserSetupStatus;
  unit: Unit | null;
  user: UserListItem;
};
