import { MetricCard } from "../../ui";
import type { SignatureRulesStats } from "./types";

type SignatureRuleStatsProps = {
  labels: {
    activeChains: string;
    documentTypes: string;
    finalRules: string;
    total: string;
    visibilityRules: string;
    warnings: string;
  };
  loading: boolean;
  stats: SignatureRulesStats;
};

export function SignatureRuleStats({ labels, loading, stats }: SignatureRuleStatsProps) {
  const pendingValue = loading ? "..." : null;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <MetricCard icon="signature" label={labels.total} value={pendingValue ?? stats.total} />
      <MetricCard icon="workflow" label={labels.activeChains} tone="green" value={pendingValue ?? stats.activeChains} />
      <MetricCard icon="document" label={labels.documentTypes} value={pendingValue ?? stats.documentTypes} />
      <MetricCard icon="shield" label={labels.finalRules} value={pendingValue ?? stats.finalRules} />
      <MetricCard icon="view" label={labels.visibilityRules} value={pendingValue ?? stats.visibilityRules} />
      <MetricCard icon="activity" label={labels.warnings} tone={stats.warnings ? "amber" : "green"} value={pendingValue ?? stats.warnings} />
    </section>
  );
}
