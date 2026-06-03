import type { AdminAssignment, EntityId, Person, Position, Unit } from "../../../api";
import type {
  AssignmentAdminRow,
  AssignmentSignEligibility,
  AssignmentType
} from "./types";

type BuildAssignmentRowsInput = {
  assignments: AdminAssignment[];
  persons: Person[];
  positions: Position[];
  units: Unit[];
};

const soonWindowMs = 1000 * 60 * 60 * 24 * 45;

export function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return String(value).slice(0, 10);
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

function shortCode(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 3).toUpperCase())
    .join("-")
    .slice(0, 12);
}

function assignmentCode(assignment: AdminAssignment, position: Position | null, unit: Unit | null) {
  const unitCode = unit?.code ? shortCode(unit.code) : "GEN";
  const positionCode = position?.code ? shortCode(position.code) : "ASN";
  return `ASN-${unitCode}-${positionCode}-${String(assignment.id).padStart(2, "0")}`;
}

function assignmentTypeFor(assignment: AdminAssignment): AssignmentType {
  const status = assignment.status.toLowerCase();
  if (status.includes("pending") || status.includes("draft")) {
    return "pending";
  }

  if (assignment.ends_at) {
    return "temporary";
  }

  if (!assignment.is_primary) {
    return "delegated";
  }

  return "primary";
}

function endingSoon(assignment: AdminAssignment) {
  if (!assignment.ends_at || assignment.status !== "active") {
    return false;
  }

  const endsAt = new Date(assignment.ends_at).getTime();
  const now = Date.now();
  return Number.isFinite(endsAt) && endsAt >= now && endsAt - now <= soonWindowMs;
}

function reportsToFor(position: Position | null, positions: Position[]) {
  if (!position) {
    return null;
  }

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

export function signEligibilityFor(assignment: AdminAssignment, position: Position | null): AssignmentSignEligibility {
  if (!position?.is_signing_authority) {
    return "no";
  }

  return assignment.is_primary ? "yes" : "optional";
}

export function authorityLabelFor(position: Position | null, unit: Unit | null, assignmentType: AssignmentType) {
  if (!position) {
    return "Assignment Authority";
  }

  if (assignmentType === "delegated") {
    return "Delegated Review";
  }

  if (position.authority_level >= 85) {
    return "University Authority";
  }

  if (position.authority_level >= 70 && unit?.unitTypeCode === "faculty") {
    return "Full Faculty Authority";
  }

  if (position.authority_level >= 55 && unit?.unitTypeCode === "department") {
    return "Department Authority";
  }

  if (position.authority_level >= 55 && unit?.unitTypeCode === "committee") {
    return "Committee Review";
  }

  if (position.authority_level >= 20) {
    return "Administrative Authority";
  }

  return "Operational Authority";
}

export function authorityScopeFor(position: Position | null, unit: Unit | null) {
  if (!position) {
    return "-";
  }

  if (position.authority_level >= 85) {
    return "University-wide";
  }

  switch (unit?.unitTypeCode) {
    case "faculty":
      return "Faculty-wide";
    case "department":
      return "Department scope";
    case "committee":
      return "Committee scope";
    case "office":
      return "Office scope";
    case "vice_chancellery":
      return "Executive scope";
    default:
      return "Position scope";
  }
}

export function buildAssignmentRows({ assignments, persons, positions, units }: BuildAssignmentRowsInput) {
  const personsById = new Map<EntityId, Person>(persons.map((person) => [person.id, person]));
  const positionsById = new Map<EntityId, Position>(positions.map((position) => [position.id, position]));
  const unitsById = new Map<EntityId, Unit>(units.map((unit) => [unit.id, unit]));
  const assignmentsByPositionId = new Map<EntityId, AdminAssignment[]>();

  for (const assignment of assignments) {
    assignmentsByPositionId.set(assignment.position_id, [
      ...(assignmentsByPositionId.get(assignment.position_id) || []),
      assignment
    ]);
  }

  return assignments
    .map<AssignmentAdminRow>((assignment) => {
      const person = personsById.get(assignment.person_id) || null;
      const position = positionsById.get(assignment.position_id) || null;
      const unit = unitsById.get(assignment.unit_id) || (position ? unitsById.get(position.unit_id) || null : null);
      const assignmentType = assignmentTypeFor(assignment);
      const signEligibility = signEligibilityFor(assignment, position);

      return {
        assignment,
        assignmentCode: assignmentCode(assignment, position, unit),
        assignmentType,
        authorityLabel: authorityLabelFor(position, unit, assignmentType),
        authorityScope: authorityScopeFor(position, unit),
        canSign: Boolean(position?.is_signing_authority),
        delegatedAssignments: (assignmentsByPositionId.get(assignment.position_id) || []).filter((item) => item.status === "active"),
        displayName: assignment.personDisplayName || person?.display_name || "-",
        endingSoon: endingSoon(assignment),
        id: assignment.id,
        lastUpdated: formatDateTime(assignment.updated_at || assignment.created_at),
        localName: person?.last_name || "-",
        person,
        position,
        reportsTo: reportsToFor(position, positions),
        signEligibility,
        status: statusLabel(assignment.status),
        unit
      };
    })
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "active" ? -1 : right.status === "active" ? 1 : 0;
      }

      return right.id - left.id;
    });
}

export function rowMatchesSearch(row: AssignmentAdminRow, search: string) {
  if (!search) {
    return true;
  }

  return [
    row.displayName,
    row.localName,
    row.assignmentCode,
    row.position?.title,
    row.position?.title_local,
    row.position?.code,
    row.unit?.name,
    row.unit?.name_local,
    row.unit?.code,
    row.authorityLabel,
    row.authorityScope
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}
