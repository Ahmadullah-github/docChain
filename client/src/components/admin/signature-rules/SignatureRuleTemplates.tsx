import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard } from "../../ui";

export type SignatureRuleTemplateId = "committee_approval" | "department_upward" | "faculty_letter" | "internal_memo" | "policy_flow";

type SignatureRuleTemplatesProps = {
  onUseTemplate?: (templateId: SignatureRuleTemplateId) => void;
};

export function SignatureRuleTemplates({ onUseTemplate }: SignatureRuleTemplatesProps) {
  const { t } = useI18n();
  const templates: Array<[SignatureRuleTemplateId, string, string]> = [
    ["department_upward", t("admin.signatureRules.templates.departmentUpward"), t("admin.signatureRules.templates.departmentUpwardHint")],
    ["faculty_letter", t("admin.signatureRules.templates.facultyLetter"), t("admin.signatureRules.templates.facultyLetterHint")],
    ["committee_approval", t("admin.signatureRules.templates.committeeApproval"), t("admin.signatureRules.templates.committeeApprovalHint")],
    ["internal_memo", t("admin.signatureRules.templates.internalMemo"), t("admin.signatureRules.templates.internalMemoHint")],
    ["policy_flow", t("admin.signatureRules.templates.policyFlow"), t("admin.signatureRules.templates.policyFlowHint")]
  ];

  return (
    <PanelCard className="overflow-hidden" title={t("admin.signatureRules.templates.title")}>
      <div className="space-y-2">
        {templates.map(([id, title, hint]) => (
          <article className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between" key={id}>
            <div className="flex min-w-0 items-center gap-3">
              <Icon className="h-5 w-5 shrink-0 text-[#061d49]" name="document" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{title}</p>
                <p className="truncate text-xs text-slate-500">{hint}</p>
              </div>
            </div>
            <Button className="w-full shrink-0 px-3 py-1.5 text-xs sm:w-auto" icon="template" onClick={() => onUseTemplate?.(id)}>{t("admin.signatureRules.templates.useTemplate")}</Button>
          </article>
        ))}
      </div>
    </PanelCard>
  );
}
