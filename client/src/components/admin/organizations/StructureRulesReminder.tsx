import { useI18n } from "../../../i18n";
import { PanelCard, ReminderList } from "../../ui";

export function StructureRulesReminder() {
  const { t } = useI18n();

  return (
    <PanelCard className="h-full" title={t("admin.organizations.reminders.title")}>
      <ReminderList
        items={[
          { icon: "shield", text: t("admin.organizations.reminders.item1") },
          { icon: "users", text: t("admin.organizations.reminders.item2") },
          { icon: "hierarchy", text: t("admin.organizations.reminders.item3") },
          { icon: "audit", text: t("admin.organizations.reminders.item4") }
        ]}
      />
    </PanelCard>
  );
}
