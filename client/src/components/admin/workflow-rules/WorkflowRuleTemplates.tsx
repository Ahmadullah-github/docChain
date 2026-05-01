import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard } from "../../ui";

export function WorkflowRuleTemplates() {
  const { t } = useI18n();
  const templates = [
    t("admin.workflowRules.templates.departmentToFaculty"),
    t("admin.workflowRules.templates.facultyToViceChancellor"),
    t("admin.workflowRules.templates.internalMemo"),
    t("admin.workflowRules.templates.committeeReport"),
    t("admin.workflowRules.templates.policyApproval")
  ];

  return (
    <PanelCard title={t("admin.workflowRules.templates.title")}>
      <div className="space-y-3">
        {templates.map((template) => (
          <article className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2" key={template}>
            <div className="flex min-w-0 items-center gap-3">
              <Icon className="h-5 w-5 shrink-0 text-[#061d49]" name="document" />
              <p className="truncate text-sm font-medium text-slate-700">{template}</p>
            </div>
            <Button className="shrink-0 px-3 py-1.5 text-xs" icon="template">{t("admin.workflowRules.templates.useTemplate")}</Button>
          </article>
        ))}
      </div>
    </PanelCard>
  );
}
