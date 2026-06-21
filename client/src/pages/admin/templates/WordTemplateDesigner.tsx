import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { Extension, type ChainedCommands, type Editor, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import ImageExtension from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Box,
  BringToFront,
  ChevronDown,
  Columns3,
  Copy,
  Eye,
  FileText,
  Grid3X3,
  Heading1,
  Heading2,
  Highlighter,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  LayoutTemplate,
  List,
  ListOrdered,
  Lock,
  Merge,
  Minus,
  Move,
  MousePointer2,
  PaintBucket,
  PanelBottom,
  PanelTop,
  Plus,
  QrCode,
  Redo2,
  RotateCcw,
  Rows2,
  Rows3,
  Save,
  SendToBack,
  ShieldCheck,
  Split,
  Square,
  Table as TableIcon,
  Trash2,
  Type,
  Underline,
  Unlock,
  Undo2
} from "lucide-react";
import { templateApi } from "../../../api";
import type { DocumentTemplateDetail, DocumentType, EntityId, TemplateBlock, TemplateBlockStyle, TemplateLayout, TipTapNode, WordTemplateZone } from "../../../api";
import { Button, SelectFilter, StatusBadge } from "../../../components/ui";
import { cx } from "../../../lib/classNames";
import {
  clampTableSelection,
  deleteTableColumn,
  deleteTableRow,
  deleteTableTrackSize,
  equalTableTrackSizes,
  insertTableColumn,
  insertTableRow,
  insertTableTrackSize,
  mergeTableCellRight,
  normalizeTableRows,
  normalizeTableTrackSizes,
  resizeVisualPercentTracks,
  serializeTableRows,
  splitTableCell,
  tableInsertFrameAtPoint,
  tableCellDocument,
  updateTableCell,
  visualTrackStopsPercent,
  type CellCoordinate,
  type TableEditResult,
  type TableDirection
} from "../templateTableUtils";
import {
  dateToken,
  defaultTemplateNameForWordDocumentType,
  normalizeWordTemplateZoneKey,
  signatureToken,
  systemToken,
  upsertWordTemplateZone,
  withWordTemplateDocument,
  withWordTemplateDocumentType,
  wordTemplateZones,
  zoneToken
} from "./wordTemplateModel";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    lineHeight: {
      setLineHeight: (lineHeight: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
  }
}

const emptyDoc: TipTapNode = { type: "doc", content: [{ type: "paragraph" }] };
const allowedImageTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const maxImageBytes = 2 * 1024 * 1024;
const a4WidthMm = 210;
const a4HeightMm = 297;
const defaultGridSizeMm = 5;
const minFloatingTableTrackPx = 20;
const tablePickerColumns = 10;
const tablePickerRows = 8;

type ResizeHandle = "nw" | "ne" | "sw" | "se";
type TableTrackAxis = "column" | "row";
type TextAlignment = "left" | "center" | "right" | "justify";
type DateCalendar = "gregorian" | "shamsi" | "hijri";
type EdgeWarningTone = "amber" | "red";

type EdgeWarning = {
  message: string;
  tone: EdgeWarningTone;
};

type PlacementPointer = {
  x: number;
  y: number;
};

type TableInsertSize = {
  columns: number;
  headerRow: boolean;
  rows: number;
};

type TablePlacementState = TableInsertSize & {
  pointer: PlacementPointer | null;
};

type SmartGuideLine = {
  label: string;
  position: number;
  tone: "active" | "center" | "margin" | "match" | "paper";
};

const resizeCursorByHandle: Record<ResizeHandle, string> = {
  ne: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  sw: "nesw-resize"
};

const dateInsertOptions: Array<{ calendar: DateCalendar; label: string; title: string }> = [
  { calendar: "gregorian", label: "Gregorian", title: "Insert Gregorian date" },
  { calendar: "shamsi", label: "Shamsi", title: "Insert Shamsi date" },
  { calendar: "hijri", label: "Hijri", title: "Insert Hijri date" }
];

const defaultWordFontFamily = "Noto Naskh Arabic, Tahoma, sans-serif";
const fontFamilyOptions = [
  { label: "Naskh Arabic", value: defaultWordFontFamily },
  { label: "Nazanin", value: "Nazanin, Noto Naskh Arabic, Tahoma, sans-serif" },
  { label: "Yekan", value: "Yekan, Noto Naskh Arabic, Tahoma, sans-serif" },
  { label: "Zar", value: "Zar, Noto Naskh Arabic, Tahoma, sans-serif" },
  { label: "Lotus", value: "Lotus, Noto Naskh Arabic, Tahoma, sans-serif" },
  { label: "Morvarid", value: "Morvarid, Noto Naskh Arabic, Tahoma, sans-serif" },
  { label: "Traffic", value: "Traffic, Noto Naskh Arabic, Tahoma, sans-serif" },
  { label: "Titr", value: "Titr, Noto Naskh Arabic, Tahoma, sans-serif" },
  { label: "Iran Nastaliq", value: "IranNastaliq, Noto Naskh Arabic, Tahoma, sans-serif" },
  { label: "Besmellah", value: "Besmellah, Noto Naskh Arabic, Tahoma, sans-serif" },
  { label: "Shaped Besmellah", value: "ShapedBesmellah, Noto Naskh Arabic, Tahoma, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times", value: "Times New Roman, serif" },
  { label: "Tahoma", value: "Tahoma, sans-serif" }
];
const fontSizeOptions = ["9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "22pt", "28pt"];
const lineHeightOptions = ["1.0", "1.15", "1.35", "1.5", "1.65", "2.0", "2.5"];
const directEditableFloatingTextTypes = ["cc_list", "rich_text", "text", "watermark"];
const riskyPaperEdgeMm = 5;
const smartGuideMatchThresholdMm = 3;

type PlacementDialog = {
  description?: string;
  floatingLabel?: string;
  inlineLabel?: string;
  onFloating: () => void;
  onInline?: () => void;
  title: string;
};

type FloatingDragState = {
  blockId: string;
  pageHeightPx: number;
  pageWidthPx: number;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

type FloatingResizeState = FloatingDragState & {
  handle: ResizeHandle;
  startHeight: number;
  startWidth: number;
};

type TableTrackResizeState =
  {
    axis: TableTrackAxis;
    boundaryIndex: number;
    pointerId: number;
    source: "floating";
    startClientX: number;
    startClientY: number;
    startColumnWidths: number[];
    startRowHeights: number[];
    tableHeightPx: number;
    tableWidthPx: number;
    blockId: string;
  };

function setPointerCaptureSafe(element: HTMLElement | null, pointerId: number) {
  try {
    element?.setPointerCapture(pointerId);
  } catch {
    // Drag chrome can be replaced while React re-renders the selected object.
  }
}

function releasePointerCaptureSafe(element: HTMLElement | null, pointerId: number) {
  try {
    if (element?.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Browsers may throw if the captured element was already removed.
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundMm(value: number) {
  return Math.round(value * 10) / 10;
}

function fontSizeNumber(value: string | number | undefined, fallback = 12) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const numeric = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function fontSizeLabel(value: string | number | undefined, fallback = "12pt") {
  const numeric = fontSizeNumber(value, fontSizeNumber(fallback));
  return `${numeric}pt`;
}

function lineHeightNumber(value: string | number | undefined, fallback = 1.65) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? clampNumber(numeric, 1, 3) : fallback;
}

function lineHeightLabel(value: string | number | undefined, fallback = 1.65) {
  const numeric = lineHeightNumber(value, fallback);
  return numeric.toFixed(2).replace(/\.?0+$/, "");
}

function blockStyleValue(block: TemplateBlock): TemplateBlockStyle {
  return block.style || {};
}

function defaultBlockStyle(overrides: TemplateBlockStyle = {}): TemplateBlockStyle {
  return {
    borderColor: "#94a3b8",
    borderStyle: "solid",
    borderWidth: 0,
    color: "#111827",
    fontFamily: defaultWordFontFamily,
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 1.65,
    textAlign: "start",
    ...overrides
  };
}

function physicalTextAlign(textAlign: TemplateBlockStyle["textAlign"], direction: TemplateLayout["page"]["direction"]): Exclude<TextAlignment, "justify"> {
  if (textAlign === "left" || textAlign === "right" || textAlign === "center") {
    return textAlign;
  }
  if (textAlign === "end") {
    return direction === "rtl" ? "left" : "right";
  }
  return direction === "rtl" ? "right" : "left";
}

function blockLabel(block: TemplateBlock) {
  if (block.type === "dynamic_field") {
    return block.field || "dynamic field";
  }
  if (block.type === "signature_zone") {
    return "approval / signature section";
  }
  if (block.type === "page_number") {
    return "page number";
  }
  return block.content?.split("\n")[0]?.slice(0, 36) || block.type.replaceAll("_", " ");
}

function blockImageSource(block: TemplateBlock) {
  return block.assetId ? templateApi.admin.logoAssetContentUrl(block.assetId) : block.src || "";
}

function floatingBlockStyle(block: TemplateBlock, pageDirection: TemplateLayout["page"]["direction"]): CSSProperties {
  const style = blockStyleValue(block);
  const borderWidth = Number(style.borderWidth || 0);
  const datePreviewValue = block.type === "dynamic_field" ? datePreviewValueForField(block.field) : "";
  const base: CSSProperties = {
    backgroundColor: style.backgroundColor || "transparent",
    borderColor: style.borderColor || "#94a3b8",
    borderStyle: style.borderStyle || "solid",
    borderWidth: `${borderWidth}px`,
    color: style.color || "#111827",
    fontFamily: style.fontFamily || undefined,
    fontSize: `${Number(style.fontSize || 11)}pt`,
    fontStyle: style.fontStyle || "normal",
    fontWeight: style.fontWeight || "400",
    height: `${block.height}mm`,
    left: `${block.x}mm`,
    letterSpacing: style.letterSpacing != null ? `${style.letterSpacing}em` : datePreviewValue ? "0.04em" : undefined,
    lineHeight: style.lineHeight || 1.65,
    textAlign: physicalTextAlign(style.textAlign, pageDirection),
    textDecoration: style.textDecoration || "none",
    top: `${block.y}mm`,
    width: `${block.width}mm`
  };

  if (block.type === "line") {
    return {
      ...base,
      backgroundColor: "transparent",
      borderLeft: 0,
      borderRight: 0,
      borderBottom: 0,
      borderTop: `${Math.max(1, borderWidth || 1)}px ${style.borderStyle || "solid"} ${style.borderColor || "#0f172a"}`,
      height: `${Math.max(0.5, block.height)}mm`
    };
  }

  return base;
}

const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {}
          }
        }
      }
    ];
  },
  addCommands() {
    return {
      setFontSize: (fontSize) => ({ chain }) => chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run()
    };
  }
});

const LineHeight = Extension.create({
  name: "lineHeight",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {}
          }
        }
      }
    ];
  },
  addCommands() {
    return {
      setLineHeight: (lineHeight) => ({ commands }) => commands.updateAttributes("paragraph", { lineHeight }) || commands.updateAttributes("heading", { lineHeight }),
      unsetLineHeight: () => ({ commands }) => commands.updateAttributes("paragraph", { lineHeight: null }) || commands.updateAttributes("heading", { lineHeight: null })
    };
  }
});

const WordImageExtension = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-align") || null,
        renderHTML: (attributes) => {
          const align = attributes.align;
          if (!["left", "center", "right"].includes(align)) {
            return {};
          }
          const margin = align === "center"
            ? "margin-inline:auto"
            : align === "left"
              ? "margin-inline-end:auto"
              : "margin-inline-start:auto";
          return {
            "data-align": align,
            style: `display:block;${margin}`
          };
        }
      }
    };
  }
});

type RibbonButtonProps = {
  active?: boolean;
  children?: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

type WordTemplateDesignerProps = {
  busy: boolean;
  canEdit: boolean;
  description: string;
  detail: DocumentTemplateDetail | null;
  documentTypes: DocumentType[];
  error?: string | null;
  notice?: string | null;
  layout: TemplateLayout;
  name: string;
  onBackToLibrary: () => void;
  onDescriptionChange: (value: string) => void;
  onLayoutChange: (layout: TemplateLayout) => void;
  onNameChange: (value: string) => void;
  onOpenPublish: () => void;
  onSave: () => void;
  onSelectDocumentType: (documentTypeId: EntityId | null) => void;
  selectedDocumentTypeId: EntityId | null;
};

type RibbonTab = "home" | "insert" | "fields" | "table" | "inspector" | "review";

const ribbonTabs: Array<{ id: RibbonTab; label: string }> = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "fields", label: "Fields" },
  { id: "table", label: "Table" },
  { id: "inspector", label: "Inspector" },
  { id: "review", label: "Review" }
];

function readFileAsDataBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function RibbonButton({ active, children, disabled, icon, label, onClick }: RibbonButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border px-2 text-xs font-bold transition",
        active ? "border-[#061d49] bg-[#061d49] text-white shadow-sm" : "border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50",
        disabled && "cursor-not-allowed opacity-45 hover:border-transparent hover:bg-white"
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
      {children}
    </button>
  );
}

function RibbonGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="flex min-h-[4.5rem] flex-col justify-between gap-1 border-r border-slate-200 px-2 py-1 last:border-r-0">
      <div className="flex flex-wrap items-center gap-1">{children}</div>
      <span className="block text-center text-[10px] font-bold uppercase leading-none tracking-wide text-slate-400">{label}</span>
    </section>
  );
}

function SelectControl({
  children,
  disabled,
  icon,
  label,
  onChange,
  value,
  widthClassName = "min-w-28"
}: {
  children: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
  widthClassName?: string;
}) {
  return (
    <label className={cx("relative inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white pl-2 pr-7 text-xs font-bold text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.03)]", widthClassName)}>
      <span className="grid h-5 w-5 shrink-0 place-items-center [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <span className="sr-only">{label}</span>
      <select
        className="h-full min-w-0 flex-1 appearance-none truncate bg-transparent py-1 pr-1 outline-none"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        title={label}
        value={value}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-500" />
    </label>
  );
}

function ColorControl({
  disabled,
  icon,
  label,
  onChange,
  value
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-transparent bg-white px-2 text-slate-700 hover:border-slate-200 hover:bg-slate-50" title={label}>
      {icon}
      <span className="h-3 w-3 rounded-sm border border-slate-300" style={{ backgroundColor: value }} />
      <input className="h-0 w-0 opacity-0" disabled={disabled} onChange={(event) => onChange(event.target.value)} type="color" value={value} />
    </label>
  );
}

function RibbonTabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={cx(
        "relative min-h-9 rounded-t-md px-3 text-sm font-bold transition",
        active ? "bg-white text-[#061d49]" : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
      {active ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#061d49]" /> : null}
    </button>
  );
}

function tableDirectionValue(direction: TemplateLayout["page"]["direction"]): TableDirection {
  return direction === "ltr" ? "ltr" : "rtl";
}

const dateFieldByCalendar: Record<DateCalendar, string> = {
  gregorian: "document.date.gregorian",
  shamsi: "document.date.shamsi",
  hijri: "document.date.hijri"
};

const datePreviewValueByField: Record<string, string> = {
  "document.date": "۱۴۰۵/۲/۱۵",
  "document.date.gregorian": "2026/5/5",
  "document.date.shamsi": "۱۴۰۵/۲/۱۵",
  "document.date.hijri": "۱۴۴۷/۱۱/۱۸"
};

function dateFieldForCalendar(calendar: DateCalendar) {
  return dateFieldByCalendar[calendar];
}

function dateFieldForToken(token: string) {
  const match = token.match(/^\{\{\s*date:(gregorian|shamsi|hijri)\s*\}\}$/);
  return match ? dateFieldForCalendar(match[1] as DateCalendar) : null;
}

function datePreviewValueForField(field?: string) {
  return field ? datePreviewValueByField[field] || "" : "";
}

function systemFieldForToken(kind: "origin_unit" | "serial") {
  if (kind === "origin_unit") {
    return "origin_unit.name";
  }
  return "document.official_serial";
}

function zoneForKey(key: string, label: string, overrides: Partial<WordTemplateZone> = {}): WordTemplateZone {
  const normalized = normalizeWordTemplateZoneKey(key);
  return {
    id: `zone-${normalized}`,
    key: normalized,
    label,
    kind: normalized === "subject" ? "subject" : normalized === "body" ? "body" : normalized === "header_unit" ? "header_unit" : "custom",
    maxLength: normalized === "body" ? 200000 : 500,
    maxLines: normalized === "body" ? 80 : 4,
    multiline: normalized !== "subject",
    placeholder: label,
    richText: normalized === "body",
    ...overrides
  };
}

function tokenLabel(token: string) {
  return token
    .replace(/\{\{\s*|\s*\}\}/g, "")
    .replace("zone:", "")
    .replace("system:", "")
    .replace("date:", "")
    .replace("signature:", "signature ")
    .replaceAll("_", " ");
}

function RichTableCellPreview({ document, placeholder }: { document: TipTapNode; placeholder?: string }) {
  function renderNode(node: TipTapNode, key: string): ReactNode {
    if (node.type === "text") {
      let content: ReactNode = node.text || "";
      (node.marks || []).forEach((mark, index) => {
        if (mark.type === "bold") content = <strong key={`${key}-bold-${index}`}>{content}</strong>;
        if (mark.type === "italic") content = <em key={`${key}-italic-${index}`}>{content}</em>;
        if (mark.type === "underline") content = <u key={`${key}-underline-${index}`}>{content}</u>;
        if (mark.type === "highlight") content = <mark key={`${key}-highlight-${index}`} style={{ backgroundColor: String(mark.attrs?.color || "#fef08a") }}>{content}</mark>;
        if (mark.type === "textStyle") {
          content = (
            <span
              key={`${key}-style-${index}`}
              style={{
                color: mark.attrs?.color ? String(mark.attrs.color) : undefined,
                fontFamily: mark.attrs?.fontFamily ? String(mark.attrs.fontFamily) : undefined,
                fontSize: mark.attrs?.fontSize ? String(mark.attrs.fontSize) : undefined
              }}
            >
              {content}
            </span>
          );
        }
      });
      return content;
    }
    if (node.type === "hardBreak") {
      return <br key={key} />;
    }
    const children = (node.content || []).map((child, index) => renderNode(child, `${key}-${index}`));
    if (node.type === "paragraph") {
      return <p key={key} style={{ lineHeight: node.attrs?.lineHeight ? String(node.attrs.lineHeight) : undefined, textAlign: node.attrs?.textAlign as CSSProperties["textAlign"] }}>{children.length ? children : <br />}</p>;
    }
    if (node.type === "bulletList") return <ul key={key}>{children}</ul>;
    if (node.type === "orderedList") return <ol key={key}>{children}</ol>;
    if (node.type === "listItem") return <li key={key}>{children}</li>;
    return <span key={key}>{children}</span>;
  }

  const content = (document.content || []).map((node, index) => renderNode(node, `cell-${index}`));
  const hasText = JSON.stringify(document).includes('"text"');
  return hasText ? <>{content}</> : <span className="select-none text-slate-400">{placeholder || "Write here"}</span>;
}

function FloatingTableCellEditor({
  document,
  onChange,
  onExit,
  onNavigate,
  onReady
}: {
  document: TipTapNode;
  onChange: (document: TipTapNode) => void;
  onExit: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onReady: (editor: Editor | null) => void;
}) {
  const lastDocumentRef = useRef(JSON.stringify(document));
  const extensions = useMemo(() => [
    StarterKit.configure({ blockquote: false, code: false, codeBlock: false, heading: false, horizontalRule: false, link: false, strike: false }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    LineHeight,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["paragraph"] })
  ], []);
  const editor = useEditor({
    content: document as JSONContent,
    editorProps: {
      attributes: {
        class: "floating-table-cell-prose min-h-full w-full outline-none"
      }
    },
    extensions,
    immediatelyRender: false,
    onUpdate: ({ editor: updatedEditor }) => {
      const next = updatedEditor.getJSON() as TipTapNode;
      lastDocumentRef.current = JSON.stringify(next);
      onChange(next);
    }
  });

  useEffect(() => {
    if (!editor) return;
    onReady(editor);
    window.requestAnimationFrame(() => editor.commands.focus("end", { scrollIntoView: false }));
    return () => onReady(null);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(document);
    if (incoming !== lastDocumentRef.current) {
      lastDocumentRef.current = incoming;
      editor.commands.setContent(document as JSONContent);
    }
  }, [document, editor]);

  return (
    <div
      className="h-full min-h-full w-full"
      data-floating-table-cell-editor="true"
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          onNavigate(event.shiftKey ? -1 : 1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onExit();
        } else {
          event.stopPropagation();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

function FloatingTablePreview({
  block,
  canEdit,
  editingCell,
  onCellChange,
  onCellEditorReady,
  onExitCell,
  onMoveTrackResize,
  onNavigateCell,
  onSelectCell,
  onStartTrackResize,
  onStopTrackResize,
  pageDirection,
  selectedCell,
  selectedTable
}: {
  block: TemplateBlock;
  canEdit?: boolean;
  editingCell?: CellCoordinate;
  onCellChange?: (cell: CellCoordinate, document: TipTapNode) => void;
  onCellEditorReady?: (editor: Editor | null) => void;
  onExitCell?: () => void;
  onMoveTrackResize?: (event: PointerEvent<HTMLSpanElement>) => void;
  onNavigateCell?: (direction: -1 | 1) => void;
  onSelectCell?: (cell: CellCoordinate) => void;
  onStartTrackResize?: (event: PointerEvent<HTMLSpanElement>, axis: TableTrackAxis, boundaryIndex: number) => void;
  onStopTrackResize?: (event: PointerEvent<HTMLSpanElement>) => void;
  pageDirection: TemplateLayout["page"]["direction"];
  selectedCell?: CellCoordinate;
  selectedTable?: boolean;
}) {
  const rows = normalizeTableRows(block);
  const columnWidths = normalizeTableTrackSizes(block.columnWidths, rows[0]?.length || 1);
  const rowHeights = normalizeTableTrackSizes(block.rowHeights, rows.length);
  const columnStops = visualTrackStopsPercent(columnWidths, columnWidths.length, tableDirectionValue(pageDirection));
  const rowStops = visualTrackStopsPercent(rowHeights, rowHeights.length, "ltr");
  const tableStyle = block.style || {};
  return (
    <div className="relative h-full w-full" data-floating-table-preview="true" onPointerDown={(event) => event.stopPropagation()}>
      <table className="h-full w-full table-fixed border-collapse bg-white" dir={pageDirection}>
        <colgroup>
          {columnWidths.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
        </colgroup>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} style={{ height: `${rowHeights[rowIndex] || 0}%` }}>
              {row.map((cell, colIndex) => {
                if (cell.hidden) {
                  return null;
                }
                const CellTag = block.headerRow && rowIndex === 0 ? "th" : "td";
                const cellStyle = cell.style || {};
                const activeCell = Boolean(selectedTable && canEdit && editingCell?.row === rowIndex && editingCell.col === colIndex);
                return (
                  <CellTag
                    className={cx("relative", selectedCell?.row === rowIndex && selectedCell.col === colIndex && "shadow-[inset_0_0_0_2px_#2563eb]")}
                    colSpan={cell.colSpan}
                    key={colIndex}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectCell?.({ col: colIndex, row: rowIndex });
                    }}
                    rowSpan={cell.rowSpan}
                    style={{
                      backgroundColor: cellStyle.backgroundColor || (CellTag === "th" ? tableStyle.headerBackgroundColor || "#f8fafc" : tableStyle.backgroundColor || "#ffffff"),
                      border: `${Number(tableStyle.borderWidth ?? 1)}px solid ${tableStyle.borderColor || "#cbd5e1"}`,
                      color: cellStyle.color || tableStyle.color || "#111827",
                      fontFamily: cellStyle.fontFamily || tableStyle.fontFamily || undefined,
                      fontSize: `${Number(cellStyle.fontSize || tableStyle.fontSize || 9)}pt`,
                      fontStyle: cellStyle.fontStyle || tableStyle.fontStyle || "normal",
                      fontWeight: cellStyle.fontWeight || (CellTag === "th" ? "700" : tableStyle.fontWeight || "400"),
                      padding: `${Number(tableStyle.cellPaddingMm ?? 1.2)}mm`,
                      textAlign: physicalTextAlign(cellStyle.textAlign || tableStyle.textAlign, pageDirection),
                      textDecoration: cellStyle.textDecoration || tableStyle.textDecoration || "none",
                      verticalAlign: "top",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word"
                    }}
                  >
                    {activeCell ? (
                      <FloatingTableCellEditor
                        document={tableCellDocument(cell)}
                        key={`${block.id}-${rowIndex}-${colIndex}`}
                        onChange={(document) => onCellChange?.({ col: colIndex, row: rowIndex }, document)}
                        onExit={() => onExitCell?.()}
                        onNavigate={(direction) => onNavigateCell?.(direction)}
                        onReady={(editor) => onCellEditorReady?.(editor)}
                      />
                    ) : (
                      <RichTableCellPreview document={tableCellDocument(cell)} placeholder={CellTag === "th" ? `Header ${colIndex + 1}` : "Write here"} />
                    )}
                  </CellTag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {selectedTable ? (
        <div className="pointer-events-none absolute inset-0">
          {columnStops.map((stop, index) => (
            <span
              className="pointer-events-auto absolute top-0 z-40 h-full w-2 -translate-x-1/2 cursor-col-resize bg-blue-500/10 transition hover:bg-blue-500/30"
              data-table-track-handle="column"
              key={`col-${index}`}
              onPointerCancel={onStopTrackResize}
              onPointerDown={(event) => onStartTrackResize?.(event, "column", index)}
              onPointerMove={onMoveTrackResize}
              onPointerUp={onStopTrackResize}
              style={{ left: `${stop}%` }}
            />
          ))}
          {rowStops.map((stop, index) => (
            <span
              className="pointer-events-auto absolute left-0 z-40 h-2 w-full -translate-y-1/2 cursor-row-resize bg-blue-500/10 transition hover:bg-blue-500/30"
              data-table-track-handle="row"
              key={`row-${index}`}
              onPointerCancel={onStopTrackResize}
              onPointerDown={(event) => onStartTrackResize?.(event, "row", index)}
              onPointerMove={onMoveTrackResize}
              onPointerUp={onStopTrackResize}
              style={{ top: `${stop}%` }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WordTemplateDesigner({
  busy,
  canEdit,
  description,
  detail,
  documentTypes,
  error,
  notice,
  layout,
  name,
  onBackToLibrary,
  onDescriptionChange,
  onLayoutChange,
  onNameChange,
  onOpenPublish,
  onSave,
  onSelectDocumentType,
  selectedDocumentTypeId
}: WordTemplateDesignerProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const replaceImageInputRef = useRef<HTMLInputElement | null>(null);
  const tablePickerAnchorRef = useRef<HTMLDivElement | null>(null);
  const workAreaRef = useRef<HTMLElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const blockElementRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const floatingTextEditorRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const activeBlockDraftRef = useRef<TemplateBlock | null>(null);
  const pendingBlockDraftRef = useRef<TemplateBlock | null>(null);
  const pendingBlockFrameRef = useRef<number | null>(null);
  const edgeWarningTimerRef = useRef<number | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [edgeWarning, setEdgeWarning] = useState<EdgeWarning | null>(null);
  const [fontSize, setFontSize] = useState("12pt");
  const [fontFamily, setFontFamily] = useState(defaultWordFontFamily);
  const [lineHeight, setLineHeight] = useState("1.65");
  const [textColor, setTextColor] = useState("#111827");
  const [highlightColor, setHighlightColor] = useState("#fef08a");
  const [cellFillColor, setCellFillColor] = useState("#f8fafc");
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTab>("home");
  const [pageZoom, setPageZoom] = useState(0.9);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<FloatingDragState | null>(null);
  const [resizeState, setResizeState] = useState<FloatingResizeState | null>(null);
  const [tableTrackResizeState, setTableTrackResizeState] = useState<TableTrackResizeState | null>(null);
  const [activeGuideBlock, setActiveGuideBlock] = useState<TemplateBlock | null>(null);
  const [activeTextEditBlockId, setActiveTextEditBlockId] = useState<string | null>(null);
  const [activeTableCellEditor, setActiveTableCellEditor] = useState<Editor | null>(null);
  const [placementPointer, setPlacementPointer] = useState<PlacementPointer | null>(null);
  const [textPlacementMode, setTextPlacementMode] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [placementDialog, setPlacementDialog] = useState<PlacementDialog | null>(null);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tablePickerSize, setTablePickerSize] = useState<TableInsertSize>({ columns: 3, headerRow: true, rows: 3 });
  const [tablePlacement, setTablePlacement] = useState<TablePlacementState | null>(null);
  const [inlineImageSize, setInlineImageSize] = useState({ width: "", height: "" });
  const [selectionTick, setSelectionTick] = useState(0);
  const [selectedTableCell, setSelectedTableCell] = useState<CellCoordinate>({ col: 0, row: 0 });
  const [editingTableCell, setEditingTableCell] = useState<(CellCoordinate & { blockId: string }) | null>(null);
  const zones = wordTemplateZones(layout);
  const blocks = layout.blocks || [];
  const selectedBlock = selectedBlockId ? blocks.find((block) => block.id === selectedBlockId) || null : null;
  const activeDocumentTypes = documentTypes.filter((documentType) => documentType.status === "active");
  const selectedDocumentType = selectedDocumentTypeId
    ? documentTypes.find((documentType) => documentType.id === selectedDocumentTypeId) || null
    : null;

  function captureDesignerScroll() {
    const workArea = workAreaRef.current;
    return {
      workArea,
      workAreaLeft: workArea?.scrollLeft ?? 0,
      workAreaTop: workArea?.scrollTop ?? 0,
      windowX: window.scrollX,
      windowY: window.scrollY
    };
  }

  function restoreDesignerScroll(snapshot: ReturnType<typeof captureDesignerScroll>) {
    const restore = () => {
      snapshot.workArea?.scrollTo({ left: snapshot.workAreaLeft, top: snapshot.workAreaTop });
      window.scrollTo(snapshot.windowX, snapshot.windowY);
    };
    window.requestAnimationFrame(restore);
    window.setTimeout(restore, 0);
  }

  function preserveDesignerScroll<T>(run: () => T): T {
    const snapshot = captureDesignerScroll();
    const result = run();
    restoreDesignerScroll(snapshot);
    return result;
  }

  function focusPageWithoutScroll() {
    pageRef.current?.focus({ preventScroll: true });
  }

  function focusEditorChain() {
    return editor?.chain().focus(undefined, { scrollIntoView: false });
  }

  const extensions = useMemo(() => [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    LineHeight,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    WordImageExtension.configure({
      allowBase64: true,
      inline: false,
      resize: {
        alwaysPreserveAspectRatio: true,
        directions: ["bottom-right"],
        enabled: true,
        minHeight: 24,
        minWidth: 24
      }
    }),
    Placeholder.configure({ placeholder: "" })
  ], []);

  const editor = useEditor({
    content: (layout.document || emptyDoc) as JSONContent,
    editable: canEdit,
    editorProps: {
      attributes: {
        class: "word-template-prose min-h-[calc(297mm-36mm)] w-full outline-none"
      }
    },
    extensions,
    immediatelyRender: false,
    onUpdate: ({ editor: updatedEditor }) => {
      onLayoutChange(withWordTemplateDocument(layout, updatedEditor.getJSON() as TipTapNode));
    }
  });

  useEffect(() => {
    if (!editor) {
      return undefined;
    }
    const bumpSelection = () => setSelectionTick((current) => current + 1);
    editor.on("selectionUpdate", bumpSelection);
    editor.on("transaction", bumpSelection);
    return () => {
      editor.off("selectionUpdate", bumpSelection);
      editor.off("transaction", bumpSelection);
    };
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [canEdit, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const incoming = JSON.stringify(layout.document || emptyDoc);
    const current = JSON.stringify(editor.getJSON());
    if (incoming !== current) {
      editor.commands.setContent((layout.document || emptyDoc) as JSONContent);
    }
  }, [editor, layout.document]);

  useEffect(() => {
    if (activeTableCellEditor) {
      const textStyle = activeTableCellEditor.getAttributes("textStyle") as { color?: string; fontFamily?: string; fontSize?: string };
      const highlight = activeTableCellEditor.getAttributes("highlight") as { color?: string };
      const paragraphAttrs = activeTableCellEditor.getAttributes("paragraph") as { lineHeight?: string };
      setFontFamily(textStyle.fontFamily || defaultWordFontFamily);
      setFontSize(textStyle.fontSize || "12pt");
      setLineHeight(lineHeightLabel(paragraphAttrs.lineHeight));
      setTextColor(textStyle.color || "#111827");
      setHighlightColor(highlight.color || "#fef08a");
      return;
    }
    if (selectedBlock) {
      const style = blockStyleValue(selectedBlock);
      setFontFamily(style.fontFamily || defaultWordFontFamily);
      setFontSize(fontSizeLabel(style.fontSize));
      setLineHeight(lineHeightLabel(style.lineHeight));
      setTextColor(style.color || "#111827");
      setHighlightColor(style.backgroundColor || "#fef08a");
      return;
    }
    if (!editor) {
      return;
    }
    const textStyle = editor.getAttributes("textStyle") as { color?: string; fontFamily?: string; fontSize?: string };
    const highlight = editor.getAttributes("highlight") as { color?: string };
    const paragraphAttrs = editor.getAttributes("paragraph") as { lineHeight?: string };
    const headingAttrs = editor.getAttributes("heading") as { lineHeight?: string };
    setFontFamily(textStyle.fontFamily || defaultWordFontFamily);
    setFontSize(textStyle.fontSize || "12pt");
    setLineHeight(lineHeightLabel(paragraphAttrs.lineHeight || headingAttrs.lineHeight));
    setTextColor(textStyle.color || "#111827");
    setHighlightColor(highlight.color || "#fef08a");
    const imageAttrs = selectedInlineImageAttrs();
    setInlineImageSize({
      height: imageAttrs?.height ? String(Math.round(Number(imageAttrs.height))) : "",
      width: imageAttrs?.width ? String(Math.round(Number(imageAttrs.width))) : ""
    });
  }, [activeTableCellEditor, editor, selectedBlock, selectionTick]);

  useEffect(() => {
    if (!activeTableCellEditor) return undefined;
    const bumpSelection = () => setSelectionTick((current) => current + 1);
    activeTableCellEditor.on("selectionUpdate", bumpSelection);
    activeTableCellEditor.on("transaction", bumpSelection);
    return () => {
      activeTableCellEditor.off("selectionUpdate", bumpSelection);
      activeTableCellEditor.off("transaction", bumpSelection);
    };
  }, [activeTableCellEditor]);

  useEffect(() => () => {
    if (pendingBlockFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingBlockFrameRef.current);
    }
    if (edgeWarningTimerRef.current !== null) {
      window.clearTimeout(edgeWarningTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!activeTextEditBlockId || selectedBlockId !== activeTextEditBlockId) {
      return;
    }
    window.requestAnimationFrame(() => {
      const editorElement = floatingTextEditorRefs.current.get(activeTextEditBlockId);
      if (!editorElement) {
        return;
      }
      editorElement.focus({ preventScroll: true });
      const end = editorElement.value.length;
      editorElement.setSelectionRange(end, end);
    });
  }, [activeTextEditBlockId, selectedBlockId, blocks.length]);

  useEffect(() => {
    if (!dragState && !resizeState && !tableTrackResizeState) {
      return undefined;
    }
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = tableTrackResizeState
      ? tableTrackResizeState.axis === "column" ? "col-resize" : "row-resize"
      : resizeState ? resizeCursorByHandle[resizeState.handle] : "move";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragState, resizeState, tableTrackResizeState]);

  useEffect(() => {
    if (!dragState && !resizeState && !tableTrackResizeState) {
      return undefined;
    }
    const pointerId = dragState?.pointerId ?? resizeState?.pointerId ?? tableTrackResizeState?.pointerId;
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      event.preventDefault();
      if (dragState) {
        moveBlockDragFromPoint(event.clientX, event.clientY);
      } else if (resizeState) {
        moveBlockResizeFromPoint(event.clientX, event.clientY);
      } else if (tableTrackResizeState) {
        moveTableTrackResizeFromPoint(event.clientX, event.clientY);
      }
    };
    const handlePointerDone = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      handlePointerMove(event);
      if (dragState || resizeState) {
        commitFloatingBlockDraft();
      }
      setDragState(null);
      setResizeState(null);
      setTableTrackResizeState(null);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerDone);
    window.addEventListener("pointercancel", handlePointerDone);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerDone);
      window.removeEventListener("pointercancel", handlePointerDone);
    };
  }, [blocks, dragState, layout.page.direction, resizeState, tableTrackResizeState]);

  useEffect(() => {
    if (!textPlacementMode && !tablePlacement && !tablePickerOpen) {
      return undefined;
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setTextPlacementMode(false);
      setTablePlacement(null);
      setTablePickerOpen(false);
      setPlacementPointer(null);
      showStatus("Placement canceled.");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tablePickerOpen, tablePlacement, textPlacementMode]);

  useEffect(() => {
    if (!tablePickerOpen) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-table-picker-cell="${tablePickerSize.columns}-${tablePickerSize.rows}"]`)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tablePickerOpen]);

  function updateLayout(next: TemplateLayout) {
    preserveDesignerScroll(() => onLayoutChange(next));
  }

  function showStatus(message: string) {
    setStatusMessage(message);
    window.setTimeout(() => {
      setStatusMessage((current) => current === message ? null : current);
    }, 2600);
  }

  function showEdgeWarning(warning: EdgeWarning | null, transient = false) {
    if (edgeWarningTimerRef.current !== null) {
      window.clearTimeout(edgeWarningTimerRef.current);
      edgeWarningTimerRef.current = null;
    }
    setEdgeWarning(warning);
    if (warning && transient) {
      edgeWarningTimerRef.current = window.setTimeout(() => {
        setEdgeWarning((current) => current?.message === warning.message ? null : current);
        edgeWarningTimerRef.current = null;
      }, 4200);
    }
  }

  function pageMarginMm(side: "bottom" | "left" | "right" | "top") {
    const value = side === "bottom" ? layout.page.marginBottomMm
      : side === "left" ? layout.page.marginLeftMm
        : side === "right" ? layout.page.marginRightMm
          : layout.page.marginTopMm;
    const limit = side === "left" || side === "right" ? a4WidthMm : a4HeightMm;
    const numeric = Number(value);
    return clampNumber(Number.isFinite(numeric) ? numeric : 18, 0, limit / 2);
  }

  function edgeWarningForBlock(block: TemplateBlock | null | undefined): EdgeWarning | null {
    if (!block) {
      return null;
    }
    const right = block.x + block.width;
    const bottom = block.y + block.height;
    const nearPaperEdge = block.x <= riskyPaperEdgeMm
      || block.y <= riskyPaperEdgeMm
      || right >= a4WidthMm - riskyPaperEdgeMm
      || bottom >= a4HeightMm - riskyPaperEdgeMm;
    if (nearPaperEdge) {
      return {
        message: "This object is within 5mm of the paper edge and may be clipped when printed.",
        tone: "red"
      };
    }
    const outsidePrintableMargins = block.x < pageMarginMm("left")
      || block.y < pageMarginMm("top")
      || right > a4WidthMm - pageMarginMm("right")
      || bottom > a4HeightMm - pageMarginMm("bottom");
    if (outsidePrintableMargins) {
      return {
        message: "This object is outside the printable margin area. It can print, but verify the final paper output.",
        tone: "amber"
      };
    }
    return null;
  }

  function canEditFloatingTextDirectly(block?: TemplateBlock | null) {
    return Boolean(block && directEditableFloatingTextTypes.includes(block.type));
  }

  function clientPointToPageMm(clientX: number, clientY: number): PlacementPointer | null {
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) {
      return null;
    }
    return {
      x: roundMm(clampNumber(((clientX - rect.left) / rect.width) * a4WidthMm, 0, a4WidthMm)),
      y: roundMm(clampNumber(((clientY - rect.top) / rect.height) * a4HeightMm, 0, a4HeightMm))
    };
  }

  function canMutateBlock(block?: TemplateBlock | null) {
    return Boolean(canEdit && block && !block.locked);
  }

  function editableSelectedBlock() {
    const block = selectedBlock;
    if (!block) {
      showStatus("Select a floating object first.");
      return null;
    }
    if (!canEdit) {
      showStatus("This template is read-only.");
      return null;
    }
    if (block.locked) {
      showStatus("Unlock this object before changing it.");
      return null;
    }
    return block;
  }

  function selectedBlockIsImageLike(block?: TemplateBlock | null): block is TemplateBlock {
    return Boolean(block && ["image", "logo"].includes(block.type));
  }

  function updateBlocks(nextBlocks: TemplateBlock[], nextSelectedId = selectedBlockId) {
    preserveDesignerScroll(() => {
      onLayoutChange({
        ...layout,
        mode: "word_template",
        schemaVersion: 2,
        blocks: nextBlocks
      });
      setSelectedBlockId(nextSelectedId);
    });
  }

  function updateBlock(blockId: string, updater: Partial<TemplateBlock> | ((block: TemplateBlock) => TemplateBlock)) {
    const nextBlocks = blocks.map((block) => {
      if (block.id !== blockId) {
        return block;
      }
      return typeof updater === "function" ? updater(block) : { ...block, ...updater };
    });
    updateBlocks(nextBlocks, blockId);
  }

  function applyFloatingBlockDraft(block: TemplateBlock) {
    const element = blockElementRefs.current.get(block.id);
    if (!element) {
      return;
    }
    element.style.left = `${block.x}mm`;
    element.style.top = `${block.y}mm`;
    element.style.width = `${block.width}mm`;
    element.style.height = `${block.type === "line" ? Math.max(0.5, block.height) : block.height}mm`;
  }

  function scheduleFloatingBlockDraft(block: TemplateBlock) {
    activeBlockDraftRef.current = block;
    pendingBlockDraftRef.current = block;
    if (pendingBlockFrameRef.current !== null) {
      return;
    }
    pendingBlockFrameRef.current = window.requestAnimationFrame(() => {
      pendingBlockFrameRef.current = null;
      const next = pendingBlockDraftRef.current;
      if (next) {
        applyFloatingBlockDraft(next);
        setActiveGuideBlock(next);
      }
    });
  }

  function commitFloatingBlockDraft() {
    const draft = activeBlockDraftRef.current;
    activeBlockDraftRef.current = null;
    pendingBlockDraftRef.current = null;
    if (pendingBlockFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingBlockFrameRef.current);
      pendingBlockFrameRef.current = null;
    }
    if (!draft) {
      return;
    }
    const finalDraft = draft;
    applyFloatingBlockDraft(finalDraft);
    setActiveGuideBlock(null);
    showEdgeWarning(edgeWarningForBlock(finalDraft), true);
    updateBlock(finalDraft.id, finalDraft);
  }

  function updateSelectedBlockStyle(nextStyle: Partial<TemplateBlockStyle>) {
    if (activeTableCellEditor && selectedBlock?.type === "table") {
      return false;
    }
    const block = editableSelectedBlock();
    if (!block) {
      return false;
    }
    updateBlock(block.id, (currentBlock) => ({
      ...currentBlock,
      style: {
        ...currentBlock.style,
        ...nextStyle
      }
    }));
    return true;
  }

  function snapMm(value: number) {
    return snapEnabled ? roundMm(Math.round(value / defaultGridSizeMm) * defaultGridSizeMm) : roundMm(value);
  }

  function clampBlock(block: TemplateBlock): TemplateBlock {
    const width = clampNumber(block.width, 3, a4WidthMm);
    const height = clampNumber(block.height, 1, a4HeightMm);
    return {
      ...block,
      height: roundMm(Math.min(height, a4HeightMm - clampNumber(block.y, 0, a4HeightMm - height))),
      width: roundMm(Math.min(width, a4WidthMm - clampNumber(block.x, 0, a4WidthMm - width))),
      x: roundMm(clampNumber(block.x, 0, Math.max(0, a4WidthMm - width))),
      y: roundMm(clampNumber(block.y, 0, Math.max(0, a4HeightMm - height)))
    };
  }

  function newBlockId(type: string) {
    return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function addFloatingBlock(input: Partial<TemplateBlock> & Pick<TemplateBlock, "type">) {
    const base: TemplateBlock = {
      height: 18,
      id: input.id || newBlockId(input.type),
      type: input.type,
      width: 70,
      x: snapMm(28 + (blocks.length % 4) * 8),
      y: snapMm(42 + (blocks.length % 6) * 8),
      style: defaultBlockStyle()
    };
    const nextBlock = clampBlock({
      ...base,
      ...input,
      style: {
        ...base.style,
        ...input.style
      }
    });
    updateBlocks([...blocks, nextBlock], nextBlock.id);
    setActiveRibbonTab("inspector");
    showStatus(`${blockLabel(nextBlock)} inserted as a floating object.`);
    return nextBlock;
  }

  function applyToCurrentTextRange(run: (chain: ChainedCommands) => boolean) {
    const targetEditor = activeTableCellEditor || editor;
    if (!targetEditor) {
      return false;
    }
    const { selection } = targetEditor.state;
    const chain = targetEditor.chain().focus(undefined, { scrollIntoView: false });
    if (activeTableCellEditor) {
      run(chain);
      return true;
    }
    if (!selection.empty) {
      run(chain);
      return true;
    }

    const { $from } = selection;
    const parentStart = $from.start();
    const parentEnd = $from.end();
    if (parentEnd > parentStart) {
      const cursor = selection.from;
      run(chain.setTextSelection({ from: parentStart, to: parentEnd }));
      targetEditor.commands.setTextSelection(cursor);
      return true;
    }

    run(chain);
    return true;
  }

  function applyFontSize(value: string) {
    setFontSize(value);
    if (updateSelectedBlockStyle({ fontSize: fontSizeNumber(value) })) {
      return;
    }
    applyToCurrentTextRange((chain) => chain.setFontSize(value).run());
  }

  function applyFontFamily(value: string) {
    setFontFamily(value);
    if (updateSelectedBlockStyle({ fontFamily: value })) {
      return;
    }
    applyToCurrentTextRange((chain) => chain.setFontFamily(value).run());
  }

  function applyLineHeight(value: string | number) {
    const next = lineHeightLabel(value);
    setLineHeight(next);
    if (updateSelectedBlockStyle({ lineHeight: lineHeightNumber(next) })) {
      return;
    }
    const targetEditor = activeTableCellEditor || editor;
    if (!targetEditor?.can().setLineHeight(next)) {
      showStatus("Place the cursor inside text or select a floating text object first.");
      return;
    }
    applyToCurrentTextRange((chain) => chain.setLineHeight(next).run());
  }

  function stepLineHeight(delta: number) {
    const next = clampNumber(Math.round((lineHeightNumber(lineHeight) + delta) * 10) / 10, 1, 3);
    applyLineHeight(next);
  }

  function applyColor(value: string) {
    setTextColor(value);
    if (updateSelectedBlockStyle({ color: value })) {
      return;
    }
    applyToCurrentTextRange((chain) => chain.setColor(value).run());
  }

  function applyHighlight(value: string) {
    setHighlightColor(value);
    if (updateSelectedBlockStyle({ backgroundColor: value })) {
      return;
    }
    applyToCurrentTextRange((chain) => chain.toggleHighlight({ color: value }).run());
  }

  function toggleBold() {
    if (selectedBlock && !activeTableCellEditor) {
      updateSelectedBlockStyle({ fontWeight: blockStyleValue(selectedBlock).fontWeight === "700" ? "400" : "700" });
      return;
    }
    applyToCurrentTextRange((chain) => chain.toggleBold().run());
  }

  function toggleItalic() {
    if (selectedBlock && !activeTableCellEditor) {
      updateSelectedBlockStyle({ fontStyle: blockStyleValue(selectedBlock).fontStyle === "italic" ? "normal" : "italic" });
      return;
    }
    applyToCurrentTextRange((chain) => chain.toggleItalic().run());
  }

  function toggleUnderline() {
    if (selectedBlock && !activeTableCellEditor) {
      updateSelectedBlockStyle({ textDecoration: blockStyleValue(selectedBlock).textDecoration === "underline" ? "none" : "underline" });
      return;
    }
    applyToCurrentTextRange((chain) => chain.toggleUnderline().run());
  }

  function applyAlignment(value: TextAlignment) {
    if (selectedBlock && !activeTableCellEditor) {
      updateSelectedBlockStyle({ textAlign: value === "justify" ? "start" : value });
      return;
    }
    if (value !== "justify" && selectedInlineImageAttrs()) {
      updateInlineImageAttrs({ align: value });
      return;
    }
    const targetEditor = activeTableCellEditor || editor;
    if (!targetEditor?.can().setTextAlign(value)) {
      showStatus("Place the cursor inside text or select a floating text object first.");
      return;
    }
    targetEditor.chain().focus(undefined, { scrollIntoView: false }).setTextAlign(value).run();
  }

  function selectedInlineImageAttrs() {
    if (!editor) {
      return null;
    }
    const selection = editor.state.selection;
    if (selection instanceof NodeSelection && selection.node.type.name === "image") {
      return selection.node.attrs as { align?: string; alt?: string; height?: number; src?: string; title?: string; width?: number };
    }
    return editor.isActive("image") ? editor.getAttributes("image") as { align?: string; alt?: string; height?: number; src?: string; title?: string; width?: number } : null;
  }

  function updateInlineImageAttrs(attrs: Record<string, unknown>) {
    if (!editor || !selectedInlineImageAttrs()) {
      showStatus("Select an inline image first.");
      return;
    }
    preserveDesignerScroll(() => {
      focusEditorChain()?.updateAttributes("image", attrs).run();
    });
  }

  function convertInlineImageToFloating() {
    if (!editor) {
      return;
    }
    const selection = editor.state.selection;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") {
      showStatus("Select an inline image first.");
      return;
    }
    const attrs = selection.node.attrs as { alt?: string; height?: number; src?: string; title?: string; width?: number };
    const widthPx = Number(attrs.width || 220);
    const heightPx = Number(attrs.height || 120);
    addFloatingBlock({
      height: clampNumber(Math.round(heightPx * 0.264583), 10, 90),
      src: attrs.src || "",
      style: defaultBlockStyle({ borderWidth: 0 }),
      type: "image",
      width: clampNumber(Math.round(widthPx * 0.264583), 14, 150)
    });
    preserveDesignerScroll(() => {
      focusEditorChain()?.deleteSelection().run();
    });
  }

  function replaceSelectedInlineImage(file: File | null | undefined) {
    if (!file) {
      return;
    }
    if (!selectedInlineImageAttrs()) {
      showStatus("Select an inline image first.");
      return;
    }
    void uploadImage(file, "replace-inline");
  }

  function replaceSelectedFloatingImage() {
    if (!selectedBlockIsImageLike(selectedBlock)) {
      showStatus("Select a floating image or logo first.");
      return;
    }
    if (!editableSelectedBlock()) {
      return;
    }
    replaceImageInputRef.current?.click();
  }

  function clearSelectedFloatingImage() {
    if (!selectedBlockIsImageLike(selectedBlock)) {
      showStatus("Select a floating image or logo first.");
      return;
    }
    const block = editableSelectedBlock();
    if (!block) {
      return;
    }
    updateBlock(block.id, (currentBlock) => ({
      ...currentBlock,
      assetId: undefined,
      assetName: undefined,
      src: ""
    }));
  }

  function insertTextToken(token: string, zone?: WordTemplateZone) {
    if (!editor) {
      return;
    }
    preserveDesignerScroll(() => {
      setSelectedBlockId(null);
      focusEditorChain()?.insertContent(token).run();
      const layoutWithDocument = withWordTemplateDocument(layout, editor.getJSON() as TipTapNode);
      if (zone) {
        updateLayout(upsertWordTemplateZone(layoutWithDocument, zone));
      } else {
        updateLayout(layoutWithDocument);
      }
    });
  }

  function addFloatingTokenBlock(token: string, input: Partial<TemplateBlock> = {}, zone?: WordTemplateZone) {
    let nextLayout = layout;
    if (zone) {
      nextLayout = upsertWordTemplateZone(layout, zone);
    }
    const dateField = dateFieldForToken(token);
    const field = token.startsWith("{{zone:")
      ? `document.template.${normalizeWordTemplateZoneKey(token.replace(/\{\{\s*zone:|\s*\}\}/g, ""))}`
      : token.startsWith("{{system:official_serial")
        ? "document.official_serial"
        : token.startsWith("{{system:page_number")
          ? "page.number"
          : dateField || input.field;
    const floatingType = token.startsWith("{{signature:") ? "signature_zone" : token.startsWith("{{system:page_number") ? "page_number" : input.type || "dynamic_field";
    const nextBlock = clampBlock({
      content: datePreviewValueForField(field) || tokenLabel(token),
      field,
      height: floatingType === "signature_zone" ? 54 : 12,
      id: input.id || newBlockId(floatingType),
      limit: floatingType === "signature_zone" ? 5 : input.limit,
      mode: token.includes("slots") ? "slots" : input.mode,
      style: defaultBlockStyle({
        borderColor: "#bfdbfe",
        borderStyle: "dashed",
        borderWidth: floatingType === "signature_zone" ? 0 : 1,
        fontWeight: token.includes("subject") ? "700" : "400",
        letterSpacing: dateField ? 0.04 : undefined,
        textAlign: floatingType === "signature_zone" ? "center" : "start",
        ...input.style
      }),
      type: floatingType,
      width: floatingType === "signature_zone" ? 138 : 64,
      x: snapMm(32 + (blocks.length % 4) * 8),
      y: snapMm(58 + (blocks.length % 7) * 8),
      ...input
    } as TemplateBlock);
    updateLayout({
      ...nextLayout,
      blocks: [...(nextLayout.blocks || []), nextBlock]
    });
    setSelectedBlockId(nextBlock.id);
    setActiveRibbonTab("table");
    showStatus(`${blockLabel(nextBlock)} inserted as a floating object.`);
  }

  function choosePlacement(input: PlacementDialog) {
    if (!canEdit || busy) {
      return;
    }
    setPlacementDialog(input);
  }

  function insertTokenWithPlacement(title: string, token: string, zone?: WordTemplateZone, floating?: Partial<TemplateBlock>) {
    const table = selectedFloatingTable();
    if (activeTableCellEditor && table) {
      activeTableCellEditor.chain().focus(undefined, { scrollIntoView: false }).insertContent(token).run();
      const rows = normalizeTableRows(table);
      const result = updateTableCell(rows, selectedTableCell, {
        content: "",
        richContent: activeTableCellEditor.getJSON() as TipTapNode
      });
      let nextLayout: TemplateLayout = {
        ...layout,
        blocks: blocks.map((block) => block.id === table.id ? { ...block, rows: serializeTableRows(result.rows) } : block)
      };
      if (zone) nextLayout = upsertWordTemplateZone(nextLayout, zone);
      updateLayout(nextLayout);
      showStatus(`${title.replace(/^Insert\s+/i, "")} added to the selected table cell.`);
      return;
    }
    choosePlacement({
      description: "Inline becomes flowing Word content. Floating can be dragged and resized anywhere on the A4 page.",
      onFloating: () => {
        setPlacementDialog(null);
        addFloatingTokenBlock(token, floating, zone);
      },
      onInline: () => {
        setPlacementDialog(null);
        insertTextToken(token, zone);
      },
      title
    });
  }

  function insertCustomZone() {
    const label = window.prompt("Custom field label");
    if (!label?.trim()) {
      return;
    }
    const key = normalizeWordTemplateZoneKey(label);
    if (!key) {
      setImageError("Use letters, numbers, dots, dashes, or underscores for custom fields.");
      return;
    }
    const zone: WordTemplateZone = {
      id: `zone-${key}`,
      key,
      label: label.trim(),
      kind: "custom",
      maxLength: 500,
      maxLines: 4,
      multiline: true,
      placeholder: label.trim()
    };
    insertTokenWithPlacement(`Insert ${label.trim()}`, zoneToken(key), zone, {
      content: label.trim(),
      field: `document.template.${key}`
    });
  }

  function insertHeaderFooter(kind: "header" | "footer") {
    if (!editor) {
      return;
    }
    choosePlacement({
      description: kind === "header" ? "Inline header flows with text. Floating header objects stay fixed at the top of the page." : "Inline footer flows with text. Floating footer objects stay fixed near the bottom of the page.",
      onFloating: () => {
        setPlacementDialog(null);
        if (kind === "header") {
          const nextBlocks = [
            clampBlock({ id: newBlockId("logo"), type: "logo", x: 18, y: 16, width: 22, height: 22, src: "", style: defaultBlockStyle({ borderColor: "#bfdbfe", borderStyle: "dashed", borderWidth: 1 }) }),
            clampBlock({ id: newBlockId("header-title"), type: "text", x: 54, y: 13, width: 102, height: 24, content: "امارت اسلامی افغانستان\nوزارت تحصیلات عالی\nریاست پوهنتون بلخ", style: defaultBlockStyle({ fontSize: 11, fontWeight: "700", textAlign: "center" }) }),
            clampBlock({ id: newBlockId("logo"), type: "logo", x: 170, y: 16, width: 22, height: 22, src: "", style: defaultBlockStyle({ borderColor: "#bfdbfe", borderStyle: "dashed", borderWidth: 1 }) })
          ];
          updateBlocks([...blocks, ...nextBlocks], nextBlocks[1].id);
          setActiveRibbonTab("inspector");
        } else {
          const nextBlocks = [
            clampBlock({ id: newBlockId("footer-line"), type: "line", x: 18, y: 268, width: 174, height: 1, style: defaultBlockStyle({ borderColor: "#0f172a", borderWidth: 1 }) }),
            clampBlock({ id: newBlockId("footer"), type: "text", x: 22, y: 272, width: 166, height: 10, content: "Address / Phone / Email", pageScope: "all", style: defaultBlockStyle({ fontSize: 8, textAlign: "center" }) }),
            clampBlock({ id: newBlockId("page-number"), type: "page_number", x: 95, y: 284, width: 20, height: 8, pageScope: "all", style: defaultBlockStyle({ fontSize: 8, textAlign: "center" }) })
          ];
          updateBlocks([...blocks, ...nextBlocks], nextBlocks[1].id);
          setActiveRibbonTab("inspector");
        }
      },
      onInline: () => {
        preserveDesignerScroll(() => {
          setPlacementDialog(null);
          if (kind === "header") {
            focusEditorChain()?.insertContent({
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: [
                    { type: "tableCell", content: [{ type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Logo" }] }] },
                    { type: "tableCell", content: [{ type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "امارت اسلامی افغانستان" }, { type: "hardBreak" }, { type: "text", text: "{{zone:header_unit}}" }] }] },
                    { type: "tableCell", content: [{ type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Logo" }] }] }
                  ]
                }
              ]
            }).run();
            updateLayout(upsertWordTemplateZone(
              withWordTemplateDocument(layout, editor.getJSON() as TipTapNode),
              zoneForKey("header_unit", "Header unit / position")
            ));
          } else {
            focusEditorChain()?.insertContent([
              { type: "horizontalRule" },
              { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Address / Phone / Email" }] },
              { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: systemToken("page_number") }] }
            ]).run();
          }
        });
      },
      title: kind === "header" ? "Insert header" : "Insert footer"
    });
  }

  async function uploadImage(file: File | null | undefined, mode: "choose" | "replace-inline" | "replace-floating" | "floating" = "choose", targetBlockId = selectedBlockId) {
    if (!file || !editor) {
      return;
    }
    if (!allowedImageTypes.includes(file.type)) {
      setImageError("Upload a PNG, JPG, WEBP, or SVG image.");
      return;
    }
    if (file.size > maxImageBytes) {
      setImageError("Template images must be 2MB or smaller.");
      return;
    }
    setImageError(null);
    try {
      const dataBase64 = await readFileAsDataBase64(file);
      const uploaded = await templateApi.uploadAsset({
        original_filename: file.name,
        mime_type: file.type,
        data_base64: dataBase64
      });
      if (mode === "replace-inline") {
        updateInlineImageAttrs({ alt: file.name, src: uploaded.data_url });
        return;
      }
      if (mode === "replace-floating") {
        const targetBlock = blocks.find((block) => block.id === targetBlockId);
        if (!selectedBlockIsImageLike(targetBlock)) {
          showStatus("Select a floating image or logo first.");
          return;
        }
        if (!canMutateBlock(targetBlock)) {
          showStatus(targetBlock.locked ? "Unlock this object before changing it." : "This template is read-only.");
          return;
        }
        updateBlock(targetBlock.id, (block) => ({
          ...block,
          assetId: undefined,
          assetName: file.name,
          src: uploaded.data_url,
          style: {
            ...block.style,
            borderWidth: 0
          }
        }));
        return;
      }
      if (mode === "floating") {
        addFloatingBlock({
          assetName: file.name,
          height: 30,
          src: uploaded.data_url,
          style: defaultBlockStyle({ borderWidth: 0 }),
          type: "image",
          width: 45
        });
        return;
      }
      choosePlacement({
        description: file.name,
        onFloating: () => {
          setPlacementDialog(null);
          addFloatingBlock({
            assetName: file.name,
            height: 30,
            src: uploaded.data_url,
            style: defaultBlockStyle({ borderWidth: 0 }),
            type: "image",
            width: 45
          });
        },
        onInline: () => {
          preserveDesignerScroll(() => {
            setPlacementDialog(null);
            setSelectedBlockId(null);
            focusEditorChain()?.setImage({ src: uploaded.data_url, alt: file.name, width: 220 }).run();
          });
        },
        title: "Insert image"
      });
    } catch (caught) {
      setImageError(caught instanceof Error ? caught.message : "Could not upload image.");
    }
  }

  function handleImageInput(event: ChangeEvent<HTMLInputElement>) {
    void uploadImage(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleReplaceImageInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (selectedBlockIsImageLike(selectedBlock)) {
      void uploadImage(file, "replace-floating", selectedBlock.id);
      event.target.value = "";
      return;
    }
    replaceSelectedInlineImage(file);
    event.target.value = "";
  }

  function openTablePicker() {
    if (disabled) return;
    setTextPlacementMode(false);
    setPlacementPointer(null);
    setTablePlacement(null);
    setTablePickerSize({ columns: 3, headerRow: true, rows: 3 });
    setTablePickerOpen(true);
  }

  function beginTablePlacement(size = tablePickerSize) {
    setTablePickerOpen(false);
    setTextPlacementMode(false);
    setPlacementPointer(null);
    setSelectedBlockId(null);
    setActiveTableCellEditor(null);
    setTablePlacement({ ...size, pointer: null });
    showStatus(`Move over the page and click to place a ${size.columns} × ${size.rows} table. Press Escape to cancel.`);
  }

  function tablePlacementBlock(state = tablePlacement): TemplateBlock | null {
    if (!state?.pointer) return null;
    const frame = tableInsertFrameAtPoint({
      columns: state.columns,
      pageHeightMm: a4HeightMm,
      pageWidthMm: a4WidthMm,
      rows: state.rows,
      x: snapMm(state.pointer.x),
      y: snapMm(state.pointer.y)
    });
    return clampBlock({
      columnWidths: equalTableTrackSizes(state.columns),
      headerRow: state.headerRow,
      height: frame.height,
      id: "table-placement-preview",
      rowHeights: equalTableTrackSizes(state.rows),
      rows: Array.from({ length: state.rows }, () => Array.from({ length: state.columns }, () => "")),
      style: defaultBlockStyle({
        backgroundColor: "#ffffff",
        borderColor: "#94a3b8",
        borderWidth: 1,
        cellPaddingMm: 1.2,
        headerBackgroundColor: "#f8fafc",
        textAlign: "start"
      }),
      type: "table",
      width: frame.width,
      x: frame.x,
      y: frame.y
    });
  }

  function updateTablePlacementPointer(clientX: number, clientY: number) {
    if (!tablePlacement) return;
    const pointer = clientPointToPageMm(clientX, clientY);
    if (pointer) setTablePlacement((current) => current ? { ...current, pointer } : null);
  }

  function placeTableAtPoint(event: PointerEvent<HTMLDivElement>) {
    if (!tablePlacement || event.button !== 0) return;
    const pointer = clientPointToPageMm(event.clientX, event.clientY);
    const preview = tablePlacementBlock({ ...tablePlacement, pointer });
    if (!preview) return;
    event.preventDefault();
    event.stopPropagation();
    const nextBlock = addFloatingBlock({ ...preview, id: newBlockId("table") });
    setTablePlacement(null);
    setSelectedTableCell({ col: 0, row: 0 });
    setEditingTableCell({ blockId: nextBlock.id, col: 0, row: 0 });
    setActiveRibbonTab("table");
    showStatus(`${tablePlacement.columns} × ${tablePlacement.rows} table inserted. Start typing in the selected cell.`);
    setSelectedBlockId(nextBlock.id);
  }

  function handleTablePickerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === "ArrowLeft" ? { columns: -1, rows: 0 }
      : event.key === "ArrowRight" ? { columns: 1, rows: 0 }
        : event.key === "ArrowUp" ? { columns: 0, rows: -1 }
          : event.key === "ArrowDown" ? { columns: 0, rows: 1 }
            : null;
    if (delta) {
      event.preventDefault();
      const next = {
        ...tablePickerSize,
        columns: clampNumber(tablePickerSize.columns + delta.columns, 1, tablePickerColumns),
        rows: clampNumber(tablePickerSize.rows + delta.rows, 1, tablePickerRows)
      };
      setTablePickerSize(next);
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-table-picker-cell="${next.columns}-${next.rows}"]`)?.focus({ preventScroll: true });
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      beginTablePlacement();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setTablePickerOpen(false);
    }
  }

  function tablePickerPosition(): CSSProperties {
    const rect = tablePickerAnchorRef.current?.getBoundingClientRect();
    const width = 348;
    return {
      left: rect ? clampNumber(rect.left, 8, Math.max(8, window.innerWidth - width - 8)) : 16,
      top: rect ? rect.bottom + 8 : 160,
      width
    };
  }

  function insertFloatingText() {
    const nextBlock = addFloatingBlock({
      content: "Text",
      height: 16,
      style: defaultBlockStyle({ borderColor: "#bfdbfe", borderStyle: "dashed", borderWidth: 1 }),
      type: "text",
      width: 60
    });
    setActiveTextEditBlockId(nextBlock.id);
  }

  function toggleTextPlacementMode() {
    if (!canEdit || busy || !editor) {
      return;
    }
    setTextPlacementMode((current) => {
      const next = !current;
      setTablePickerOpen(false);
      setTablePlacement(null);
      setPlacementPointer(null);
      setSelectedBlockId(null);
      setActiveTextEditBlockId(null);
      showEdgeWarning(null);
      showStatus(next ? "Click anywhere on the paper to place editable text." : "Text placement canceled.");
      return next;
    });
  }

  function updatePlacementPointer(clientX: number, clientY: number) {
    if (!textPlacementMode) {
      return;
    }
    const point = clientPointToPageMm(clientX, clientY);
    if (point) {
      setPlacementPointer(point);
    }
  }

  function placeFloatingTextAtPoint(event: PointerEvent<HTMLDivElement>) {
    if (!textPlacementMode || !canEdit || busy || event.button !== 0) {
      return;
    }
    const point = clientPointToPageMm(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextBlock = addFloatingBlock({
      content: "",
      height: 16,
      style: defaultBlockStyle({ borderColor: "#bfdbfe", borderStyle: "dashed", borderWidth: 1 }),
      type: "text",
      width: 60,
      x: point.x,
      y: point.y
    });
    setTextPlacementMode(false);
    setPlacementPointer(null);
    setActiveTextEditBlockId(nextBlock.id);
    showEdgeWarning(edgeWarningForBlock(nextBlock), true);
  }

  function insertFloatingShape(type: "box" | "line" | "qr") {
    if (type === "line") {
      addFloatingBlock({
        height: 1,
        style: defaultBlockStyle({ borderColor: "#0f172a", borderWidth: 1 }),
        type: "line",
        width: 80
      });
      return;
    }
    if (type === "qr") {
      addFloatingBlock({
        height: 24,
        style: defaultBlockStyle({ borderColor: "#475569", borderStyle: "dashed", borderWidth: 1, fontSize: 8, textAlign: "center" }),
        type: "qr",
        width: 24
      });
      return;
    }
    addFloatingBlock({
      height: 28,
      style: defaultBlockStyle({ backgroundColor: "transparent", borderColor: "#0f172a", borderWidth: 1 }),
      type: "box",
      width: 52
    });
  }

  function selectedFloatingTable() {
    return selectedBlock?.type === "table" && canMutateBlock(selectedBlock) ? selectedBlock : null;
  }

  function updateFloatingTableRows(
    run: (rows: ReturnType<typeof normalizeTableRows>) => TableEditResult,
    trackChange?: "delete-column" | "delete-row" | "insert-column" | "insert-row"
  ) {
    if (selectedBlock?.type === "table" && !canMutateBlock(selectedBlock)) {
      showStatus(selectedBlock.locked ? "Unlock this object before changing it." : "This template is read-only.");
      return false;
    }
    const table = selectedFloatingTable();
    if (!table) {
      return false;
    }
    const rows = normalizeTableRows(table);
    const result = run(rows);
    const nextRows = normalizeTableRows(result.rows);
    const oldColumnCount = rows[0]?.length || 1;
    const oldRowCount = rows.length;
    const patch: Partial<TemplateBlock> = { rows: serializeTableRows(nextRows) };
    if (trackChange === "insert-column" && (nextRows[0]?.length || 1) > oldColumnCount) {
      patch.columnWidths = insertTableTrackSize(table.columnWidths, oldColumnCount, result.selection.col);
    } else if (trackChange === "delete-column" && (nextRows[0]?.length || 1) < oldColumnCount) {
      patch.columnWidths = deleteTableTrackSize(table.columnWidths, oldColumnCount, selectedTableCell.col);
    } else if (trackChange === "insert-row" && nextRows.length > oldRowCount) {
      patch.rowHeights = insertTableTrackSize(table.rowHeights, oldRowCount, result.selection.row);
    } else if (trackChange === "delete-row" && nextRows.length < oldRowCount) {
      patch.rowHeights = deleteTableTrackSize(table.rowHeights, oldRowCount, selectedTableCell.row);
    }
    const nextSelection = clampTableSelection(nextRows, result.selection);
    setSelectedTableCell(nextSelection);
    setEditingTableCell({ ...nextSelection, blockId: table.id });
    setActiveTableCellEditor(null);
    updateBlock(table.id, patch);
    return result;
  }

  function updateFloatingTableCellRichContent(cell: CellCoordinate, document: TipTapNode) {
    const table = selectedFloatingTable();
    if (!table) return;
    const rows = normalizeTableRows(table);
    const result = updateTableCell(rows, cell, { content: "", richContent: document });
    updateBlock(table.id, { rows: serializeTableRows(result.rows) });
  }

  function navigateFloatingTableCell(direction: -1 | 1) {
    const table = selectedFloatingTable();
    if (!table) return;
    const rows = normalizeTableRows(table);
    const visible = rows.flatMap((row, rowIndex) => row.flatMap((cell, colIndex) => cell.hidden ? [] : [{ col: colIndex, row: rowIndex }]));
    const index = visible.findIndex((cell) => cell.row === selectedTableCell.row && cell.col === selectedTableCell.col);
    if (direction === 1 && index === visible.length - 1) {
      updateFloatingTableRows(
        (currentRows) => insertTableRow(currentRows, { row: currentRows.length - 1, col: 0 }, 1),
        "insert-row"
      );
      return;
    }
    const next = visible[clampNumber(index + direction, 0, Math.max(0, visible.length - 1))];
    if (next) {
      setActiveTableCellEditor(null);
      setSelectedTableCell(next);
      setEditingTableCell({ ...next, blockId: table.id });
    }
  }

  function runTableCommand(label: string, floatingCommand?: () => unknown) {
    if (selectedBlock?.type === "table" && !canMutateBlock(selectedBlock)) {
      showStatus(selectedBlock.locked ? "Unlock this object before changing it." : "This template is read-only.");
      return;
    }
    if (floatingCommand?.()) {
      return;
    }
    showStatus(`${label} needs a selected floating table.`);
  }

  function selectDocumentType(value: string) {
    const nextDocumentType = value === "all" ? null : documentTypes.find((documentType) => String(documentType.id) === value) || null;
    onSelectDocumentType(nextDocumentType?.id || null);
    updateLayout(withWordTemplateDocumentType(layout, nextDocumentType));
    if (!name.trim() || name === "Official Document Template" || name === defaultTemplateNameForWordDocumentType(selectedDocumentType)) {
      onNameChange(defaultTemplateNameForWordDocumentType(nextDocumentType));
    }
  }

  function startBlockDrag(event: PointerEvent<HTMLElement>, block: TemplateBlock, options: { force?: boolean } = {}) {
    setSelectedBlockId(block.id);
    setActiveRibbonTab(block.type === "table" ? "table" : "inspector");
    if (block.type === "table" && options.force) {
      setEditingTableCell(null);
      setActiveTableCellEditor(null);
    }
    if (canEdit && !block.locked && event.button === 0 && canEditFloatingTextDirectly(block) && !options.force) {
      setActiveTextEditBlockId(block.id);
      return;
    }
    setActiveTextEditBlockId(null);
    focusPageWithoutScroll();
    if (!canEdit || block.locked || event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!options.force && target?.closest("input, textarea, select, button, [data-resize-handle], [data-table-track-handle], [data-floating-table-preview='true'], [data-floating-text-editor='true']")) {
      return;
    }
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPointerCaptureSafe(event.currentTarget, event.pointerId);
    setResizeState(null);
    setTableTrackResizeState(null);
    setActiveGuideBlock(block);
    showEdgeWarning(null);
    activeBlockDraftRef.current = block;
    pendingBlockDraftRef.current = null;
    setDragState({
      blockId: block.id,
      pageHeightPx: rect.height,
      pageWidthPx: rect.width,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: block.x,
      startY: block.y
    });
  }

  function moveBlockDragFromPoint(clientX: number, clientY: number) {
    if (!dragState) {
      return;
    }
    const block = blocks.find((item) => item.id === dragState.blockId);
    if (!block) {
      return;
    }
    const deltaX = ((clientX - dragState.startClientX) / dragState.pageWidthPx) * a4WidthMm;
    const deltaY = ((clientY - dragState.startClientY) / dragState.pageHeightPx) * a4HeightMm;
    scheduleFloatingBlockDraft(clampBlock({
      ...block,
      x: roundMm(clampNumber(dragState.startX + deltaX, 0, Math.max(0, a4WidthMm - block.width))),
      y: roundMm(clampNumber(dragState.startY + deltaY, 0, Math.max(0, a4HeightMm - block.height)))
    }));
  }

  function moveBlockDrag(event: PointerEvent<HTMLElement>) {
    moveBlockDragFromPoint(event.clientX, event.clientY);
  }

  function stopBlockDrag(event: PointerEvent<HTMLElement>) {
    if (dragState) {
      releasePointerCaptureSafe(event.currentTarget, dragState.pointerId);
    }
    commitFloatingBlockDraft();
    setDragState(null);
    setActiveGuideBlock(null);
  }

  function startBlockResize(event: PointerEvent<HTMLSpanElement>, block: TemplateBlock, handle: ResizeHandle) {
    setSelectedBlockId(block.id);
    setActiveRibbonTab(block.type === "table" ? "table" : "inspector");
    if (block.type === "table") {
      setEditingTableCell(null);
      setActiveTableCellEditor(null);
    }
    if (!canEdit || block.locked || event.button !== 0) {
      return;
    }
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPointerCaptureSafe(event.currentTarget, event.pointerId);
    setDragState(null);
    setTableTrackResizeState(null);
    setActiveGuideBlock(block);
    setActiveTextEditBlockId(null);
    showEdgeWarning(null);
    activeBlockDraftRef.current = block;
    pendingBlockDraftRef.current = null;
    setResizeState({
      blockId: block.id,
      handle,
      pageHeightPx: rect.height,
      pageWidthPx: rect.width,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startHeight: block.height,
      startWidth: block.width,
      startX: block.x,
      startY: block.y
    });
  }

  function moveBlockResizeFromPoint(clientX: number, clientY: number) {
    if (!resizeState) {
      return;
    }
    const block = blocks.find((item) => item.id === resizeState.blockId);
    if (!block) {
      return;
    }
    const deltaX = ((clientX - resizeState.startClientX) / resizeState.pageWidthPx) * a4WidthMm;
    const deltaY = ((clientY - resizeState.startClientY) / resizeState.pageHeightPx) * a4HeightMm;
    const minWidth = block.type === "line" ? 4 : 6;
    const minHeight = block.type === "line" ? 0.5 : 4;
    let nextX = resizeState.startX;
    let nextY = resizeState.startY;
    let nextWidth = resizeState.startWidth;
    let nextHeight = resizeState.startHeight;

    if (resizeState.handle.includes("e")) {
      nextWidth = clampNumber(resizeState.startWidth + deltaX, minWidth, a4WidthMm - resizeState.startX);
    }
    if (resizeState.handle.includes("s")) {
      nextHeight = clampNumber(resizeState.startHeight + deltaY, minHeight, a4HeightMm - resizeState.startY);
    }
    if (resizeState.handle.includes("w")) {
      const right = resizeState.startX + resizeState.startWidth;
      nextX = clampNumber(resizeState.startX + deltaX, 0, right - minWidth);
      nextWidth = right - nextX;
    }
    if (resizeState.handle.includes("n")) {
      const bottom = resizeState.startY + resizeState.startHeight;
      nextY = clampNumber(resizeState.startY + deltaY, 0, bottom - minHeight);
      nextHeight = bottom - nextY;
    }

    scheduleFloatingBlockDraft(clampBlock({
      ...block,
      height: roundMm(nextHeight),
      width: roundMm(nextWidth),
      x: roundMm(nextX),
      y: roundMm(nextY)
    }));
  }

  function moveBlockResize(event: PointerEvent<HTMLElement>) {
    moveBlockResizeFromPoint(event.clientX, event.clientY);
  }

  function stopBlockResize(event: PointerEvent<HTMLSpanElement>) {
    if (resizeState) {
      releasePointerCaptureSafe(event.currentTarget, resizeState.pointerId);
    }
    commitFloatingBlockDraft();
    setResizeState(null);
    setActiveGuideBlock(null);
  }

  function startFloatingTableTrackResize(event: PointerEvent<HTMLSpanElement>, block: TemplateBlock, axis: TableTrackAxis, boundaryIndex: number) {
    if (!canEdit || block.locked || block.type !== "table") {
      return;
    }
    const tableRect = (event.currentTarget.closest("[data-floating-table-preview='true']") as HTMLElement | null)?.getBoundingClientRect();
    if (!tableRect) {
      return;
    }
    const rows = normalizeTableRows(block);
    event.preventDefault();
    event.stopPropagation();
    setPointerCaptureSafe(event.currentTarget, event.pointerId);
    setDragState(null);
    setResizeState(null);
    setSelectedBlockId(block.id);
    setActiveRibbonTab("table");
    setEditingTableCell(null);
    setActiveTableCellEditor(null);
    setTableTrackResizeState({
      axis,
      blockId: block.id,
      boundaryIndex,
      pointerId: event.pointerId,
      source: "floating",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startColumnWidths: normalizeTableTrackSizes(block.columnWidths, rows[0]?.length || 1),
      startRowHeights: normalizeTableTrackSizes(block.rowHeights, rows.length),
      tableHeightPx: Math.max(1, tableRect.height),
      tableWidthPx: Math.max(1, tableRect.width)
    });
  }

  function moveTableTrackResizeFromPoint(clientX: number, clientY: number) {
    const state = tableTrackResizeState;
    if (!state) {
      return;
    }
    const delta = state.axis === "column" ? clientX - state.startClientX : clientY - state.startClientY;
    const block = blocks.find((item) => item.id === state.blockId);
    if (!block) {
      return;
    }
    if (state.axis === "column") {
      updateBlock(block.id, {
        columnWidths: resizeVisualPercentTracks(state.startColumnWidths, state.startColumnWidths.length, state.boundaryIndex, delta, state.tableWidthPx, tableDirectionValue(layout.page.direction), minFloatingTableTrackPx)
      });
    } else {
      updateBlock(block.id, {
        rowHeights: resizeVisualPercentTracks(state.startRowHeights, state.startRowHeights.length, state.boundaryIndex, delta, state.tableHeightPx, "ltr", minFloatingTableTrackPx)
      });
    }
  }

  function moveTableTrackResize(event: PointerEvent<HTMLElement>) {
    moveTableTrackResizeFromPoint(event.clientX, event.clientY);
  }

  function stopTableTrackResize(event: PointerEvent<HTMLSpanElement>) {
    if (tableTrackResizeState) {
      releasePointerCaptureSafe(event.currentTarget, tableTrackResizeState.pointerId);
    }
    setTableTrackResizeState(null);
  }

  function duplicateSelectedBlock() {
    const block = editableSelectedBlock();
    if (!block) {
      return;
    }
    const clone = clampBlock({
      ...block,
      id: newBlockId(block.type),
      locked: false,
      x: snapMm(block.x + defaultGridSizeMm),
      y: snapMm(block.y + defaultGridSizeMm)
    });
    updateBlocks([...blocks, clone], clone.id);
  }

  function deleteSelectedBlock() {
    const block = editableSelectedBlock();
    if (!block) {
      return;
    }
    updateBlocks(blocks.filter((item) => item.id !== block.id), null);
  }

  function reorderSelectedBlock(direction: "back" | "front") {
    const block = editableSelectedBlock();
    if (!block) {
      return;
    }
    const remaining = blocks.filter((item) => item.id !== block.id);
    updateBlocks(direction === "front" ? [...remaining, block] : [block, ...remaining], block.id);
  }

  function handleDesignerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (!selectedBlock || target?.closest("input, textarea, select, [contenteditable='true']")) {
      return;
    }
    const step = event.shiftKey ? defaultGridSizeMm : 1;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelectedBlock();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelectedBlock();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "]") {
      event.preventDefault();
      reorderSelectedBlock("front");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "[") {
      event.preventDefault();
      reorderSelectedBlock("back");
      return;
    }
    const delta = event.key === "ArrowLeft" ? { x: -step, y: 0 }
      : event.key === "ArrowRight" ? { x: step, y: 0 }
        : event.key === "ArrowUp" ? { x: 0, y: -step }
          : event.key === "ArrowDown" ? { x: 0, y: step }
            : null;
    if (delta) {
      event.preventDefault();
      const block = editableSelectedBlock();
      if (!block) {
        return;
      }
      updateBlock(block.id, clampBlock({
        ...block,
        x: block.x + delta.x,
        y: block.y + delta.y
      }));
    }
  }

  const disabled = busy || !canEdit || !editor;
  const selectedBlockMutationDisabled = disabled || Boolean(selectedBlock?.locked);
  const tableCommandDisabled = disabled || selectedBlock?.type !== "table" || Boolean(selectedBlock.locked);
  const tableTextDisabled = tableCommandDisabled || !activeTableCellEditor;
  const typographyControlDisabled = selectedBlockMutationDisabled || Boolean(selectedBlock && ["box", "image", "line", "logo", "qr"].includes(selectedBlock.type)) || Boolean(selectedBlock?.type === "table" && !activeTableCellEditor);
  const inlineImageAttrs = selectedInlineImageAttrs();
  const selectedStyle = selectedBlock ? blockStyleValue(selectedBlock) : null;
  const activeBold = activeTableCellEditor ? activeTableCellEditor.isActive("bold") : selectedBlock ? selectedStyle?.fontWeight === "700" : Boolean(editor?.isActive("bold"));
  const activeItalic = activeTableCellEditor ? activeTableCellEditor.isActive("italic") : selectedBlock ? selectedStyle?.fontStyle === "italic" : Boolean(editor?.isActive("italic"));
  const activeUnderline = activeTableCellEditor ? activeTableCellEditor.isActive("underline") : selectedBlock ? selectedStyle?.textDecoration === "underline" : Boolean(editor?.isActive("underline"));
  const activeAlign = activeTableCellEditor
    ? activeTableCellEditor.isActive({ textAlign: "center" }) ? "center"
      : activeTableCellEditor.isActive({ textAlign: "left" }) ? "left"
        : activeTableCellEditor.isActive({ textAlign: "right" }) ? "right"
          : activeTableCellEditor.isActive({ textAlign: "justify" }) ? "justify"
            : "start"
    : selectedBlock
    ? selectedStyle?.textAlign || "start"
    : editor?.isActive({ textAlign: "center" }) ? "center"
      : editor?.isActive({ textAlign: "left" }) ? "left"
        : editor?.isActive({ textAlign: "right" }) ? "right"
          : editor?.isActive({ textAlign: "justify" }) ? "justify"
            : "start";
  const pageFrameStyle = {
    minHeight: `${297 * pageZoom}mm`,
    minWidth: `${210 * pageZoom}mm`,
    width: `${210 * pageZoom}mm`
  };
  const pageStyle = {
    backgroundColor: layout.page.backgroundColor || "#ffffff",
    backgroundImage: showGrid ? "linear-gradient(rgba(6,29,73,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(6,29,73,.08) 1px, transparent 1px)" : undefined,
    backgroundSize: showGrid ? `${(defaultGridSizeMm / a4WidthMm) * 100}% ${(defaultGridSizeMm / a4HeightMm) * 100}%` : undefined,
    transform: `scale(${pageZoom})`
  };

  function updateZoom(delta: number) {
    setPageZoom((current) => Math.max(0.65, Math.min(1.25, Number((current + delta).toFixed(2)))));
  }

  function renderFloatingBlockContent(block: TemplateBlock) {
    if (canEditFloatingTextDirectly(block) && selectedBlockId === block.id && canEdit && !block.locked) {
      return (
        <textarea
          className="h-full min-h-full w-full resize-none border-0 bg-transparent p-0 text-inherit outline-none placeholder:text-blue-300"
          data-floating-text-editor="true"
          dir="auto"
          onChange={(event) => updateBlock(block.id, { content: event.target.value })}
          onClick={(event) => event.stopPropagation()}
          onFocus={() => {
            setActiveTextEditBlockId(block.id);
            setSelectedBlockId(block.id);
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          placeholder="Write here..."
          ref={(node) => {
            if (node) {
              floatingTextEditorRefs.current.set(block.id, node);
            } else {
              floatingTextEditorRefs.current.delete(block.id);
            }
          }}
          style={{
            fontFamily: "inherit",
            fontSize: "inherit",
            fontStyle: "inherit",
            fontWeight: "inherit",
            lineHeight: "inherit",
            textAlign: "inherit",
            textDecoration: "inherit"
          }}
          value={block.content || ""}
        />
      );
    }
    if (["image", "logo"].includes(block.type)) {
      const src = blockImageSource(block);
      return src ? <img alt="" className="h-full w-full object-contain" src={src} /> : (
        <span className="flex h-full w-full items-center justify-center border border-dashed border-blue-200 bg-blue-50/70 text-[8pt] font-black text-blue-700">
          Choose image
        </span>
      );
    }
    if (block.type === "table") {
      return (
        <FloatingTablePreview
          block={block}
          canEdit={canEdit && !block.locked}
          editingCell={editingTableCell?.blockId === block.id ? editingTableCell : undefined}
          onCellChange={updateFloatingTableCellRichContent}
          onCellEditorReady={setActiveTableCellEditor}
          onExitCell={() => {
            setActiveTableCellEditor(null);
            setEditingTableCell(null);
            focusPageWithoutScroll();
          }}
          onMoveTrackResize={moveTableTrackResize}
          onNavigateCell={navigateFloatingTableCell}
          onSelectCell={(cell) => {
            setSelectedBlockId(block.id);
            setActiveRibbonTab("table");
            setSelectedTableCell(cell);
            setEditingTableCell({ ...cell, blockId: block.id });
          }}
          onStartTrackResize={(event, axis, boundaryIndex) => startFloatingTableTrackResize(event, block, axis, boundaryIndex)}
          onStopTrackResize={stopTableTrackResize}
          pageDirection={layout.page.direction}
          selectedCell={selectedBlockId === block.id ? selectedTableCell : undefined}
          selectedTable={selectedBlockId === block.id}
        />
      );
    }
    if (block.type === "line" || block.type === "box") {
      return null;
    }
    if (block.type === "qr") {
      return <span className="flex h-full w-full items-center justify-center text-center text-[8pt] font-black leading-tight text-slate-600">VERIFY<br />QR</span>;
    }
    if (block.type === "signature_zone") {
      const count = 1
      return (
        <div className="h-full w-full text-center text-[8pt] font-bold text-slate-600">
          <span>Approval {count}</span>
        </div>
      );
    }
    if (block.type === "page_number") {
      return "1";
    }
    if (block.type === "dynamic_field") {
      return datePreviewValueForField(block.field) || block.content || block.field?.replace("document.template.", "") || "Dynamic field";
    }
    return block.content || block.type.replaceAll("_", " ");
  }

  function placementPreviewBlock(): TemplateBlock | null {
    if (!textPlacementMode || !placementPointer) {
      return null;
    }
    return clampBlock({
      content: "",
      height: 16,
      id: "placement-preview-text",
      style: defaultBlockStyle({ borderColor: "#bfdbfe", borderStyle: "dashed", borderWidth: 1 }),
      type: "text",
      width: 60,
      x: placementPointer.x,
      y: placementPointer.y
    });
  }

  function activeSmartGuideBlock() {
    return activeGuideBlock || tablePlacementBlock() || placementPreviewBlock();
  }

  function pushGuideLine(lines: SmartGuideLine[], line: SmartGuideLine) {
    if (lines.some((item) => Math.abs(item.position - line.position) < 0.2 && item.tone === line.tone)) {
      return;
    }
    lines.push({ ...line, position: roundMm(line.position) });
  }

  function blockGuidePoints(block: TemplateBlock) {
    return {
      x: [
        { label: "left", position: block.x },
        { label: "center", position: block.x + block.width / 2 },
        { label: "right", position: block.x + block.width }
      ],
      y: [
        { label: "top", position: block.y },
        { label: "middle", position: block.y + block.height / 2 },
        { label: "bottom", position: block.y + block.height }
      ]
    };
  }

  function nearestGuideLine(
    activePoints: Array<{ label: string; position: number }>,
    candidates: SmartGuideLine[]
  ): SmartGuideLine | null {
    let nearestDistance = Number.POSITIVE_INFINITY;
    let nearestLine: SmartGuideLine | null = null;
    activePoints.forEach((activePoint) => {
      candidates.forEach((candidate) => {
        const distance = Math.abs(activePoint.position - candidate.position);
        if (distance > smartGuideMatchThresholdMm) {
          return;
        }
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestLine = {
            ...candidate,
            label: `${activePoint.label} -> ${candidate.label}`
          };
        }
      });
    });
    return nearestLine;
  }

  function smartGuideLinesForBlock(block: TemplateBlock | null) {
    const xLines: SmartGuideLine[] = [];
    const yLines: SmartGuideLine[] = [];
    if (!block) {
      return { xLines, yLines };
    }

    const activePoints = blockGuidePoints(block);
    const xCandidates: SmartGuideLine[] = [
      { label: "paper edge", position: 0, tone: "paper" },
      { label: "left margin", position: pageMarginMm("left"), tone: "margin" },
      { label: "page center", position: a4WidthMm / 2, tone: "center" },
      { label: "right margin", position: a4WidthMm - pageMarginMm("right"), tone: "margin" },
      { label: "paper edge", position: a4WidthMm, tone: "paper" }
    ];
    const yCandidates: SmartGuideLine[] = [
      { label: "paper edge", position: 0, tone: "paper" },
      { label: "top margin", position: pageMarginMm("top"), tone: "margin" },
      { label: "page middle", position: a4HeightMm / 2, tone: "center" },
      { label: "bottom margin", position: a4HeightMm - pageMarginMm("bottom"), tone: "margin" },
      { label: "paper edge", position: a4HeightMm, tone: "paper" }
    ];

    blocks
      .filter((item) => !item.hidden && item.id !== block.id)
      .forEach((item) => {
        const otherPoints = blockGuidePoints(item);
        otherPoints.x.forEach((point) => xCandidates.push({ label: `${blockLabel(item)} ${point.label}`, position: point.position, tone: "match" }));
        otherPoints.y.forEach((point) => yCandidates.push({ label: `${blockLabel(item)} ${point.label}`, position: point.position, tone: "match" }));
      });

    pushGuideLine(xLines, nearestGuideLine(activePoints.x, xCandidates) || { label: "center", position: activePoints.x[1].position, tone: "active" });
    pushGuideLine(yLines, nearestGuideLine(activePoints.y, yCandidates) || { label: "middle", position: activePoints.y[1].position, tone: "active" });

    return { xLines, yLines };
  }

  function guideLineClass(tone: SmartGuideLine["tone"], axis: "x" | "y") {
    return cx(
      "absolute z-40",
      axis === "x" ? "top-0 h-full w-px" : "left-0 h-px w-full",
      tone === "active" && "bg-blue-500/35",
      tone === "center" && "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.35)]",
      tone === "margin" && "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.35)]",
      tone === "match" && "bg-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,0.35)]",
      tone === "paper" && "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.35)]"
    );
  }

  function renderSmartRulers() {
    const guideBlock = activeSmartGuideBlock();
    const showRulers = textPlacementMode || Boolean(guideBlock);
    if (!showRulers) {
      return null;
    }

    const { xLines, yLines } = smartGuideLinesForBlock(guideBlock);
    const xTicks = [0, 30, 60, 90, 120, 150, 180, 210];
    const yTicks = [0, 42, 84, 126, 168, 210, 252, 297];
    const liveWarning = edgeWarningForBlock(guideBlock);
    const badgeLeft = guideBlock ? clampNumber(guideBlock.x + guideBlock.width + 2, 2, a4WidthMm - 44) : 8;
    const badgeTop = guideBlock ? clampNumber(guideBlock.y, 8, a4HeightMm - 18) : 8;

    return (
      <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
        <div className="absolute left-0 top-0 z-50 h-[5mm] w-full border-b border-blue-200/60 bg-white/70 text-[6px] font-black text-slate-500 shadow-sm backdrop-blur">
          {xTicks.map((tick) => (
            <span className="absolute top-0 flex h-full -translate-x-1/2 items-end border-l border-slate-300/50 pb-0.5 pl-0.5" key={`x-tick-${tick}`} style={{ left: `${tick}mm` }}>
              {tick}
            </span>
          ))}
        </div>
        <div className="absolute left-0 top-0 z-50 h-full w-[6mm] border-r border-blue-200/60 bg-white/70 text-[6px] font-black text-slate-500 shadow-sm backdrop-blur">
          {yTicks.map((tick) => (
            <span className="absolute left-0 flex w-full -translate-y-1/2 items-start border-t border-slate-300/50 pl-0.5 pt-0.5" key={`y-tick-${tick}`} style={{ top: `${tick}mm` }}>
              {tick}
            </span>
          ))}
        </div>

        {xLines.map((line) => (
          <span className={guideLineClass(line.tone, "x")} key={`x-${line.tone}-${line.position}`} style={{ left: `${line.position}mm` }}>
            {line.tone !== "active" ? (
              <span className="absolute top-[5.5mm] -translate-x-1/2 whitespace-nowrap rounded bg-slate-950/90 px-1.5 py-0.5 text-[7px] font-black text-white shadow-lg">
                {line.label} {line.position}mm
              </span>
            ) : null}
          </span>
        ))}
        {yLines.map((line) => (
          <span className={guideLineClass(line.tone, "y")} key={`y-${line.tone}-${line.position}`} style={{ top: `${line.position}mm` }}>
            {line.tone !== "active" ? (
              <span className="absolute left-[6.5mm] -translate-y-1/2 whitespace-nowrap rounded bg-slate-950/90 px-1.5 py-0.5 text-[7px] font-black text-white shadow-lg">
                {line.label} {line.position}mm
              </span>
            ) : null}
          </span>
        ))}

        {textPlacementMode && placementPointer ? (
          <span
            className="absolute z-50 rounded border border-dashed border-blue-500 bg-blue-100/30 shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
            style={{ height: "16mm", left: `${guideBlock?.x ?? placementPointer.x}mm`, top: `${guideBlock?.y ?? placementPointer.y}mm`, width: "60mm" }}
          />
        ) : null}

        {guideBlock ? (
          <span
            className="absolute z-50 max-w-[42mm] rounded-md bg-[#061d49] px-2 py-1 text-[8px] font-black leading-tight text-white shadow-xl"
            style={{ left: `${badgeLeft}mm`, top: `${badgeTop}mm` }}
          >
            X {guideBlock.x} / Y {guideBlock.y}<br />
            W {guideBlock.width} / H {guideBlock.height}
          </span>
        ) : textPlacementMode ? (
          <span className="absolute left-[10mm] top-[10mm] z-50 rounded-md bg-[#061d49] px-2 py-1 text-[8px] font-black text-white shadow-xl">
            Click to place text
          </span>
        ) : null}

        {liveWarning ? (
          <span
            className={cx(
              "absolute right-[8mm] top-[8mm] z-50 max-w-[72mm] rounded-md px-2 py-1.5 text-[8px] font-black leading-tight shadow-xl",
              liveWarning.tone === "red" ? "bg-red-600 text-white" : "bg-amber-300 text-amber-950"
            )}
          >
            {liveWarning.message}
          </span>
        ) : null}
      </div>
    );
  }

  function renderInspectorPanel() {
    return (
      <>
        <RibbonGroup label="Document">
          <div className="grid max-w-48 gap-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-xs font-black text-slate-950">{selectedDocumentType?.name || "All document types"}</span>
              <StatusBadge tone={selectedDocumentType?.status === "active" ? "green" : "slate"}>{selectedDocumentType?.status || "all"}</StatusBadge>
            </div>
            <span className="force-ltr truncate text-start text-[11px] font-semibold text-slate-500">{selectedDocumentType?.code || "global"}</span>
          </div>
        </RibbonGroup>

        <RibbonGroup label="Page">
          <div className="grid grid-cols-2 gap-1 text-[11px] font-bold text-slate-600">
            <span className="rounded bg-slate-50 px-2 py-1.5">RTL</span>
            <span className="rounded bg-slate-50 px-2 py-1.5">18mm</span>
            <span className="rounded bg-slate-50 px-2 py-1.5">{Math.round(pageZoom * 100)}%</span>
            <span className="rounded bg-slate-50 px-2 py-1.5">{blocks.length} obj</span>
          </div>
          <div className="flex items-center gap-1">
            <RibbonButton active={snapEnabled} icon={<Grid3X3 className="h-8 w-6" />} label="Snap 5mm" onClick={() => setSnapEnabled((current) => !current)}>Snap</RibbonButton>
            <RibbonButton active={showGrid} icon={<Grid3X3 className="h-8 w-6" />} label="Grid" onClick={() => setShowGrid((current) => !current)}>Grid</RibbonButton>
          </div>
        </RibbonGroup>

        <RibbonGroup label="Floating Object">
          {selectedBlock ? (
            <div className="flex min-w-max items-center gap-2">
              <div className="grid w-40 grid-cols-4 gap-1">
                {(["x", "y", "width", "height"] as const).map((key) => (
                  <label className="text-[9px] font-black uppercase text-slate-500" key={key}>
                    {key === "width" ? "w" : key === "height" ? "h" : key}
                    <input
                      className="mt-0.5 h-7 w-full rounded-md border border-slate-200 px-1 text-xs font-bold text-slate-700"
                      disabled={!canEdit || selectedBlock.locked}
                      onChange={(event) => updateBlock(selectedBlock.id, clampBlock({ ...selectedBlock, [key]: Number(event.target.value) }))}
                      type="number"
                      value={selectedBlock[key]}
                    />
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <RibbonButton disabled={selectedBlockMutationDisabled} icon={<Copy className="h-8 w-6" />} label="Duplicate" onClick={duplicateSelectedBlock} />
                <RibbonButton disabled={!canEdit} icon={selectedBlock.locked ? <Unlock className="h-8 w-6" /> : <Lock className="h-8 w-6" />} label={selectedBlock.locked ? "Unlock" : "Lock"} onClick={() => updateBlock(selectedBlock.id, { locked: !selectedBlock.locked })} />
                <RibbonButton disabled={selectedBlockMutationDisabled} icon={<Trash2 className="h-8 w-6" />} label="Delete" onClick={deleteSelectedBlock} />
                <RibbonButton disabled={selectedBlockMutationDisabled} icon={<BringToFront className="h-8 w-6" />} label="Bring to front" onClick={() => reorderSelectedBlock("front")} />
                <RibbonButton disabled={selectedBlockMutationDisabled} icon={<SendToBack className="h-8 w-6" />} label="Send to back" onClick={() => reorderSelectedBlock("back")} />
                {selectedBlockIsImageLike(selectedBlock) ? (
                  <>
                    <RibbonButton disabled={selectedBlockMutationDisabled} icon={<ImagePlus className="h-8 w-6" />} label="Replace image" onClick={replaceSelectedFloatingImage}>Replace</RibbonButton>
                    <RibbonButton disabled={selectedBlockMutationDisabled || (!selectedBlock.src && !selectedBlock.assetId)} icon={<RotateCcw className="h-8 w-6" />} label="Clear image" onClick={clearSelectedFloatingImage}>Clear</RibbonButton>
                  </>
                ) : null}
                <RibbonButton icon={<Box className="h-8 w-6" />} label="Clear selection" onClick={() => setSelectedBlockId(null)} />
              </div>
              {selectedBlock.type === "table" ? <span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700 ring-1 ring-blue-100">R{selectedTableCell.row + 1} C{selectedTableCell.col + 1}</span> : null}
            </div>
          ) : (
            <span className="rounded-md bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">No object selected</span>
          )}
        </RibbonGroup>

        <RibbonGroup label="Editable Zones">
          <div className="flex max-w-72 flex-wrap items-center gap-1">
            <span className="rounded-full bg-[#061d49]/10 px-2 py-1 text-xs font-black text-[#061d49]">{zones.length}</span>
            {zones.length ? zones.slice(0, 4).map((zone) => (
              <span className="max-w-28 truncate rounded bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200" key={zone.id} title={zone.label}>
                {zone.label}
              </span>
            )) : (
              <span className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">No zones</span>
            )}
            {zones.length > 4 ? <span className="text-[11px] font-black text-slate-500">+{zones.length - 4}</span> : null}
          </div>
        </RibbonGroup>
      </>
    );
  }

  return (
    <div className="template-designer-shell min-h-[calc(100vh-1rem)] w-full overflow-hidden bg-[#eef2f7]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#f8fafc] shadow-[0_2px_10px_rgba(15,23,42,0.08)]">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 bg-white px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-[#061d49] shadow-sm transition hover:bg-slate-50"
              onClick={onBackToLibrary}
              title="Library"
              type="button"
            >
              <LayoutTemplate className="h-8 w-6" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  className="h-9 min-w-0 max-w-[34rem] flex-1 rounded-md border border-transparent bg-transparent px-2 text-base font-black text-slate-950 outline-none transition focus:border-slate-200 focus:bg-white focus:shadow-sm"
                  disabled={!canEdit}
                  maxLength={180}
                  onChange={(event) => onNameChange(event.target.value)}
                  value={name}
                />
                <StatusBadge>{detail?.template.status || "draft"}</StatusBadge>
              </div>
              <input
                className="h-7 w-full max-w-3xl rounded-md border border-transparent bg-transparent px-2 text-sm text-slate-600 outline-none transition focus:border-slate-200 focus:bg-white"
                disabled={!canEdit}
                maxLength={500}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="Description"
                value={description}
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <SelectFilter className="h-9 w-56 rounded-md text-sm" disabled={busy || !canEdit} onChange={(event) => selectDocumentType(event.target.value)} value={selectedDocumentTypeId ? String(selectedDocumentTypeId) : "all"}>
              <option value="all">All document types</option>
              {activeDocumentTypes.map((documentType) => <option key={documentType.id} value={documentType.id}>{documentType.name}</option>)}
            </SelectFilter>
            <Button className="min-h-9 px-3 py-1.5 text-sm" disabled={busy} onClick={onBackToLibrary}>Library</Button>
            <Button className="min-h-9 px-3 py-1.5 text-sm" disabled={busy || !canEdit} icon="save" onClick={onSave} variant="secondary">{busy ? "Saving..." : "Save"}</Button>
            <Button className="min-h-9 px-3 py-1.5 text-sm" disabled={busy || !name.trim()} icon="view" onClick={onOpenPublish} variant="primary">Preview & Publish</Button>
          </div>
        </div>

        <div className="border-t border-slate-100 px-4 pt-1">
          <div className="flex min-w-0 items-end justify-between gap-3">
            <nav className="flex min-w-0 flex-wrap items-end gap-1">
              {ribbonTabs.map((tab) => (
                <RibbonTabButton active={activeRibbonTab === tab.id} key={tab.id} label={tab.label} onClick={() => setActiveRibbonTab(tab.id)} />
              ))}
            </nav>
            <div className="mb-1 hidden items-center gap-1 lg:flex">
              <RibbonButton disabled={disabled || !editor?.can().undo()} icon={<Undo2 className="h-8 w-6" />} label="Undo" onClick={() => preserveDesignerScroll(() => focusEditorChain()?.undo().run())} />
              <RibbonButton disabled={disabled || !editor?.can().redo()} icon={<Redo2 className="h-8 w-6" />} label="Redo" onClick={() => preserveDesignerScroll(() => focusEditorChain()?.redo().run())} />
              <span className="mx-1 h-6 w-px bg-slate-200" />
              <RibbonButton disabled={pageZoom <= 0.65} icon={<Minus className="h-8 w-6" />} label="Zoom out" onClick={() => updateZoom(-0.1)} />
              <button className="h-8 min-w-14 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-700" onClick={() => setPageZoom(0.9)} type="button">
                {Math.round(pageZoom * 100)}%
              </button>
              <RibbonButton disabled={pageZoom >= 1.25} icon={<Plus className="h-8 w-6" />} label="Zoom in" onClick={() => updateZoom(0.1)} />
            </div>
          </div>
        </div>

        <div className="px-4 pb-2">
          <div className={cx(
            "flex min-h-[5.25rem] min-w-0 items-stretch overflow-hidden rounded-md border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]",
            activeRibbonTab === "inspector" ? "overflow-x-auto" : "flex-wrap"
          )}>
            {activeRibbonTab === "home" ? (
              <>
                <RibbonGroup label="Font">
                  <SelectControl disabled={disabled || Boolean(selectedBlock)} icon={<Type className="h-8 w-6" />} label="Style" onChange={(value) => {
                    if (value === "paragraph") focusEditorChain()?.setParagraph().run();
                    if (value === "h1") focusEditorChain()?.toggleHeading({ level: 1 }).run();
                    if (value === "h2") focusEditorChain()?.toggleHeading({ level: 2 }).run();
                  }} value={editor?.isActive("heading", { level: 1 }) ? "h1" : editor?.isActive("heading", { level: 2 }) ? "h2" : "paragraph"} widthClassName="w-32">
                    <option value="paragraph">Normal</option>
                    <option value="h1">Heading 1</option>
                    <option value="h2">Heading 2</option>
                  </SelectControl>
                  <SelectControl disabled={typographyControlDisabled} icon={<Baseline className="h-8 w-6" />} label="Font" onChange={applyFontFamily} value={fontFamily} widthClassName="w-56">
                    {fontFamilyOptions.map((option) => (
                      <option key={option.value} style={{ fontFamily: option.value }} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectControl>
                  <SelectControl disabled={typographyControlDisabled} icon={<Type className="h-8 w-6" />} label="Font size" onChange={applyFontSize} value={fontSize} widthClassName="w-28">
                    {fontSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                  </SelectControl>
                  <RibbonButton active={activeBold} disabled={typographyControlDisabled} icon={<Bold className="h-8 w-6" />} label="Bold" onClick={toggleBold} />
                  <RibbonButton active={activeItalic} disabled={typographyControlDisabled} icon={<Italic className="h-8 w-6" />} label="Italic" onClick={toggleItalic} />
                  <RibbonButton active={activeUnderline} disabled={typographyControlDisabled} icon={<Underline className="h-8 w-6" />} label="Underline" onClick={toggleUnderline} />
                  <ColorControl disabled={typographyControlDisabled} icon={<Baseline className="h-8 w-6" />} label="Text color" onChange={applyColor} value={textColor} />
                  <ColorControl disabled={typographyControlDisabled} icon={<Highlighter className="h-8 w-6" />} label="Highlight" onChange={applyHighlight} value={highlightColor} />
                </RibbonGroup>
                <RibbonGroup label="Paragraph">
                  <RibbonButton active={activeAlign === "left"} disabled={selectedBlockMutationDisabled} icon={<AlignLeft className="h-8 w-6" />} label="Align left" onClick={() => applyAlignment("left")} />
                  <RibbonButton active={activeAlign === "center"} disabled={selectedBlockMutationDisabled} icon={<AlignCenter className="h-8 w-6" />} label="Align center" onClick={() => applyAlignment("center")} />
                  <RibbonButton active={activeAlign === "right" || activeAlign === "start"} disabled={selectedBlockMutationDisabled} icon={<AlignRight className="h-8 w-6" />} label="Align right" onClick={() => applyAlignment("right")} />
                  <RibbonButton active={activeAlign === "justify"} disabled={disabled || Boolean(selectedBlock)} icon={<AlignJustify className="h-8 w-6" />} label="Justify" onClick={() => applyAlignment("justify")} />
                  <div className="flex items-center gap-1">
                    <RibbonButton disabled={typographyControlDisabled || lineHeightNumber(lineHeight) <= 1} icon={<Minus className="h-8 w-6" />} label="Decrease line spacing" onClick={() => stepLineHeight(-0.1)} />
                    <SelectControl disabled={typographyControlDisabled} icon={<Rows2 className="h-8 w-6" />} label="Line spacing" onChange={applyLineHeight} value={lineHeight} widthClassName="w-28">
                      {lineHeightOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </SelectControl>
                    <RibbonButton disabled={typographyControlDisabled || lineHeightNumber(lineHeight) >= 3} icon={<Plus className="h-8 w-6" />} label="Increase line spacing" onClick={() => stepLineHeight(0.1)} />
                  </div>
                  <RibbonButton active={editor?.isActive("bulletList")} disabled={disabled || Boolean(selectedBlock)} icon={<List className="h-8 w-6" />} label="Bullet list" onClick={() => focusEditorChain()?.toggleBulletList().run()} />
                  <RibbonButton active={editor?.isActive("orderedList")} disabled={disabled || Boolean(selectedBlock)} icon={<ListOrdered className="h-8 w-6" />} label="Numbered list" onClick={() => focusEditorChain()?.toggleOrderedList().run()} />
                </RibbonGroup>
              </>
            ) : null}

            {activeRibbonTab === "insert" ? (
              <>
                <RibbonGroup label="Media">
                  <RibbonButton disabled={disabled} icon={<ImageIcon className="h-8 w-6" />} label="Insert image" onClick={() => imageInputRef.current?.click()}>Image</RibbonButton>
                  <div ref={tablePickerAnchorRef}>
                    <RibbonButton active={tablePickerOpen || Boolean(tablePlacement)} disabled={disabled} icon={<TableIcon className="h-8 w-6" />} label="Insert table" onClick={openTablePicker}>Table</RibbonButton>
                  </div>
                  <RibbonButton disabled={disabled} icon={<Type className="h-8 w-6" />} label="Floating text" onClick={insertFloatingText}>Text</RibbonButton>
                  <RibbonButton active={textPlacementMode} disabled={disabled} icon={<MousePointer2 className="h-8 w-6" />} label="Place text on paper" onClick={toggleTextPlacementMode}>Place</RibbonButton>
                </RibbonGroup>
                <RibbonGroup label="Objects">
                  <RibbonButton disabled={disabled} icon={<Minus className="h-8 w-6" />} label="Line" onClick={() => insertFloatingShape("line")}>Line</RibbonButton>
                  <RibbonButton disabled={disabled} icon={<Square className="h-8 w-6" />} label="Box" onClick={() => insertFloatingShape("box")}>Box</RibbonButton>
                  <RibbonButton disabled={disabled} icon={<QrCode className="h-8 w-6" />} label="QR code" onClick={() => insertFloatingShape("qr")}>QR</RibbonButton>
                </RibbonGroup>
                <RibbonGroup label="Page">
                  <RibbonButton disabled={disabled} icon={<PanelTop className="h-8 w-6" />} label="Insert header" onClick={() => insertHeaderFooter("header")}>Header</RibbonButton>
                  <RibbonButton disabled={disabled} icon={<PanelBottom className="h-8 w-6" />} label="Insert footer" onClick={() => insertHeaderFooter("footer")}>Footer</RibbonButton>
                </RibbonGroup>
                {inlineImageAttrs ? (
                  <RibbonGroup label="Inline Image">
                    <input
                      className="h-8 w-16 rounded-md border border-slate-200 px-2 text-xs font-bold"
                      min={24}
                      onChange={(event) => {
                        const value = event.target.value;
                        setInlineImageSize((current) => ({ ...current, width: value }));
                        updateInlineImageAttrs({ width: value ? Number(value) : null });
                      }}
                      placeholder="W"
                      type="number"
                      value={inlineImageSize.width}
                    />
                    <input
                      className="h-8 w-16 rounded-md border border-slate-200 px-2 text-xs font-bold"
                      min={24}
                      onChange={(event) => {
                        const value = event.target.value;
                        setInlineImageSize((current) => ({ ...current, height: value }));
                        updateInlineImageAttrs({ height: value ? Number(value) : null });
                      }}
                      placeholder="H"
                      type="number"
                      value={inlineImageSize.height}
                    />
                    <RibbonButton disabled={disabled} icon={<RotateCcw className="h-8 w-6" />} label="Reset image size" onClick={() => updateInlineImageAttrs({ height: null, width: null })} />
                    <RibbonButton disabled={disabled} icon={<AlignLeft className="h-8 w-6" />} label="Image left" onClick={() => applyAlignment("left")} />
                    <RibbonButton disabled={disabled} icon={<AlignCenter className="h-8 w-6" />} label="Image center" onClick={() => applyAlignment("center")} />
                    <RibbonButton disabled={disabled} icon={<AlignRight className="h-8 w-6" />} label="Image right" onClick={() => applyAlignment("right")} />
                    <RibbonButton disabled={disabled} icon={<ImagePlus className="h-8 w-6" />} label="Replace image" onClick={() => replaceImageInputRef.current?.click()} />
                    <RibbonButton disabled={disabled} icon={<Move className="h-8 w-6" />} label="Convert to floating" onClick={convertInlineImageToFloating}>Float</RibbonButton>
                  </RibbonGroup>
                ) : null}
              </>
            ) : null}

            {activeRibbonTab === "fields" ? (
              <>
                <RibbonGroup label="Editable Zones">
                  <RibbonButton disabled={disabled} icon={<Heading1 className="h-8 w-6" />} label="Subject field" onClick={() => insertTokenWithPlacement("Insert subject field", zoneToken("subject"), zoneForKey("subject", "Subject"), { field: "document.subject" })}>Subject</RibbonButton>
                  <RibbonButton disabled={disabled} icon={<FileText className="h-8 w-6" />} label="Body field" onClick={() => insertTokenWithPlacement("Insert body field", zoneToken("body"), zoneForKey("body", "Body"), { field: "document.body", height: 64, width: 142 })}>Body</RibbonButton>
                  <RibbonButton disabled={disabled} icon={<Heading2 className="h-8 w-6" />} label="Header unit field" onClick={() => insertTokenWithPlacement("Insert unit field", zoneToken("header_unit"), zoneForKey("header_unit", "Header unit / position"), { field: "document.template.header_unit" })}>Unit</RibbonButton>
                  <RibbonButton disabled={disabled} icon={<Plus className="h-8 w-6" />} label="Custom field" onClick={insertCustomZone}>Custom</RibbonButton>
                  <RibbonButton disabled={disabled} icon={<Baseline className="h-8 w-6" />} label="Serial" onClick={() => insertTokenWithPlacement("Insert serial", systemToken("official_serial"), undefined, { field: systemFieldForToken("serial") })}>Serial</RibbonButton>
                  <RibbonButton disabled={disabled} icon={<ShieldCheck className="h-8 w-6" />} label="Approval section" onClick={() => insertTokenWithPlacement("Insert approval section", signatureToken("completed"), undefined, { height: 54, limit: 5, mode: "completed", type: "signature_zone", width: 138 })}>Approve</RibbonButton>
                </RibbonGroup>
                <RibbonGroup label="Dates">
                  {dateInsertOptions.map((option) => (
                    <RibbonButton
                      disabled={disabled}
                      icon={<FileText className="h-8 w-6" />}
                      key={option.calendar}
                      label={option.title}
                      onClick={() => insertTokenWithPlacement(option.title, dateToken(option.calendar), undefined, { field: dateFieldForCalendar(option.calendar) })}
                    >
                      {option.label}
                    </RibbonButton>
                  ))}
                </RibbonGroup>
              </>
            ) : null}

            {activeRibbonTab === "table" ? (
              <>
                <RibbonGroup label="Rows & Columns">
                  <RibbonButton disabled={tableCommandDisabled} icon={<Rows3 className="h-8 w-6" />} label="Row above" onClick={() => runTableCommand("Row above", () => updateFloatingTableRows((rows) => insertTableRow(rows, selectedTableCell, 0), "insert-row"))} />
                  <RibbonButton disabled={tableCommandDisabled} icon={<Rows3 className="h-8 w-6 rotate-180" />} label="Row below" onClick={() => runTableCommand("Row below", () => updateFloatingTableRows((rows) => insertTableRow(rows, selectedTableCell, 1), "insert-row"))} />
                  <RibbonButton disabled={tableCommandDisabled} icon={<Columns3 className="h-8 w-6" />} label="Column before" onClick={() => runTableCommand("Column before", () => updateFloatingTableRows((rows) => insertTableColumn(rows, selectedTableCell, 0), "insert-column"))} />
                  <RibbonButton disabled={tableCommandDisabled} icon={<Columns3 className="h-8 w-6 rotate-180" />} label="Column after" onClick={() => runTableCommand("Column after", () => updateFloatingTableRows((rows) => insertTableColumn(rows, selectedTableCell, 1), "insert-column"))} />
                  <RibbonButton disabled={tableCommandDisabled} icon={<Trash2 className="h-8 w-6" />} label="Delete row" onClick={() => runTableCommand("Delete row", () => updateFloatingTableRows((rows) => deleteTableRow(rows, selectedTableCell), "delete-row"))} />
                  <RibbonButton disabled={tableCommandDisabled} icon={<Trash2 className="h-8 w-6 rotate-90" />} label="Delete column" onClick={() => runTableCommand("Delete column", () => updateFloatingTableRows((rows) => deleteTableColumn(rows, selectedTableCell), "delete-column"))} />
                </RibbonGroup>
                <RibbonGroup label="Cell Text">
                  <SelectControl disabled={tableTextDisabled} icon={<Baseline className="h-8 w-6" />} label="Font" onChange={applyFontFamily} value={fontFamily} widthClassName="w-48">
                    {fontFamilyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </SelectControl>
                  <SelectControl disabled={tableTextDisabled} icon={<Type className="h-8 w-6" />} label="Font size" onChange={applyFontSize} value={fontSize} widthClassName="w-24">
                    {fontSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                  </SelectControl>
                  <RibbonButton active={activeBold} disabled={tableTextDisabled} icon={<Bold className="h-8 w-6" />} label="Bold" onClick={toggleBold} />
                  <RibbonButton active={activeItalic} disabled={tableTextDisabled} icon={<Italic className="h-8 w-6" />} label="Italic" onClick={toggleItalic} />
                  <RibbonButton active={activeUnderline} disabled={tableTextDisabled} icon={<Underline className="h-8 w-6" />} label="Underline" onClick={toggleUnderline} />
                  <ColorControl disabled={tableTextDisabled} icon={<Baseline className="h-8 w-6" />} label="Text color" onChange={applyColor} value={textColor} />
                  <ColorControl disabled={tableTextDisabled} icon={<Highlighter className="h-8 w-6" />} label="Highlight" onChange={applyHighlight} value={highlightColor} />
                  <RibbonButton active={activeAlign === "left"} disabled={tableTextDisabled} icon={<AlignLeft className="h-8 w-6" />} label="Align left" onClick={() => applyAlignment("left")} />
                  <RibbonButton active={activeAlign === "center"} disabled={tableTextDisabled} icon={<AlignCenter className="h-8 w-6" />} label="Align center" onClick={() => applyAlignment("center")} />
                  <RibbonButton active={activeAlign === "right" || activeAlign === "start"} disabled={tableTextDisabled} icon={<AlignRight className="h-8 w-6" />} label="Align right" onClick={() => applyAlignment("right")} />
                  <RibbonButton active={activeAlign === "justify"} disabled={tableTextDisabled} icon={<AlignJustify className="h-8 w-6" />} label="Justify" onClick={() => applyAlignment("justify")} />
                  <RibbonButton active={activeTableCellEditor?.isActive("bulletList")} disabled={tableTextDisabled} icon={<List className="h-8 w-6" />} label="Bullet list" onClick={() => activeTableCellEditor?.chain().focus().toggleBulletList().run()} />
                  <RibbonButton active={activeTableCellEditor?.isActive("orderedList")} disabled={tableTextDisabled} icon={<ListOrdered className="h-8 w-6" />} label="Numbered list" onClick={() => activeTableCellEditor?.chain().focus().toggleOrderedList().run()} />
                </RibbonGroup>
                <RibbonGroup label="Cell">
                  <RibbonButton disabled={tableCommandDisabled} icon={<Merge className="h-8 w-6" />} label="Merge with next cell" onClick={() => runTableCommand("Merge cells", () => updateFloatingTableRows((rows) => mergeTableCellRight(rows, selectedTableCell)))} />
                  <RibbonButton disabled={tableCommandDisabled} icon={<Split className="h-8 w-6" />} label="Split cell" onClick={() => runTableCommand("Split cell", () => updateFloatingTableRows((rows) => splitTableCell(rows, selectedTableCell)))} />
                  <RibbonButton disabled={tableCommandDisabled} icon={<Grid3X3 className="h-8 w-6" />} label="Header row" onClick={() => runTableCommand("Header row", () => {
                    const table = selectedFloatingTable();
                    if (!table) return false;
                    updateBlock(table.id, { headerRow: !table.headerRow });
                    return true;
                  })} />
                  <ColorControl disabled={tableCommandDisabled} icon={<PaintBucket className="h-8 w-6" />} label="Cell fill" onChange={(value) => {
                    setCellFillColor(value);
                    runTableCommand("Cell fill", () => {
                      const table = selectedFloatingTable();
                      if (!table) return false;
                      updateFloatingTableRows((rows) => updateTableCell(rows, selectedTableCell, { style: { ...(rows[selectedTableCell.row]?.[selectedTableCell.col]?.style || {}), backgroundColor: value } }));
                      return true;
                    });
                  }} value={cellFillColor} />
                  <RibbonButton disabled={tableCommandDisabled} icon={<Grid3X3 className="h-8 w-6" />} label="Equal widths and heights" onClick={() => {
                    const table = selectedFloatingTable();
                    if (table) {
                      const rows = normalizeTableRows(table);
                      updateBlock(table.id, { columnWidths: equalTableTrackSizes(rows[0]?.length || 1), rowHeights: equalTableTrackSizes(rows.length) });
                    }
                  }}>Equal</RibbonButton>
                  <RibbonButton disabled={tableCommandDisabled} icon={<Trash2 className="h-8 w-6" />} label="Delete table" onClick={() => {
                    const table = selectedFloatingTable();
                    if (table) {
                      deleteSelectedBlock();
                    }
                  }}>Table</RibbonButton>
                </RibbonGroup>
              </>
            ) : null}

            {activeRibbonTab === "inspector" ? renderInspectorPanel() : null}

            {activeRibbonTab === "review" ? (
              <RibbonGroup label="Publish">
                <RibbonButton disabled={busy || !canEdit || !editor} icon={<Save className="h-8 w-6" />} label="Save" onClick={onSave}>Save</RibbonButton>
                <RibbonButton disabled={busy || !name.trim()} icon={<Eye className="h-8 w-6" />} label="Preview and publish" onClick={onOpenPublish}>Preview</RibbonButton>
                <RibbonButton disabled={busy || !name.trim()} icon={<ShieldCheck className="h-8 w-6" />} label="Approve and publish" onClick={onOpenPublish}>Publish</RibbonButton>
              </RibbonGroup>
            ) : null}
          </div>
        </div>
      </header>

      <input accept={allowedImageTypes.join(",")} className="hidden" onChange={handleImageInput} ref={imageInputRef} type="file" />
      <input accept={allowedImageTypes.join(",")} className="hidden" onChange={handleReplaceImageInput} ref={replaceImageInputRef} type="file" />

      {(error || notice || imageError || edgeWarning || statusMessage || !canEdit) ? (
        <div className="mx-auto mt-3 max-w-5xl px-4">
          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
          {notice ? <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{notice}</div> : null}
          {imageError ? <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{imageError}</div> : null}
          {edgeWarning ? (
            <div className={cx(
              "mt-2 rounded-md border px-4 py-3 text-sm font-semibold",
              edgeWarning.tone === "red" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"
            )}>
              {edgeWarning.message}
            </div>
          ) : null}
          {statusMessage ? <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">{statusMessage}</div> : null}
          {!canEdit ? <div className="mt-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">This template version is not editable. Create a new template or clone it before changing the design.</div> : null}
        </div>
      ) : null}

      <div className="grid min-h-[calc(100vh-10.75rem)] min-w-0 grid-cols-1">
        <main className="min-w-0 overflow-auto px-4 py-6" ref={workAreaRef}>
          <div className="mx-auto" style={pageFrameStyle}>
            <div
              className={cx(
                "template-designer-page relative min-h-[297mm] w-[210mm] origin-top overflow-hidden bg-white px-[18mm] py-[18mm] text-right text-[11pt] leading-7 text-slate-950 shadow-[0_20px_60px_rgba(15,23,42,0.20)] ring-1 ring-slate-200",
                (textPlacementMode || tablePlacement) && "cursor-crosshair"
              )}
              dir={layout.page.direction}
              onKeyDown={handleDesignerKeyDown}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                  setSelectedBlockId(null);
                }
              }}
              ref={pageRef}
              style={pageStyle}
              tabIndex={0}
            >
              <div className="relative z-10">
                <EditorContent editor={editor} onFocus={() => setSelectedBlockId(null)} />
              </div>
              {textPlacementMode ? (
                <div
                  className="absolute inset-0 z-[35] cursor-crosshair bg-blue-500/[0.02]"
                  onPointerDown={placeFloatingTextAtPoint}
                  onPointerMove={(event) => updatePlacementPointer(event.clientX, event.clientY)}
                />
              ) : null}
              {tablePlacement ? (
                <div
                  className="absolute inset-0 z-[35] cursor-crosshair bg-blue-500/[0.02]"
                  onPointerDown={placeTableAtPoint}
                  onPointerMove={(event) => updateTablePlacementPointer(event.clientX, event.clientY)}
                />
              ) : null}
              {tablePlacementBlock() ? (
                <div
                  className="pointer-events-none absolute z-[34] overflow-hidden bg-white/80 opacity-75 shadow-lg ring-2 ring-blue-600"
                  style={floatingBlockStyle(tablePlacementBlock()!, layout.page.direction)}
                >
                  <FloatingTablePreview block={tablePlacementBlock()!} pageDirection={layout.page.direction} />
                </div>
              ) : null}
              <div className="pointer-events-none absolute inset-0 z-20">
                {blocks.filter((block) => !block.hidden).map((block) => {
                  const selected = selectedBlockId === block.id;
                  return (
                    <div
                      aria-label={blockLabel(block)}
                      className={cx(
                        "absolute whitespace-pre-wrap p-1.5 text-start outline-none transition",
                        selected ? "overflow-visible ring-2 ring-blue-600" : "overflow-hidden ring-1 ring-transparent",
                        canEdit && !block.locked ? "pointer-events-auto cursor-move touch-none active:cursor-grabbing" : "pointer-events-auto cursor-default",
                        !selected && canEdit && "hover:ring-blue-400/60",
                        (dragState?.blockId === block.id || resizeState?.blockId === block.id) && "shadow-lg ring-2 ring-[#061d49]",
                        block.locked && "bg-slate-50/40",
                        ["image", "logo", "table", "line", "box"].includes(block.type) && "p-0"
                      )}
                      key={block.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedBlockId(block.id);
                        setActiveRibbonTab(block.type === "table" ? "table" : "inspector");
                        if (block.type === "table") {
                          setEditingTableCell(null);
                          setActiveTableCellEditor(null);
                        }
                        if (canEditFloatingTextDirectly(block) && canEdit && !block.locked) {
                          setActiveTextEditBlockId(block.id);
                        } else {
                          setActiveTextEditBlockId(null);
                          focusPageWithoutScroll();
                        }
                      }}
                      onPointerCancel={stopBlockDrag}
                      onPointerDown={(event) => startBlockDrag(event, block)}
                      onPointerMove={moveBlockDrag}
                      onPointerUp={stopBlockDrag}
                      ref={(node) => {
                        if (node) {
                          blockElementRefs.current.set(block.id, node);
                        } else {
                          blockElementRefs.current.delete(block.id);
                        }
                      }}
                      role="button"
                      style={floatingBlockStyle(block, layout.page.direction)}
                      tabIndex={0}
                    >
                      {renderFloatingBlockContent(block)}
                      {selected && canEdit && !block.locked ? (["top", "bottom", "start", "end"] as const).map((rail) => (
                        <span
                          aria-hidden="true"
                          className={cx(
                            "absolute z-20 bg-blue-500/0 transition hover:bg-blue-500/10",
                            (rail === "top" || rail === "bottom") && "left-0 h-2 w-full cursor-move",
                            rail === "top" && "-top-2",
                            rail === "bottom" && "-bottom-2",
                            (rail === "start" || rail === "end") && "top-0 h-full w-2 cursor-move",
                            rail === "start" && "-start-2",
                            rail === "end" && "-end-2"
                          )}
                          data-object-move-rail={rail}
                          key={`move-${rail}`}
                          onPointerCancel={stopBlockDrag}
                          onPointerDown={(event) => startBlockDrag(event, block, { force: true })}
                          onPointerMove={moveBlockDrag}
                          onPointerUp={stopBlockDrag}
                        />
                      )) : null}
                      {selected && canEdit && !block.locked ? (
                        <button
                          aria-label="Move selected object"
                          className="absolute -top-8 start-0 z-40 inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md border border-blue-600 bg-white text-blue-700 shadow-sm transition hover:bg-blue-50 active:cursor-grabbing"
                          data-object-move-handle="true"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onPointerCancel={stopBlockDrag}
                          onPointerDown={(event) => startBlockDrag(event, block, { force: true })}
                          onPointerMove={moveBlockDrag}
                          onPointerUp={stopBlockDrag}
                          title="Move selected object"
                          type="button"
                        >
                          <Move className="h-8 w-6" />
                        </button>
                      ) : null}
                      {selected && canEdit ? (["nw", "ne", "sw", "se"] as ResizeHandle[]).map((handle) => (
                        <span
                          className={cx(
                            "absolute z-30 h-2.5 w-2.5 rounded-full border border-blue-600 bg-white shadow-sm",
                            handle === "nw" && "-left-1.5 -top-1.5 cursor-nw-resize",
                            handle === "ne" && "-right-1.5 -top-1.5 cursor-ne-resize",
                            handle === "sw" && "-bottom-1.5 -left-1.5 cursor-sw-resize",
                            handle === "se" && "-bottom-1.5 -right-1.5 cursor-se-resize"
                          )}
                          data-resize-handle={handle}
                          key={handle}
                          onPointerCancel={stopBlockResize}
                          onPointerDown={(event) => startBlockResize(event, block, handle)}
                          onPointerMove={moveBlockResize}
                          onPointerUp={stopBlockResize}
                        />
                      )) : null}
                    </div>
                  );
                })}
              </div>
              {renderSmartRulers()}
            </div>
          </div>
        </main>

      </div>

      {tablePickerOpen ? (
        <div className="fixed inset-0 z-50" onPointerDown={() => setTablePickerOpen(false)}>
          <div
            aria-label="Insert table"
            aria-modal="true"
            className="fixed rounded-lg border border-slate-200 bg-white p-4 shadow-2xl"
            onKeyDown={handleTablePickerKeyDown}
            onPointerDown={(event) => event.stopPropagation()}
            role="dialog"
            style={tablePickerPosition()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-950">Insert floating table</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">{tablePickerSize.columns} columns × {tablePickerSize.rows} rows</p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                <input
                  checked={tablePickerSize.headerRow}
                  className="h-4 w-4 rounded border-slate-300 text-[#061d49]"
                  onChange={(event) => setTablePickerSize((current) => ({ ...current, headerRow: event.target.checked }))}
                  type="checkbox"
                />
                Header row
              </label>
            </div>
            <div
              aria-label="Choose table dimensions"
              className="mt-3 grid grid-cols-10 gap-1"
              role="grid"
            >
              {Array.from({ length: tablePickerRows }, (_rowItem, rowIndex) => (
                Array.from({ length: tablePickerColumns }, (_columnItem, columnIndex) => {
                  const columns = columnIndex + 1;
                  const rows = rowIndex + 1;
                  const highlighted = columns <= tablePickerSize.columns && rows <= tablePickerSize.rows;
                  const current = columns === tablePickerSize.columns && rows === tablePickerSize.rows;
                  return (
                    <button
                      aria-label={`${columns} columns by ${rows} rows`}
                      aria-selected={current}
                      className={cx(
                        "h-6 w-6 rounded-sm border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                        highlighted ? "border-blue-600 bg-blue-100" : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50"
                      )}
                      data-table-picker-cell={`${columns}-${rows}`}
                      key={`${columns}-${rows}`}
                      onClick={() => beginTablePlacement({ columns, headerRow: tablePickerSize.headerRow, rows })}
                      onFocus={() => setTablePickerSize((currentSize) => ({ ...currentSize, columns, rows }))}
                      onMouseEnter={() => setTablePickerSize((currentSize) => ({ ...currentSize, columns, rows }))}
                      role="gridcell"
                      tabIndex={current ? 0 : -1}
                      type="button"
                    />
                  );
                })
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">Use arrow keys and Enter, or point and click. You will place the table on the page next.</p>
          </div>
        </div>
      ) : null}

      {placementDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-2xl">
            <p className="text-sm font-black text-slate-950">{placementDialog.title}</p>
            {placementDialog.description ? <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{placementDialog.description}</p> : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {placementDialog.onInline ? (
                <button
                  className="rounded-md border border-slate-200 bg-white px-3 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                  onClick={placementDialog.onInline}
                  type="button"
                >
                  {placementDialog.inlineLabel || "Inline"}
                </button>
              ) : null}
              <button
                className={cx("rounded-md border border-[#061d49] bg-[#061d49] px-3 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#082763]", !placementDialog.onInline && "col-span-2")}
                onClick={placementDialog.onFloating}
                type="button"
              >
                {placementDialog.floatingLabel || "Floating"}
              </button>
            </div>
            <button
              className="mt-3 w-full rounded-md border border-transparent px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
              onClick={() => setPlacementDialog(null)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
