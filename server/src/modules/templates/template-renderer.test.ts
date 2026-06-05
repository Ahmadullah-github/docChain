import { describe, expect, it } from "vitest";
import { formatTemplateDocumentDate, renderTemplateHtml } from "./template-renderer";
import type { TemplateLayout } from "./template-renderer";

const emptyContext = {
  document: {},
  serialAssignment: null,
  signatureEvents: [],
  workflowEvents: []
};

function renderBlockStyle(textAlign: string, direction: "ltr" | "rtl") {
  const layout: TemplateLayout = {
    page: { direction },
    blocks: [
      {
        id: "sample",
        type: "text",
        x: 10,
        y: 10,
        width: 40,
        height: 10,
        content: "Sample",
        style: { textAlign }
      }
    ]
  };

  const match = renderTemplateHtml(layout, emptyContext).match(/<div class="dc-block" style="([^"]+)">Sample<\/div>/);
  return match?.[1] || "";
}

function renderTableCellStyle(textAlign: string, direction: "ltr" | "rtl") {
  const layout: TemplateLayout = {
    page: { direction },
    blocks: [
      {
        id: "table",
        type: "table",
        x: 10,
        y: 10,
        width: 40,
        height: 10,
        rows: [["Cell"]],
        style: { textAlign }
      }
    ]
  };

  const match = renderTemplateHtml(layout, emptyContext).match(/<td style="([^"]+)">Cell<\/td>/);
  return match?.[1] || "";
}

function renderDynamicField(field: string, document: Record<string, unknown> = { document_date: "2026-05-05", created_at: "2024-01-01T00:00:00.000Z" }) {
  const layout: TemplateLayout = {
    page: { direction: "rtl" },
    blocks: [
      {
        id: "date",
        type: "dynamic_field",
        x: 10,
        y: 10,
        width: 40,
        height: 10,
        field,
        style: { textAlign: "right" }
      }
    ]
  };

  return renderTemplateHtml(layout, { ...emptyContext, document });
}

function renderTable(rows: unknown[][], extraBlock: Record<string, unknown> = {}, context = emptyContext) {
  const layout: TemplateLayout = {
    page: { direction: "rtl" },
    blocks: [
      {
        id: "table",
        type: "table",
        x: 10,
        y: 10,
        width: 80,
        height: 20,
        rows,
        ...extraBlock,
        style: { borderColor: "#123456", borderWidth: 2, fontSize: 8, textAlign: "right", ...((extraBlock.style as Record<string, unknown> | undefined) || {}) }
      }
    ]
  };

  return renderTemplateHtml(layout, context);
}

function occurrenceCount(value: string, token: string) {
  return value.split(token).length - 1;
}

describe("template renderer alignment", () => {
  it("renders physical right on RTL pages", () => {
    expect(renderBlockStyle("right", "rtl")).toContain("text-align:right");
  });

  it("resolves legacy start to right on RTL pages", () => {
    expect(renderBlockStyle("start", "rtl")).toContain("text-align:right");
  });

  it("resolves legacy end to left on RTL pages", () => {
    expect(renderBlockStyle("end", "rtl")).toContain("text-align:left");
  });

  it("keeps physical left and right on LTR pages", () => {
    expect(renderBlockStyle("left", "ltr")).toContain("text-align:left");
    expect(renderBlockStyle("right", "ltr")).toContain("text-align:right");
  });

  it("normalizes table cell alignment with the same rules", () => {
    expect(renderTableCellStyle("start", "rtl")).toContain("text-align:right");
    expect(renderTableCellStyle("end", "rtl")).toContain("text-align:left");
  });

  it("renders line blocks as empty strokes", () => {
    const html = renderTemplateHtml({
      page: { direction: "rtl" },
      blocks: [
        {
          id: "line",
          type: "line",
          x: 10,
          y: 10,
          width: 80,
          height: 1,
          content: "line",
          style: { borderWidth: 2, borderColor: "#0f172a" }
        }
      ]
    }, emptyContext);

    expect(html).toContain("border-top:2px solid #0f172a");
    expect(html).not.toContain(">line</div>");
  });
});

