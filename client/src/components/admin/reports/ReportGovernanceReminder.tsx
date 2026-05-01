import { useI18n } from "../../../i18n";
import { Icon, PanelCard } from "../../ui";
import type { IconName } from "../../ui";

export function ReportGovernanceReminder() {
  const { t } = useI18n();
  const items: Array<{ icon: IconName; text: string }> = [
    { icon: "reports", text: t("admin.reports.governance.item1") },
    { icon: "audit", text: t("admin.reports.governance.item2") },
    { icon: "lock", text: t("admin.reports.governance.item3") },
    { icon: "export", text: t("admin.reports.governance.item4") }
  ];

  return (
    <PanelCard title={t("admin.reports.governance.title")}>
      <div className="space-y-3">
        {items.map((item) => (
          <div className="flex gap-3 text-sm leading-5 text-slate-700" key={item.text}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#061d49]">
              <Icon className="h-5 w-5" name={item.icon} />
            </span>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}
