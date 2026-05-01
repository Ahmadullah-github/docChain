import { MetricCard } from "../../ui";

type PositionStatsProps = {
  labels: {
    active: string;
    canSign: string;
    multiUnit: string;
    pending: string;
    total: string;
    vacant: string;
  };
  loading: boolean;
  stats: {
    active: number;
    canSign: number;
    multiUnit: number;
    pending: number;
    total: number;
    vacant: number;
  };
};

export function PositionStats({ labels, loading, stats }: PositionStatsProps) {
  const value = (item: number) => loading ? "-" : item;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <MetricCard icon="briefcase" label={labels.total} value={value(stats.total)} />
      <MetricCard icon="userCheck" label={labels.active} tone="green" value={value(stats.active)} />
      <MetricCard icon="clock" label={labels.vacant} tone="amber" value={value(stats.vacant)} />
      <MetricCard icon="signature" label={labels.canSign} value={value(stats.canSign)} />
      <MetricCard icon="hierarchy" label={labels.multiUnit} value={value(stats.multiUnit)} />
      <MetricCard icon="audit" label={labels.pending} tone="red" value={value(stats.pending)} />
    </section>
  );
}
