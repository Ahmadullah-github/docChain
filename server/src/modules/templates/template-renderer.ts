import fs from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";

export type TemplateLayout = Record<string, unknown> & {
  page?: Record<string, unknown>;
  blocks?: Array<Record<string, unknown>>;
};

type RenderContext = {
  document: Record<string, unknown>;
  signatureEvents: RowDataPacket[];
  signatureSlots: RowDataPacket[];
  workflowEvents: RowDataPacket[];
  serialAssignment: Record<string, unknown> | null;
};

const pageWidthMm = 210;
const pageHeightMm = 297;

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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
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

function blockStyle(block: Record<string, unknown>) {
  const style = typeof block.style === "object" && block.style ? block.style as Record<string, unknown> : {};
  const x = numberValue(block.x, 20);
  const y = numberValue(block.y, 20);
  const width = numberValue(block.width, 60);
  const height = numberValue(block.height, 12);
  const borderWidth = numberValue(style.borderWidth, 0);
  const fontSize = numberValue(style.fontSize, 10);
  const fontWeight = stringValue(style.fontWeight, "400");
  const textAlign = stringValue(style.textAlign, "start");
  const color = cssColor(style.color, "#111827");
  const backgroundColor = cssColor(style.backgroundColor);
  const borderColor = cssColor(style.borderColor, "#94a3b8");
  const borderStyle = borderWidth > 0 ? stringValue(style.borderStyle, "solid") : "none";

  return [
    "position:absolute",
    `left:${x}mm`,
    `top:${y}mm`,
    `width:${width}mm`,
    `min-height:${height}mm`,
    `font-size:${fontSize}pt`,
    `font-weight:${fontWeight}`,
    `text-align:${textAlign}`,
    `color:${color}`,
    `background:${backgroundColor}`,
    `border:${borderWidth}px ${borderStyle} ${borderColor}`,
    "box-sizing:border-box",
    "overflow:hidden",
    "white-space:pre-wrap"
  ].join(";");
}

function resolveDynamicField(field: string, context: RenderContext) {
  const map: Record<string, unknown> = {
    "document.subject": context.document.subject,
    "document.body": context.document.body,
    "document.summary": context.document.summary,
    "document.internal_reference": context.document.internal_reference,
    "document.official_serial": context.document.official_serial || context.serialAssignment?.serial_value,
    "document.status": context.document.status,
    "document.date": context.document.created_at,
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
    "page.number": "1"
  };

  return map[field] ?? "";
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
    return `file://${absolute}`;
  }

  return "";
}

function renderTextBlock(block: Record<string, unknown>, content: unknown) {
  return `<div class="dc-block" style="${blockStyle(block)}">${escapeHtml(content)}</div>`;
}

