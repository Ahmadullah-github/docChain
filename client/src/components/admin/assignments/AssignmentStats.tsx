import { MetricCard } from "../../ui";

type AssignmentStatsProps = {
  labels: {
    active: string;
    canSign: string;
    delegated: string;
    endingSoon: string;
    pending: string;
    total: string;
  };
  loading: boolean;
  stats: {
    active: number;
    canSign: number;
    delegated: number;
    endingSoon: number;
    pending: number;
    total: number;
  };
};

export function AssignmentStats({ labels, loading, stats }: AssignmentStatsProps) {
  const value = (item: number) => loading ? "-" : item;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <MetricCard icon="users" label={labels.total} value={value(stats.total)} />
      <MetricCard icon="userCheck" label={labels.active} tone="green" value={value(stats.active)} />
      <MetricCard icon="clock" label={labels.pending} tone="amber" value={value(stats.pending)} />
      <MetricCard icon="hierarchy" label={labels.delegated} value={value(stats.delegated)} />
      <MetricCard icon="signature" label={labels.canSign} value={value(stats.canSign)} />
      <MetricCard icon="audit" label={labels.endingSoon} tone="red" value={value(stats.endingSoon)} />
    </section>
  );
}
