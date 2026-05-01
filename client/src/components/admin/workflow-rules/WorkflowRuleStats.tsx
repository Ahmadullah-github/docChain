import { MetricCard } from "../../ui";
import type { WorkflowRulesStats } from "./types";

type WorkflowRuleStatsProps = {
  labels: {
    active: string;
    documentTypes: string;
    signatureRules: string;
    total: string;
    visibilityRules: string;
    warnings: string;
  };
  loading: boolean;
  stats: WorkflowRulesStats;
};

export function WorkflowRuleStats({ labels, loading, stats }: WorkflowRuleStatsProps) {
  const pendingValue = loading ? "..." : null;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <MetricCard icon="hierarchy" label={labels.total} value={pendingValue ?? stats.total} />
      <MetricCard icon="activity" label={labels.active} tone="green" value={pendingValue ?? stats.active} />
      <MetricCard icon="document" label={labels.documentTypes} value={pendingValue ?? stats.documentTypes} />
      <MetricCard icon="signature" label={labels.signatureRules} tone="amber" value={pendingValue ?? stats.signatureRules} />
      <MetricCard icon="view" label={labels.visibilityRules} value={pendingValue ?? stats.visibilityRules} />
      <MetricCard icon="shield" label={labels.warnings} tone={stats.warnings ? "amber" : "green"} value={pendingValue ?? stats.warnings} />
    </section>
  );
}
