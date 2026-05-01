import type { AdminAssignment, EntityId, Position, Unit } from "../../../api";
import {
  buildAuthorityRows,
  buildUnitTree,
  chooseHeadAuthority,
  collectUnitIds,
  filterUnitTree,
  formatDate,
  formatStatus,
  getActiveAssignmentsForUnit,
  iconForUnit,
  normalizeSearch,
  unitMatchesSearch
} from "../organizations/organizationUtils";
import type { UnitTreeNode } from "../organizations/types";
import type { StructuralChangeRow, UnitCardModel, UnitLeadershipRow } from "./types";

export {
  buildUnitTree,
  collectUnitIds,
  filterUnitTree,
  formatDate,
  formatStatus,
  getActiveAssignmentsForUnit,
  iconForUnit,
  normalizeSearch,
  unitMatchesSearch
};

export function countHierarchyLevels(units: Unit[]) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  let maxDepth = 0;

  for (const unit of units) {
    let depth = 1;
    let parentId = unit.parent_unit_id || null;
    const seen = new Set<EntityId>([unit.id]);

    while (parentId && byId.has(parentId) && !seen.has(parentId)) {
      seen.add(parentId);
      depth += 1;
      parentId = byId.get(parentId)?.parent_unit_id || null;
    }

    maxDepth = Math.max(maxDepth, depth);
  }

  return maxDepth;
}

export function countLeafUnits(units: Unit[]) {
  const parentIds = new Set(units.map((unit) => unit.parent_unit_id).filter(Boolean));
  return units.filter((unit) => !parentIds.has(unit.id)).length;
}

export function countRootUnits(units: Unit[]) {
  return units.filter((unit) => !unit.parent_unit_id).length;
}

export function countChildren(unitId: EntityId, units: Unit[]) {
  return units.filter((unit) => unit.parent_unit_id === unitId).length;
}

export function workflowScopeForUnit(unit: Unit | null) {
  if (!unit) {
    return "-";
  }

  switch (unit.unitTypeCode) {
    case "faculty":
      return "Internal + Faculty Routing";
    case "department":
      return "Department Routing";
    case "committee":
      return "Committee Workflow";
    case "vice_chancellery":
      return "Executive Routing";
    case "university":
      return "University Rule Matrix";
    default:
      return "Internal Directory";
  }
}

export function visibilityForUnit(unit: Unit | null) {
  if (!unit) {
    return "-";
  }

  return unit.status === "active" ? "Included in directory" : "Limited visibility";
}

export function buildLeadershipRows(assignments: AdminAssignment[], positionsById: Map<EntityId, Position>) {
  return buildAuthorityRows(assignments, positionsById) as UnitLeadershipRow[];
}

export function chooseLeadershipHead(rows: UnitLeadershipRow[]) {
  return chooseHeadAuthority(rows);
}

export function flattenTreeLevels(nodes: UnitTreeNode[], assignmentsByUnitId: Map<EntityId, AdminAssignment[]>) {
  const levels: UnitCardModel[][] = [];

  const walk = (items: UnitTreeNode[], depth: number) => {
    if (!levels[depth]) {
      levels[depth] = [];
    }

    for (const item of items) {
      levels[depth].push({
        activeAssignments: assignmentsByUnitId.get(item.id)?.filter((assignment) => assignment.status === "active").length || 0,
        depth,
        id: item.id,
        name: item.name,
        nameLocal: item.name_local,
        status: item.status,
        typeCode: item.unitTypeCode,
        typeName: item.unitTypeName || item.unitTypeCode || "-",
        unit: item
      });
      walk(item.children, depth + 1);
    }
  };

  walk(nodes, 0);
  return levels.filter(Boolean);
}

export function buildChangeQueue(): StructuralChangeRow[] {
  return [];
}
