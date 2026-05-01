import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../api";
import type { AdminAssignment, EntityId, Person, Position, Unit } from "../../api";
import { AdminPageHeader } from "../../components/admin";
import {
  AssignmentDirectory,
  AssignmentGovernanceReminder,
  AssignmentInspector,
  AssignmentRegistry,
  AssignmentRelationshipPreview,
  AssignmentReviewQueue,
  AssignmentStats,
  buildAssignmentRows,
  buildReviewQueue
} from "../../components/admin/assignments";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";

type AssignmentsPageData = {
  assignments: AdminAssignment[];
  persons: Person[];
  positions: Position[];
  units: Unit[];
};

const emptyData: AssignmentsPageData = {
  assignments: [],
  persons: [],
  positions: [],
  units: []
};

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function chooseDefaultAssignment(rows: ReturnType<typeof buildAssignmentRows>) {
  return rows.find((row) => row.status === "active") || rows[0] || null;
}

export function AdminAssignmentsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<AssignmentsPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<EntityId | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadAssignments() {
      setLoading(true);
      const [assignments, positions, units, persons] = await Promise.all([
        safe(adminApi.assignments.list(), []),
        safe(adminApi.positions.list(), []),
        safe(adminApi.units.list(), []),
        safe(adminApi.persons.list(), [])
      ]);

      if (alive) {
        setData({ assignments, persons, positions, units });
        setLoading(false);
      }
    }

    void loadAssignments();

    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => buildAssignmentRows(data), [data]);
  const reviewQueue = useMemo(() => buildReviewQueue(rows), [rows]);

  useEffect(() => {
    const selectedStillExists = selectedAssignmentId ? rows.some((row) => row.id === selectedAssignmentId) : false;
    if (!selectedStillExists) {
      setSelectedAssignmentId(chooseDefaultAssignment(rows)?.id || null);
    }
  }, [rows, selectedAssignmentId]);

  const selectedAssignment = rows.find((row) => row.id === selectedAssignmentId) || null;
  const stats = {
    active: rows.filter((row) => row.status === "active").length,
    canSign: rows.filter((row) => row.signEligibility !== "no").length,
    delegated: rows.filter((row) => row.assignmentType === "delegated").length,
    endingSoon: rows.filter((row) => row.endingSoon).length,
    pending: rows.filter((row) => row.assignmentType === "pending" || row.status.includes("pending")).length,
    total: rows.length
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" variant="primary">{t("admin.assignments.actions.newAssignment")}</Button>
            <Button icon="users">{t("admin.assignments.actions.bulkAssign")}</Button>
            <Button icon="move">{t("admin.assignments.actions.transferAssignment")}</Button>
          </>
        )}
        description={t("admin.assignments.description")}
        title={t("admin.assignments.title")}
      />

      <AssignmentStats
        labels={{
          active: t("admin.assignments.stats.active"),
          canSign: t("admin.assignments.stats.canSign"),
          delegated: t("admin.assignments.stats.delegated"),
          endingSoon: t("admin.assignments.stats.endingSoon"),
          pending: t("admin.assignments.stats.pending"),
          total: t("admin.assignments.stats.total")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(28rem,.8fr)]">
        <div className="min-w-0 space-y-4">
          <AssignmentDirectory
            onSelectAssignment={setSelectedAssignmentId}
            rows={rows}
            selectedAssignmentId={selectedAssignmentId}
            units={data.units}
          />
          <AssignmentRelationshipPreview
            onSelectAssignment={setSelectedAssignmentId}
            rows={rows}
            selectedAssignmentId={selectedAssignmentId}
          />
        </div>
        <div className="min-w-0">
          <AssignmentInspector selectedAssignment={selectedAssignment} />
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <AssignmentRegistry onSelectAssignment={setSelectedAssignmentId} rows={rows} units={data.units} />
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(18rem,.45fr)_minmax(0,1fr)]">
          <AssignmentGovernanceReminder />
          <AssignmentReviewQueue rows={reviewQueue} />
        </div>
      </section>
    </div>
  );
}
