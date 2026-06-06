import fs from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { documentContentToPlainText, normalizeDocumentContent, type DocumentContent, type TipTapNode } from "../documents/document-content";

export type TemplateLayout = Record<string, unknown> & {
  mode?: string;
  schemaVersion?: number;
  page?: Record<string, unknown>;
  blocks?: Array<Record<string, unknown>>;
  document?: TipTapNode;
  zones?: Array<Record<string, unknown>>;
};

type RenderContext = {
  document: Record<string, unknown>;
  endorsements?: Array<Record<string, unknown>>;
  pageNumber?: number;
  signatureVisibility?: Record<string, boolean>;
  signatureEvents: RowDataPacket[];
  verification?: {
    qrDataUrl?: string;
    url?: string;
  } | null;
  workflowEvents: RowDataPacket[];
  serialAssignment: Record<string, unknown> | null;
};

type PageDirection = "ltr" | "rtl";
type PhysicalTextAlign = "left" | "center" | "right";
export type DocumentDateCalendar = "gregorian" | "shamsi" | "hijri";

const pageWidthMm = 210;
const pageHeightMm = 297;
const templateDateTimeZone = "Asia/Kabul";
const templateFieldPrefix = "document.template.";
const ptToMm = 0.352778;
const persianFontFiles = [
  { family: "Besmellah", file: "Besmellah.regular.woff2", weight: 400 },
  { family: "ShapedBesmellah", file: "ShapedBesmellah.regular.woff2", weight: 400 },
  { family: "IranNastaliq", file: "IranNastaliq.regular.woff2", weight: 400 },
  { family: "Lotus", file: "Lotus.regular.woff2", weight: 400 },
  { family: "Morvarid", file: "Morvarid.regular.woff2", weight: 400 },
  { family: "Nazanin", file: "Nazanin.regular.woff2", weight: 400 },
  { family: "Titr", file: "Titr.bold.woff2", weight: 700 },
  { family: "Traffic", file: "Traffic.regular.woff2", weight: 400 },
  { family: "Yekan", file: "Yekan.regular.woff2", weight: 400 },
  { family: "Zar", file: "Zar.regular.woff2", weight: 400 }
];

let cachedPersianFontFaceCss: string | null = null;

type PreparedBlock = {
  block: Record<string, unknown>;
  content?: unknown;
};

type RichHtmlContent = {
  html: string;
  isHtml: true;
  text: string;
};

