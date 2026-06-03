import { createHash } from "node:crypto";

type DocumentHashSource = Record<string, unknown>;

function parseJsonColumn(value: unknown) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return dateOnly ? dateOnly[1] : raw;
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, stableValue(record[key])])
    );
  }

  return value ?? null;
}

export function canonicalDocumentHashPayload(document: DocumentHashSource) {
  return stableValue({
    body: document.body ?? "",
    confidentialityLevelId: document.confidentiality_level_id ?? document.confidentialityLevelId ?? null,
    currentVersionNumber: Number(document.current_version_number ?? document.currentVersionNumber ?? document.version_number ?? 1),
    documentContent: parseJsonColumn(document.document_content ?? document.documentContent ?? null),
    documentDate: normalizeDate(document.document_date ?? document.documentDate ?? null),
    documentTypeId: document.document_type_id ?? document.documentTypeId ?? null,
    priorityLevelId: document.priority_level_id ?? document.priorityLevelId ?? null,
    subject: document.subject ?? "",
    summary: document.summary ?? "",
    templateFields: parseJsonColumn(document.template_fields ?? document.templateFields ?? null)
  });
}

export function calculateDocumentContentHash(document: DocumentHashSource) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalDocumentHashPayload(document)))
    .digest("hex");
}
