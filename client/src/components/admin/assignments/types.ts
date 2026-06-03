import type { AdminAssignment, EntityId, Person, Position, Unit } from "../../../api";

export type AssignmentType = "primary" | "delegated" | "temporary" | "pending";
export type AssignmentSignEligibility = "yes" | "optional" | "no";

export type AssignmentAdminRow = {
  assignment: AdminAssignment;
  assignmentCode: string;
  assignmentType: AssignmentType;
  authorityLabel: string;
  authorityScope: string;
  canSign: boolean;
  delegatedAssignments: AdminAssignment[];
  displayName: string;
  endingSoon: boolean;
  id: EntityId;
  lastUpdated: string;
  localName: string;
  person: Person | null;
  position: Position | null;
  reportsTo: Position | null;
  signEligibility: AssignmentSignEligibility;
  status: string;
  unit: Unit | null;
};
