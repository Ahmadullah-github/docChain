import type { AdminAssignment, EntityId, Person, Position, Unit } from "../../../api";
import type { PositionAdminRow, PositionAuthorityBand } from "./types";

type BuildPositionRowsInput = {
  assignments: AdminAssignment[];
  persons: Person[];
  positions: Position[];
  units: Unit[];
};

export function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return String(value).replace("T", " ").slice(0, 16);
}

export function statusLabel(value?: string | null) {
  return value || "unknown";
}

export function authorityBandForLevel(level: number): PositionAuthorityBand {
  if (level >= 85) {
    return "executive";
  }

  if (level >= 70) {
    return "academic";
  }

  if (level >= 55) {
    return "unit";
  }

  if (level >= 40) {
    return "review";
  }

  if (level >= 20) {
    return "administrative";
  }

  return "operational";
}

function sortAssignments(left: AdminAssignment, right: AdminAssignment) {
  if (left.status !== right.status) {
    return left.status === "active" ? -1 : right.status === "active" ? 1 : 0;
  }

  if (left.is_primary !== right.is_primary) {
    return left.is_primary ? -1 : 1;
  }

  return left.id - right.id;
}

function uniqueUnits(assignments: AdminAssignment[], unitsById: Map<EntityId, Unit>, fallbackUnit: Unit | null) {
  const seen = new Set<EntityId>();
  const units: Unit[] = [];

  if (fallbackUnit) {
    seen.add(fallbackUnit.id);
    units.push(fallbackUnit);
  }

  for (const assignment of assignments) {
    const unit = unitsById.get(assignment.unit_id);
    if (unit && !seen.has(unit.id)) {
      seen.add(unit.id);
      units.push(unit);
    }
  }

  return units;
}

function holderName(assignment: AdminAssignment, personsById: Map<EntityId, Person>) {
  return assignment.personDisplayName || personsById.get(assignment.person_id)?.display_name || "-";
}

function compactList(values: string[], empty = "") {
  if (!values.length) {
    return empty;
  }

  if (values.length <= 2) {
    return values.join(", ");
  }

  return `${values.slice(0, 2).join(", ")} +${values.length - 2}`;
}

function inferUnitType(units: Unit[]) {
  const codes = Array.from(new Set(units.map((unit) => unit.unitTypeCode || "unknown")));
  const labels = Array.from(new Set(units.map((unit) => unit.unitTypeName || unit.unitTypeCode || "Unknown")));

  if (!units.length) {
    return { code: "unassigned", label: "" };
  }

  if (codes.length > 1) {
    return { code: "multi_unit", label: "" };
  }

  return { code: codes[0], label: labels[0] };
}

function reportsToFor(position: Position, positions: Position[]) {
  return positions
    .filter((candidate) => candidate.id !== position.id && candidate.authority_level > position.authority_level)
    .sort((left, right) => {
      const leftDistance = left.authority_level - position.authority_level;
      const rightDistance = right.authority_level - position.authority_level;
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      return left.title.localeCompare(right.title);
    })[0] || null;
}

export function buildPositionRows({ assignments, persons, positions, units }: BuildPositionRowsInput) {
  const assignmentsByPositionId = new Map<EntityId, AdminAssignment[]>();
  const personsById = new Map<EntityId, Person>(persons.map((person) => [person.id, person]));
  const unitsById = new Map<EntityId, Unit>(units.map((unit) => [unit.id, unit]));

  for (const assignment of assignments) {
    assignmentsByPositionId.set(assignment.position_id, [
      ...(assignmentsByPositionId.get(assignment.position_id) || []),
      assignment
    ]);
  }

  return positions
    .map<PositionAdminRow>((position) => {
      const positionAssignments = (assignmentsByPositionId.get(position.id) || []).slice().sort(sortAssignments);
      const activeAssignments = positionAssignments.filter((assignment) => assignment.status === "active");
      const primaryAssignment = (activeAssignments.length ? activeAssignments : positionAssignments)[0] || null;
      const positionUnit = unitsById.get(position.unit_id) || null;
      const scopedUnits = uniqueUnits(activeAssignments.length ? activeAssignments : positionAssignments, unitsById, positionUnit);
      const primaryUnit = positionUnit || (primaryAssignment ? unitsById.get(primaryAssignment.unit_id) || null : null);
      const unitType = inferUnitType(scopedUnits);
      const holderNames = activeAssignments.map((assignment) => holderName(assignment, personsById));
      const baseStatus = position.status === "active" && !activeAssignments.length ? "vacant" : statusLabel(position.status);

      return {
        activeAssignments,
        assignments: positionAssignments,
        authorityBand: authorityBandForLevel(Number(position.authority_level || 0)),
        canSign: Boolean(position.is_signing_authority),
        currentHolder: compactList(holderNames),
        holderCount: holderNames.length,
        id: position.id,
        lastUpdated: formatDateTime(position.updated_at || position.created_at),
        levelLabel: unitType.label,
        multiUnit: scopedUnits.length > 1,
        position,
        primaryAssignment,
        primaryUnit,
        reportsTo: reportsToFor(position, positions),
        status: baseStatus,
        unitScope: compactList(scopedUnits.map((unit) => unit.name)),
        unitTypeCode: unitType.code,
        unitTypeLabel: unitType.label,
        units: scopedUnits
      };
    })
    .sort((left, right) => {
      if (left.position.authority_level !== right.position.authority_level) {
        return right.position.authority_level - left.position.authority_level;
      }

      return left.position.title.localeCompare(right.position.title);
    });
}

export function rowMatchesSearch(row: PositionAdminRow, search: string) {
  if (!search) {
    return true;
  }

  return [
    row.position.title,
    row.position.title_local,
    row.position.code,
    row.unitScope,
    row.position.unitName,
    row.position.unitCode,
    row.levelLabel,
    row.currentHolder,
    row.primaryAssignment?.personDisplayName,
    row.primaryUnit?.name,
    row.primaryUnit?.name_local,
    row.reportsTo?.title
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}