describe("template renderer document dates", () => {
  it("formats Gregorian document dates with Latin digits", () => {
    expect(formatTemplateDocumentDate("2026-05-05", "gregorian")).toBe("2026/5/5");
  });

  it("formats Shamsi document dates with Persian digits", () => {
    expect(formatTemplateDocumentDate("2026-05-05", "shamsi")).toBe("۱۴۰۵/۲/۱۵");
  });

  it("formats Hijri document dates with Persian digits", () => {
    expect(formatTemplateDocumentDate("2026-05-05", "hijri")).toBe("۱۴۴۷/۱۱/۱۸");
  });

  it("renders all calendar dynamic fields from document_date", () => {
    expect(renderDynamicField("document.date.gregorian")).toContain(">2026/5/5</div>");
    expect(renderDynamicField("document.date.shamsi")).toContain(">۱۴۰۵/۲/۱۵</div>");
    expect(renderDynamicField("document.date.hijri")).toContain(">۱۴۴۷/۱۱/۱۸</div>");
  });

  it("marks dynamic date fields for live preview updates", () => {
    expect(renderDynamicField("document.date.gregorian")).toContain('data-dc-live-field="date" data-dc-date-calendar="gregorian"');
    expect(renderDynamicField("document.date.shamsi")).toContain('data-dc-live-field="date" data-dc-date-calendar="shamsi"');
    expect(renderDynamicField("document.date.hijri")).toContain('data-dc-live-field="date" data-dc-date-calendar="hijri"');
    expect(renderDynamicField("document.date")).toContain('data-dc-live-field="date" data-dc-date-calendar="shamsi"');
  });

  it("keeps legacy document.date as the Shamsi alias", () => {
    expect(renderDynamicField("document.date")).toContain(">۱۴۰۵/۲/۱۵</div>");
  });

  it("falls back to created_at when document_date is missing", () => {
    expect(renderDynamicField("document.date.gregorian", { created_at: "2026-05-05T00:00:00.000Z" })).toContain(">2026/5/5</div>");
  });
});

describe("template renderer fillable template fields", () => {
  it("resolves document template field values", () => {
    const html = renderDynamicField("document.template.header_unit", {
      template_fields: { header_unit: "پوهنځی کمپیوتر ساینس" }
    });

    expect(html).toContain(">پوهنځی کمپیوتر ساینس</div>");
    expect(html).toContain('data-dc-live-field="template.header_unit"');
  });

  it("marks subject and body dynamic fields for live preview updates", () => {
    expect(renderDynamicField("document.subject", { subject: "Live subject" })).toContain('data-dc-live-field="subject"');
    expect(renderDynamicField("document.body", { body: "Live body" })).toContain('data-dc-live-field="body"');
  });

  it("moves lower blocks when a fillable header grows", () => {
    const layout: TemplateLayout = {
      page: { direction: "rtl" },
      blocks: [
        {
          id: "header-unit",
          type: "dynamic_field",
          x: 50,
          y: 10,
          width: 50,
          height: 6,
          field: "document.template.header_unit",
          maxLines: 3,
          minFontSize: 8,
          reflowBelow: true,
          style: { fontSize: 10, lineHeight: 1.35, textAlign: "center" }
        },
        {
          id: "line",
          type: "line",
          x: 10,
          y: 20,
          width: 80,
          height: 1,
          style: { borderWidth: 1, borderColor: "#0f172a" }
        }
      ]
    };
    const html = renderTemplateHtml(layout, {
      ...emptyContext,
      document: { template_fields: { header_unit: "Line one\nLine two\nLine three" } }
    });
    const lineTop = Number(html.match(/top:([0-9.]+)mm;width:80mm/)?.[1] || 20);

    expect(lineTop).toBeGreaterThan(20);
  });
});