const endorsementCommentMaxLength = 300;

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function boolValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function jsonRecordValue(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function safeTextAlign(value: unknown) {
  const textAlign = stringValue(value);
  return ["left", "right", "center", "justify"].includes(textAlign) ? textAlign : "";
}

function htmlStyleAttribute(style: Array<string | false | undefined>) {
  const values = style.filter(Boolean);
  return values.length ? ` style="${values.join(";")}"` : "";
}

function safeLineHeight(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 3 ? String(Math.round(numeric * 100) / 100) : "";
}

function richNodeStyleAttribute(attrs: Record<string, unknown>) {
  const textAlign = safeTextAlign(attrs.textAlign);
  const lineHeight = safeLineHeight(attrs.lineHeight);
  return htmlStyleAttribute([
    textAlign ? `text-align:${textAlign}` : false,
    lineHeight ? `line-height:${lineHeight}` : false
  ]);
}

function persianFontFaceCss() {
  if (cachedPersianFontFaceCss !== null) {
    return cachedPersianFontFaceCss;
  }
  const roots = [
    path.resolve(process.cwd(), "client/dist/fonts/persian"),
    path.resolve(process.cwd(), "client/public/fonts/persian")
  ];
  cachedPersianFontFaceCss = persianFontFiles.map((font) => {
    const filePath = roots.map((root) => path.join(root, font.file)).find((candidate) => fs.existsSync(candidate));
    if (!filePath) {
      return "";
    }
    const base64 = fs.readFileSync(filePath).toString("base64");
    return `@font-face{font-family:"${font.family}";src:url("data:font/woff2;base64,${base64}") format("woff2");font-weight:${font.weight};font-style:normal;font-display:swap;}`;
  }).filter(Boolean).join("\n");
  return cachedPersianFontFaceCss;
}

function tableColumnWidthsForNode(node: TipTapNode) {
  const firstRow = node.content?.[0];
  const widths: number[] = [];
  (firstRow?.content || []).forEach((cell) => {
    const attrs = cell.attrs || {};
    const colSpan = Math.max(1, Math.min(12, Math.round(numberValue(attrs.colspan || attrs.colSpan, 1))));
    const colwidth = Array.isArray(attrs.colwidth) ? attrs.colwidth : [];
    for (let index = 0; index < colSpan; index += 1) {
      const width = numberValue(colwidth[index], 0);
      widths.push(width > 0 ? Math.round(width) : 0);
    }
  });
  return widths;
}

function richTextForNode(node: TipTapNode): string {
  if (node.type === "text") {
    let html = escapeHtml(node.text || "");
    for (const mark of node.marks || []) {
      if (mark.type === "bold") {
        html = `<strong>${html}</strong>`;
      } else if (mark.type === "italic") {
        html = `<em>${html}</em>`;
      } else if (mark.type === "underline") {
        html = `<u>${html}</u>`;
      } else if (mark.type === "textStyle") {
        const attrs = mark.attrs || {};
        const color = cssColor(attrs.color, "");
        const fontFamily = stringValue(attrs.fontFamily);
        const fontSize = stringValue(attrs.fontSize);
        html = `<span${htmlStyleAttribute([
          color ? `color:${color}` : false,
          fontFamily ? `font-family:${escapeHtml(fontFamily)}` : false,
          /^\d+(?:\.\d+)?(?:px|pt|rem|em|%)$/.test(fontSize) ? `font-size:${fontSize}` : false
        ])}>${html}</span>`;
      } else if (mark.type === "highlight") {
        const color = cssColor(mark.attrs?.color, "#fef08a");
        html = `<mark style="background:${color};padding:0 .3mm">${html}</mark>`;
      }
    }
    return html;
  }

  if (node.type === "hardBreak") {
    return "<br />";
  }

  if (node.type === "horizontalRule") {
    return "<hr />";
  }

  const children = (node.content || []).map((child) => richTextForNode(child)).join("");
  const attrs = node.attrs || {};
  if (node.type === "paragraph") {
    return `<p${richNodeStyleAttribute(attrs)}>${children || "<br />"}</p>`;
  }
  if (node.type === "heading") {
    const level = Math.max(1, Math.min(3, Math.round(numberValue(attrs.level, 2))));
    return `<h${level}${richNodeStyleAttribute(attrs)}>${children || "<br />"}</h${level}>`;
  }
  if (node.type === "bulletList") {
    return `<ul>${children}</ul>`;
  }
  if (node.type === "orderedList") {
    return `<ol>${children}</ol>`;
  }
  if (node.type === "listItem") {
    return `<li>${children}</li>`;
  }
  if (node.type === "blockquote") {
    return `<blockquote>${children}</blockquote>`;
  }
  if (node.type === "table") {
    const widths = tableColumnWidthsForNode(node);
    const fixedWidth = widths.length && widths.every((width) => width > 0);
    const colgroup = widths.length ? `<colgroup>${widths.map((width) => `<col${width > 0 ? ` style="width:${width}px"` : ""} />`).join("")}</colgroup>` : "";
    return `<table class="dc-rich-table"${fixedWidth ? ` style="width:${widths.reduce((sum, width) => sum + width, 0)}px"` : ""}>${colgroup}<tbody>${children}</tbody></table>`;
  }
  if (node.type === "tableRow") {
    const height = numberValue(attrs.height, 0);
    return `<tr${htmlStyleAttribute([height > 0 ? `height:${Math.round(height)}px` : false])}>${children}</tr>`;
  }
  if (node.type === "tableCell" || node.type === "tableHeader") {
    const tag = node.type === "tableHeader" ? "th" : "td";
    const colSpan = Math.max(1, Math.min(12, Math.round(numberValue(attrs.colspan || attrs.colSpan, 1))));
    const rowSpan = Math.max(1, Math.min(24, Math.round(numberValue(attrs.rowspan || attrs.rowSpan, 1))));
    const spanAttrs = `${colSpan > 1 ? ` colspan="${colSpan}"` : ""}${rowSpan > 1 ? ` rowspan="${rowSpan}"` : ""}`;
    const backgroundColor = cssColor(attrs.backgroundColor || attrs.bgColor, "");
    return `<${tag}${spanAttrs}${htmlStyleAttribute([backgroundColor ? `background:${backgroundColor}` : false])}>${children || "<br />"}</${tag}>`;
  }
  if (node.type === "image") {
    const src = imageSource(attrs.src);
    const alt = stringValue(attrs.alt);
    const title = stringValue(attrs.title);
    const width = numberValue(attrs.width, 0);
    const height = numberValue(attrs.height, 0);
    const align = stringValue(attrs.align);
    const alignStyle = align === "center"
      ? "display:block;margin-inline:auto"
      : align === "left"
        ? "display:block;margin-inline-end:auto"
        : align === "right"
          ? "display:block;margin-inline-start:auto"
          : "";
    return src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ""}${width > 0 ? ` width="${Math.round(width)}"` : ""}${height > 0 ? ` height="${Math.round(height)}"` : ""}${htmlStyleAttribute([
      width > 0 ? `width:${Math.round(width)}px` : false,
      height > 0 ? `height:${Math.round(height)}px` : false,
      alignStyle || false
    ])} />` : "";
  }

  return children;
}

function richTextPlainForNode(node: TipTapNode): string {
  if (node.type === "text") {
    return node.text || "";
  }
  if (node.type === "hardBreak") {
    return "\n";
  }
  if (node.type === "horizontalRule") {
    return "\n\n";
  }
  const children = (node.content || []).map((child) => richTextPlainForNode(child)).join("");
  if (["paragraph", "heading", "blockquote", "listItem"].includes(node.type)) {
    return `${children}\n`;
  }
  if (node.type === "tableCell" || node.type === "tableHeader") {
    return `${children.trim()} | `;
  }
  if (node.type === "tableRow") {
    return `${children.replace(/\s+\|\s*$/, "")}\n`;
  }
  if (node.type === "table") {
    return `${children}\n`;
  }
  return children;
}

function richTextForDoc(node: TipTapNode): RichHtmlContent {
  const doc = node.type === "doc" ? node : { type: "doc", content: [node] };
  return {
    html: (doc.content || []).map((child) => richTextForNode(child)).join(""),
    isHtml: true,
    text: richTextPlainForNode(doc).trim()
  };
}

function richContentValue(context: RenderContext): DocumentContent {
  return normalizeDocumentContent(context.document.document_content || context.document.documentContent, {
    body: stringValue(context.document.body),
    date: stringValue(context.document.document_date || context.document.documentDate) || null,
    subject: stringValue(context.document.subject),
    summary: stringValue(context.document.summary) || null,
    templateFields: jsonRecordValue(context.document.template_fields || context.document.templateFields) as Record<string, string>
  });
}

function tipTapNodeCharacterCount(node: TipTapNode) {
  return richTextPlainForNode(node).length;
}

function splitRichBodyIntoPages(content: DocumentContent, maxCharsPerPage = 2200): TipTapNode[] {
  const topLevel = content.body.type === "doc" ? content.body.content || [] : [content.body];
  const pages: TipTapNode[] = [{ type: "doc", content: [] }];
  let currentCount = 0;
  const startPage = () => {
    if ((pages[pages.length - 1].content || []).length) {
      pages.push({ type: "doc", content: [] });
      currentCount = 0;
    }
  };

  for (const node of topLevel) {
    if (node.type === "horizontalRule") {
      startPage();
      continue;
    }

    const nodeCount = Math.max(1, tipTapNodeCharacterCount(node));
    if (currentCount > 0 && currentCount + nodeCount > maxCharsPerPage) {
      startPage();
    }
    pages[pages.length - 1].content = [...(pages[pages.length - 1].content || []), node];
    currentCount += nodeCount;
  }

  const populatedPages = pages.filter((page) => (page.content || []).length);
  return populatedPages.length ? populatedPages : [{ type: "doc", content: [{ type: "paragraph" }] }];
}

function blockPageScope(block: Record<string, unknown>, field = "") {
  const explicit = stringValue(block.pageScope);
  if (["all", "first", "except_first", "last"].includes(explicit)) {
    return explicit;
  }
  const id = stringValue(block.id).toLowerCase();
  const type = stringValue(block.type);
  if (field === "document.body" || type === "page_number" || id.includes("footer")) {
    return "all";
  }
  if (type === "signature_zone" || type === "comments_zone") {
    return "last";
  }
  if (type === "watermark") {
    return "all";
  }
  return "first";
}

function shouldRenderBlockOnPage(block: Record<string, unknown>, pageIndex: number, totalPages: number) {
  const field = stringValue(block.field);
  const scope = blockPageScope(block, field);
  if (scope === "all") {
    return true;
  }
  if (scope === "first") {
    return pageIndex === 0;
  }
  if (scope === "except_first") {
    return pageIndex > 0;
  }
  if (scope === "last") {
    return pageIndex === totalPages - 1;
  }
  return pageIndex === 0;
}

function htmlContent(value: unknown): value is RichHtmlContent {
  return Boolean(value && typeof value === "object" && (value as RichHtmlContent).isHtml === true);
}

function cssColor(value: unknown, fallback = "transparent") {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed) || /^rgba?\([0-9.,\s%]+\)$/.test(trimmed) || /^[a-zA-Z]+$/.test(trimmed)) {
    return trimmed;
  }

  return fallback;
}

function pageDirectionValue(value: unknown): PageDirection {
  return stringValue(value, "rtl") === "ltr" ? "ltr" : "rtl";
}

function resolveTextAlign(value: unknown, pageDirection: PageDirection): PhysicalTextAlign {
  const textAlign = stringValue(value, "start");
  if (textAlign === "center" || textAlign === "left" || textAlign === "right") {
    return textAlign;
  }
  if (textAlign === "end") {
    return pageDirection === "rtl" ? "left" : "right";
  }
  return pageDirection === "rtl" ? "right" : "left";
}

function parseTemplateDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  const raw = stringValue(value);
  if (!raw) {
    return null;
  }

  const dateOnly = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnly) {
    return new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12));
  }

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) && !/(?:z|[+-]\d{2}:?\d{2})$/i.test(raw)
    ? `${raw.replace(" ", "T")}Z`
    : raw;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function formatTemplateDocumentDate(value: unknown, calendar: DocumentDateCalendar) {
  const date = parseTemplateDate(value);
  if (!date) {
    return "";
  }

  const locale = calendar === "gregorian"
    ? "en-US-u-ca-gregory-nu-latn"
    : calendar === "shamsi"
      ? "fa-AF-u-ca-persian-nu-arabext"
      : "fa-AF-u-ca-islamic-nu-arabext";
  const parts = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    timeZone: templateDateTimeZone,
    year: "numeric"
  }).formatToParts(date);
  const partValue = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value || "";
  const year = partValue("year");
  const month = partValue("month");
  const day = partValue("day");

  return year && month && day ? `${year}/${month}/${day}` : "";
}

function blockStyle(block: Record<string, unknown>, pageDirection: PageDirection) {
  const style = typeof block.style === "object" && block.style ? block.style as Record<string, unknown> : {};
  const type = stringValue(block.type);
  const x = numberValue(block.x, 20);
  const y = numberValue(block.y, 20);
  const width = numberValue(block.width, 60);
  const height = numberValue(block.height, 12);
  const rawBorderWidth = numberValue(style.borderWidth, 0);
  const rawBorderStyle = stringValue(style.borderStyle, "solid").toLowerCase();
  const borderWidth = rawBorderStyle === "dashed" ? 0 : rawBorderWidth;
  const fontFamily = stringValue(style.fontFamily);
  const fontSize = numberValue(style.fontSize, 10);
  const lineHeight = numberValue(style.lineHeight, 1.65);
  const fontWeight = stringValue(style.fontWeight, "400");
  const fontStyle = stringValue(style.fontStyle) === "italic" ? "italic" : "normal";
  const textDecoration = stringValue(style.textDecoration) === "underline" ? "underline" : "none";
  const textAlign = resolveTextAlign(style.textAlign, pageDirection);
  const letterSpacing = Number.isFinite(Number(style.letterSpacing))
    ? Number(style.letterSpacing)
    : dateCalendarForDynamicField(stringValue(block.field))
      ? 0.04
      : 0;
  const color = cssColor(style.color, "#111827");
  const backgroundColor = cssColor(style.backgroundColor);
  const borderColor = cssColor(style.borderColor, "#94a3b8");
  const borderStyle = borderWidth > 0 ? stringValue(style.borderStyle, "solid") : "none";

  if (type === "line") {
    const lineBorderWidth = rawBorderStyle === "solid" ? Math.max(1, rawBorderWidth) : 0;
    return [
      "position:absolute",
      `left:${x}mm`,
      `top:${y}mm`,
      `width:${width}mm`,
      `height:${Math.max(0.5, height)}mm`,
      lineBorderWidth > 0 ? `border-top:${lineBorderWidth}px solid ${borderColor}` : "border-top:0",
      "box-sizing:border-box",
      "overflow:visible",
      "padding:0"
    ].join(";");
  }

  const heightStyle = ["image", "logo", "qr", "table"].includes(type) ? `height:${height}mm` : `min-height:${height}mm`;

  return [
    "position:absolute",
    `left:${x}mm`,
    `top:${y}mm`,
    `width:${width}mm`,
    heightStyle,
    `font-size:${fontSize}pt`,
    `line-height:${lineHeight}`,
    `font-weight:${fontWeight}`,
    `font-style:${fontStyle}`,
    `text-decoration:${textDecoration}`,
    letterSpacing ? `letter-spacing:${letterSpacing}em` : "",
    `text-align:${textAlign}`,
    `color:${color}`,
    `background:${backgroundColor}`,
    `border:${borderWidth}px ${borderStyle} ${borderColor}`,
    fontFamily ? `font-family:${fontFamily}` : "",
    "box-sizing:border-box",
    "overflow:hidden",
    "white-space:pre-wrap"
  ].join(";");
}

function resolveDynamicField(field: string, context: RenderContext) {
  const documentContent = richContentValue(context);
  if (field.startsWith(templateFieldPrefix)) {
    const templateFields = {
      ...jsonRecordValue(context.document.template_fields || context.document.templateFields),
      ...documentContent.templateFields
    };
    return templateFields[field.slice(templateFieldPrefix.length)] || "";
  }

  const documentDate = context.document.document_date || context.document.documentDate || context.document.created_at || context.document.createdAt;
  const metadata = documentContent.metadata || {};
  const map: Record<string, unknown> = {
    "document.subject": context.document.subject,
    "document.body": documentContentToPlainText(documentContent) || context.document.body,
    "document.summary": context.document.summary,
    "document.topic": metadata.topic,
    "document.sub_topic": metadata.subTopic,
    "document.internal_reference": context.document.internal_reference,
    "document.official_serial": context.document.official_serial || context.serialAssignment?.serial_value,
    "document.status": context.document.status,
    "document.date": formatTemplateDocumentDate(documentDate, "shamsi"),
    "document.date.gregorian": formatTemplateDocumentDate(documentDate, "gregorian"),
    "document.date.shamsi": formatTemplateDocumentDate(documentDate, "shamsi"),
    "document.date.hijri": formatTemplateDocumentDate(documentDate, "hijri"),
    "document.updated_at": context.document.updated_at,
    "document.document_type": context.document.documentTypeName,
    "document.confidentiality": context.document.confidentialityName,
    "document.priority": context.document.priorityName,
    "origin_unit.name": context.document.originUnitName,
    "owner_unit.name": context.document.ownerUnitName,
    "holder_unit.name": context.document.currentHolderUnitName,
    "signature.final.name": context.signatureEvents[0]?.user_id ? `User #${context.signatureEvents[0].user_id}` : "",
    "signature.final.position": context.signatureEvents[0]?.signerPositionTitle,
    "signature.final.unit": context.signatureEvents[0]?.signerUnitName,
    "serial.value": context.serialAssignment?.serial_value,
    "page.number": context.pageNumber || 1
  };

  return map[field] ?? "";
}

