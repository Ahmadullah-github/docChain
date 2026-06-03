import { MetricCard } from "../../ui";
import type { DocumentTypeStats as DocumentTypeStatsType } from "./types";

type DocumentTypeStatsProps = {
  labels: {
    active: string;
    serialReady: string;
    templateReady: string;
    total: string;
    warnings: string;
  };
  loading: boolean;
  stats: DocumentTypeStatsType;
};

export function DocumentTypeStats({ labels, loading, stats }: DocumentTypeStatsProps) {
  const pendingValue = loading ? "..." : null;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard icon="document" label={labels.total} value={pendingValue ?? stats.total} />
      <MetricCard icon="activity" label={labels.active} tone="green" value={pendingValue ?? stats.active} />
      <MetricCard icon="template" label={labels.templateReady} tone={stats.templateReady ? "green" : "amber"} value={pendingValue ?? stats.templateReady} />
      <MetricCard icon="serial" label={labels.serialReady} tone={stats.serialReady ? "green" : "amber"} value={pendingValue ?? stats.serialReady} />
      <MetricCard icon="audit" label={labels.warnings} tone={stats.warnings ? "amber" : "green"} value={pendingValue ?? stats.warnings} />
    </section>
  );
}