describe("template renderer word templates", () => {
  const wordLayout: TemplateLayout = {
    mode: "word_template",
    schemaVersion: 2,
    page: { direction: "rtl", widthMm: 210, heightMm: 297 },
    blocks: [],
    zones: [
      { id: "subject", key: "subject", label: "Subject", kind: "subject" },
      { id: "body", key: "body", label: "Body", kind: "body" },
      { id: "recipient", key: "recipient", label: "Recipient", kind: "recipient" },
      { id: "custom", key: "custom_field", label: "Custom Field", kind: "custom" }
    ],
    document: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "شماره: {{system:official_serial}}" }] },
        { type: "paragraph", content: [{ type: "text", text: "تاریخ: {{date:shamsi}}" }] },
        { type: "paragraph", content: [{ type: "text", text: "به {{zone:recipient}}" }] },
        { type: "paragraph", content: [{ type: "text", text: "موضوع: {{zone:subject}}" }] },
        { type: "paragraph", content: [{ type: "text", text: "{{zone:body}}" }] },
        { type: "paragraph", content: [{ type: "text", text: "custom={{zone:custom_field}}" }] },
        { type: "paragraph", content: [{ type: "text", text: "{{signature:completed}}" }] }
      ]
    }
  };

  it("replaces word-template zones, system tokens, and rich body content", () => {
    const html = renderTemplateHtml(wordLayout, {
      ...emptyContext,
      serialAssignment: { serial_value: "DOC-2026-0001" },
      document: {
        document_date: "2026-05-05",
        subject: "موضوع واقعی",
        template_fields: {
          recipient: "اداره محترم",
          custom_field: "ارزش اختصاصی"
        },
        document_content: {
          version: 1,
          body: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "متن غنی سند" }] }
            ]
          },
          templateFields: {
            recipient: "اداره محترم",
            custom_field: "ارزش اختصاصی"
          },
          freeBlocks: [],
          pagination: { mode: "auto", manualBreaks: true },
          metadata: {}
        }
      }
    });

    expect(html).toContain("DOC-2026-0001");
    expect(html).toContain("۱۴۰۵/۲/۱۵");
    expect(html).toContain("اداره محترم");
    expect(html).toContain("موضوع واقعی");
    expect(html).toContain("متن غنی سند");
    expect(html).toContain("ارزش اختصاصی");
    expect(html).toContain('data-dc-live-field="date"');
    expect(html).toContain('data-dc-date-calendar="shamsi"');
    expect(html).toContain('data-dc-live-field="template.recipient"');
    expect(html).toContain('data-dc-live-field="subject"');
    expect(html).toContain('data-dc-live-field="body"');
    expect(html).toContain('data-dc-live-field="template.custom_field"');
    expect(html).not.toContain("{{zone:");
  });

  it("renders inline image dimensions and absolute floating blocks in word templates", () => {
    const html = renderTemplateHtml({
      ...wordLayout,
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "image",
                attrs: {
                  align: "center",
                  alt: "logo",
                  height: 80,
                  src: "data:image/png;base64,abc",
                  width: 120
                }
              }
            ]
          }
        ]
      },
      blocks: [
        { id: "float-image", type: "image", x: 12, y: 16, width: 22, height: 22, src: "data:image/png;base64,abc", style: { borderWidth: 0 } },
        { id: "float-table", type: "table", x: 30, y: 52, width: 82, height: 26, headerRow: true, rows: [["H1", "H2"], ["{{document.subject}}", "B"]], style: { borderWidth: 1 } },
        { id: "float-field", type: "dynamic_field", x: 34, y: 88, width: 70, height: 12, field: "document.official_serial", style: { fontSize: 11 } },
        { id: "float-sign", type: "signature_zone", x: 60, y: 210, width: 76, height: 34, mode: "completed", style: { borderWidth: 0 } }
      ]
    }, {
      ...emptyContext,
      serialAssignment: { serial_value: "DOC-2026-77" },
      document: { subject: "Floating Subject" }
    });

    expect(html).toContain("width=\"120\"");
    expect(html).toContain("height=\"80\"");
    expect(html).toContain("margin-inline:auto");
    expect(html).toContain("dc-word-floating-layer");
    expect(html).toContain("left:12mm");
    const floatingImageStyle = html.match(/<div class="dc-block dc-image" style="([^"]+)"><img/)?.[1] || "";
    expect(floatingImageStyle).toContain("width:22mm");
    expect(floatingImageStyle).toContain("height:22mm");
    expect(floatingImageStyle).not.toContain("min-height:22mm");
    expect(html).toContain(".dc-word-floating-layer .dc-image img { width: 100%; height: 100%;");
    expect(html).toContain("Floating Subject");
    expect(html).toContain("DOC-2026-77");
    expect(html).toContain("dc-endorsements");
  });

  it("renders inline word-template table column widths and row heights", () => {
    const html = renderTemplateHtml({
      ...wordLayout,
      document: {
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                attrs: { height: 42 },
                content: [
                  { type: "tableHeader", attrs: { colspan: 1, rowspan: 1, colwidth: [140] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Header 1" }] }] },
                  { type: "tableHeader", attrs: { colspan: 1, rowspan: 1, colwidth: [220] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Header 2" }] }] }
                ]
              },
              {
                type: "tableRow",
                attrs: { height: 56 },
                content: [
                  { type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: [140] }, content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] },
                  { type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: [220] }, content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] }
                ]
              }
            ]
          }
        ]
      }
    }, emptyContext);

    expect(html).toContain('<col style="width:140px" />');
    expect(html).toContain('<col style="width:220px" />');
    expect(html).toContain('style="height:42px"');
    expect(html).toContain('style="height:56px"');
  });
});

