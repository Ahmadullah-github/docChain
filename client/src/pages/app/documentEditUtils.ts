import type { DocumentContent, TemplateLayout } from "../../api";

export type TemplateFieldBlock = {
  id: string;
  key: string;
  label: string;
  maxLines: number;
  placeholder: string;
};

const templateFieldPrefix = "document.template.";
const headerTemplateFieldKey = "header_unit";
const headerTemplateMaxLines = 3;
const templateFieldMaxLength = 10000;

export function parseTemplateFields(value: unknown): Record<string, string> {
  if (!value) {
    return {};
  }

  const parsed = typeof value === "string" ? (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return {};
    }
  })() : value;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>)
      .filter(([, item]) => typeof item === "string")
      .map(([key, item]) => [key, String(item)])
  );
}

export function normalizeTemplateFields(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, value.replace(/\r\n?/g, "\n").trimEnd()])
      .filter(([key, value]) => key && value)
  );
}

function templateFieldKey(block: NonNullable<TemplateLayout["blocks"]>[number]) {
  return block.type === "dynamic_field" && block.field?.startsWith(templateFieldPrefix)
    ? block.field.slice(templateFieldPrefix.length)
    : "";
}

function templateFieldLabel(block: NonNullable<TemplateLayout["blocks"]>[number], key: string) {
  if (key === headerTemplateFieldKey) {
    return "Header unit / position";
  }
  return block.placeholder || block.content || key.replaceAll("_", " ");
}

export function templateFieldsForLayout(layout?: TemplateLayout | null): TemplateFieldBlock[] {
  const blockFields = (layout?.blocks || [])
    .map((block) => {
      const key = templateFieldKey(block);
      return key ? {
        id: block.id,
        key,
        label: templateFieldLabel(block, key),
        maxLines: Math.max(1, Math.min(6, Number(block.maxLines || (key === headerTemplateFieldKey ? headerTemplateMaxLines : 3)))),
        placeholder: block.placeholder || "Write header text"
      } : null;
    })
    .filter((item): item is TemplateFieldBlock => Boolean(item));

  if (layout?.mode === "word_template") {
    const zoneFields = (layout.zones || [])
      .filter((zone) => !["subject", "body"].includes(zone.key))
      .filter((zone) => !["system_field", "signature", "date", "serial"].includes(zone.kind))
      .map((zone) => ({
        id: zone.id,
        key: zone.key,
        label: zone.label || zone.key.replaceAll("_", " "),
        maxLines: Math.max(1, Math.min(12, Number(zone.maxLines || (zone.multiline ? 4 : 1)))),
        placeholder: zone.placeholder || zone.label || "Write field text"
      }));
    const seen = new Set<string>();
    return [...zoneFields, ...blockFields].filter((field) => {
      if (seen.has(field.key)) {
        return false;
      }
      seen.add(field.key);
      return true;
    });
  }

  return blockFields;
}

export function limitTemplateFieldValue(value: string, maxLines: number) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .slice(0, maxLines)
    .join("\n")
    .slice(0, templateFieldMaxLength);
}

export function dateInputValue(value: unknown) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

export function draftContentKey(input: {
  confidentialityId: string;
  content: DocumentContent;
  date: string;
  priorityId: string;
  subject: string;
  summary: string;
  templateFields: Record<string, string>;
}) {
  return JSON.stringify(input);
}
