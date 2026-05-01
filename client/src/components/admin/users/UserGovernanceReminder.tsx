import { useI18n } from "../../../i18n";
import { PanelCard, ReminderList } from "../../ui";

export function UserGovernanceReminder() {
  const { t } = useI18n();

  return (
    <PanelCard title={t("admin.users.governance.title")}>
      <ReminderList
        items={[
          { icon: "shield", text: t("admin.users.governance.item1") },
          { icon: "hierarchy", text: t("admin.users.governance.item2") },
          { icon: "key", text: t("admin.users.governance.item3") },
          { icon: "audit", text: t("admin.users.governance.item4") }
        ]}
      />
    </PanelCard>
  );
}
