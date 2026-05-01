import { useI18n } from "../../../i18n";
import { Icon, PanelCard } from "../../ui";
import type { IconName } from "../../ui";

export function WorkflowRuleHelp() {
  const { t } = useI18n();
  const items: Array<{ icon: IconName; text: string }> = [
    { icon: "hierarchy", text: t("admin.workflowRules.help.routing") },
    { icon: "signature", text: t("admin.workflowRules.help.signatures") },
    { icon: "view", text: t("admin.workflowRules.help.visibility") },
    { icon: "serial", text: t("admin.workflowRules.help.serial") },
    { icon: "settings", text: t("admin.workflowRules.help.template") }
  ];

  return (
    <PanelCard title={t("admin.workflowRules.help.title")}>
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
