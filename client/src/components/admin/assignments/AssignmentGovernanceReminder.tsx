import { useI18n } from "../../../i18n";
import { PanelCard, ReminderList } from "../../ui";

export function AssignmentGovernanceReminder() {
  const { t } = useI18n();

  return (
    <PanelCard title={t("admin.assignments.governance.title")}>
      <ReminderList
        items={[
          { icon: "shield", text: t("admin.assignments.governance.item1") },
          { icon: "users", text: t("admin.assignments.governance.item2") },
          { icon: "signature", text: t("admin.assignments.governance.item3") },
          { icon: "audit", text: t("admin.assignments.governance.item4") }
        ]}
      />
    </PanelCard>
  );
}
