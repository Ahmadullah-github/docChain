export type TipTapMark = {
  type: string;
  attrs?: Record<string, unknown> | null;
};

export type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown> | null;
  content?: TipTapNode[];
  marks?: TipTapMark[];
  text?: string;
};

export type DocumentFreeBlock = {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  content: TipTapNode;
  locked?: boolean;
};

export type DocumentContent = {
  version: 1;
  body: TipTapNode;
  templateFields: Record<string, string>;
  freeBlocks: DocumentFreeBlock[];
  pagination: {
    mode: "auto";
    manualBreaks: true;
  };
  metadata: {
    subject?: string;
    topic?: string;
    subTopic?: string;
    summary?: string;
    date?: string | null;
    pageNumberMode?: "system" | "manual";
    pageNumberStart?: number;
    signatureVisibility?: Record<string, boolean>;
  };
};

const maxTextLength = 200_000;
const maxNodeDepth = 16;
const maxChildrenPerNode = 500;

function recordValue(value: unknown): Record<string, unknown> {
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

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeType(value: unknown, fallback: string) {
  const type = stringValue(value).trim();
  return /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(type) ? type : fallback;
}

function normalizeAttrs(value: unknown) {
  const attrs = recordValue(value);
  return Object.fromEntries(
    Object.entries(attrs)
      .filter(([, item]) => item === null || ["boolean", "number", "string"].includes(typeof item))
      .slice(0, 40)
  );
}

function normalizeMarks(value: unknown): TipTapMark[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const marks = value
    .slice(0, 16)
    .map((item) => recordValue(item))
    .map((item) => ({
      type: safeType(item.type, ""),
      attrs: Object.keys(normalizeAttrs(item.attrs)).length ? normalizeAttrs(item.attrs) : undefined
    }))
    .filter((item) => item.type);
  return marks.length ? marks : undefined;
}

function normalizeTipTapNode(value: unknown, fallbackType = "doc", depth = 0): TipTapNode {
  const record = recordValue(value);
  const type = safeType(record.type, fallbackType);
  const node: TipTapNode = { type };
  const attrs = normalizeAttrs(record.attrs);
  if (Object.keys(attrs).length) {
    node.attrs = attrs;
  }
  const marks = normalizeMarks(record.marks);
  if (marks) {
    node.marks = marks;
  }
  if (typeof record.text === "string") {
    node.text = record.text.slice(0, maxTextLength);
  }
  if (depth < maxNodeDepth && Array.isArray(record.content)) {
    node.content = record.content
      .slice(0, maxChildrenPerNode)
      .map((child) => normalizeTipTapNode(child, "paragraph", depth + 1));
  }
  if (node.type === "doc" && (!node.content || !node.content.length)) {
    node.content = [{ type: "paragraph" }];
  }
  return node;
}

export function tipTapDocFromPlainText(value: unknown): TipTapNode {
  const text = stringValue(value).replace(/\r\n?/g, "\n").slice(0, maxTextLength);
  const paragraphs = text
    ? text.split(/\n{2,}/).map((paragraph) => ({
      type: "paragraph",
      content: paragraph.split("\n").flatMap((line, index) => {
        const nodes: TipTapNode[] = [];
        if (index > 0) {
          nodes.push({ type: "hardBreak" });
        }
        if (line) {
          nodes.push({ type: "text", text: line });
        }
        return nodes;
      })
    }))
    : [{ type: "paragraph" }];
  return { type: "doc", content: paragraphs };
}

export function normalizeTemplateFieldRecord(value: unknown) {
  const source = recordValue(value);
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key, item]) => /^[a-zA-Z0-9_.-]{1,80}$/.test(key) && typeof item === "string")
      .map(([key, item]) => [key, String(item).replace(/\r\n?/g, "\n").trimEnd().slice(0, 500)])
      .filter(([, item]) => item)
  );
}

function normalizeFreeBlocks(value: unknown): DocumentFreeBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 40).map((item, index) => {
    const block = recordValue(item);
    return {
      id: stringValue(block.id, `free-${index + 1}`).slice(0, 80),
      page: Math.max(1, Math.min(100, Math.round(numberValue(block.page, 1)))),
      x: Math.max(0, Math.min(210, numberValue(block.x, 20))),
      y: Math.max(0, Math.min(297, numberValue(block.y, 40))),
      width: Math.max(8, Math.min(210, numberValue(block.width, 80))),
      height: Math.max(4, Math.min(297, numberValue(block.height, 20))),
      content: normalizeTipTapNode(block.content, "doc"),
      locked: block.locked === true
    };
  });
}

function normalizeMetadata(value: unknown, fallback?: { date?: string | null; subject?: string; summary?: string | null }) {
  const metadata = recordValue(value);
  const signatureVisibility: Record<string, boolean> = Object.fromEntries(
    Object.entries(recordValue(metadata.signatureVisibility))
      .filter((entry): entry is [string, boolean] => /^[a-zA-Z0-9_.-]{1,80}$/.test(entry[0]) && typeof entry[1] === "boolean")
  );
  return {
    subject: stringValue(metadata.subject, fallback?.subject || "").trim().slice(0, 255) || undefined,
    topic: stringValue(metadata.topic).trim().slice(0, 255) || undefined,
    subTopic: stringValue(metadata.subTopic).trim().slice(0, 255) || undefined,
    summary: stringValue(metadata.summary, fallback?.summary || "").trim().slice(0, 1000) || undefined,
    date: typeof metadata.date === "string" ? metadata.date.slice(0, 20) : fallback?.date || null,
    pageNumberMode: metadata.pageNumberMode === "manual" ? "manual" as const : "system" as const,
    pageNumberStart: Math.max(1, Math.min(9999, Math.round(numberValue(metadata.pageNumberStart, 1)))),
    signatureVisibility: Object.keys(signatureVisibility).length ? signatureVisibility : undefined
  };
}

export function normalizeDocumentContent(
  value: unknown,
  fallback?: { body?: string; date?: string | null; subject?: string; summary?: string | null; templateFields?: Record<string, string> }
): DocumentContent {
  const source = recordValue(value);
  const candidateBody = recordValue(source.body);
  const body = candidateBody.type ? normalizeTipTapNode(candidateBody, "doc") : tipTapDocFromPlainText(fallback?.body || "");
  const sourceTemplateFields = normalizeTemplateFieldRecord(source.templateFields);
  const fallbackTemplateFields = normalizeTemplateFieldRecord(fallback?.templateFields);
  return {
    version: 1,
    body,
    templateFields: { ...fallbackTemplateFields, ...sourceTemplateFields },
    freeBlocks: normalizeFreeBlocks(source.freeBlocks),
    pagination: { mode: "auto", manualBreaks: true },
    metadata: normalizeMetadata(source.metadata, fallback)
  };
}

function plainTextForNode(node: TipTapNode): string {
  if (node.type === "text") {
    return node.text || "";
  }
  if (node.type === "hardBreak") {
    return "\n";
  }
  if (node.type === "horizontalRule") {
    return "\n\n";
  }
  const children = (node.content || []).map((child) => plainTextForNode(child)).join("");
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

export function documentContentToPlainText(content: DocumentContent | unknown) {
  const normalized = normalizeDocumentContent(content);
  return plainTextForNode(normalized.body)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
