import type { AdminAssignment, EntityId, Position, Unit, UnitType } from "../../../api";

export type UnitTypeOption = Pick<UnitType, "code" | "id" | "name">;

export type UnitLeadershipRow = {
  assignment: AdminAssignment;
  assignmentType: "primary" | "secondary" | "functional";
  canSign: boolean;
  personName: string;
  position: Position | null;
  positionTitle: string;
};

export type StructuralChangeRow = {
  date: string;
  id: string;
  request: string;
  requestedBy: string;
  status: "pending_review" | "draft" | "awaiting_approval";
  type: "create" | "update" | "reassign";
  unitName: string;
};

export type UnitCanvasMode = "tree" | "map";

export type UnitZoomLevel = "compact" | "normal" | "large";

export type UnitCardModel = {
  activeAssignments: number;
  depth: number;
  id: EntityId;
  name: string;
  nameLocal?: string | null;
  status: string;
  typeCode?: string;
  typeName: string;
  unit: Unit;
};
