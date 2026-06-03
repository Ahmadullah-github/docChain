import type { FormEvent } from "react";
import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, SelectFilter, StatusBadge } from "../../ui";
import { formatLabel, sampleSerialFor, serialResetPolicyOptions, serialScopeOptions, serialStatusOptions, unsupportedSerialTokens } from "./serialSettingsUtils";
import type { SerialRuleForm } from "./types";

type BuilderMode = "clone" | "create" | "edit";

type SerialFormatBuilderProps = {
  busy?: boolean;
  embedded?: boolean;
  form: SerialRuleForm | null;
  formError?: string | null;
  mode: BuilderMode;
  onCancel: () => void;
  onChange: (patch: Partial<SerialRuleForm>) => void;
  onSaveDraft: () => void;
  onSaveRule: () => void;
};

const fieldClassName = "min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-5 text-slate-900 shadow-sm shadow-slate-900/5 outline-none transition focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10";
const labelClassName = "min-w-0 space-y-1 text-xs font-bold text-slate-600";
const checkboxClassName = "h-4 w-4 rounded border-slate-300 text-[#061d49] focus:ring-[#061d49]";

function TokenChip({ token }: { token: string }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#061d49] ring-1 ring-blue-200">
      {token}
    </span>
  );
}

function titleForMode(mode: BuilderMode, t: ReturnType<typeof useI18n>["t"]) {
  switch (mode) {
    case "clone":
      return t("admin.serialSettings.builder.cloneTitle");
    case "create":
      return t("admin.serialSettings.builder.createTitle");
    case "edit":
    default:
      return t("admin.serialSettings.builder.title");
  }
}

export function SerialFormatBuilder({ busy = false, embedded = false, form, formError, mode, onCancel, onChange, onSaveDraft, onSaveRule }: SerialFormatBuilderProps) {
  const { t } = useI18n();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveRule();
  }

  const unsupportedTokens = form ? unsupportedSerialTokens(form.format) : [];
  const sample = form ? sampleSerialFor(form.format, form.sequence_padding) : "";

  const content = form ? (
    <form className="space-y-3" onSubmit={handleSubmit}>
      {formError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{formError}</div> : null}

      <section className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label className={labelClassName}>
            <span>{t("admin.serialSettings.builder.ruleCode")}</span>
            <input className={`${fieldClassName} force-ltr w-full text-start font-mono`} onChange={(event) => onChange({ code: event.target.value })} required value={form.code} />
          </label>
          <label className={labelClassName}>
            <span>{t("admin.serialSettings.builder.ruleName")}</span>
            <input className={`${fieldClassName} w-full`} onChange={(event) => onChange({ name: event.target.value })} required value={form.name} />
          </label>
          <label className={labelClassName}>
            <span>{t("admin.serialSettings.builder.scope")}</span>
            <SelectFilter className="w-full min-w-0" value={form.scope} onChange={(event) => onChange({ scope: event.target.value as SerialRuleForm["scope"] })}>
              {serialScopeOptions.map((scope) => <option key={scope} value={scope}>{formatLabel(scope)}</option>)}
            </SelectFilter>
          </label>
          <label className={labelClassName}>
            <span>{t("admin.serialSettings.builder.resetPolicy")}</span>
            <SelectFilter className="w-full min-w-0" value={form.reset_policy} onChange={(event) => onChange({ reset_policy: event.target.value as SerialRuleForm["reset_policy"] })}>
              {serialResetPolicyOptions.map((policy) => <option key={policy} value={policy}>{formatLabel(policy)}</option>)}
            </SelectFilter>
          </label>
          <label className={labelClassName}>
            <span>{t("admin.serialSettings.builder.padding")}</span>
            <input className={`${fieldClassName} force-ltr w-full text-start`} max={12} min={1} onChange={(event) => onChange({ sequence_padding: Number(event.target.value) })} type="number" value={form.sequence_padding} />
          </label>
          <label className={labelClassName}>
            <span>{t("admin.serialSettings.builder.status")}</span>
            <SelectFilter className="w-full min-w-0" value={form.status} onChange={(event) => onChange({ status: event.target.value as SerialRuleForm["status"] })}>
              {serialStatusOptions.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
            </SelectFilter>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input checked={form.is_default} className={checkboxClassName} onChange={(event) => onChange({ is_default: event.target.checked })} type="checkbox" />
          {t("admin.serialSettings.builder.setDefault")}
        </label>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {t("admin.serialSettings.builder.formatPattern")}
          <input className={`${fieldClassName} force-ltr mt-2 w-full text-start font-mono font-bold text-[#061d49]`} onChange={(event) => onChange({ format: event.target.value })} required value={form.format} />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {["{YEAR}", "{YY}", "{MONTH}", "{SEQUENCE}", "{SEQ}", "{ORG}", "{DOC}"].map((token) => <TokenChip key={token} token={token} />)}
        </div>
        {unsupportedTokens.length ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            {t("admin.serialSettings.builder.unsupportedTokens", { tokens: unsupportedTokens.join(", ") })}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{t("admin.serialSettings.builder.sample")}</p>
            <p className="force-ltr mt-1 truncate text-start font-mono text-2xl font-bold text-emerald-950" title={sample}>{sample}</p>
          </div>
          <StatusBadge tone={form.is_default ? "green" : "blue"}>
            {form.is_default ? t("admin.serialSettings.builder.defaultRule") : t("admin.serialSettings.builder.availableRule")}
          </StatusBadge>
        </div>
      </section>

      <label className={`${labelClassName} block`}>
        <span>{t("admin.serialSettings.builder.notes")}</span>
        <textarea className={`${fieldClassName} min-h-20 w-full resize-y`} onChange={(event) => onChange({ notes: event.target.value })} value={form.notes} />
      </label>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-[#061d49]">
        <div className="flex gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" name="serial" />
          <p>{t("admin.serialSettings.builder.explanation", { sample })}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Button className="min-h-9 px-3 py-1.5 text-xs" disabled={busy} icon="export" type="submit" variant="primary">{t("admin.serialSettings.builder.saveRule")}</Button>
        <Button className="min-h-9 px-3 py-1.5 text-xs" disabled={busy} icon="document" onClick={onSaveDraft}>{t("admin.serialSettings.builder.saveDraft")}</Button>
        <Button className="min-h-9 px-3 py-1.5 text-xs" disabled={busy} onClick={onCancel}>{t("admin.serialSettings.builder.cancel")}</Button>
      </div>
    </form>
  ) : (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      {t("admin.serialSettings.builder.empty")}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <PanelCard bodyClassName="p-3 sm:p-4" className="h-full overflow-hidden" title={titleForMode(mode, t)}>
      {content}
    </PanelCard>
  );
}
