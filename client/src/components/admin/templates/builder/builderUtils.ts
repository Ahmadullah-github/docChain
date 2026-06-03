import type { PreviewScenario } from "./types";

export const a4Width = 210;
export const a4Height = 297;
export const defaultBuilderRailWidth = 320;
export const minBuilderRailWidth = 280;
export const maxBuilderRailWidth = 420;
export const minBuilderCanvasWidth = 360;
export const builderRailWidthStorageKey = "docchain.templateBuilder.railWidth";
export const templateLogoLimit = 10;
export const maxTemplateLogoBytes = 2 * 1024 * 1024;
export const allowedTemplateLogoMimeTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
export const quickFontSizes = [8, 10, 12, 14, 18];
export const quickTextColors = ["#111827", "#061d49", "#dc2626", "#047857", "#7c3aed"];
export const quickFillColors = ["transparent", "#ffffff", "#f8fafc", "#fef3c7", "#dbeafe"];
export const dateDynamicFields = [
  "document.date.gregorian",
  "document.date.shamsi",
  "document.date.hijri"
];
export const templateFieldPrefix = "document.template.";
export const headerTemplateField = `${templateFieldPrefix}header_unit`;
export const commonDynamicFields = [
  headerTemplateField,
  "document.subject",
  "document.body",
  "document.official_serial",
  ...dateDynamicFields,
  "document.date",
  "origin_unit.name",
  "serial.value"
];

export const dynamicFieldLabels: Record<string, string> = {
  "document.date": "Date SH legacy",
  "document.date.gregorian": "Date AD",
  "document.date.shamsi": "Date SH",
  "document.date.hijri": "Date HI",
  [headerTemplateField]: "Staff header"
};

export const previewDateFieldValues = {
  "document.date": "۱۴۰۵/۲/۱۵",
  "document.date.gregorian": "2026/5/5",
  "document.date.shamsi": "۱۴۰۵/۲/۱۵",
  "document.date.hijri": "۱۴۴۷/۱۱/۱۸"
};

export const scenarioValues: Record<PreviewScenario, Record<string, string>> = {
  standard: {
    [headerTemplateField]: "پوهنځی کمپیوتر ساینس",
    "document.subject": "موضوع: مکتوب رسمی نمونه",
    "document.body": "این متن نمونه برای پیش نمایش قالب رسمی سند است. متن اصلی سند در زمان تولید از محتوای واقعی جایگزین می شود.",
    "document.summary": "خلاصه سند نمونه",
    "document.internal_reference": "DOC-20260426-0001",
    "document.official_serial": "DOC-2026-000001",
    ...previewDateFieldValues,
    "document.document_type": "Official Letter",
    "document.confidentiality": "Normal",
    "origin_unit.name": "Faculty of Computer Science",
    "owner_unit.name": "Department of Software Engineering",
    "holder_unit.name": "Rector Office",
    "signature.final.position": "President",
    "signature.final.unit": "University",
    "serial.value": "DOC-2026-000001",
    "page.number": "1"
  },
  longBody: {
    [headerTemplateField]: "پوهنځی کمپیوتر ساینس\nدیپارتمنت انجنیری نرم افزار",
    "document.subject": "موضوع: درخواست رسمی جهت بررسی اسناد اداری",
    "document.body": "این متن طولانی نمونه برای بررسی رفتار قالب در حالت محتوای زیاد استفاده می شود. هدف این است که مسئول سیستم قبل از نشر قالب بداند بخش متن اصلی، امضاها، کاپی ها و پاورقی چگونه در صفحه رسمی دیده می شوند.\n\nدر اسناد واقعی پوهنتون بلخ، محتوای نامه ممکن است چند پاراگراف داشته باشد و باید بدون برهم زدن هدر رسمی و ساحه امضا قابل خواندن باقی بماند.",
    "document.summary": "پیش نمایش متن طولانی",
    "document.internal_reference": "DOC-20260426-0002",
    "document.official_serial": "DOC-2026-000002",
    ...previewDateFieldValues,
    "document.document_type": "Official Letter",
    "document.confidentiality": "Normal",
    "origin_unit.name": "Faculty of Computer Science",
    "owner_unit.name": "Department of Software Engineering",
    "holder_unit.name": "Rector Office",
    "signature.final.position": "Dean",
    "signature.final.unit": "Faculty",
    "serial.value": "DOC-2026-000002",
    "page.number": "1"
  },
  threeSignatures: {
    [headerTemplateField]: "کمیته اداری و علمی",
    "document.subject": "موضوع: پیشنهادیه کمیته",
    "document.body": "این نمونه برای نمایش چند امضا در زنجیره تایید استفاده می شود.",
    "document.summary": "سه امضا",
    "document.internal_reference": "DOC-20260426-0003",
    "document.official_serial": "DOC-2026-000003",
    ...previewDateFieldValues,
    "document.document_type": "Proposal",
    "document.confidentiality": "Internal",
    "origin_unit.name": "Committee",
    "owner_unit.name": "Rector Office",
    "holder_unit.name": "Rector Office",
    "signature.final.position": "Committee Chair",
    "signature.final.unit": "University",
    "serial.value": "DOC-2026-000003",
    "page.number": "1"
  },
  withCc: {
    [headerTemplateField]: "آمریت روابط عامه",
    "document.subject": "موضوع: اعلامیه رسمی",
    "document.body": "این نمونه بخش کاپی ها و یادداشت پایانی را فعال نشان می دهد.",
    "document.summary": "با کاپی ها",
    "document.internal_reference": "DOC-20260426-0004",
    "document.official_serial": "DOC-2026-000004",
    ...previewDateFieldValues,
    "document.document_type": "Announcement",
    "document.confidentiality": "Normal",
    "origin_unit.name": "Rector Office",
    "owner_unit.name": "Public Relations",
    "holder_unit.name": "Public Relations",
    "signature.final.position": "Rector",
    "signature.final.unit": "University",
    "serial.value": "DOC-2026-000004",
    "page.number": "1"
  }
};
