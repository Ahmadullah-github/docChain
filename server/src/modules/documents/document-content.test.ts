import { describe, expect, it } from "vitest";
import { documentContentToPlainText, normalizeDocumentContent } from "./document-content";

describe("document content normalization", () => {
  it("derives plain body text from TipTap JSON", () => {
    const content = normalizeDocumentContent({
      version: 1,
      body: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "First paragraph" }] },
          { type: "paragraph", content: [{ type: "text", text: "Second paragraph" }] }
        ]
      }
    });

    expect(documentContentToPlainText(content)).toBe("First paragraph\nSecond paragraph");
  });

  it("creates TipTap content from legacy body text", () => {
    const content = normalizeDocumentContent(undefined, { body: "Legacy body", subject: "Subject", date: "2026-05-06" });

    expect(content.version).toBe(1);
    expect(content.metadata.subject).toBe("Subject");
    expect(documentContentToPlainText(content)).toBe("Legacy body");
  });

  it("normalizes template fields and bounded staff free blocks", () => {
    const content = normalizeDocumentContent({
      templateFields: { header_unit: "Line one\r\nLine two", unsafe: 12 },
      freeBlocks: [{ id: "free", page: 999, x: -10, y: 500, width: 500, height: 0, content: { type: "doc" } }]
    });

    expect(content.templateFields).toEqual({ header_unit: "Line one\nLine two" });
    expect(content.freeBlocks[0]).toMatchObject({ page: 100, x: 0, y: 297, width: 210, height: 4 });
  });
});
