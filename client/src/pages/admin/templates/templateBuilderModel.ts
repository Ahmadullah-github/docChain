import type {
  DocumentType,
  DocumentTemplateDetail,
  EntityId,
  JsonRecord,
  TemplateBlock,
  TemplateLayout,
  TemplateLocale,
  TemplateTableCell,
  TemplateVariant
} from "../../../api";
import {
  a4Height,
  a4Width,
  headerTemplateField,
  inspectorTabs,
  templateFieldPrefix
} from "../../../components/admin/templates/builder";
import type { InspectorTab } from "../../../components/admin/templates/builder";
import { equalTableTrackSizes, tableCell } from "../templateTableUtils";
import type { IconName } from "../../../components/ui";

export const variants: TemplateVariant[] = ["official", "internal", "archive", "routing_sheet"];
export const locales: TemplateLocale[] = ["all", "en", "fa-AF", "ps-AF"];

export type DocumentFamily = "maktoob" | "istelam" | "pishnehadiya" | "elam" | "legacy";
export type ShellPreset = "university" | "faculty" | "department" | "committee";
export type SectionKey = "recipient" | "greeting" | "subject" | "body" | "closing" | "signature" | "cc" | "footer" | "qr";
export type SignatureLayout = "single" | "two_column" | "grid";
export type LogoSlotId = "logo-left" | "logo-right";
export type TemplateTextAlign = NonNullable<TemplateBlock["style"]>["textAlign"];
export type PhysicalTextAlign = Extract<TemplateTextAlign, "left" | "center" | "right">;

export type EditorSettings = {
  activeInspectorTab: InspectorTab;
  gridSizeMm: number;
  showGrid: boolean;
  showRulers: boolean;
  snapEnabled: boolean;
};

export type GuidedTemplateMeta = {
  documentFamily: DocumentFamily;
  shellPreset: ShellPreset;
  sections: Record<SectionKey, boolean>;
  signatureLayout: SignatureLayout;
  lockedBlockIds: string[];
};

export type GuidedConfig = Omit<GuidedTemplateMeta, "lockedBlockIds">;

export const textAlignOptions: Array<{ align: PhysicalTextAlign; icon: IconName; label: string }> = [
  { align: "left", icon: "alignLeft", label: "Left" },
  { align: "center", icon: "alignCenter", label: "Center" },
  { align: "right", icon: "alignRight", label: "Right" }
];

export const defaultEditorSettings: EditorSettings = {
  activeInspectorTab: "block",
  gridSizeMm: 5,
  showGrid: false,
  showRulers: false,
  snapEnabled: false
};

const documentTypeFamilies: Array<{ family: Exclude<DocumentFamily, "legacy">; tokens: string[] }> = [
  { family: "maktoob", tokens: ["maktob", "maktoob", "letter", "مکتوب"] },
  { family: "istelam", tokens: ["istelam", "inquiry", "request", "استعلام"] },
  { family: "pishnehadiya", tokens: ["pishnehadiya", "proposal", "recommendation", "پیشنهاد", "پیشنهادیه"] },
  { family: "elam", tokens: ["elam", "announcement", "notice", "اعلام", "اعلامیه"] }
];

export const familyOptions: Array<{ id: Exclude<DocumentFamily, "legacy">; label: string; description: string }> = [
  { id: "maktoob", label: "Maktoob", description: "Official correspondence with recipient, subject, body, signature, and copies." },
  { id: "istelam", label: "Istelam", description: "Inquiry/request format with reference text, response body, and signer zone." },
  { id: "pishnehadiya", label: "Pishnehadiya", description: "Proposal format with justification, recommendation, and approval signatures." },
  { id: "elam", label: "Elam", description: "Announcement format for audience, message, date, and issuing office." }
];

export const sectionOptions: Array<{ id: SectionKey; label: string; description: string }> = [
  { id: "recipient", label: "Recipient", description: "Official addressee line." },
  { id: "greeting", label: "Greeting", description: "Formal greeting or salutation." },
  { id: "subject", label: "Subject", description: "Bound to document subject." },
  { id: "body", label: "Body", description: "Bound to document body." },
  { id: "closing", label: "Closing", description: "Formal closing text." },
  { id: "signature", label: "Approvals", description: "Workflow-driven approval/signature section." },
  { id: "cc", label: "CC", description: "Copies section." },
  { id: "footer", label: "Footer", description: "Address/contact line." },
  { id: "qr", label: "QR", description: "Verification marker." }
];

