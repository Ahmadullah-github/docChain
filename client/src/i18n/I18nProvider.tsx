import { createContext, useContext, useEffect, useState } from "react";
import { setApiLocale } from "../lib/api";
import {
  defaultLocale,
  localeDirection,
  localeOptions,
  normalizeLocale,
  translations
} from "./locales";
import type { Direction, Locale, TranslationKey } from "./locales";

const storageKey = "docchain.locale";

type TranslationValues = Record<string, string | number | null | undefined>;

type I18nState = {
  locale: Locale;
  direction: Direction;
  localeOptions: typeof localeOptions;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
};

const I18nContext = createContext<I18nState | null>(null);

function initialLocale() {
  if (typeof window === "undefined") {
    return defaultLocale;
  }

  const storedLocale = window.localStorage.getItem(storageKey);
  if (storedLocale) {
    return normalizeLocale(storedLocale);
  }

  return normalizeLocale(window.navigator.language);
}

function interpolate(template: string, values?: TranslationValues) {
  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ""));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const direction = localeDirection(locale);

  function setLocale(nextLocale: Locale) {
    setLocaleState(nextLocale);
    window.localStorage.setItem(storageKey, nextLocale);
  }

  function t(key: TranslationKey, values?: TranslationValues) {
    const dictionary = translations[locale] || translations.en;
    return interpolate(dictionary[key] || translations.en[key], values);
  }

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.documentElement.dataset.locale = locale;
    document.documentElement.dataset.direction = direction;
    setApiLocale(locale);
  }, [direction, locale]);

  return (
    <I18nContext.Provider value={{ locale, direction, localeOptions, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside I18nProvider.");
  }
  return value;
}