describe("template renderer tables", () => {
  it("renders header rows with fixed table styling", () => {
    const html = renderTable([["H1", "H2"], ["A", "B"]], { headerRow: true });

    expect(html).toContain("<th");
    expect(html).toContain("dc-table-block");
    expect(html).toContain("table-layout: fixed");
  });

  it("emits persisted column widths and row heights", () => {
    const html = renderTable([["A", "B"], ["C", "D"]], { columnWidths: [25, 75], rowHeights: [40, 60] });

    expect(html).toContain('<col style="width:25%">');
    expect(html).toContain('<col style="width:75%">');
    expect(html).toContain('<tr style="height:40%">');
    expect(html).toContain('<tr style="height:60%">');
  });

  it("falls back to equal grid sizes when saved sizes are missing", () => {
    const html = renderTable([["A", "B"], ["C", "D"]]);

    expect(html).toContain('<col style="width:50%">');
    expect(html).toContain('<tr style="height:50%">');
  });

  it("renders colSpan, rowSpan, and skips hidden cells", () => {
    const html = renderTable([
      [{ content: "Merged", colSpan: 2, rowSpan: 2 }, { content: "Hidden", hidden: true }],
      [{ content: "Hidden", hidden: true }, { content: "Hidden", hidden: true }]
    ]);

    expect(html).toContain('colspan="2"');
    expect(html).toContain('rowspan="2"');
    expect(html).not.toContain("Hidden");
  });

  it("lets cell style override table defaults", () => {
    const html = renderTable([[{ content: "Styled", style: { backgroundColor: "#ff0000", fontWeight: "700", textAlign: "left" } }]]);

    expect(html).toContain("background:#ff0000");
    expect(html).toContain("font-weight:700");
    expect(html).toContain("text-align:left");
  });

  it("keeps RTL/LTR physical alignment rules for table cells", () => {
    expect(renderTableCellStyle("right", "rtl")).toContain("text-align:right");
    expect(renderTableCellStyle("left", "ltr")).toContain("text-align:left");
  });

  it("resolves dynamic field tokens inside table cells", () => {
    const html = renderTable(
      [["Subject: {{document.subject}}"]],
      {},
      { ...emptyContext, document: { subject: "Token Subject" } }
    );

    expect(html).toContain("Subject: Token Subject");
  });

  it("escapes unsafe table cell content", () => {
    const html = renderTable([["<script>alert(1)</script>"]]);

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});

describe("template renderer rich staff document content", () => {
  it("renders TipTap paragraphs, marks, and tables from document_content", () => {
    const html = renderTemplateHtml({
      page: { direction: "rtl" },
      blocks: [
        { id: "body", type: "dynamic_field", x: 20, y: 40, width: 160, height: 160, field: "document.body" }
      ]
    }, {
      ...emptyContext,
      document: {
        document_content: {
          version: 1,
          body: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Bold", marks: [{ type: "bold" }] }] },
              {
                type: "table",
                content: [
                  { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Header" }] }] }] },
                  { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Cell" }] }] }] }
                ]
              }
            ]
          }
        }
      }
    });

    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain('<table class="dc-rich-table">');
    expect(html).toContain("<th><p>Header</p></th>");
    expect(html).toContain("<td><p>Cell</p></td>");
  });

  it("honors manual page breaks while keeping first-page header and all-page footer rules", () => {
    const html = renderTemplateHtml({
      page: { direction: "rtl" },
      blocks: [
        { id: "header-title", type: "text", x: 20, y: 10, width: 160, height: 10, content: "Official header" },
        { id: "body", type: "dynamic_field", x: 20, y: 40, width: 160, height: 160, field: "document.body" },
        { id: "footer-text", type: "text", x: 20, y: 270, width: 160, height: 10, content: "Official footer" }
      ]
    }, {
      ...emptyContext,
      document: {
        document_content: {
          version: 1,
          body: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Page one" }] },
              { type: "horizontalRule" },
              { type: "paragraph", content: [{ type: "text", text: "Page two" }] }
            ]
          }
        }
      }
    });

    expect(html).toContain('data-page="2"');
    expect(occurrenceCount(html, "Official header")).toBe(1);
    expect(occurrenceCount(html, "Official footer")).toBe(2);
    expect(html).toContain("Page one");
    expect(html).toContain("Page two");
  });

  it("renders page numbers per page", () => {
    const html = renderTemplateHtml({
      page: { direction: "rtl" },
      blocks: [
        { id: "body", type: "dynamic_field", x: 20, y: 40, width: 160, height: 160, field: "document.body" },
        { id: "footer-page", type: "page_number", x: 20, y: 270, width: 20, height: 8 }
      ]
    }, {
      ...emptyContext,
      document: {
        document_content: {
          version: 1,
          body: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Page one" }] },
              { type: "horizontalRule" },
              { type: "paragraph", content: [{ type: "text", text: "Page two" }] }
            ]
          }
        }
      }
    });

    expect(html).toContain(">1</div>");
    expect(html).toContain(">2</div>");
  });

  it("keeps serial blank in draft and renders assigned serial later", () => {
    const layout: TemplateLayout = {
      page: { direction: "rtl" },
      blocks: [
        { id: "serial", type: "dynamic_field", x: 20, y: 20, width: 60, height: 10, field: "document.official_serial" }
      ]
    };

    expect(renderTemplateHtml(layout, { ...emptyContext, document: { status: "draft" } })).not.toContain("SER-2026-1");
    expect(renderTemplateHtml(layout, { ...emptyContext, document: { status: "approved" }, serialAssignment: { serial_value: "SER-2026-1" } })).toContain(">SER-2026-1</div>");
  });

  it("applies signature visibility preferences during render", () => {
    const html = renderTemplateHtml({
      page: { direction: "rtl" },
      blocks: [
        { id: "signatures", type: "signature_zone", x: 20, y: 200, width: 160, height: 40, mode: "slots" }
      ]
    }, {
      ...emptyContext,
      signatureVisibility: { "event:2": false },
      signatureEvents: [
        { id: 1, signerPositionTitle: "Visible signer", signerUnitName: "Unit" },
        { id: 2, signerPositionTitle: "Hidden signer", signerUnitName: "Unit" }
      ] as any
    });

    expect(html).toContain("Visible signer");
    expect(html).not.toContain("Hidden signer");
  });

  it("renders signature images in completed signature zones", () => {
    const html = renderTemplateHtml({
      page: { direction: "rtl" },
      blocks: [
        { id: "signatures", type: "signature_zone", x: 20, y: 200, width: 160, height: 40, mode: "completed" }
      ]
    }, {
      ...emptyContext,
      signatureEvents: [
        {
          id: 1,
          created_at: "2026-05-05T00:00:00.000Z",
          signatureImageDataUrl: "data:image/png;base64,abc123",
          signerPositionTitle: "Dean",
          signerUnitName: "Faculty"
        }
      ] as any
    });

    expect(html).toContain("data:image/png;base64,abc123");
    expect(html).toContain("Dean");
  });

  it("renders placed signatures at stored page coordinates", () => {
    const html = renderTemplateHtml({
      page: { direction: "rtl" },
      blocks: [
        { id: "body", type: "text", x: 20, y: 20, width: 120, height: 20, content: "Body" }
      ]
    }, {
      ...emptyContext,
      signatureEvents: [
        {
          id: 1,
          created_at: "2026-05-05T00:00:00.000Z",
          print_options: { show_name_position: true, show_date: true, show_comment: true },
          render_height: 18,
          render_page: 1,
          render_width: 46,
          render_x: 120,
          render_y: 230,
          response_note: "Approved.",
          signatureImageDataUrl: "data:image/png;base64,placed",
          signerName: "Signer One",
          signerPositionTitle: "Dean",
          signerUnitName: "Faculty"
        }
      ] as any
    });

    expect(html).toContain("dc-placed-signature");
    expect(html).toContain("left:120mm;top:230mm;width:46mm;height:18mm");
    expect(html).toContain("data:image/png;base64,placed");
    expect(html).toContain("Approved.");
  });

  it("does not duplicate placed signatures inside signature zones", () => {
    const html = renderTemplateHtml({
      page: { direction: "rtl" },
      blocks: [
        { id: "signatures", type: "signature_zone", x: 20, y: 200, width: 160, height: 40, mode: "completed" }
      ]
    }, {
      ...emptyContext,
      signatureEvents: [
        {
          id: 1,
          render_height: 18,
          render_page: 1,
          render_width: 46,
          render_x: 120,
          render_y: 230,
          signatureImageDataUrl: "data:image/png;base64,placed",
          signerPositionTitle: "Placed signer"
        },
        {
          id: 2,
          signatureImageDataUrl: "data:image/png;base64,legacy",
          signerPositionTitle: "Legacy signer"
        }
      ] as any
    });

    expect(html).toContain("Placed signer");
    expect(html).toContain("Legacy signer");
    expect(html.indexOf("data:image/png;base64,placed")).toBe(html.lastIndexOf("data:image/png;base64,placed"));
  });

  it("renders compact completed endorsements instead of workflow history", () => {
    const html = renderTemplateHtml({
      page: { direction: "rtl" },
      blocks: [
        { id: "signatures", type: "signature_zone", x: 20, y: 200, width: 160, height: 54, mode: "completed", limit: 5 }
      ]
    }, {
      ...emptyContext,
      endorsements: [
        {
          completedAt: "2026-05-05T00:00:00.000Z",
          requiredAction: "review",
          responderName: "Reviewer One",
          responderPositionTitle: "Department Head",
          responderUnitName: "Computer Science",
          responseNote: "Reviewed and approved for final processing."
        },
        {
          completedAt: "2026-05-06T00:00:00.000Z",
          requiredAction: "sign",
          responderName: "Signer Two",
          responderPositionTitle: "Dean",
          responderUnitName: "Faculty",
          responseNote: "Signed with comments.",
          signatureImageDataUrl: "data:image/png;base64,signature"
        }
      ],
      workflowEvents: [
        { action: "send", note: "Sender routing note that should not print here." }
      ] as any
    });

    expect(html).toContain("Reviewed / Approved");
    expect(html).toContain("Reviewer One");
    expect(html).toContain("Reviewed and approved for final processing.");
    expect(html).toContain("data:image/png;base64,signature");
    expect(html).not.toContain("Sender routing note that should not print here.");
  });

  it("renders final QR verification blocks with serial and QR image", () => {
    const html = renderTemplateHtml({
      page: { direction: "ltr" },
      blocks: [
        { id: "qr", type: "qr", x: 10, y: 10, width: 60, height: 24 }
      ]
    }, {
      ...emptyContext,
      document: { official_serial: "BU-1405-000231" },
      verification: {
        qrDataUrl: "data:image/png;base64,qr123",
        url: "https://docchain.example/verify/token"
      }
    });

    expect(html).toContain("data:image/png;base64,qr123");
    expect(html).toContain("Official Serial: BU-1405-000231");
    expect(html).toContain("Verify this document in DocChain");
  });
});