const defaultSections: Record<SectionKey, boolean> = {
  recipient: true,
  greeting: true,
  subject: true,
  body: true,
  closing: true,
  signature: true,
  cc: true,
  footer: true,
  qr: false
};

export function safeLayout(value?: TemplateLayout | null) {
  if (value?.page && Array.isArray(value.blocks)) {
    return value;
  }

  return buildGuidedLayout(defaultGuidedConfig("maktoob"));
}

export function readEditorSettings(layout: TemplateLayout): EditorSettings {
  const meta = isRecord(layout.meta) ? layout.meta : {};
  const editor = isRecord(meta.editor) ? meta.editor : {};
  const tab = String(editor.activeInspectorTab || defaultEditorSettings.activeInspectorTab);
  const gridSize = Number(editor.gridSizeMm);

  return {
    activeInspectorTab: inspectorTabs.some((item) => item.id === tab) ? tab as InspectorTab : defaultEditorSettings.activeInspectorTab,
    gridSizeMm: Number.isFinite(gridSize) ? clampNumber(gridSize, 1, 25) : defaultEditorSettings.gridSizeMm,
    showGrid: typeof editor.showGrid === "boolean" ? editor.showGrid : defaultEditorSettings.showGrid,
    showRulers: typeof editor.showRulers === "boolean" ? editor.showRulers : defaultEditorSettings.showRulers,
    snapEnabled: typeof editor.snapEnabled === "boolean" ? editor.snapEnabled : defaultEditorSettings.snapEnabled
  };
}

export function withEditorSettings(layout: TemplateLayout, nextEditor: Partial<EditorSettings>): TemplateLayout {
  const currentEditor = readEditorSettings(layout);
  return {
    ...layout,
    meta: {
      ...(isRecord(layout.meta) ? layout.meta : {}),
      editor: {
        ...currentEditor,
        ...nextEditor
      }
    }
  };
}

