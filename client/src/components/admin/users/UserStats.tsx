import { MetricCard } from "../../ui";

type UserStatsProps = {
  labels: {
    active: string;
    disabled: string;
    multiAssignment: string;
    pending: string;
    suspended: string;
    total: string;
  };
  loading: boolean;
  stats: {
    active: number;
    disabled: number;
    multiAssignment: number;
    pending: number;
    suspended: number;
    total: number;
  };
};

export function UserStats({ labels, loading, stats }: UserStatsProps) {
  const value = (item: number) => loading ? "-" : item;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <MetricCard icon="users" label={labels.total} value={value(stats.total)} />
      <MetricCard icon="userCheck" label={labels.active} tone="green" value={value(stats.active)} />
      <MetricCard icon="clock" label={labels.pending} tone="amber" value={value(stats.pending)} />
      <MetricCard icon="pause" label={labels.suspended} tone="red" value={value(stats.suspended)} />
      <MetricCard icon="userX" label={labels.disabled} tone="slate" value={value(stats.disabled)} />
      <MetricCard icon="users" label={labels.multiAssignment} value={value(stats.multiAssignment)} />
    </section>
  );
}
