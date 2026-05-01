import { useI18n } from "../../i18n";
import { SelectFilter } from "../ui";
import type { Locale } from "../../i18n";

export function LanguageSwitcher() {
  const { locale, localeOptions, setLocale, t } = useI18n();

  return (
    <label className="text-sm font-medium text-slate-700">
      <span className="sr-only">{t("app.language")}</span>
      <SelectFilter
        aria-label={t("app.language")}
        className="min-w-20 border-transparent bg-transparent px-2 font-bold text-[#061d49] ring-0 focus:ring-2"
        onChange={(event) => setLocale(event.target.value as Locale)}
        value={locale}
      >
        {localeOptions.map((option) => (
          <option key={option.code} value={option.code}>
            {option.code === "en" ? "EN" : option.code === "fa-AF" ? "FA" : "PS"}
          </option>
        ))}
      </SelectFilter>
    </label>
  );
}
