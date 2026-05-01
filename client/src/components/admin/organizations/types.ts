import type { AdminAssignment, EntityId, Position, Unit, UnitType } from "../../../api";

export type UnitTreeNode = Unit & {
  children: UnitTreeNode[];
};

export type UnitAuthorityRow = {
  assignment: AdminAssignment;
  assignmentType: "primary" | "secondary" | "functional";
  canSign: boolean;
  personName: string;
  position: Position | null;
  positionTitle: string;
};

export type UnitDirectoryRow = {
  code: string;
  headPosition: string;
  id: EntityId;
  name: string;
  nameLocal?: string | null;
  parentUnitName: string;
  status: string;
  typeName: string;
  unit: Unit;
  userCount: number;
};

export type UnitTypeOption = Pick<UnitType, "code" | "id" | "name">;
