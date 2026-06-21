import { describe, expect, it } from "vitest";
import { renderTemplateHtml } from "./template-renderer";

describe("floating rich table rendering", () => {
  it("renders rich marks, resolves tokens, and escapes cell text", () => {
    const html = renderTemplateHtml({
      mode: "word_template",
      schemaVersion: 2,
      page: { widthMm: 210, heightMm: 297, direction: "rtl" },
      document: { type: "doc", content: [{ type: "paragraph" }] },
      blocks: [{
        id: "table-1",
        type: "table",
        x: 20,
        y: 30,
        width: 100,
        height: 30,
        headerRow: true,
        rows: [[{
          content: "legacy fallback",
          richContent: {
            type: "doc",
            content: [{
              type: "paragraph",
              content: [{
                type: "text",
                text: "{{zone:subject}} <unsafe>",
                marks: [{ type: "bold" }]
              }]
            }]
          }
        }]]
      }]
    } as any, {
      document: {
        subject: "Approved subject",
        document_content: {
          version: 1,
          body: { type: "doc", content: [{ type: "paragraph" }] },
          templateFields: {},
          freeBlocks: [],
          pagination: { mode: "auto", manualBreaks: true },
          metadata: {}
        }
      },
      signatureEvents: [],
      workflowEvents: []
    } as any);

    expect(html).toContain('<div class="dc-table-cell-content">');
    expect(html).toContain('<strong><span data-dc-live-field="subject">Approved subject</span> &lt;unsafe&gt;</strong>');
    expect(html).not.toContain("legacy fallback");
    expect(html).not.toContain("<unsafe>");
  });
});
