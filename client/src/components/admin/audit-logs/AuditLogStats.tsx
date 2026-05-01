import { MetricCard } from "../../ui";
import type { AuditLogStats as AuditLogStatsType } from "./types";

type AuditLogStatsProps = {
  labels: {
    adminChanges: string;
    documentEvents: string;
    highRisk: string;
    today: string;
    total: string;
    uniqueActors: string;
  };
  loading: boolean;
  stats: AuditLogStatsType;
};

export function AuditLogStats({ labels, loading, stats }: AuditLogStatsProps) {
  const pendingValue = loading ? "..." : null;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <MetricCard icon="audit" label={labels.total} value={pendingValue ?? stats.total} />
      <MetricCard icon="clock" label={labels.today} tone="green" value={pendingValue ?? stats.today} />
      <MetricCard icon="settings" label={labels.adminChanges} value={pendingValue ?? stats.adminChanges} />
      <MetricCard icon="document" label={labels.documentEvents} value={pendingValue ?? stats.documentEvents} />
      <MetricCard icon="shield" label={labels.highRisk} tone={stats.highRisk ? "red" : "green"} value={pendingValue ?? stats.highRisk} />
      <MetricCard icon="users" label={labels.uniqueActors} value={pendingValue ?? stats.uniqueActors} />
    </section>
  );
}
