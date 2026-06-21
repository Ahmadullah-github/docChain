import { describe, expect, it } from "vitest";
import type { TemplateLayout } from "../../../api";
import { stripInlineTablesFromWordLayout } from "./wordTemplateModel";

describe("word template table cleanup", () => {
  it("removes inline tables and their content while preserving surrounding text", () => {
    const layout = {
      mode: "word_template",
      schemaVersion: 2,
      page: { widthMm: 210, heightMm: 297, direction: "rtl" },
      blocks: [],
      document: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Before" }] },
          {
            type: "table",
            content: [{
              type: "tableRow",
              content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Delete me" }] }] }]
            }]
          },
          { type: "paragraph", content: [{ type: "text", text: "After" }] }
        ]
      }
    } as TemplateLayout;

    const result = stripInlineTablesFromWordLayout(layout);
    expect(result.removedTableCount).toBe(1);
    expect(JSON.stringify(result.layout.document)).not.toContain("Delete me");
    expect(JSON.stringify(result.layout.document)).toContain("Before");
    expect(JSON.stringify(result.layout.document)).toContain("After");
  });
});
