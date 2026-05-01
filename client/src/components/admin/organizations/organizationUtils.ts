import type { AdminAssignment, EntityId, Position, Unit } from "../../../api";
import type { IconName } from "../../ui";
import type { UnitAuthorityRow, UnitDirectoryRow, UnitTreeNode } from "./types";

export function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function buildUnitTree(units: Unit[]) {
  const byId = new Map<EntityId, UnitTreeNode>();
  for (const unit of units) {
    byId.set(unit.id, { ...unit, children: [] });
  }

  const roots: UnitTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_unit_id ? byId.get(node.parent_unit_id) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: UnitTreeNode[]) => {
    nodes.sort((left, right) => left.name.localeCompare(right.name));
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(roots);
  return roots;
}

export function collectUnitIds(nodes: UnitTreeNode[]) {
  const ids: EntityId[] = [];
  const walk = (items: UnitTreeNode[]) => {
    for (const item of items) {
      ids.push(item.id);
      walk(item.children);
    }
  };

  walk(nodes);
  return ids;
}

export function unitMatchesSearch(unit: Unit, search: string) {
  if (!search) {
    return true;
  }

  return [
    unit.name,
    unit.name_local,
    unit.code,
    unit.unitTypeCode,
    unit.unitTypeName,
    unit.parentUnitName,
    unit.organizationName
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}

export function filterUnitTree(nodes: UnitTreeNode[], search: string): UnitTreeNode[] {
  if (!search) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const children = filterUnitTree(node.children, search);
    if (unitMatchesSearch(node, search) || children.length) {
      return [{ ...node, children }];
    }

    return [];
  });
}

export function iconForUnit(unit: Pick<Unit, "unitTypeCode">): IconName {
  switch (unit.unitTypeCode) {
    case "university":
    case "faculty":
    case "department":
      return "building";
    case "vice_chancellery":
      return "hierarchy";
    case "committee":
      return "users";
    case "office":
      return "briefcase";
    default:
      return "document";
  }
}

export function formatStatus(value?: string | null) {
  return value || "unknown";
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return String(value).replace("T", " ").slice(0, 16);
}

export function getActiveAssignmentsForUnit(unitId: EntityId, assignments: AdminAssignment[]) {
  return assignments.filter((assignment) => assignment.unit_id === unitId && assignment.status === "active");
}

export function buildAuthorityRows(assignments: AdminAssignment[], positionsById: Map<EntityId, Position>) {
  return assignments.map<UnitAuthorityRow>((assignment) => {
    const position = positionsById.get(assignment.position_id) || null;
    const canSign = Boolean(position?.is_signing_authority);
    const assignmentType = assignment.is_primary ? "primary" : canSign ? "secondary" : "functional";

    return {
      assignment,
      assignmentType,
      canSign,
      personName: assignment.personDisplayName || "-",
      position,
      positionTitle: position?.title || assignment.positionTitle || "-"
    };
  });
}

export function chooseHeadAuthority(rows: UnitAuthorityRow[]) {
  return rows
    .slice()
    .sort((left, right) => {
      if (left.assignment.is_primary !== right.assignment.is_primary) {
        return left.assignment.is_primary ? -1 : right.assignment.is_primary ? 1 : 0;
      }

      return (right.position?.authority_level || 0) - (left.position?.authority_level || 0);
    })[0] || null;
}

export function buildDirectoryRows(
  units: Unit[],
  assignments: AdminAssignment[],
  positionsById: Map<EntityId, Position>,
  noParentLabel: string,
  noHeadLabel: string
) {
  return units.map<UnitDirectoryRow>((unit) => {
    const activeAssignments = getActiveAssignmentsForUnit(unit.id, assignments);
    const authorityRows = buildAuthorityRows(activeAssignments, positionsById);
    const head = chooseHeadAuthority(authorityRows);
    const userCount = new Set(activeAssignments.map((assignment) => assignment.person_id)).size;

    return {
      code: unit.code,
      headPosition: head?.positionTitle || noHeadLabel,
      id: unit.id,
      name: unit.name,
      nameLocal: unit.name_local,
      parentUnitName: unit.parentUnitName || noParentLabel,
      status: formatStatus(unit.status),
      typeName: unit.unitTypeName || unit.unitTypeCode || "-",
      unit,
      userCount
    };
  });
}
