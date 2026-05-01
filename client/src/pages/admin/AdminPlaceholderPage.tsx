import { AdminPageHeader } from "../../components/admin";
import { EmptyState, PanelCard } from "../../components/ui";
import { useI18n } from "../../i18n";

type AdminPlaceholderPageProps = {
  title: string;
};

export function AdminPlaceholderPage({ title }: AdminPlaceholderPageProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <AdminPageHeader description={t("admin.placeholder.description")} title={title} />
      <PanelCard>
        <EmptyState label={t("admin.placeholder.empty")} />
      </PanelCard>
    </div>
  );
}
