import { MetricCard } from "../../ui";
import type { DocumentTypeStats as DocumentTypeStatsType } from "./types";

type DocumentTypeStatsProps = {
  labels: {
    active: string;
    routed: string;
    serialRequired: string;
    signed: string;
    total: string;
    warnings: string;
  };
  loading: boolean;
  stats: DocumentTypeStatsType;
};

export function DocumentTypeStats({ labels, loading, stats }: DocumentTypeStatsProps) {
  const pendingValue = loading ? "..." : null;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <MetricCard icon="document" label={labels.total} value={pendingValue ?? stats.total} />
      <MetricCard icon="activity" label={labels.active} tone="green" value={pendingValue ?? stats.active} />
      <MetricCard icon="serial" label={labels.serialRequired} value={pendingValue ?? stats.serialRequired} />
      <MetricCard icon="workflow" label={labels.routed} value={pendingValue ?? stats.routed} />
      <MetricCard icon="signature" label={labels.signed} tone="amber" value={pendingValue ?? stats.signed} />
      <MetricCard icon="audit" label={labels.warnings} tone={stats.warnings ? "amber" : "green"} value={pendingValue ?? stats.warnings} />
    </section>
  );
}
