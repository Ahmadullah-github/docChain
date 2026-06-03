import type { JsonRecord } from "../../api";

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }
  return String(value).replace("T", " ").slice(0, 16);
}

export function textField(record: JsonRecord | null | undefined, key: string, fallback = "-") {
  const value = record?.[key];
  return value == null || value === "" ? fallback : String(value);
}

export function numberField(record: JsonRecord | null | undefined, key: string) {
  const value = record?.[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function statusLabel(value?: string | null) {
  return String(value || "unknown").replaceAll("_", " ");
}
