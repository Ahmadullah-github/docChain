import type { AdminAssignment, EntityId, Person, Position, Unit, UserListItem } from "../../../api";
import type { UserAdminRow, UserReviewQueueRow, UserSetupStatus } from "./types";

export function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return String(value).replace("T", " ").slice(0, 16);
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return String(value).slice(0, 10);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
}

export function statusLabel(value?: string | null) {
  return value || "unknown";
}

function roleLabelFor(user: UserListItem, position: Position | null, assignment: AdminAssignment | null) {
  const roleLabels = user.roleDisplayNames?.length ? user.roleDisplayNames : user.roleNames;
  if (roleLabels?.length) {
    return roleLabels.join(", ");
  }

  return position?.title || assignment?.positionTitle || "Staff";
}

function choosePrimaryAssignment(assignments: AdminAssignment[]) {
  return assignments
    .slice()
    .sort((left, right) => {
      if (left.is_primary !== right.is_primary) {
        return left.is_primary ? -1 : 1;
      }

      if (left.status !== right.status) {
        return left.status === "active" ? -1 : right.status === "active" ? 1 : 0;
      }

      return left.id - right.id;
    })[0] || null;
}

function setupStatusFor(user: UserListItem, canSign: boolean): UserSetupStatus {
  if (user.status !== "active") {
    return "pending";
  }

  if (user.mustChangePassword) {
    return "pending";
  }

  return canSign ? "ready" : "not_required";
}

export function buildUserRows({
  assignments,
  persons,
  positions,
  units,
  users
}: {
  assignments: AdminAssignment[];
  persons: Person[];
  positions: Position[];
  units: Unit[];
  users: UserListItem[];
}) {
  const personsById = new Map<EntityId, Person>(persons.map((person) => [person.id, person]));
  const positionsById = new Map<EntityId, Position>(positions.map((position) => [position.id, position]));
  const unitsById = new Map<EntityId, Unit>(units.map((unit) => [unit.id, unit]));
  const assignmentsByPersonId = new Map<EntityId, AdminAssignment[]>();

  for (const assignment of assignments) {
    assignmentsByPersonId.set(assignment.person_id, [
      ...(assignmentsByPersonId.get(assignment.person_id) || []),
      assignment
    ]);
  }

  return users.map<UserAdminRow>((user) => {
    const userAssignments = assignmentsByPersonId.get(user.personId) || [];
    const activeAssignments = userAssignments.filter((assignment) => assignment.status === "active");
    const primaryAssignment = choosePrimaryAssignment(activeAssignments.length ? activeAssignments : userAssignments);
    const position = primaryAssignment ? positionsById.get(primaryAssignment.position_id) || null : null;
    const primaryUnit = primaryAssignment ? unitsById.get(primaryAssignment.unit_id) || null : null;
    const canSign = activeAssignments.some((assignment) => Boolean(positionsById.get(assignment.position_id)?.is_signing_authority));

    return {
      activeAssignments,
      assignments: userAssignments,
      canSign,
      id: user.id,
      person: personsById.get(user.personId) || null,
      position,
      primaryAssignment,
      primaryUnit,
      roleLabel: roleLabelFor(user, position, primaryAssignment),
      setupStatus: setupStatusFor(user, canSign),
      unit: primaryUnit,
      user
    };
  });
}

export function rowMatchesSearch(row: UserAdminRow, search: string) {
  if (!search) {
    return true;
  }

  return [
    row.user.personDisplayName,
    row.user.username,
    row.user.email,
    row.person?.phone,
    row.unit?.name,
    row.primaryAssignment?.unitName,
    row.position?.title,
    row.primaryAssignment?.positionTitle,
    row.roleLabel
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}

export function buildReviewQueue(rows: UserAdminRow[]) {
  const queue: UserReviewQueueRow[] = [];

  for (const row of rows) {
    if (row.user.status === "pending_activation") {
      queue.push({
        date: formatDate(row.user.createdAt),
        id: `${row.id}-activation`,
        issue: "First-time activation pending",
        requestedBy: "System Admin",
        status: "awaiting_setup",
        userId: row.id,
        userName: row.user.personDisplayName
      });
    }

    if (row.user.mustChangePassword) {
      queue.push({
        date: formatDate(row.user.createdAt),
        id: `${row.id}-password`,
        issue: "Password change required",
        requestedBy: row.primaryAssignment?.unitName || "System",
        status: "incomplete_setup",
        userId: row.id,
        userName: row.user.personDisplayName
      });
    }

    if (row.user.status === "suspended") {
      queue.push({
        date: formatDate(row.user.lastLoginAt || row.user.createdAt),
        id: `${row.id}-suspended`,
        issue: "Account suspended for policy review",
        requestedBy: "Security Review",
        status: "under_review",
        userId: row.id,
        userName: row.user.personDisplayName
      });
    }

    if (!row.assignments.length) {
      queue.push({
        date: formatDate(row.user.createdAt),
        id: `${row.id}-assignment`,
        issue: "No position assignment configured",
        requestedBy: "Registry Office",
        status: "incomplete_setup",
        userId: row.id,
        userName: row.user.personDisplayName
      });
    }
  }

  return queue.slice(0, 8);
}
