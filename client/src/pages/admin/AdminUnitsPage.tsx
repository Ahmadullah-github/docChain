import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../api";
import type { AdminAssignment, EntityId, Organization, Position, Unit, UnitType } from "../../api";
import { AdminPageHeader } from "../../components/admin";
import {
  buildChangeQueue,
  buildLeadershipRows,
  chooseLeadershipHead,
  countHierarchyLevels,
  countLeafUnits,
  countRootUnits,
  getActiveAssignmentsForUnit,
  HierarchyCanvas,
  HierarchyRulesReminder,
  StructuralChangeQueue,
  UnitInspector,
  UnitStats,
  UnitsHierarchyNavigator
} from "../../components/admin/units";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";

type UnitsPageData = {
  assignments: AdminAssignment[];
  organizations: Organization[];
  positions: Position[];
  units: Unit[];
  unitTypes: UnitType[];
};

const emptyData: UnitsPageData = {
  assignments: [],
  organizations: [],
  positions: [],
  units: [],
  unitTypes: []
};

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function chooseDefaultUnit(units: Unit[]) {
  return units.find((unit) => unit.unitTypeCode === "faculty") || units[0] || null;
}

export function AdminUnitsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<UnitsPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedUnitId, setSelectedUnitId] = useState<EntityId | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadUnits() {
      setLoading(true);
      const [organizations, unitTypes, units, positions, assignments] = await Promise.all([
        safe(adminApi.organizations.list(), []),
        safe(adminApi.unitTypes.list(), []),
        safe(adminApi.units.list(), []),
        safe(adminApi.positions.list(), []),
        safe(adminApi.assignments.list(), [])
      ]);

      if (alive) {
        setData({ assignments, organizations, positions, units, unitTypes });
        setLoading(false);
      }
    }

    void loadUnits();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const selectedStillExists = selectedUnitId ? data.units.some((unit) => unit.id === selectedUnitId) : false;
    if (!selectedStillExists) {
      setSelectedUnitId(chooseDefaultUnit(data.units)?.id || null);
    }
  }, [data.units, selectedUnitId]);

  const positionsById = useMemo(() => new Map(data.positions.map((position) => [position.id, position])), [data.positions]);
  const selectedUnit = data.units.find((unit) => unit.id === selectedUnitId) || null;
  const activeAssignments = selectedUnit ? getActiveAssignmentsForUnit(selectedUnit.id, data.assignments) : [];
  const leadershipRows = useMemo(() => buildLeadershipRows(activeAssignments, positionsById), [activeAssignments, positionsById]);
  const head = chooseLeadershipHead(leadershipRows);
  const changeQueue = useMemo(() => buildChangeQueue(), []);

  const stats = {
    assignedPositions: data.assignments.filter((assignment) => assignment.status === "active").length,
    hierarchyLevels: countHierarchyLevels(data.units),
    leafUnits: countLeafUnits(data.units),
    pendingChanges: changeQueue.length,
    rootOrganizations: countRootUnits(data.units),
    totalUnits: data.units.length
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" variant="primary">{t("admin.units.actions.addUnit")}</Button>
            <Button icon="move">{t("admin.units.actions.reorderStructure")}</Button>
            <Button icon="upload">{t("admin.units.actions.importHierarchy")}</Button>
            <Button icon="export">{t("admin.units.actions.exportMap")}</Button>
          </>
        )}
        description={t("admin.units.description")}
        title={t("admin.units.title")}
      />

      <UnitStats
        labels={{
          assignedPositions: t("admin.units.stats.assignedPositions"),
          hierarchyLevels: t("admin.units.stats.hierarchyLevels"),
          leafUnits: t("admin.units.stats.leafUnits"),
          pendingChanges: t("admin.units.stats.pendingChanges"),
          rootOrganizations: t("admin.units.stats.rootOrganizations"),
          totalUnits: t("admin.units.stats.totalUnits")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(22rem,.85fr)_minmax(34rem,1.45fr)_minmax(24rem,.95fr)]">
        <UnitsHierarchyNavigator
          onSelectUnit={setSelectedUnitId}
          selectedUnitId={selectedUnitId}
          units={data.units}
          unitTypes={data.unitTypes.map((unitType) => ({ code: unitType.code, id: unitType.id, name: unitType.name }))}
        />
        <HierarchyCanvas
          assignments={data.assignments}
          onSelectUnit={setSelectedUnitId}
          selectedUnitId={selectedUnitId}
          units={data.units}
        />
        <UnitInspector
          headPosition={head?.positionTitle || t("admin.units.inspector.noHead")}
          leadershipRows={leadershipRows}
          parentUnitName={selectedUnit?.parentUnitName || t("admin.units.inspector.noParent")}
          selectedUnit={selectedUnit}
          units={data.units}
        />
      </section>

      <section className="min-w-0 space-y-4">
        <StructuralChangeQueue rows={changeQueue} />
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <HierarchyRulesReminder />
        </div>
      </section>
    </div>
  );
}
