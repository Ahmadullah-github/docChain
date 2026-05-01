import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard } from "../../ui";

export type WorkflowTemplateKey = "department_to_faculty" | "faculty_to_vc" | "internal_memo" | "committee_report" | "policy_approval";

type WorkflowRuleTemplatesProps = {
  onUseTemplate?: (template: WorkflowTemplateKey) => void;
};

export function WorkflowRuleTemplates({ onUseTemplate }: WorkflowRuleTemplatesProps) {
  const { t } = useI18n();
  const templates: Array<{ key: WorkflowTemplateKey; label: string }> = [
    { key: "department_to_faculty", label: t("admin.workflowRules.templates.departmentToFaculty") },
    { key: "faculty_to_vc", label: t("admin.workflowRules.templates.facultyToViceChancellor") },
    { key: "internal_memo", label: t("admin.workflowRules.templates.internalMemo") },
    { key: "committee_report", label: t("admin.workflowRules.templates.committeeReport") },
    { key: "policy_approval", label: t("admin.workflowRules.templates.policyApproval") }
  ];

  return (
    <PanelCard title={t("admin.workflowRules.templates.title")}>
      <div className="space-y-3">
        {templates.map((template) => (
          <article className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2" key={template.key}>
            <div className="flex min-w-0 items-center gap-3">
              <Icon className="h-5 w-5 shrink-0 text-[#061d49]" name="document" />
              <p className="truncate text-sm font-medium text-slate-700">{template.label}</p>
            </div>
            <Button className="shrink-0 px-3 py-1.5 text-xs" icon="template" onClick={() => onUseTemplate?.(template.key)}>{t("admin.workflowRules.templates.useTemplate")}</Button>
          </article>
        ))}
      </div>
    </PanelCard>
  );
}
