import type { TemplateBlock, TemplateLayout } from "../../api";

export type StaffTemplateFieldKind = "subject" | "body" | "template";

export type StaffTemplateFieldDefinition = {
  id: string;
  key: string;
  kind: StaffTemplateFieldKind;
  label: string;
  maxLength: number;
  maxLines: number;
  multiline: boolean;
  placeholder: string;
  required: boolean;
  richText: boolean;
};

export type StaffTemplateFieldValues = {
  bodyText: string;
  subject: string;
  templateFields: Record<string, string>;
};

const templateFieldPrefix = "document.template.";
const defaultTemplateFieldMaxLength = 500;
const subjectMaxLength = 255;
const bodyMaxLength = 200000;
const ignoredWordZoneKinds = new Set(["system_field", "signature", "date", "serial"]);

export function staffTemplateLabelFromKey(key: string) {
  if (key === "header_unit") {
    return "Header unit / position";
  }

  return key
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function finiteNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clampLines(value: unknown, fallback: number) {
  return Math.max(1, Math.min(120, Math.round(finiteNumber(value, fallback))));
}

function defaultSubjectField(): StaffTemplateFieldDefinition {
  return {
    id: "staff-subject",
    key: "subject",
    kind: "subject",
    label: "Subject",
    maxLength: subjectMaxLength,
    maxLines: 2,
    multiline: false,
    placeholder: "Document subject",
    required: true,
    richText: false
  };
}

function defaultBodyField(): StaffTemplateFieldDefinition {
  return {
    id: "staff-body",
    key: "body",
    kind: "body",
    label: "Body",
    maxLength: bodyMaxLength,
    maxLines: 80,
    multiline: true,
    placeholder: "Write the document body...",
    required: true,
    richText: true
  };
}

function dedupeFields(fields: StaffTemplateFieldDefinition[]) {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = `${field.kind}:${field.key}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function ensureCoreFields(fields: StaffTemplateFieldDefinition[]) {
  const next = [...fields];
  if (!next.some((field) => field.kind === "subject")) {
    next.unshift(defaultSubjectField());
  }
  if (!next.some((field) => field.kind === "body")) {
    next.push(defaultBodyField());
  }
  return next;
}

function wordZoneToField(zone: NonNullable<TemplateLayout["zones"]>[number]): StaffTemplateFieldDefinition | null {
  const key = String(zone.key || "").trim();
  const kind = String(zone.kind || "");
  if (!key || ignoredWordZoneKinds.has(kind)) {
    return null;
  }

  const fieldKind: StaffTemplateFieldKind = key === "subject" || kind === "subject"
    ? "subject"
    : key === "body" || kind === "body"
      ? "body"
      : "template";
  const defaultField = fieldKind === "subject"
    ? defaultSubjectField()
    : fieldKind === "body"
      ? defaultBodyField()
      : null;
  const multiline = typeof zone.multiline === "boolean" ? zone.multiline : fieldKind !== "subject";

  return {
    id: String(zone.id || `zone-${key}`),
    key,
    kind: fieldKind,
    label: String(zone.label || defaultField?.label || staffTemplateLabelFromKey(key)),
    maxLength: Math.max(1, finiteNumber(zone.maxLength, defaultField?.maxLength || defaultTemplateFieldMaxLength)),
    maxLines: clampLines(zone.maxLines, defaultField?.maxLines || (multiline ? 4 : 1)),
    multiline,
    placeholder: String(zone.placeholder || zone.label || defaultField?.placeholder || staffTemplateLabelFromKey(key)),
    required: fieldKind === "subject" || fieldKind === "body" || Boolean(zone.required),
    richText: typeof zone.richText === "boolean" ? zone.richText : fieldKind === "body"
  };
}

function legacyBlockToField(block: TemplateBlock): StaffTemplateFieldDefinition | null {
  if (block.hidden || block.type !== "dynamic_field") {
    return null;
  }

  const field = block.field || "";
  const kind: StaffTemplateFieldKind | null = field === "document.subject"
    ? "subject"
    : field === "document.body"
      ? "body"
      : field.startsWith(templateFieldPrefix)
        ? "template"
        : null;
  if (!kind) {
    return null;
  }

  const key = kind === "template" ? field.slice(templateFieldPrefix.length) : kind;
  if (!key) {
    return null;
  }

  const defaultField = kind === "subject"
    ? defaultSubjectField()
    : kind === "body"
      ? defaultBodyField()
      : null;
  const maxLines = clampLines(block.maxLines, defaultField?.maxLines || (key === "header_unit" ? 3 : 2));

  return {
    id: block.id || `block-${key}`,
    key,
    kind,
    label: block.placeholder || block.content || defaultField?.label || staffTemplateLabelFromKey(key),
    maxLength: defaultField?.maxLength || defaultTemplateFieldMaxLength,
    maxLines,
    multiline: kind !== "subject",
    placeholder: block.placeholder || defaultField?.placeholder || staffTemplateLabelFromKey(key),
    required: kind === "subject" || kind === "body",
    richText: kind === "body"
  };
}

export function staffTemplateFieldsForLayout(layout?: TemplateLayout | null): StaffTemplateFieldDefinition[] {
  if (layout?.mode === "word_template") {
    const zoneFields = (layout.zones || [])
      .map(wordZoneToField)
      .filter((field): field is StaffTemplateFieldDefinition => Boolean(field));
    const floatingFields = (layout.blocks || [])
      .map(legacyBlockToField)
      .filter((field): field is StaffTemplateFieldDefinition => Boolean(field));
    const fields = [...zoneFields, ...floatingFields];
    return ensureCoreFields(dedupeFields(fields));
  }

  const fields = (layout?.blocks || [])
    .map(legacyBlockToField)
    .filter((field): field is StaffTemplateFieldDefinition => Boolean(field));
  return ensureCoreFields(dedupeFields(fields));
}

export function limitStaffTemplateFieldValue(value: string, definition: StaffTemplateFieldDefinition) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .slice(0, definition.maxLines)
    .join("\n")
    .slice(0, definition.maxLength);
}

export function missingRequiredStaffTemplateFields(
  definitions: StaffTemplateFieldDefinition[],
  values: StaffTemplateFieldValues
) {
  return definitions.filter((definition) => {
    if (!definition.required) {
      return false;
    }
    if (definition.kind === "subject") {
      return !values.subject.trim();
    }
    if (definition.kind === "body") {
      return !values.bodyText.trim();
    }
    return !String(values.templateFields[definition.key] || "").trim();
  });
}
