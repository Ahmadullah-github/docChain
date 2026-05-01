import { useI18n } from "../../../i18n";
import { Icon, PanelCard } from "../../ui";
import type { IconName } from "../../ui";

export function AuditGovernanceReminder() {
  const { t } = useI18n();
  const items: Array<{ icon: IconName; text: string }> = [
    { icon: "shield", text: t("admin.auditLogs.governance.item1") },
    { icon: "lock", text: t("admin.auditLogs.governance.item2") },
    { icon: "search", text: t("admin.auditLogs.governance.item3") },
    { icon: "audit", text: t("admin.auditLogs.governance.item4") }
  ];

  return (
    <PanelCard title={t("admin.auditLogs.governance.title")}>
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