function resolveFieldTokens(value: string, context: RenderContext) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_token, field: string) => String(resolveDynamicField(field, context) ?? ""));
}

function liveFieldKeyForDynamicField(field: string) {
  if (field === "document.subject") {
    return "subject";
  }
  if (field === "document.body") {
    return "body";
  }
  if (field === "document.date" || field === "document.date.shamsi" || field === "document.date.gregorian" || field === "document.date.hijri") {
    return "date";
  }
  if (field.startsWith(templateFieldPrefix)) {
    return `template.${field.slice(templateFieldPrefix.length)}`;
  }
  return "";
}

function dateCalendarForDynamicField(field: string): DocumentDateCalendar | null {
  if (field === "document.date.gregorian") {
    return "gregorian";
  }
  if (field === "document.date.hijri") {
    return "hijri";
  }
  if (field === "document.date" || field === "document.date.shamsi") {
    return "shamsi";
  }
  return null;
}

function liveFieldKeyForWordZone(key: string) {
  if (key === "subject" || key === "body") {
    return key;
  }
  return key ? `template.${key}` : "";
}

function liveFieldAttribute(key: string, dateCalendar?: DocumentDateCalendar | null) {
  if (!key) {
    return "";
  }
  return ` data-dc-live-field="${escapeHtml(key)}"${dateCalendar ? ` data-dc-date-calendar="${dateCalendar}"` : ""}`;
}

function wordTemplateDocument(layout: TemplateLayout): TipTapNode {
  const document = layout.document;
  return document && typeof document === "object" && document.type ? document : { type: "doc", content: [{ type: "paragraph" }] };
}

function wordTemplateFields(context: RenderContext) {
  const documentContent = richContentValue(context);
  return {
    ...jsonRecordValue(context.document.template_fields || context.document.templateFields),
    ...documentContent.templateFields
  } as Record<string, unknown>;
}

function wordTemplateDocumentDate(context: RenderContext) {
  return context.document.document_date || context.document.documentDate || context.document.created_at || context.document.createdAt;
}

function wordTemplateZoneValue(key: string, context: RenderContext) {
  const documentContent = richContentValue(context);
  const fields = wordTemplateFields(context);
  if (key === "subject") {
    return stringValue(context.document.subject || documentContent.metadata.subject);
  }
  if (key === "body") {
    return richTextForDoc(documentContent.body).html || escapeHtml(context.document.body);
  }
  return escapeHtml(fields[key] || "");
}

function printableComment(value: unknown) {
  const normalized = stringValue(value).replace(/\s+/g, " ").trim();
  return normalized.length > endorsementCommentMaxLength
    ? `${normalized.slice(0, endorsementCommentMaxLength - 1).trim()}...`
    : normalized;
}

function endorsementActionLabel(value: unknown) {
  const action = stringValue(value).toLowerCase();
  if (action === "sign") {
    return "Signed";
  }
  if (action === "review") {
    return "Reviewed / Approved";
  }
  return action ? action.slice(0, 1).toUpperCase() + action.slice(1) : "Endorsed";
}

function endorsementSource(context: RenderContext) {
  const endorsements = Array.isArray(context.endorsements) ? context.endorsements : [];
  if (endorsements.length) {
    return endorsements;
  }

  const placedIds = new Set(placedSignatureEvents(context).map((item) => Number(item.id)));
  const documentContent = richContentValue(context);
  const visibility = {
    ...(documentContent.metadata.signatureVisibility || {}),
    ...(context.signatureVisibility || {})
  };
  return context.signatureEvents.filter((item) => {
    if (placedIds.has(Number(item.id))) {
      return false;
    }
    const key = `event:${item.id}`;
    return visibility[key] !== false && visibility[String(item.id)] !== false;
  }).map((item, index) => ({
    completedAt: item.created_at || item.createdAt,
    requiredAction: "sign",
    responderName: item.signerName || "",
    responderPositionTitle: item.signerPositionTitle || item.requiredPositionTitle || `Signature ${index + 1}`,
    responderUnitName: item.signerUnitName || item.targetUnitName || "",
    responseNote: item.response_note || item.responseNote || item.taskResponseNote,
    signatureImageDataUrl: item.signatureImageDataUrl
  }));
}

