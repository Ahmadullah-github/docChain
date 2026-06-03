import type { AdminAssignment, EntityId, Position, Unit } from "../../../api";

export type PositionAuthorityBand =
  | "executive"
  | "academic"
  | "unit"
  | "review"
  | "administrative"
  | "operational";

export type PositionAdminRow = {
  activeAssignments: AdminAssignment[];
  assignments: AdminAssignment[];
  authorityBand: PositionAuthorityBand;
  canSign: boolean;
  currentHolder: string;
  holderCount: number;
  id: EntityId;
  lastUpdated: string;
  levelLabel: string;
  multiUnit: boolean;
  position: Position;
  primaryAssignment: AdminAssignment | null;
  primaryUnit: Unit | null;
  reportsTo: Position | null;
  status: string;
  unitScope: string;
  unitTypeCode: string;
  unitTypeLabel: string;
  units: Unit[];
};
