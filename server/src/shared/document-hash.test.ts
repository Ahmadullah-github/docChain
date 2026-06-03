import { describe, expect, it } from "vitest";
import { calculateDocumentContentHash } from "./document-hash";

describe("document content hash", () => {
  const document = {
    body: "Body",
    confidentiality_level_id: 1,
    current_version_number: 2,
    document_content: { body: { type: "doc", content: [{ type: "paragraph" }] }, templateFields: { a: "b" } },
    document_date: "2026-05-05",
    document_type_id: 3,
    priority_level_id: 4,
    subject: "Subject",
    summary: "Summary",
    template_fields: { header: "Value" }
  };

  it("is stable for equivalent object key ordering", () => {
    expect(calculateDocumentContentHash(document)).toBe(calculateDocumentContentHash({
      ...document,
      document_content: { templateFields: { a: "b" }, body: { content: [{ type: "paragraph" }], type: "doc" } },
      template_fields: { header: "Value" }
    }));
  });

  it("changes when material content changes", () => {
    expect(calculateDocumentContentHash(document)).not.toBe(calculateDocumentContentHash({
      ...document,
      body: "Changed body"
    }));
  });

  it("changes when version changes", () => {
    expect(calculateDocumentContentHash(document)).not.toBe(calculateDocumentContentHash({
      ...document,
      current_version_number: 3
    }));
  });
});
