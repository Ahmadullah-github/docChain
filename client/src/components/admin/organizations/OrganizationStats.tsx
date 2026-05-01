import { MetricCard } from "../../ui";

type OrganizationStatsProps = {
  loading: boolean;
  stats: {
    activePositions: number;
    departments: number;
    faculties: number;
    officesCommittees: number;
    organizations: number;
    viceChancelleries: number;
  };
  labels: {
    activePositions: string;
    departments: string;
    faculties: string;
    officesCommittees: string;
    organizations: string;
    viceChancelleries: string;
  };
};

export function OrganizationStats({ labels, loading, stats }: OrganizationStatsProps) {
  const value = (item: number) => loading ? "-" : item;

  return (
    <section className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
      <MetricCard icon="building" label={labels.organizations} value={value(stats.organizations)} />
      <MetricCard icon="hierarchy" label={labels.viceChancelleries} value={value(stats.viceChancelleries)} />
      <MetricCard icon="document" label={labels.faculties} value={value(stats.faculties)} />
      <MetricCard icon="building" label={labels.departments} value={value(stats.departments)} />
      <MetricCard icon="users" label={labels.officesCommittees} value={value(stats.officesCommittees)} />
      <MetricCard icon="briefcase" label={labels.activePositions} value={value(stats.activePositions)} />
    </section>
  );
}
