import type { TipTapNode } from "../api";

export type LivePreviewDateCalendar = "gregorian" | "shamsi" | "hijri";

export type LivePreviewValues = {
  bodyContent?: TipTapNode;
  bodyText: string;
  documentDate?: string | null;
  subject: string;
  templateFields: Record<string, string>;
};

const livePreviewDateTimeZone = "Asia/Kabul";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function bodyTextToHtml(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return "<p>Draft body will appear here.</p>";
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.split("\n").map((line) => escapeHtml(line)).join("<br />")}</p>`)
    .join("");
}

function htmlStyleAttribute(styles: Array<string | false | null | undefined>) {
  const value = styles.filter(Boolean).join(";");
  return value ? ` style="${escapeHtml(value)}"` : "";
}

function safeTextAlign(value: unknown) {
  return typeof value === "string" && ["left", "center", "right", "justify"].includes(value) ? value : "";
}

function safeColor(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(trimmed) || /^rgba?\([0-9.,\s%]+\)$/.test(trimmed) || /^[a-zA-Z]+$/.test(trimmed)
    ? trimmed
    : fallback;
}

function safeSize(value: unknown) {
  return typeof value === "string" && /^\d+(?:\.\d+)?(?:px|pt|rem|em|%)$/.test(value.trim()) ? value.trim() : "";
}

function safeFontFamily(value: unknown) {
  return typeof value === "string" && /^[\w\s"',.-]+$/.test(value.trim()) ? value.trim() : "";
}

function safeLineHeight(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 3 ? String(Math.round(numeric * 100) / 100) : "";
}

function nodeText(value: TipTapNode): string {
  if (value.type === "text") {
    return value.text || "";
  }
  if (value.type === "hardBreak") {
    return "\n";
  }
  if (value.type === "horizontalRule") {
    return "\n\n";
  }
  return (value.content || []).map((child) => nodeText(child)).join("");
}

function tableCellSpanAttribute(name: "colspan" | "rowspan", value: unknown, max: number) {
  const numberValue = Number(value);
  const span = Number.isFinite(numberValue) ? Math.max(1, Math.min(max, Math.round(numberValue))) : 1;
  return span > 1 ? ` ${name}="${span}"` : "";
}

function richNodeToHtml(node: TipTapNode): string {
  if (node.type === "text") {
    let html = escapeHtml(node.text || "");
    for (const mark of node.marks || []) {
      if (mark.type === "bold") {
        html = `<strong>${html}</strong>`;
      } else if (mark.type === "italic") {
        html = `<em>${html}</em>`;
      } else if (mark.type === "underline") {
        html = `<u>${html}</u>`;
      } else if (mark.type === "highlight") {
        const color = safeColor(mark.attrs?.color, "#fef08a");
        html = `<mark style="background:${escapeHtml(color)};padding:0 .3mm">${html}</mark>`;
      } else if (mark.type === "textStyle") {
        const color = safeColor(mark.attrs?.color);
        const fontFamily = safeFontFamily(mark.attrs?.fontFamily);
        const fontSize = safeSize(mark.attrs?.fontSize);
        html = `<span${htmlStyleAttribute([
          color ? `color:${color}` : false,
          fontFamily ? `font-family:${fontFamily}` : false,
          fontSize ? `font-size:${fontSize}` : false
        ])}>${html}</span>`;
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

  const children = (node.content || []).map((child) => richNodeToHtml(child)).join("");
  const attrs = node.attrs || {};
  const align = safeTextAlign(attrs.textAlign);
  const lineHeight = safeLineHeight(attrs.lineHeight);

  if (node.type === "paragraph") {
    return `<p${htmlStyleAttribute([align ? `text-align:${align}` : false, lineHeight ? `line-height:${lineHeight}` : false])}>${children || "<br />"}</p>`;
  }
  if (node.type === "heading") {
    const levelValue = Number(attrs.level);
    const level = Number.isFinite(levelValue) ? Math.max(1, Math.min(3, Math.round(levelValue))) : 2;
    return `<h${level}${htmlStyleAttribute([align ? `text-align:${align}` : false, lineHeight ? `line-height:${lineHeight}` : false])}>${children || "<br />"}</h${level}>`;
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
    return `<table class="dc-rich-table"><tbody>${children}</tbody></table>`;
  }
  if (node.type === "tableRow") {
    return `<tr>${children}</tr>`;
  }
  if (node.type === "tableCell" || node.type === "tableHeader") {
    const tag = node.type === "tableHeader" ? "th" : "td";
    const colSpan = tableCellSpanAttribute("colspan", attrs.colspan || attrs.colSpan, 12);
    const rowSpan = tableCellSpanAttribute("rowspan", attrs.rowspan || attrs.rowSpan, 24);
    return `<${tag}${colSpan}${rowSpan}>${children || "<br />"}</${tag}>`;
  }

  return children;
}

function bodyContentToHtml(value?: TipTapNode) {
  if (!value || !nodeText(value).trim()) {
    return "<p>Draft body will appear here.</p>";
  }

  const documentNode = value.type === "doc" ? value : { type: "doc", content: [value] };
  return (documentNode.content || []).map((node) => richNodeToHtml(node)).join("");
}

function parseLivePreviewDate(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
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

function dateCalendarValue(value: unknown): LivePreviewDateCalendar {
  return value === "gregorian" || value === "hijri" || value === "shamsi" ? value : "shamsi";
}

export function formatLivePreviewDocumentDate(value: unknown, calendar: LivePreviewDateCalendar = "shamsi") {
  const date = parseLivePreviewDate(value);
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
    timeZone: livePreviewDateTimeZone,
    year: "numeric"
  }).formatToParts(date);
  const partValue = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value || "";
  const year = partValue("year");
  const month = partValue("month");
  const day = partValue("day");

  return year && month && day ? `${year}/${month}/${day}` : "";
}

export function livePreviewFieldValue(field: string, values: LivePreviewValues, dateCalendar?: string | null) {
  if (field === "subject") {
    return values.subject.trim() || "Draft subject";
  }
  if (field === "date") {
    return formatLivePreviewDocumentDate(values.documentDate, dateCalendarValue(dateCalendar));
  }
  if (field.startsWith("template.")) {
    return values.templateFields[field.slice("template.".length)] || "";
  }
  return "";
}

export function patchLivePreviewFrame(frame: HTMLIFrameElement | null, values: LivePreviewValues) {
  const document = frame?.contentDocument;
  if (!document) {
    return false;
  }

  const fields = Array.from(document.querySelectorAll<HTMLElement>("[data-dc-live-field]"));
  if (!fields.length) {
    return false;
  }

  window.requestAnimationFrame(() => {
    for (const element of fields) {
      const field = element.dataset.dcLiveField || "";
      if (field === "body") {
        const nextHtml = values.bodyContent ? bodyContentToHtml(values.bodyContent) : bodyTextToHtml(values.bodyText);
        if (element.innerHTML !== nextHtml) {
          element.innerHTML = nextHtml;
        }
        continue;
      }

      const nextText = livePreviewFieldValue(field, values, element.dataset.dcDateCalendar);
      if (element.textContent !== nextText) {
        element.textContent = nextText;
      }
    }
    document.documentElement.dataset.dcLivePatchedAt = String(Date.now());
  });

  return true;
}

export function currentPreviewFrameHtml(frame: HTMLIFrameElement | null, fallbackHtml: string | null) {
  const document = frame?.contentDocument;
  if (!document?.documentElement) {
    return fallbackHtml || "";
  }

  const doctype = document.doctype ? "<!doctype html>\n" : "";
  return `${doctype}${document.documentElement.outerHTML}`;
}
