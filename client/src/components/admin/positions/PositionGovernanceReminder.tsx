import { useI18n } from "../../../i18n";
import { PanelCard, ReminderList } from "../../ui";

export function PositionGovernanceReminder() {
  const { t } = useI18n();

  return (
    <PanelCard title={t("admin.positions.governance.title")}>
      <ReminderList
        items={[
          { icon: "shield", text: t("admin.positions.governance.item1") },
          { icon: "users", text: t("admin.positions.governance.item2") },
          { icon: "signature", text: t("admin.positions.governance.item3") },
          { icon: "audit", text: t("admin.positions.governance.item4") }
        ]}
      />
    </PanelCard>
  );
}
