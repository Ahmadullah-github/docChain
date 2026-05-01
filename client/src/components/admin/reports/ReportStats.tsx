import { MetricCard } from "../../ui";
import type { ReportStats as ReportStatsType } from "./types";

type ReportStatsProps = {
  labels: {
    activeAssignments: string;
    auditEvents: string;
    documents: string;
    reportPacks: string;
    signatureRules: string;
    workflowRules: string;
  };
  loading: boolean;
  stats: ReportStatsType;
};

export function ReportStats({ labels, loading, stats }: ReportStatsProps) {
  const pendingValue = loading ? "..." : null;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <MetricCard icon="reports" label={labels.reportPacks} value={pendingValue ?? stats.reportPacks} />
      <MetricCard icon="document" label={labels.documents} value={pendingValue ?? stats.documents} />
      <MetricCard icon="workflow" label={labels.workflowRules} value={pendingValue ?? stats.workflowRules} />
      <MetricCard icon="signature" label={labels.signatureRules} tone="amber" value={pendingValue ?? stats.signatureRules} />
      <MetricCard icon="audit" label={labels.auditEvents} value={pendingValue ?? stats.auditEvents} />
      <MetricCard icon="userCheck" label={labels.activeAssignments} tone="green" value={pendingValue ?? stats.activeAssignments} />
    </section>
  );
}
