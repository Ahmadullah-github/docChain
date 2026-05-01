import { useEffect, useState } from "react";
import { adminApi, routingRulesApi, signatureApi } from "../../api";
import type { Organization, RoutingRuleDetail, Unit, UserListItem, JsonRecord } from "../../api";
import {
  AdminPageHeader,
  HierarchyMiniTree,
  RuleMatrixPreview,
  SerialTriggerStepper,
  SignatureRuleMatrix
} from "../../components/admin";
import {
  ActivityTimeline,
  Button,
  DataTable,
  MetricCard,
  PanelCard,
  ReminderList,
  SearchInput,
  StatusBadge,
  Toolbar
} from "../../components/ui";
import { useI18n } from "../../i18n";

type AdminDashboardData = {
  organizations: Organization[];
  routingRules: RoutingRuleDetail[];
  signatureRules: JsonRecord[];
  units: Unit[];
  users: UserListItem[];
};

const emptyData: AdminDashboardData = {
  organizations: [],
  routingRules: [],
  signatureRules: [],
  units: [],
  users: []
};

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function countUnits(units: Unit[], unitTypeCode: string) {
  return units.filter((unit) => unit.unitTypeCode === unitTypeCode).length;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return value.replace("T", " ").slice(0, 16);
}

export function AdminDashboardPage() {
  const { t } = useI18n();
  const [data, setData] = useState<AdminDashboardData>(emptyData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadDashboard() {
      setLoading(true);
      const [organizations, units, users, routingRuleList, signatureRules] = await Promise.all([
        safe(adminApi.organizations.list(), []),
        safe(adminApi.units.list(), []),
        safe(adminApi.users.list(), []),
        safe(routingRulesApi.list({ status: "active", limit: 6 }), []),
        safe(signatureApi.listSignatureRules(), [])
      ]);

      const routingRules = await Promise.all(
        routingRuleList.slice(0, 6).map((rule) => safe(routingRulesApi.get(rule.id), { rule, conditions: [] }))
      );

      if (alive) {
        setData({ organizations, routingRules, signatureRules: signatureRules.slice(0, 6), units, users });
        setLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      alive = false;
    };
  }, []);

  const activeUsers = data.users.filter((user) => user.status === "active").length;
  const stats = [
    { icon: "building" as const, label: t("admin.dashboard.stats.organizations"), value: data.organizations.length },
    { icon: "hierarchy" as const, label: t("admin.dashboard.stats.viceChancelleries"), value: countUnits(data.units, "vice_chancellery") },
    { icon: "document" as const, label: t("admin.dashboard.stats.faculties"), value: countUnits(data.units, "faculty") },
    { icon: "building" as const, label: t("admin.dashboard.stats.departments"), value: countUnits(data.units, "department") },
    { icon: "users" as const, label: t("admin.dashboard.stats.activeUsers"), value: activeUsers },
    { icon: "workflow" as const, label: t("admin.dashboard.stats.workflowRules"), value: data.routingRules.length }
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="building" variant="primary">{t("admin.dashboard.actions.newOrganization")}</Button>
            <Button icon="hierarchy">{t("admin.dashboard.actions.newUnit")}</Button>
            <Button icon="export">{t("admin.dashboard.actions.export")}</Button>
          </>
        )}
        description={t("admin.dashboard.description")}
        title={t("admin.dashboard.title")}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {stats.map((stat) => (
          <MetricCard icon={stat.icon} key={stat.label} label={stat.label} value={loading ? "-" : stat.value} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_1.2fr]">
        <PanelCard
          actions={<Button variant="ghost">{t("admin.dashboard.panels.expand")}</Button>}
          title={t("admin.dashboard.hierarchy.title")}
        >
          <HierarchyMiniTree emptyLabel={t("admin.dashboard.empty.units")} units={data.units} />
        </PanelCard>

        <PanelCard title={t("admin.dashboard.users.title")}>
          <Toolbar>
            <SearchInput placeholder={t("admin.dashboard.users.search")} wrapperClassName="min-w-60 flex-1" />
            <Button icon="users">{t("admin.dashboard.users.invite")}</Button>
          </Toolbar>
          <div className="mt-3">
            <DataTable
              columns={[
                {
                  key: "name",
                  header: t("admin.dashboard.users.columns.name"),
                  cell: (user) => <span className="font-semibold text-slate-900">{user.personDisplayName}</span>
                },
                {
                  key: "username",
                  header: t("admin.dashboard.users.columns.username"),
                  cell: (user) => user.username,
                  hideOnMobile: true
                },
                {
                  key: "status",
                  header: t("admin.dashboard.users.columns.status"),
                  cell: (user) => <StatusBadge>{user.status}</StatusBadge>
                },
                {
                  key: "lastLogin",
                  header: t("admin.dashboard.users.columns.lastLogin"),
                  cell: (user) => formatDate(user.lastLoginAt),
                  hideOnMobile: true
                }
              ]}
              emptyLabel={t("admin.dashboard.empty.users")}
              getRowKey={(user) => user.id}
              rows={data.users.slice(0, 6)}
            />
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_1fr_.9fr]">
        <PanelCard title={t("admin.dashboard.routing.title")}>
          <RuleMatrixPreview emptyLabel={t("admin.dashboard.empty.routingRules")} rules={data.routingRules} />
        </PanelCard>

        <PanelCard title={t("admin.dashboard.signature.title")}>
          <SignatureRuleMatrix emptyLabel={t("admin.dashboard.empty.signatureRules")} rules={data.signatureRules} />
        </PanelCard>

        <PanelCard title={t("admin.dashboard.activity.title")}>
          <ActivityTimeline
            items={[
              {
                title: t("admin.dashboard.activity.item1"),
                meta: t("admin.dashboard.activity.actor1"),
                time: "2025-05-19 10:02"
              },
              {
                title: t("admin.dashboard.activity.item2"),
                meta: t("admin.dashboard.activity.actor2"),
                time: "2025-05-19 09:45"
              },
              {
                title: t("admin.dashboard.activity.item3"),
                meta: t("admin.dashboard.activity.actor3"),
                time: "2025-05-19 09:10"
              },
              {
                title: t("admin.dashboard.activity.item4"),
                meta: t("admin.dashboard.activity.actor4"),
                time: "2025-05-18 08:15"
              }
            ]}
          />
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_.7fr]">
        <SerialTriggerStepper
          labels={[
            t("admin.dashboard.serial.step1"),
            t("admin.dashboard.serial.step2"),
            t("admin.dashboard.serial.step3"),
            t("admin.dashboard.serial.step4"),
            t("admin.dashboard.serial.step5")
          ]}
          note={t("admin.dashboard.serial.note")}
          title={t("admin.dashboard.serial.title")}
        />

        <PanelCard title={t("admin.dashboard.reminders.title")}>
          <ReminderList
            items={[
              { icon: "shield", text: t("admin.dashboard.reminders.item1") },
              { icon: "users", text: t("admin.dashboard.reminders.item2") },
              { icon: "signature", text: t("admin.dashboard.reminders.item3") },
              { icon: "audit", text: t("admin.dashboard.reminders.item4") }
            ]}
          />
        </PanelCard>
      </section>
    </div>
  );
}
