import { useI18n } from "../../../i18n";
import { PanelCard, ReminderList } from "../../ui";

export function HierarchyRulesReminder() {
  const { t } = useI18n();

  return (
    <PanelCard title={t("admin.units.rules.title")}>
      <ReminderList
        items={[
          { icon: "users", text: t("admin.units.rules.item1") },
          { icon: "hierarchy", text: t("admin.units.rules.item2") },
          { icon: "view", text: t("admin.units.rules.item3") },
          { icon: "shield", text: t("admin.units.rules.item4") }
        ]}
      />
    </PanelCard>
  );
}
