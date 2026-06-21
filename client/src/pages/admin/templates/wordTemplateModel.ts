import type { DocumentType, EntityId, TemplateLayout, TipTapNode, WordTemplateZone } from "../../../api";

export const wordTemplateMode = "word_template";
export const wordTemplateSchemaVersion = 2;

function emptyWordTemplateDocument(): TipTapNode {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function normalizeWordTemplateZoneKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function zoneToken(key: string) {
  return `{{zone:${normalizeWordTemplateZoneKey(key) || "custom_field"}}}`;
}

export function systemToken(key: string) {
  return `{{system:${key}}}`;
}

export function dateToken(calendar: "gregorian" | "shamsi" | "hijri" = "shamsi") {
  return `{{date:${calendar}}}`;
}

export function signatureToken(mode: "completed" | "slots" = "completed") {
  return `{{signature:${mode}}}`;
}

export function defaultTemplateNameForWordDocumentType(documentType?: Pick<DocumentType, "name"> | null) {
  return documentType?.name ? `${documentType.name} Template` : "Official Document Template";
}

export function defaultWordTemplateLayout(documentType?: Pick<DocumentType, "code" | "id" | "name"> | null): TemplateLayout {
  return {
    mode: wordTemplateMode,
    schemaVersion: wordTemplateSchemaVersion,
    page: {
      widthMm: 210,
      heightMm: 297,
      marginTopMm: 18,
      marginRightMm: 18,
      marginBottomMm: 18,
      marginLeftMm: 18,
      direction: "rtl",
      backgroundColor: "#ffffff"
    },
    blocks: [],
    document: emptyWordTemplateDocument(),
    zones: [],
    meta: {
      documentTypeId: documentType?.id || null,
      documentTypeName: documentType?.name || null,
      documentTypeCode: documentType?.code || null,
      editor: "word_template"
    }
  };
}

export function isWordTemplateLayout(layout?: TemplateLayout | null): layout is TemplateLayout & { document: TipTapNode; zones: WordTemplateZone[] } {
  return Boolean(layout?.mode === wordTemplateMode && layout.document);
}

export function wordTemplateZones(layout?: TemplateLayout | null) {
  return isWordTemplateLayout(layout) ? layout.zones || [] : [];
}

export function editableWordTemplateZones(layout?: TemplateLayout | null) {
  return wordTemplateZones(layout).filter((zone) => !["system_field", "signature", "date", "serial"].includes(zone.kind));
}

export function upsertWordTemplateZone(layout: TemplateLayout, zone: WordTemplateZone): TemplateLayout {
  const zones = [...wordTemplateZones(layout)];
  const normalizedKey = normalizeWordTemplateZoneKey(zone.key);
  const index = zones.findIndex((item) => item.key === normalizedKey);
  const nextZone = { ...zone, key: normalizedKey };
  if (index >= 0) {
    zones[index] = { ...zones[index], ...nextZone };
  } else {
    zones.push(nextZone);
  }
  return { ...layout, zones };
}

export function withWordTemplateDocument(layout: TemplateLayout, document: TipTapNode): TemplateLayout {
  return {
    ...layout,
    mode: wordTemplateMode,
    schemaVersion: wordTemplateSchemaVersion,
    blocks: layout.blocks || [],
    document
  };
}

function withoutInlineTemplateTables(node: TipTapNode): { node: TipTapNode | null; removed: number } {
  if (["table", "tableRow", "tableCell", "tableHeader"].includes(node.type)) {
    return { node: null, removed: node.type === "table" ? 1 : 0 };
  }

  let removed = 0;
  const content = (node.content || []).flatMap((child) => {
    const result = withoutInlineTemplateTables(child);
    removed += result.removed;
    return result.node ? [result.node] : [];
  });
  const next = { ...node };
  if (node.content) {
    next.content = content;
  }
  if (next.type === "doc" && !next.content?.length) {
    next.content = [{ type: "paragraph" }];
  }
  return { node: next, removed };
}

export function stripInlineTablesFromWordLayout(layout: TemplateLayout) {
  const source = layout.document || emptyWordTemplateDocument();
  const result = withoutInlineTemplateTables(source);
  return {
    layout: withWordTemplateDocument(layout, result.node || emptyWordTemplateDocument()),
    removedTableCount: result.removed
  };
}

export function withWordTemplateDocumentType(layout: TemplateLayout, documentType: Pick<DocumentType, "code" | "id" | "name"> | null): TemplateLayout {
  return {
    ...layout,
    meta: {
      ...(layout.meta || {}),
      documentTypeId: documentType?.id || null,
      documentTypeName: documentType?.name || null,
      documentTypeCode: documentType?.code || null,
      editor: "word_template"
    }
  };
}

export function documentTypeIdFromWordLayout(layout?: TemplateLayout | null): EntityId | null {
  const value = layout?.meta?.documentTypeId;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric as EntityId : null;
}
