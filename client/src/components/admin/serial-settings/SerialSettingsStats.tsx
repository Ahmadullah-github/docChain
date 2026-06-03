import { MetricCard } from "../../ui";
import type { SerialSettingsStats as SerialSettingsStatsType } from "./types";

type SerialSettingsStatsProps = {
  labels: {
    active: string;
    defaultRules: string;
    documentTypes: string;
    total: string;
    warnings: string;
  };
  loading: boolean;
  stats: SerialSettingsStatsType;
};

export function SerialSettingsStats({ labels, loading, stats }: SerialSettingsStatsProps) {
  const pendingValue = loading ? "..." : null;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard icon="serial" label={labels.total} value={pendingValue ?? stats.total} />
      <MetricCard icon="activity" label={labels.active} tone="green" value={pendingValue ?? stats.active} />
      <MetricCard icon="shield" label={labels.defaultRules} value={pendingValue ?? stats.defaultRules} />
      <MetricCard icon="document" label={labels.documentTypes} value={pendingValue ?? stats.documentTypes} />
      <MetricCard icon="audit" label={labels.warnings} tone={stats.warnings ? "amber" : "green"} value={pendingValue ?? stats.warnings} />
    </section>
  );
}