function signatureEventVisible(context: RenderContext, item: RowDataPacket) {
  const documentContent = richContentValue(context);
  const visibility = {
    ...(documentContent.metadata.signatureVisibility || {}),
    ...(context.signatureVisibility || {})
  };
  const key = `event:${item.id}`;
  return visibility[key] !== false && visibility[String(item.id)] !== false;
}

function signaturePrintOptions(item: RowDataPacket) {
  const raw = jsonRecordValue(item.print_options || item.printOptions);
  return {
    showComment: boolValue(raw.show_comment ?? raw.showComment),
    showDate: boolValue(raw.show_date ?? raw.showDate),
    showNamePosition: raw.show_name_position === false || raw.showNamePosition === false ? false : true
  };
}

function placedSignatureEvents(context: RenderContext) {
  return context.signatureEvents.filter((item) => {
    const page = Math.round(numberValue(item.render_page || item.renderPage, 0));
    const x = numberValue(item.render_x || item.renderX, Number.NaN);
    const y = numberValue(item.render_y || item.renderY, Number.NaN);
    const width = numberValue(item.render_width || item.renderWidth, 0);
    const height = numberValue(item.render_height || item.renderHeight, 0);
    return page > 0
      && Number.isFinite(x)
      && Number.isFinite(y)
      && width > 0
      && height > 0
      && signatureEventVisible(context, item);
  });
}

function renderPlacedSignatureLayer(context: RenderContext, pageNumber: number) {
  const items = placedSignatureEvents(context)
    .filter((item) => Math.round(numberValue(item.render_page || item.renderPage, 0)) === pageNumber)
    .map((item) => {
      const image = stringValue(item.signatureImageDataUrl);
      if (!image) {
        return "";
      }
      const options = signaturePrintOptions(item);
      const name = stringValue(item.signerName);
      const office = [stringValue(item.signerPositionTitle), stringValue(item.signerUnitName)].filter(Boolean).join(" - ");
      const signedAt = options.showDate ? formatTemplateDocumentDate(item.created_at || item.createdAt, "shamsi") : "";
      const comment = options.showComment ? printableComment(item.response_note || item.responseNote || item.taskResponseNote) : "";
      const metadata = [
        options.showNamePosition && name ? `<span>${escapeHtml(name)}</span>` : "",
        options.showNamePosition && office ? `<span>${escapeHtml(office)}</span>` : "",
        signedAt ? `<span>${escapeHtml(signedAt)}</span>` : "",
        comment ? `<span>${escapeHtml(comment)}</span>` : ""
      ].filter(Boolean).join("");

      const left = Math.max(0, numberValue(item.render_x || item.renderX, 0));
      const top = Math.max(0, numberValue(item.render_y || item.renderY, 0));
      const width = Math.max(1, numberValue(item.render_width || item.renderWidth, 46));
      const height = Math.max(1, numberValue(item.render_height || item.renderHeight, 18));
      return `<div class="dc-placed-signature" style="left:${left}mm;top:${top}mm;width:${width}mm;height:${height}mm">
        <img src="${escapeHtml(image)}" alt="" />
        ${metadata ? `<div class="dc-placed-signature-meta">${metadata}</div>` : ""}
      </div>`;
    }).join("\n");

  return items ? `<section class="dc-placed-signature-layer">${items}</section>` : "";
}

function renderEndorsementCards(source: Array<Record<string, unknown>>, limit: number, classPrefix: "dc" | "dc-word") {
  return source.slice(0, limit).map((item, index) => {
    const image = stringValue(item.signatureImageDataUrl);
    const name = stringValue(item.responderName || item.signerName);
    const position = stringValue(item.responderPositionTitle || item.signerPositionTitle || item.requestedPositionTitle);
    const unit = stringValue(item.responderUnitName || item.signerUnitName || item.requestedUnitName);
    const signedAt = formatTemplateDocumentDate(item.completedAt || item.completed_at || item.created_at || item.createdAt, "shamsi");
    const comment = printableComment(item.responseNote || item.response_note);
    const action = endorsementActionLabel(item.requiredAction || item.required_action || item.documentTaskRequiredAction);
    const signaturePlaceholder = action === "Signed" ? "Signature unavailable" : "Review response";
    return `<article class="${classPrefix}-endorsement-card">
      <header class="${classPrefix}-endorsement-head">
        <span class="${classPrefix}-endorsement-number">${escapeHtml(index + 1)}</span>
        <strong>${escapeHtml(action)}</strong>
      </header>
      ${name ? `<div class="${classPrefix}-endorsement-name">${escapeHtml(name)}</div>` : ""}
      ${position || unit ? `<div class="${classPrefix}-endorsement-office">${escapeHtml([position, unit].filter(Boolean).join(" - "))}</div>` : ""}
      ${signedAt ? `<div class="${classPrefix}-endorsement-date">${escapeHtml(signedAt)}</div>` : ""}
      ${comment ? `<p class="${classPrefix}-endorsement-comment">${escapeHtml(comment)}</p>` : ""}
      <div class="${classPrefix}-endorsement-signature">${image ? `<img src="${escapeHtml(image)}" alt="" />` : `<span>${escapeHtml(signaturePlaceholder)}</span>`}</div>
    </article>`;
  }).join("");
}

function renderWordSignature(_mode: string, context: RenderContext) {
  const source = endorsementSource(context);
  const limit = Math.max(1, Math.min(12, 5));
  const items = renderEndorsementCards(source, limit, "dc-word");

  return `<section class="dc-word-endorsements">${items || "<article class=\"dc-word-endorsement-card\"><header class=\"dc-word-endorsement-head\"><span class=\"dc-word-endorsement-number\">1</span><strong>Endorsement</strong></header></article>"}</section>`;
}

function renderWordQr(context: RenderContext) {
  const qrDataUrl = stringValue(context.verification?.qrDataUrl);
  if (!qrDataUrl) {
    return `<div class="dc-word-qr"></div>`;
  }
  return `<div class="dc-word-qr dc-word-qr-final"><img src="${escapeHtml(qrDataUrl)}" alt="" /></div>`;
}