function renderTableBlock(block: Record<string, unknown>) {
  const rows = Array.isArray(block.rows) ? block.rows : [];
  const cells = rows.map((row) => {
    const rowCells = Array.isArray(row) ? row : [];
    return `<tr>${rowCells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
  }).join("");
  return `<div class="dc-block" style="${blockStyle(block)}"><table>${cells}</table></div>`;
}

function renderSignatureZone(block: Record<string, unknown>, context: RenderContext) {
  const mode = stringValue(block.mode, "completed");
  const source = mode === "slots" ? context.signatureSlots : context.signatureEvents;
  const limit = Math.max(1, Math.min(12, numberValue(block.limit, 6)));
  const items = source.slice(0, limit).map((item, index) => {
    const position = item.signerPositionTitle || item.requiredPositionTitle || `Signature ${index + 1}`;
    const unit = item.signerUnitName || item.targetUnitName || "";
    return `<div class="dc-signature-item">
      <div class="dc-signature-line"></div>
      <strong>${escapeHtml(position)}</strong>
      <span>${escapeHtml(unit)}</span>
    </div>`;
  }).join("");

  return `<div class="dc-block dc-signatures" style="${blockStyle(block)}">${items || escapeHtml("Signature zone")}</div>`;
}

function renderCommentsZone(block: Record<string, unknown>, context: RenderContext) {
  const items = context.workflowEvents
    .filter((event) => event.note || event.return_reason)
    .slice(0, Math.max(1, Math.min(12, numberValue(block.limit, 5))))
    .map((event) => `<li><strong>${escapeHtml(event.action)}</strong>: ${escapeHtml(event.note || event.return_reason)}</li>`)
    .join("");

  return `<div class="dc-block dc-comments" style="${blockStyle(block)}"><ul>${items}</ul></div>`;
}

function renderBlock(block: Record<string, unknown>, context: RenderContext) {
  const type = stringValue(block.type, "text");

  switch (type) {
    case "dynamic_field":
      return renderTextBlock(block, resolveDynamicField(stringValue(block.field), context));
    case "rich_text":
    case "text":
      return renderTextBlock(block, block.content || "");
    case "image":
    case "logo": {
      const src = imageSource(block.src);
      return `<div class="dc-block dc-image" style="${blockStyle(block)}">${src ? `<img src="${escapeHtml(src)}" alt="" />` : ""}</div>`;
    }
    case "line":
      return `<div class="dc-block dc-line" style="${blockStyle(block)}"></div>`;
    case "box":
      return `<div class="dc-block" style="${blockStyle({ ...block, style: { ...(block.style as object || {}), borderWidth: numberValue((block.style as Record<string, unknown>)?.borderWidth, 1) } })}"></div>`;
    case "table":
      return renderTableBlock(block);
    case "qr":
      return `<div class="dc-block dc-qr" style="${blockStyle(block)}">VERIFY<br />DOCCHAIN</div>`;
    case "signature_zone":
      return renderSignatureZone(block, context);
    case "comments_zone":
      return renderCommentsZone(block, context);
    case "cc_list":
      return renderTextBlock(block, stringValue(block.content, "Copies / CC"));
    case "watermark":
      return `<div class="dc-block dc-watermark" style="${blockStyle(block)}">${escapeHtml(block.content || "DRAFT")}</div>`;
    case "page_number":
      return renderTextBlock(block, "1");
    default:
      return renderTextBlock(block, block.content || type);
  }
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
      { id: "body", type: "dynamic_field", x: 26, y: 72, width: 158, height: 110, field: "document.body", style: { fontSize: 11, textAlign: "start", borderWidth: 0 } },
      { id: "signature", type: "signature_zone", x: 72, y: 200, width: 70, height: 34, mode: "completed", style: { fontSize: 10, textAlign: "center", borderWidth: 0 } },
      { id: "footer-line", type: "line", x: 16, y: 268, width: 178, height: 1, style: { borderWidth: 1, borderColor: "#0f172a" } },
      { id: "footer", type: "text", x: 20, y: 272, width: 170, height: 8, content: "آدرس، تلفن و معلومات تماس", style: { fontSize: 8, textAlign: "center", borderWidth: 0 } }
    ]
  };
}

export function renderTemplateHtml(layout: TemplateLayout, context: RenderContext) {
  const page = typeof layout.page === "object" && layout.page ? layout.page : {};
  const direction = stringValue(page.direction, "rtl");
  const backgroundColor = cssColor(page.backgroundColor, "#ffffff");
  const blocks = Array.isArray(layout.blocks) ? layout.blocks : [];

  return `<!doctype html>
<html dir="${escapeHtml(direction)}">
<head>
  <meta charset="utf-8" />
  <style>
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
    .dc-block { padding: 1.5mm; line-height: 1.65; }
    .dc-image { display: flex; align-items: center; justify-content: center; padding: 0; }
    .dc-image img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .dc-line { min-height: 0 !important; padding: 0; border-left: 0 !important; border-right: 0 !important; border-bottom: 0 !important; }
    .dc-signatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm; }
    .dc-signature-item { text-align: center; font-size: 9pt; }
    .dc-signature-line { height: 10mm; border-bottom: 1px solid #334155; margin-bottom: 1.5mm; }
    .dc-signature-item span { display: block; color: #64748b; }
    .dc-comments ul { margin: 0; padding-inline-start: 4mm; }
    .dc-qr { display: flex; align-items: center; justify-content: center; border: 1px dashed #475569 !important; text-align: center; font-size: 7pt; }
    .dc-watermark { transform: rotate(-24deg); opacity: .12; font-size: 42pt !important; text-align: center; }
    table { width: 100%; border-collapse: collapse; }
    td { border: 1px solid #cbd5e1; padding: 1.5mm; }
  </style>
</head>
<body>
  <main class="dc-page">
    ${blocks.map((block) => renderBlock(block, context)).join("\n")}
  </main>
</body>
</html>`;
}