export function defaultGuidedConfig(family: Exclude<DocumentFamily, "legacy"> = "maktoob"): GuidedConfig {
  return {
    documentFamily: family,
    shellPreset: "university",
    sections: {
      ...defaultSections,
      recipient: family !== "elam",
      greeting: family !== "elam",
      closing: family !== "elam",
      cc: family !== "elam",
      qr: false
    },
    signatureLayout: family === "pishnehadiya" ? "grid" : "two_column"
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hydrateConfig(layout: TemplateLayout): { config: GuidedConfig; isLegacy: boolean } {
  const meta = isRecord(layout.meta) ? layout.meta : null;
  const documentFamily = meta?.documentFamily;
  if (!documentFamily || documentFamily === "legacy" || !["maktoob", "istelam", "pishnehadiya", "elam"].includes(String(documentFamily))) {
    return { config: { ...defaultGuidedConfig("maktoob"), documentFamily: "legacy" }, isLegacy: true };
  }

  const config = defaultGuidedConfig(documentFamily as Exclude<DocumentFamily, "legacy">);
  const sections = isRecord(meta.sections) ? meta.sections : {};
  return {
    config: {
      documentFamily: documentFamily as Exclude<DocumentFamily, "legacy">,
      shellPreset: ["university", "faculty", "department", "committee"].includes(String(meta.shellPreset))
        ? meta.shellPreset as ShellPreset
        : config.shellPreset,
      sections: Object.fromEntries(
        sectionOptions.map((section) => [section.id, typeof sections[section.id] === "boolean" ? sections[section.id] : config.sections[section.id]])
      ) as Record<SectionKey, boolean>,
      signatureLayout: ["single", "two_column", "grid"].includes(String(meta.signatureLayout))
        ? meta.signatureLayout as SignatureLayout
        : config.signatureLayout
    },
    isLegacy: false
  };
}

export function documentTypeIdFromLayout(layout: TemplateLayout | null | undefined): EntityId | null {
  const meta = isRecord(layout?.meta) ? layout?.meta : {};
  const documentTypeId = Number(meta.documentTypeId);
  return Number.isFinite(documentTypeId) && documentTypeId > 0 ? documentTypeId : null;
}

export function documentTypeNameFromLayout(layout: TemplateLayout | null | undefined): string {
  const meta = isRecord(layout?.meta) ? layout?.meta : {};
  return typeof meta.documentTypeName === "string" ? meta.documentTypeName : "";
}

export function withDocumentTypeMeta(layout: TemplateLayout, documentType: Pick<DocumentType, "code" | "id" | "name"> | null): TemplateLayout {
  return {
    ...layout,
    meta: {
      ...(isRecord(layout.meta) ? layout.meta : {}),
      documentTypeCode: documentType?.code || null,
      documentTypeId: documentType?.id || null,
      documentTypeName: documentType?.name || null
    }
  };
}

function familyForDocumentType(documentType?: Pick<DocumentType, "code" | "name"> | null): Exclude<DocumentFamily, "legacy"> {
  const haystack = `${documentType?.code || ""} ${documentType?.name || ""}`.toLowerCase();
  return documentTypeFamilies.find((item) => item.tokens.some((token) => haystack.includes(token.toLowerCase())))?.family || "maktoob";
}

export function defaultTemplateNameForDocumentType(documentType?: Pick<DocumentType, "name"> | null) {
  return documentType?.name ? `${documentType.name} Template` : "Official Document Template";
}

export function buildDocumentTypeStarterLayout(documentType?: Pick<DocumentType, "code" | "id" | "name"> | null): TemplateLayout {
  const family = familyForDocumentType(documentType);
  const starter = buildGuidedLayout(defaultGuidedConfig(family));
  return withDocumentTypeMeta({
    ...starter,
    blocks: starter.blocks.map((item) => ({ ...item, locked: false })),
    meta: {
      ...(isRecord(starter.meta) ? starter.meta : {}),
      freeformDesigner: true,
      lockedBlockIds: []
    }
  }, documentType || null);
}

export function shellTitle(_shellPreset: ShellPreset) {
  return "امارت اسلامی افغانستان\nوزارت تحصیلات عالی\nریاست پوهنتون بلخ";
}

export function familyTitle(family: DocumentFamily) {
  switch (family) {
    case "istelam":
      return "استعلام";
    case "pishnehadiya":
      return "پیشنهادیه";
    case "elam":
      return "اعلامیه";
    case "maktoob":
      return "مکتوب";
    default:
      return "Legacy";
  }
}

function block(id: string, input: Omit<TemplateBlock, "id">): TemplateBlock {
  return { id, ...input };
}

function defaultTableRows(): TemplateTableCell[][] {
  return [
    [tableCell("Header 1"), tableCell("Header 2"), tableCell("Header 3")],
    [tableCell(""), tableCell(""), tableCell("")],
    [tableCell(""), tableCell(""), tableCell("")]
  ];
}

export function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export function colorInputValue(value: string | undefined, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value as string : fallback;
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

const dateFieldByInsertType: Record<string, string> = {
  date_gregorian: "document.date.gregorian",
  date_shamsi: "document.date.shamsi",
  date_hijri: "document.date.hijri"
};

export function insertedBlock(type: string, index: number): TemplateBlock {
  const baseY = Math.min(224, 64 + index * 5);
  const commonStyle = { fontSize: 10, textAlign: "start" as const, borderWidth: type === "box" ? 1 : 0 };
  const dateField = dateFieldByInsertType[type];

  if (dateField) {
    return {
      id: crypto.randomUUID(),
      type: "dynamic_field",
      x: 132,
      y: baseY,
      width: 48,
      height: 9,
      field: dateField,
      style: { fontSize: 9, textAlign: "right", borderWidth: 0 }
    };
  }

  if (type === "staff_header_field") {
    return {
      id: crypto.randomUUID(),
      type: "dynamic_field",
      x: 48,
      y: 34,
      width: 114,
      height: 8,
      field: headerTemplateField,
      maxLines: 3,
      minFontSize: 7,
      placeholder: "Faculty, department, office, or position",
      reflowBelow: true,
      style: { fontSize: 9, fontWeight: "700", lineHeight: 1.35, textAlign: "center", borderWidth: 0 }
    };
  }

  if (type === "table") {
    return {
      id: crypto.randomUUID(),
      type,
      x: 28,
      y: baseY,
      width: 124,
      height: 36,
      columnWidths: equalTableTrackSizes(3),
      headerRow: true,
      rowHeights: equalTableTrackSizes(3),
      rows: defaultTableRows(),
      style: { cellPaddingMm: 1.5, fontSize: 9, headerBackgroundColor: "#f8fafc", textAlign: "start", borderColor: "#cbd5e1", borderWidth: 1 }
    };
  }

  if (type === "line") {
    return {
      id: crypto.randomUUID(),
      type,
      x: 24,
      y: baseY,
      width: 160,
      height: 1,
      style: { borderWidth: 1, borderColor: "#0f172a" }
    };
  }

  if (type === "box") {
    return {
      id: crypto.randomUUID(),
      type,
      x: 24,
      y: baseY,
      width: 68,
      height: 18,
      style: { borderWidth: 1, borderColor: "#94a3b8", backgroundColor: "transparent" }
    };
  }

  if (type === "signature_zone") {
    return {
      id: crypto.randomUUID(),
      type,
      x: 36,
      y: baseY,
      width: 138,
      height: 54,
      content: "approval / signature section",
      limit: 5,
      mode: "completed",
      style: { fontSize: 8, textAlign: "center", borderWidth: 0 }
    };
  }

  if (type === "qr") {
    return {
      id: crypto.randomUUID(),
      type,
      x: 164,
      y: baseY,
      width: 20,
      height: 20,
      content: "QR",
      style: { fontSize: 7, textAlign: "center", borderWidth: 1, borderColor: "#64748b" }
    };
  }

  if (type === "logo" || type === "image") {
    return {
      id: crypto.randomUUID(),
      type,
      x: 24,
      y: baseY,
      width: 28,
      height: 22,
      src: "",
      style: { borderWidth: 0 }
    };
  }

  return {
    id: crypto.randomUUID(),
    type,
    x: 24,
    y: baseY,
    width: type === "dynamic_field" ? 82 : 68,
    height: 18,
    content: type === "text" ? "New text block" : type.replaceAll("_", " "),
    field: type === "dynamic_field" ? "document.subject" : undefined,
    style: commonStyle
  };
}

export function buildGuidedLayout(config: GuidedConfig): TemplateLayout {
  const lockedBlockIds = [
    "logo-left",
    "header-title",
    "logo-right",
    "header-staff-unit",
    "doc-number-label",
    "doc-number",
    "doc-date-label",
    "doc-date",
    "header-separator",
    "bismillah"
  ];
  const blocks: TemplateBlock[] = [
    block("logo-left", { type: "logo", x: 16, y: 10, width: 24, height: 24, locked: true, src: "", style: { borderWidth: 0 } }),
    block("header-title", { type: "text", x: 48, y: 8, width: 114, height: 25, locked: true, content: shellTitle(config.shellPreset), style: { fontSize: 12, fontWeight: "700", textAlign: "center" } }),
    block("logo-right", { type: "logo", x: 170, y: 10, width: 24, height: 24, locked: true, src: "", style: { borderWidth: 0 } }),
    block("header-staff-unit", { type: "dynamic_field", x: 48, y: 34, width: 114, height: 9, locked: true, field: headerTemplateField, maxLines: 3, minFontSize: 7, placeholder: "Faculty, department, office, or position", reflowBelow: true, style: { fontSize: 9, fontWeight: "700", lineHeight: 1.35, textAlign: "center", borderWidth: 0 } }),
    block("doc-number-label", { type: "text", x: 166, y: 44, width: 16, height: 7, locked: true, content: "شماره:", style: { fontSize: 9, fontWeight: "700", textAlign: "right" } }),
    block("doc-number", { type: "dynamic_field", x: 112, y: 44, width: 52, height: 7, locked: true, field: "document.official_serial", style: { fontSize: 9, textAlign: "right" } }),
    block("doc-date-label", { type: "text", x: 80, y: 44, width: 16, height: 7, locked: true, content: "تاریخ:", style: { fontSize: 9, fontWeight: "700", textAlign: "right" } }),
    block("doc-date", { type: "dynamic_field", x: 20, y: 44, width: 58, height: 7, locked: true, field: "document.date.shamsi", style: { fontSize: 9, textAlign: "right" } }),
    block("header-separator", { type: "line", x: 16, y: 54, width: 178, height: 1, locked: true, style: { borderWidth: 1, borderColor: "#0f172a" } }),
    block("bismillah", { type: "text", x: 72, y: 58, width: 66, height: 11, locked: true, content: "بسم الله الرحمن الرحیم", style: { fontSize: 13, fontWeight: "700", textAlign: "center" } })
  ];

  let y = 74;
  if (config.sections.recipient) {
    blocks.push(block("recipient", { type: "text", x: 24, y, width: 162, height: 10, content: "به مقام محترم / اداره مربوط", style: { fontSize: 11, fontWeight: "700", textAlign: "start" } }));
    y += 12;
  }

  if (config.sections.greeting) {
    blocks.push(block("greeting", { type: "text", x: 24, y, width: 162, height: 9, content: "السلام علیکم و رحمت الله و برکاته", style: { fontSize: 10, textAlign: "start" } }));
    y += 12;
  }

  if (config.sections.subject) {
    blocks.push(block("subject-label", { type: "text", x: 158, y, width: 24, height: 9, locked: true, content: "موضوع:", style: { fontSize: 11, fontWeight: "700", textAlign: "right" } }));
    blocks.push(block("subject", { type: "dynamic_field", x: 24, y, width: 132, height: 10, field: "document.subject", style: { fontSize: 11, fontWeight: "700", textAlign: "right" } }));
    lockedBlockIds.push("subject-label");
    y += 14;
  }

  if (config.sections.body) {
    const bodyHeight = config.documentFamily === "pishnehadiya" ? 82 : config.documentFamily === "elam" ? 96 : 88;
    blocks.push(block("body", { type: "dynamic_field", x: 26, y, width: 158, height: bodyHeight, field: "document.body", pageScope: "all", style: { fontSize: 11, textAlign: "start" } }));
    y += bodyHeight + 8;
  }

  if (config.sections.closing) {
    blocks.push(block("closing", { type: "text", x: 26, y, width: 158, height: 10, content: "با احترام", style: { fontSize: 10, textAlign: "start" } }));
    y += 14;
  }

  if (config.sections.signature) {
    const signatureWidth = config.signatureLayout === "single" ? 96 : 138;
    const signatureX = config.signatureLayout === "single" ? 57 : 36;
    const signatureHeight = config.signatureLayout === "single" ? 40 : 54;
    blocks.push(block("signature", { type: "signature_zone", x: signatureX, y: Math.min(y, 198), width: signatureWidth, height: signatureHeight, mode: "completed", limit: config.signatureLayout === "single" ? 1 : 5, pageScope: "last", style: { fontSize: 8, textAlign: "center" } }));
  }

  if (config.sections.cc) {
    blocks.push(block("cc", { type: "cc_list", x: 24, y: 242, width: 112, height: 18, content: "کاپی ها:\n- مرجع مربوط\n- آرشیف", style: { fontSize: 8, textAlign: "start" } }));
  }

  if (config.sections.qr) {
    blocks.push(block("qr", { type: "qr", x: 164, y: 238, width: 20, height: 20, style: { fontSize: 7, textAlign: "center" } }));
  }

  if (config.sections.footer) {
    blocks.push(block("footer-line", { type: "line", x: 16, y: 268, width: 178, height: 1, locked: true, pageScope: "all", style: { borderWidth: 1, borderColor: "#0f172a" } }));
    blocks.push(block("footer", { type: "text", x: 20, y: 272, width: 170, height: 8, locked: true, content: "آدرس: مزار شریف، پوهنتون بلخ | تلفن | ایمیل | وب سایت", pageScope: "all", style: { fontSize: 8, textAlign: "center" } }));
    lockedBlockIds.push("footer-line", "footer");
  }

  return {
    page: {
      widthMm: 210,
      heightMm: 297,
      direction: "rtl",
      backgroundColor: "#ffffff",
      marginTopMm: 14,
      marginRightMm: 16,
      marginBottomMm: 14,
      marginLeftMm: 16
    },
    blocks,
    meta: {
      documentFamily: config.documentFamily,
      shellPreset: config.shellPreset,
      sections: config.sections,
      signatureLayout: config.signatureLayout,
      lockedBlockIds
    }
  };
}

export async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function roundMm(value: number) {
  return Math.round(value * 10) / 10;
}

export function latestEditableVersion(detail: DocumentTemplateDetail | null) {
  return detail?.versions.find((version) => ["draft", "rejected"].includes(version.status))
    || detail?.versions.find((version) => version.status === "submitted")
    || detail?.versions.find((version) => version.status === "active")
    || detail?.versions[0]
    || null;
}

export function activeLayout(detail: DocumentTemplateDetail | null) {
  return safeLayout(latestEditableVersion(detail)?.layout_definition);
}