function replaceWordTemplateTokens(html: string, context: RenderContext) {
  const bodyHtml = wordTemplateZoneValue("body", context);
  const bodyBlockPattern = /<p([^>]*)>\s*\{\{\s*zone:body\s*\}\}\s*<\/p>/gi;
  let nextHtml = html.replace(bodyBlockPattern, `<section class="dc-rich-content dc-word-body"${liveFieldAttribute("body")}>${bodyHtml}</section>`);
  nextHtml = nextHtml.replace(/<p([^>]*)>\s*\{\{\s*signature:(completed|slots)\s*\}\}\s*<\/p>/gi, (_match, _attrs, mode: string) => renderWordSignature(mode, context));
  nextHtml = nextHtml.replace(/<p([^>]*)>\s*\{\{\s*qr\s*\}\}\s*<\/p>/gi, () => renderWordQr(context));
  nextHtml = nextHtml.replace(/\{\{\s*zone:([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => (
    `<span${liveFieldAttribute(liveFieldKeyForWordZone(key))}>${wordTemplateZoneValue(key, context)}</span>`
  ));
  nextHtml = nextHtml.replace(/\{\{\s*system:([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    if (key === "official_serial" || key === "serial") {
      return escapeHtml(context.document.official_serial || context.serialAssignment?.serial_value || "");
    }
    if (key === "document_type") {
      return escapeHtml(context.document.documentTypeName || "");
    }
    if (key === "origin_unit") {
      return escapeHtml(context.document.originUnitName || context.document.ownerUnitName || "");
    }
    if (key === "page_number") {
      return escapeHtml(context.pageNumber || 1);
    }
    return escapeHtml(resolveDynamicField(key.replace(/^document_/, "document."), context));
  });
  nextHtml = nextHtml.replace(/\{\{\s*date:(gregorian|shamsi|hijri)\s*\}\}/g, (_match, calendar: DocumentDateCalendar) => (
    `<span${liveFieldAttribute("date", calendar)}>${escapeHtml(formatTemplateDocumentDate(wordTemplateDocumentDate(context), calendar))}</span>`
  ));
  nextHtml = nextHtml.replace(/\{\{\s*signature:(completed|slots)\s*\}\}/g, (_match, mode: string) => renderWordSignature(mode, context));
  nextHtml = nextHtml.replace(/\{\{\s*qr\s*\}\}/g, () => renderWordQr(context));
  return nextHtml;
}

function isWordTemplateLayout(layout: TemplateLayout) {
  return layout.mode === "word_template" || layout.schemaVersion === 2;
}

function renderWordTemplateHtml(layout: TemplateLayout, context: RenderContext) {
  const page = typeof layout.page === "object" && layout.page ? layout.page : {};
  const direction = pageDirectionValue(page.direction);
  const backgroundColor = cssColor(page.backgroundColor, "#ffffff");
  const marginTop = numberValue(page.marginTopMm, 18);
  const marginRight = numberValue(page.marginRightMm, 18);
  const marginBottom = numberValue(page.marginBottomMm, 18);
  const marginLeft = numberValue(page.marginLeftMm, 18);
  const pageContext = { ...context, pageNumber: context.pageNumber || 1 };
  const documentHtml = replaceWordTemplateTokens(richTextForDoc(wordTemplateDocument(layout)).html, pageContext);
  const floatingBlocks = Array.isArray(layout.blocks) ? layout.blocks : [];
  const documentContent = richContentValue(pageContext);
  const bodyContent = richTextForDoc(documentContent.body);
  const floatingHtml = prepareRenderableBlocks(floatingBlocks, pageContext).map((item) => {
    const field = stringValue(item.block.field);
    const type = stringValue(item.block.type);
    const override = type === "dynamic_field" && field === "document.body"
      ? bodyContent
      : type === "page_number"
        ? pageContext.pageNumber
        : item.content;
    return renderBlock(item.block, pageContext, direction, override);
  }).join("\n");

  return `<!doctype html>
<html dir="${escapeHtml(direction)}">
<head>
  <meta charset="utf-8" />
  <style>
    ${persianFontFaceCss()}
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; background: #e5e7eb; }
    body { font-family: "Noto Naskh Arabic", "Vazirmatn", "Tahoma", "Segoe UI", sans-serif; color: #111827; }
    .dc-word-page {
      box-sizing: border-box;
      position: relative;
      width: ${pageWidthMm}mm;
      height: ${pageHeightMm}mm;
      padding: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;
      background: ${backgroundColor};
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    .dc-word-content { position: relative; z-index: 1; font-size: 11pt; line-height: 1.75; }
    .dc-word-content p { margin: 0 0 3mm; }
    .dc-word-content h1, .dc-word-content h2, .dc-word-content h3 { margin: 0 0 3mm; font-weight: 700; line-height: 1.35; }
    .dc-word-content h1 { font-size: 18pt; }
    .dc-word-content h2 { font-size: 15pt; }
    .dc-word-content h3 { font-size: 13pt; }
    .dc-word-content ul, .dc-word-content ol { margin: 0 0 3mm; padding-inline-start: 7mm; }
    .dc-word-content blockquote { margin: 0 0 3mm; padding-inline-start: 4mm; border-inline-start: 2px solid #cbd5e1; color: #475569; }
    .dc-word-content table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 3mm 0; }
    .dc-word-content th, .dc-word-content td { border: 1px solid #94a3b8; padding: 1.8mm; vertical-align: top; }
    .dc-word-content th { background: #f8fafc; font-weight: 700; }
    .dc-word-content img { max-width: 100%; height: auto; object-fit: contain; }
    .dc-word-content [data-dc-live-field="date"] { letter-spacing: .04em; }
    .dc-word-floating-layer { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
    .dc-placed-signature-layer { position: absolute; inset: 0; z-index: 6; pointer-events: none; }
    .dc-placed-signature { box-sizing: border-box; position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; text-align: center; color: #0f172a; font-size: 6.4pt; line-height: 1.15; overflow: hidden; }
    .dc-placed-signature img { max-width: 100%; min-height: 0; max-height: 100%; object-fit: contain; flex: 1 1 auto; }
    .dc-placed-signature-meta { flex: 0 0 auto; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
    .dc-placed-signature-meta span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dc-word-floating-layer .dc-block { padding: 1.5mm; line-height: 1.65; }
    .dc-word-floating-layer .dc-table-block { padding: 0; line-height: 1.35; }
    .dc-word-floating-layer .dc-image { display: flex; align-items: center; justify-content: center; padding: 0; }
    .dc-word-floating-layer .dc-image img { width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; }
    .dc-word-floating-layer .dc-line { min-height: 0 !important; padding: 0; border-left: 0 !important; border-right: 0 !important; border-bottom: 0 !important; }
    .dc-word-floating-layer table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
    .dc-word-floating-layer th, .dc-word-floating-layer td { border: 1px solid #cbd5e1; padding: 1.5mm; vertical-align: top; }
    .dc-word-floating-layer th { background: #f8fafc; font-weight: 700; }
    .dc-word-floating-layer .dc-endorsements { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2mm; align-content: start; white-space: normal; }
    .dc-word-floating-layer .dc-endorsements[data-columns="1"] { grid-template-columns: 1fr; }
    .dc-word-floating-layer .dc-endorsement-card { border: 1px solid #cbd5e1; padding: 1.4mm; font-size: 7pt; line-height: 1.28; text-align: start; break-inside: avoid; background: rgba(255,255,255,.92); }
    .dc-word-floating-layer .dc-endorsement-head { display: flex; align-items: center; gap: 1.4mm; margin-bottom: .6mm; }
    .dc-word-floating-layer .dc-endorsement-number { display: inline-flex; align-items: center; justify-content: center; min-width: 4.5mm; height: 4.5mm; border: 1px solid #64748b; border-radius: 999px; font-size: 6.5pt; font-weight: 700; }
    .dc-word-floating-layer .dc-endorsement-name { font-weight: 700; color: #0f172a; }
    .dc-word-floating-layer .dc-endorsement-office, .dc-word-floating-layer .dc-endorsement-date { color: #475569; }
    .dc-word-floating-layer .dc-endorsement-comment { margin: .8mm 0 0; color: #1f2937; }
    .dc-word-floating-layer .dc-endorsement-signature { margin-top: 1mm; min-height: 8mm; display: flex; align-items: flex-end; justify-content: center; border-top: 1px solid #cbd5e1; color: #94a3b8; font-size: 6.5pt; }
    .dc-word-floating-layer .dc-endorsement-signature img { max-width: 100%; max-height: 8mm; object-fit: contain; }
    .dc-word-floating-layer .dc-qr { display: flex; align-items: center; justify-content: center; border: 0 !important; text-align: center; font-size: 7pt; }
    .dc-word-floating-layer .dc-qr-final { border: 0 !important; }
    .dc-word-floating-layer .dc-qr-final img { width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; flex: 0 0 auto; }
    .dc-word-body p { margin-bottom: 3mm; }
    .dc-word-endorsements { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm; margin-top: 8mm; white-space: normal; }
    .dc-word-endorsement-card { border: 1px solid #cbd5e1; padding: 1.6mm; font-size: 7.2pt; line-height: 1.3; text-align: start; break-inside: avoid; }
    .dc-word-endorsement-head { display: flex; align-items: center; gap: 1.5mm; margin-bottom: .6mm; }
    .dc-word-endorsement-number { display: inline-flex; align-items: center; justify-content: center; min-width: 4.8mm; height: 4.8mm; border: 1px solid #64748b; border-radius: 999px; font-size: 6.5pt; font-weight: 700; }
    .dc-word-endorsement-name { font-weight: 700; color: #0f172a; }
    .dc-word-endorsement-office, .dc-word-endorsement-date { color: #475569; }
    .dc-word-endorsement-comment { margin: .9mm 0 0; color: #1f2937; }
    .dc-word-endorsement-signature { margin-top: 1mm; min-height: 9mm; display: flex; align-items: flex-end; justify-content: center; border-top: 1px solid #cbd5e1; color: #94a3b8; font-size: 6.5pt; }
    .dc-word-endorsement-signature img { max-width: 100%; max-height: 9mm; object-fit: contain; }
    .dc-word-qr { display: inline-flex; align-items: center; justify-content: center; min-width: 18mm; min-height: 18mm; border: 0; text-align: center; font-size: 7pt; }
    .dc-word-qr-final { border: 0; }
    .dc-word-qr-final img { width: 18mm; height: 18mm; object-fit: contain; flex: 0 0 auto; }
  </style>
</head>
<body>
  <main class="dc-word-page">
    <article class="dc-word-content dc-rich-content">
      ${documentHtml}
    </article>
    ${floatingHtml ? `<section class="dc-word-floating-layer">${floatingHtml}</section>` : ""}
    ${renderPlacedSignatureLayer(pageContext, pageContext.pageNumber || 1)}
  </main>
</body>
</html>`;
}

function imageSource(src: unknown) {
  const value = stringValue(src);
  if (!value) {
    return "";
  }

  if (value.startsWith("data:") || value.startsWith("https://") || value.startsWith("http://")) {
    return value;
  }

  const absolute = path.resolve(process.cwd(), value);
  if (fs.existsSync(absolute)) {
    const extension = path.extname(absolute).toLowerCase();
    const mimeType = extension === ".svg" ? "image/svg+xml"
      : extension === ".webp" ? "image/webp"
        : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
          : "image/png";
    return `data:${mimeType};base64,${fs.readFileSync(absolute).toString("base64")}`;
  }

  return "";
}

function textContentForBlock(block: Record<string, unknown>, context: RenderContext) {
  const type = stringValue(block.type, "text");
  switch (type) {
    case "dynamic_field":
      return resolveDynamicField(stringValue(block.field), context);
    case "rich_text":
    case "text":
    case "watermark":
      return block.content || "";
    case "cc_list":
      return null;
    case "page_number":
      return context.pageNumber || 1;
    default:
      return null;
  }
}

function estimatedLineCount(content: unknown, widthMm: number, fontSizePt: number) {
  const text = String(content ?? "");
  if (!text.trim()) {
    return 1;
  }

  const usableWidth = Math.max(4, widthMm - 3);
  const averageGlyphsPerLine = Math.max(8, Math.floor((usableWidth / Math.max(1, fontSizePt * ptToMm)) * 1.75));
  return text.split(/\r\n|\r|\n/).reduce((total, line) => {
    const length = Array.from(line || " ").length;
    return total + Math.max(1, Math.ceil(length / averageGlyphsPerLine));
  }, 0);
}

function measuredTextBlock(block: Record<string, unknown>, content: unknown) {
  const style = typeof block.style === "object" && block.style ? block.style as Record<string, unknown> : {};
  const baseHeight = numberValue(block.height, 12);
  const baseFontSize = numberValue(style.fontSize, 10);
  const minFontSize = Math.max(6, Math.min(baseFontSize, numberValue(block.minFontSize, 8)));
  const maxLines = Math.max(0, Math.min(24, Math.round(numberValue(block.maxLines, 0))));
  const lineHeight = numberValue(style.lineHeight, 1.65);
  const width = numberValue(block.width, 60);

  if (!maxLines) {
    return { fontSize: baseFontSize, height: baseHeight };
  }

  const measuredContent = htmlContent(content) ? content.text : content;
  let fontSize = baseFontSize;
  let lines = estimatedLineCount(measuredContent, width, fontSize);
  while (lines > maxLines && fontSize > minFontSize) {
    fontSize -= 1;
    lines = estimatedLineCount(measuredContent, width, fontSize);
  }

  const renderedLines = Math.min(lines, maxLines);
  const contentHeight = (renderedLines * fontSize * ptToMm * lineHeight) + 3;
  return {
    fontSize,
    height: Math.max(baseHeight, Number(contentHeight.toFixed(2)))
  };
}

function prepareRenderableBlocks(blocks: Array<Record<string, unknown>>, context: RenderContext): PreparedBlock[] {
  const prepared = blocks.map((block, index) => {
    const content = textContentForBlock(block, context);
    const measurement = content === null
      ? { fontSize: numberValue((block.style as Record<string, unknown> | undefined)?.fontSize, 10), height: numberValue(block.height, 12) }
      : measuredTextBlock(block, content);
    return {
      block,
      content,
      index,
      measurement,
      originalHeight: numberValue(block.height, 12),
      y: numberValue(block.y, 20)
    };
  });

  const byIndex = new Map<number, PreparedBlock>();
  let yOffset = 0;
  [...prepared]
    .sort((left, right) => left.y - right.y || left.index - right.index)
    .forEach((item) => {
      const style = typeof item.block.style === "object" && item.block.style ? item.block.style as Record<string, unknown> : {};
      byIndex.set(item.index, {
        block: {
          ...item.block,
          height: item.measurement.height,
          y: numberValue(item.block.y, 20) + yOffset,
          style: {
            ...style,
            fontSize: item.measurement.fontSize
          }
        },
        content: item.content === null ? undefined : item.content
      });

      if (boolValue(item.block.reflowBelow)) {
        yOffset += Math.max(0, item.measurement.height - item.originalHeight);
      }
    });

  return blocks.map((_block, index) => byIndex.get(index) || { block: blocks[index] });
}

function renderTextBlock(block: Record<string, unknown>, content: unknown, pageDirection: PageDirection, attributes = "") {
  if (htmlContent(content)) {
    return `<div class="dc-block dc-rich-content" style="${blockStyle(block, pageDirection)};white-space:normal"${attributes}>${content.html}</div>`;
  }
  return `<div class="dc-block" style="${blockStyle(block, pageDirection)}"${attributes}>${escapeHtml(content)}</div>`;
}

type RenderTableCell = {
  colSpan: number;
  content: string;
  hidden: boolean;
  rowSpan: number;
  style: Record<string, unknown>;
};

function tableCellValue(cell: unknown): RenderTableCell {
  if (typeof cell === "string" || typeof cell === "number") {
    return { content: String(cell), colSpan: 1, rowSpan: 1, hidden: false, style: {} };
  }

  if (typeof cell === "object" && cell) {
    const record = cell as Record<string, unknown>;
    const style = typeof record.style === "object" && record.style ? record.style as Record<string, unknown> : {};
    return {
      content: stringValue(record.content),
      colSpan: Math.max(1, Math.min(12, numberValue(record.colSpan, 1))),
      rowSpan: Math.max(1, Math.min(24, numberValue(record.rowSpan, 1))),
      hidden: boolValue(record.hidden),
      style
    };
  }

  return { content: "", colSpan: 1, rowSpan: 1, hidden: false, style: {} };
}

function normalizeTableRows(rows: unknown[]) {
  const sourceRows = rows.length ? rows : [[""]];
  const rowCount = Math.max(1, Math.min(24, sourceRows.length));
  const source = sourceRows.slice(0, rowCount);
  const columnCount = Math.min(12, Math.max(1, ...source.map((row) => Array.isArray(row) ? row.length : 0)));
  const normalized = source.map((row) => {
    const rowCells = (Array.isArray(row) ? row : []).slice(0, columnCount).map((cell) => tableCellValue(cell));
    while (rowCells.length < columnCount) {
      rowCells.push(tableCellValue(""));
    }
    return rowCells;
  });
  const covered = normalized.map((row) => row.map(() => false));

  normalized.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (covered[rowIndex][colIndex]) {
        cell.hidden = true;
        cell.colSpan = 1;
        cell.rowSpan = 1;
        return;
      }

      cell.hidden = false;
      cell.colSpan = Math.max(1, Math.min(cell.colSpan, columnCount - colIndex));
      cell.rowSpan = Math.max(1, Math.min(cell.rowSpan, normalized.length - rowIndex));

      for (let nextRow = rowIndex; nextRow < rowIndex + cell.rowSpan; nextRow += 1) {
        for (let nextCol = colIndex; nextCol < colIndex + cell.colSpan; nextCol += 1) {
          if (nextRow === rowIndex && nextCol === colIndex) {
            continue;
          }
          covered[nextRow][nextCol] = true;
        }
      }
    });
  });

  return normalized;
}

function normalizeTableTrackSizes(value: unknown, count: number) {
  const safeCount = Math.max(1, Math.min(24, Math.round(count) || 1));
  const source = Array.isArray(value) ? value : [];
  const equal = 100 / safeCount;
  const raw = Array.from({ length: safeCount }, (_item, index) => {
    const numeric = Number(source[index]);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : equal;
  });
  const total = raw.reduce((sum, item) => sum + item, 0);

  if (total <= 0) {
    return Array.from({ length: safeCount }, () => equal);
  }

  return raw.map((item) => (item / total) * 100);
}

function percentValue(value: number) {
  return Number(value.toFixed(4)).toString();
}

function tableCellStyle(tableStyle: Record<string, unknown>, cell: RenderTableCell, isHeader: boolean, pageDirection: PageDirection) {
  const cellStyle = cell.style;
  const borderWidth = Math.max(0, numberValue(tableStyle.borderWidth, 1));
  const borderColor = cssColor(tableStyle.borderColor, "#cbd5e1");
  const fontSize = numberValue(cellStyle.fontSize, numberValue(tableStyle.fontSize, 9));
  const fontFamily = stringValue(cellStyle.fontFamily, stringValue(tableStyle.fontFamily));
  const fontWeight = stringValue(cellStyle.fontWeight, isHeader ? "700" : stringValue(tableStyle.fontWeight, "400"));
  const fontStyle = stringValue(cellStyle.fontStyle, stringValue(tableStyle.fontStyle, "normal")) === "italic" ? "italic" : "normal";
  const textDecoration = stringValue(cellStyle.textDecoration, stringValue(tableStyle.textDecoration, "none")) === "underline" ? "underline" : "none";
  const textAlign = resolveTextAlign(cellStyle.textAlign || tableStyle.textAlign, pageDirection);
  const color = cssColor(cellStyle.color, cssColor(tableStyle.color, "#111827"));
  const headerBackground = cssColor(tableStyle.headerBackgroundColor, "#f8fafc");
  const background = cssColor(cellStyle.backgroundColor, isHeader ? headerBackground : cssColor(tableStyle.backgroundColor, "#ffffff"));
  const padding = Math.max(0, Math.min(8, numberValue(tableStyle.cellPaddingMm, 1.5)));

  return [
    `border:${borderWidth}px solid ${borderColor}`,
    `text-align:${textAlign}`,
    fontFamily ? `font-family:${fontFamily}` : "",
    `font-size:${fontSize}pt`,
    `font-weight:${fontWeight}`,
    `font-style:${fontStyle}`,
    `text-decoration:${textDecoration}`,
    `color:${color}`,
    `background:${background}`,
    `padding:${padding}mm`,
    "vertical-align:top",
    "white-space:pre-wrap",
    "overflow-wrap:anywhere",
    "line-height:1.35"
  ].join(";");
}

function renderTableBlock(block: Record<string, unknown>, context: RenderContext, pageDirection: PageDirection) {
  const rows = normalizeTableRows(Array.isArray(block.rows) ? block.rows : []);
  const headerRow = boolValue(block.headerRow);
  const style = typeof block.style === "object" && block.style ? block.style as Record<string, unknown> : {};
  const columnWidths = normalizeTableTrackSizes(block.columnWidths, rows[0]?.length || 1);
  const rowHeights = normalizeTableTrackSizes(block.rowHeights, rows.length);
  const colgroup = `<colgroup>${columnWidths.map((width) => `<col style="width:${percentValue(width)}%">`).join("")}</colgroup>`;
  const cells = rows.map((row, rowIndex) => {
    return `<tr style="height:${percentValue(rowHeights[rowIndex] || 0)}%">${row.map((parsed) => {
      if (parsed.hidden) {
        return "";
      }
      const tag = headerRow && rowIndex === 0 ? "th" : "td";
      const spanAttrs = `${parsed.colSpan > 1 ? ` colspan="${parsed.colSpan}"` : ""}${parsed.rowSpan > 1 ? ` rowspan="${parsed.rowSpan}"` : ""}`;
      return `<${tag}${spanAttrs} style="${tableCellStyle(style, parsed, tag === "th", pageDirection)}">${escapeHtml(resolveFieldTokens(parsed.content, context))}</${tag}>`;
    }).join("")}</tr>`;
  }).join("");
  return `<div class="dc-block dc-table-block" style="${blockStyle({ ...block, style: { ...style, borderWidth: 0 } }, pageDirection)}"><table>${colgroup}<tbody>${cells}</tbody></table></div>`;
}

function renderSignatureZone(block: Record<string, unknown>, context: RenderContext, pageDirection: PageDirection) {
  const source = endorsementSource(context);
  const limit = Math.max(1, Math.min(12, numberValue(block.limit, 5)));
  const width = numberValue(block.width, 120);
  const columns = source.length <= 1 || width < 92 ? 1 : 2;
  const items = renderEndorsementCards(source, limit, "dc");

  return `<div class="dc-block dc-endorsements" data-columns="${columns}" style="${blockStyle(block, pageDirection)}">${items || escapeHtml("Approval / signature section")}</div>`;
}

function renderQrBlock(block: Record<string, unknown>, context: RenderContext, pageDirection: PageDirection) {
  const qrDataUrl = stringValue(context.verification?.qrDataUrl);

  if (!qrDataUrl) {
    return `<div class="dc-block dc-qr" style="${blockStyle(block, pageDirection)}"></div>`;
  }

  return `<div class="dc-block dc-qr dc-qr-final" style="${blockStyle(block, pageDirection)}"><img src="${escapeHtml(qrDataUrl)}" alt="" /></div>`;
}

function renderCommentsZone(block: Record<string, unknown>, context: RenderContext, pageDirection: PageDirection) {
  const items = context.workflowEvents
    .filter((event) => event.note || event.return_reason)
    .slice(0, Math.max(1, Math.min(12, numberValue(block.limit, 5))))
    .map((event) => `<li><strong>${escapeHtml(event.action)}</strong>: ${escapeHtml(event.note || event.return_reason)}</li>`)
    .join("");

  return `<div class="dc-block dc-comments" style="${blockStyle(block, pageDirection)}"><ul>${items}</ul></div>`;
}

function renderBlock(block: Record<string, unknown>, context: RenderContext, pageDirection: PageDirection, contentOverride?: unknown) {
  if (boolValue(block.hidden)) {
    return "";
  }

  const type = stringValue(block.type, "text");

  switch (type) {
    case "dynamic_field": {
      const field = stringValue(block.field);
      return renderTextBlock(block, contentOverride ?? resolveDynamicField(field, context), pageDirection, liveFieldAttribute(liveFieldKeyForDynamicField(field), dateCalendarForDynamicField(field)));
    }
    case "rich_text":
    case "text":
      return renderTextBlock(block, contentOverride ?? (block.content || ""), pageDirection);
    case "image":
    case "logo": {
      const src = imageSource(block.src);
      return `<div class="dc-block dc-image" style="${blockStyle(block, pageDirection)}">${src ? `<img src="${escapeHtml(src)}" alt="" />` : ""}</div>`;
    }
    case "line":
      return `<div class="dc-block dc-line" style="${blockStyle(block, pageDirection)}"></div>`;
    case "box":
      return `<div class="dc-block" style="${blockStyle({ ...block, style: { ...(block.style as object || {}), borderWidth: numberValue((block.style as Record<string, unknown>)?.borderWidth, 1) } }, pageDirection)}"></div>`;
    case "table":
      return renderTableBlock(block, context, pageDirection);
    case "qr":
      return renderQrBlock(block, context, pageDirection);
    case "signature_zone":
      return renderSignatureZone(block, context, pageDirection);
    case "comments_zone":
      return renderCommentsZone(block, context, pageDirection);
    case "cc_list":
      return "";
    case "watermark":
      return `<div class="dc-block dc-watermark" style="${blockStyle(block, pageDirection)}">${escapeHtml(contentOverride ?? (block.content || "DRAFT"))}</div>`;
    case "page_number":
      return renderTextBlock(block, contentOverride ?? (context.pageNumber || 1), pageDirection);
    default:
      return renderTextBlock(block, block.content || type, pageDirection);
  }
}

function renderStaffFreeBlock(block: DocumentContent["freeBlocks"][number], pageDirection: PageDirection) {
  const html = richTextForDoc(block.content).html;
  const templateBlock = {
    id: block.id,
    type: "rich_text",
    x: block.x,
    y: block.y,
    width: block.width,
    height: block.height,
    style: {
      borderColor: "#dbe3ee",
      borderStyle: "dashed",
      borderWidth: 0,
      fontSize: 10,
      textAlign: "start"
    }
  };
  return `<div class="dc-block dc-free-block dc-rich-content" style="${blockStyle(templateBlock, pageDirection)}">${html}</div>`;
}

export function defaultTemplateLayout(): TemplateLayout {
  return {
    page: {
      widthMm: pageWidthMm,
      heightMm: pageHeightMm,
      marginTopMm: 14,
      marginRightMm: 16,
      marginBottomMm: 14,
      marginLeftMm: 16,
      direction: "rtl",
      backgroundColor: "#ffffff"
    },
    blocks: [
      { id: "logo-left", type: "logo", x: 16, y: 12, width: 24, height: 24, src: "", style: { borderWidth: 0 } },
      { id: "title", type: "text", x: 52, y: 13, width: 106, height: 18, content: "عنوان رسمی سند", style: { fontSize: 14, fontWeight: "700", textAlign: "center" } },
      { id: "logo-right", type: "logo", x: 170, y: 12, width: 24, height: 24, src: "", style: { borderWidth: 0 } },
      { id: "subject", type: "dynamic_field", x: 22, y: 50, width: 166, height: 12, field: "document.subject", style: { fontSize: 12, fontWeight: "700", textAlign: "center", borderWidth: 0 } },
      { id: "body", type: "dynamic_field", x: 26, y: 72, width: 158, height: 110, field: "document.body", pageScope: "all", style: { fontSize: 11, textAlign: "start", borderWidth: 0 } },
      { id: "signature", type: "signature_zone", x: 36, y: 196, width: 138, height: 54, mode: "completed", limit: 5, pageScope: "last", style: { fontSize: 8, textAlign: "center", borderWidth: 0 } },
      { id: "footer-line", type: "line", x: 16, y: 268, width: 178, height: 1, pageScope: "all", style: { borderWidth: 1, borderColor: "#0f172a" } },
      { id: "footer", type: "text", x: 20, y: 272, width: 170, height: 8, content: "آدرس، تلفن و معلومات تماس", pageScope: "all", style: { fontSize: 8, textAlign: "center", borderWidth: 0 } }
    ]
  };
}

export function renderTemplateHtml(layout: TemplateLayout, context: RenderContext) {
  if (isWordTemplateLayout(layout)) {
    return renderWordTemplateHtml(layout, context);
  }

  const page = typeof layout.page === "object" && layout.page ? layout.page : {};
  const direction = pageDirectionValue(page.direction);
  const backgroundColor = cssColor(page.backgroundColor, "#ffffff");
  const blocks = Array.isArray(layout.blocks) ? layout.blocks : [];
  const documentContent = richContentValue(context);
  const bodyPages = splitRichBodyIntoPages(documentContent);
  const freeBlockPageCount = Math.max(0, ...documentContent.freeBlocks.map((block) => Math.max(1, Math.round(numberValue(block.page, 1)))));
  const totalPages = Math.max(1, bodyPages.length, freeBlockPageCount);
  const pageNumberStart = Math.max(1, Math.round(numberValue(documentContent.metadata.pageNumberStart, 1)));
  const pagesHtml = Array.from({ length: totalPages }, (_pageItem, pageIndex) => {
    const pageContext: RenderContext = { ...context, pageNumber: pageNumberStart + pageIndex };
    const bodyContent = richTextForDoc(bodyPages[pageIndex] || { type: "doc", content: [{ type: "paragraph" }] });
    const pageBlocks = blocks.filter((block) => shouldRenderBlockOnPage(block, pageIndex, totalPages));
    const preparedBlocks = prepareRenderableBlocks(pageBlocks, pageContext);
    const freeBlocks = documentContent.freeBlocks
      .filter((block) => Math.max(1, Math.round(numberValue(block.page, 1))) === pageIndex + 1)
      .map((block) => renderStaffFreeBlock(block, direction))
      .join("\n");
    return `<main class="dc-page" data-page="${pageIndex + 1}">
      ${preparedBlocks.map((item) => {
        const field = stringValue(item.block.field);
        const type = stringValue(item.block.type);
        const override = type === "dynamic_field" && field === "document.body"
          ? bodyContent
          : type === "page_number"
            ? pageContext.pageNumber
            : item.content;
        return renderBlock(item.block, pageContext, direction, override);
      }).join("\n")}
      ${freeBlocks}
      ${renderPlacedSignatureLayer(pageContext, pageIndex + 1)}
    </main>`;
  }).join("\n");

  return `<!doctype html>
<html dir="${escapeHtml(direction)}">
<head>
  <meta charset="utf-8" />
  <style>
    ${persianFontFaceCss()}
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; background: #e5e7eb; }
    body { font-family: "Noto Naskh Arabic", "Vazirmatn", "Tahoma", "Segoe UI", sans-serif; }
    .dc-page {
      position: relative;
      width: ${pageWidthMm}mm;
      height: ${pageHeightMm}mm;
      overflow: hidden;
      background: ${backgroundColor};
      color: #111827;
    }
    .dc-page:not(:last-child) { page-break-after: always; margin-bottom: 8mm; }
    .dc-block { padding: 1.5mm; line-height: 1.65; }
    .dc-table-block { padding: 0; line-height: 1.35; }
    .dc-rich-content p { margin: 0 0 2.4mm; }
    .dc-rich-content h1, .dc-rich-content h2, .dc-rich-content h3 { margin: 0 0 2.8mm; font-weight: 700; line-height: 1.35; }
    .dc-rich-content h1 { font-size: 1.35em; }
    .dc-rich-content h2 { font-size: 1.2em; }
    .dc-rich-content h3 { font-size: 1.1em; }
    .dc-rich-content ul, .dc-rich-content ol { margin: 0 0 2.4mm; padding-inline-start: 6mm; }
    .dc-rich-content blockquote { margin: 0 0 2.4mm; padding-inline-start: 3mm; border-inline-start: 2px solid #cbd5e1; color: #475569; }
    .dc-rich-content table { height: auto !important; margin: 2mm 0; }
    .dc-image { display: flex; align-items: center; justify-content: center; padding: 0; }
    .dc-image img { width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; }
    .dc-line { min-height: 0 !important; padding: 0; border-left: 0 !important; border-right: 0 !important; border-bottom: 0 !important; }
    .dc-placed-signature-layer { position: absolute; inset: 0; z-index: 6; pointer-events: none; }
    .dc-placed-signature { box-sizing: border-box; position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; text-align: center; color: #0f172a; font-size: 6.4pt; line-height: 1.15; overflow: hidden; }
    .dc-placed-signature img { max-width: 100%; min-height: 0; max-height: 100%; object-fit: contain; flex: 1 1 auto; }
    .dc-placed-signature-meta { flex: 0 0 auto; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
    .dc-placed-signature-meta span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dc-endorsements { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2mm; align-content: start; white-space: normal; }
    .dc-endorsements[data-columns="1"] { grid-template-columns: 1fr; }
    .dc-endorsement-card { border: 1px solid #cbd5e1; padding: 1.4mm; font-size: 7pt; line-height: 1.28; text-align: start; break-inside: avoid; background: rgba(255,255,255,.92); }
    .dc-endorsement-head { display: flex; align-items: center; gap: 1.4mm; margin-bottom: .6mm; }
    .dc-endorsement-number { display: inline-flex; align-items: center; justify-content: center; min-width: 4.5mm; height: 4.5mm; border: 1px solid #64748b; border-radius: 999px; font-size: 6.5pt; font-weight: 700; }
    .dc-endorsement-name { font-weight: 700; color: #0f172a; }
    .dc-endorsement-office, .dc-endorsement-date { color: #475569; }
    .dc-endorsement-comment { margin: .8mm 0 0; color: #1f2937; }
    .dc-endorsement-signature { margin-top: 1mm; min-height: 8mm; display: flex; align-items: flex-end; justify-content: center; border-top: 1px solid #cbd5e1; color: #94a3b8; font-size: 6.5pt; }
    .dc-endorsement-signature img { max-width: 100%; max-height: 8mm; object-fit: contain; }
    .dc-comments ul { margin: 0; padding-inline-start: 4mm; }
    .dc-qr { display: flex; align-items: center; justify-content: center; border: 0 !important; text-align: center; font-size: 7pt; }
    .dc-qr-final { border: 0 !important; }
    .dc-qr-final img { width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; flex: 0 0 auto; }
    .dc-watermark { transform: rotate(-24deg); opacity: .12; font-size: 42pt !important; text-align: center; }
    table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #cbd5e1; padding: 1.5mm; vertical-align: top; }
    th { background: #f8fafc; font-weight: 700; }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;
}
