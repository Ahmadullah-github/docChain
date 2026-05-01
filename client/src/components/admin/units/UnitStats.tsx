import { MetricCard } from "../../ui";

type UnitStatsProps = {
  labels: {
    assignedPositions: string;
    hierarchyLevels: string;
    leafUnits: string;
    pendingChanges: string;
    rootOrganizations: string;
    totalUnits: string;
  };
  loading: boolean;
  stats: {
    assignedPositions: number;
    hierarchyLevels: number;
    leafUnits: number;
    pendingChanges: number;
    rootOrganizations: number;
    totalUnits: number;
  };
};

export function UnitStats({ labels, loading, stats }: UnitStatsProps) {
  const value = (item: number) => loading ? "-" : item;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <MetricCard icon="building" label={labels.totalUnits} value={value(stats.totalUnits)} />
      <MetricCard icon="hierarchy" label={labels.hierarchyLevels} value={value(stats.hierarchyLevels)} />
      <MetricCard icon="building" label={labels.rootOrganizations} value={value(stats.rootOrganizations)} />
      <MetricCard icon="leaf" label={labels.leafUnits} value={value(stats.leafUnits)} />
      <MetricCard icon="users" label={labels.assignedPositions} value={value(stats.assignedPositions)} />
      <MetricCard icon="audit" label={labels.pendingChanges} value={value(stats.pendingChanges)} />
    </section>
  );
}
