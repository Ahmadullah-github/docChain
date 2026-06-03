import { describe, expect, it } from "vitest";
import type { TemplateLayout } from "../../api";
import {
  limitStaffTemplateFieldValue,
  missingRequiredStaffTemplateFields,
  staffTemplateFieldsForLayout
} from "./staffTemplateFields";

describe("staff template fields", () => {
  it("extracts editable word-template zones in template order", () => {
    const layout: TemplateLayout = {
      mode: "word_template",
      page: { direction: "rtl", heightMm: 297, widthMm: 210 },
      blocks: [],
      zones: [
        { id: "recipient", key: "recipient", label: "Recipient", kind: "recipient", maxLines: 3, multiline: true, placeholder: "Recipient office" },
        { id: "date", key: "date", label: "Date", kind: "date" },
        { id: "subject", key: "subject", label: "Subject", kind: "subject", required: true, maxLength: 200 },
        { id: "signature", key: "sign", label: "Sign", kind: "signature" },
        { id: "body", key: "body", label: "Body", kind: "body", richText: true },
        { id: "custom", key: "decision", label: "Decision", kind: "custom", required: true, maxLines: 2 }
      ]
    };

    const fields = staffTemplateFieldsForLayout(layout);

    expect(fields.map((field) => field.key)).toEqual(["recipient", "subject", "body", "decision"]);
    expect(fields.find((field) => field.key === "date")).toBeUndefined();
    expect(fields.find((field) => field.key === "sign")).toBeUndefined();
    expect(fields.find((field) => field.key === "subject")?.required).toBe(true);
    expect(fields.find((field) => field.key === "subject")?.maxLength).toBe(200);
    expect(fields.find((field) => field.key === "body")?.richText).toBe(true);
    expect(fields.find((field) => field.key === "decision")?.required).toBe(true);
  });

  it("falls back to legacy dynamic fields and adds missing core fields", () => {
    const layout: TemplateLayout = {
      page: { direction: "rtl", heightMm: 297, widthMm: 210 },
      blocks: [
        { id: "serial", type: "dynamic_field", x: 0, y: 0, width: 20, height: 8, field: "document.official_serial" },
        { id: "recipient", type: "dynamic_field", x: 20, y: 20, width: 50, height: 16, field: "document.template.recipient", maxLines: 4, placeholder: "Recipient" },
        { id: "hidden", type: "dynamic_field", x: 0, y: 0, width: 20, height: 8, field: "document.template.hidden", hidden: true }
      ]
    };

    const fields = staffTemplateFieldsForLayout(layout);

    expect(fields.map((field) => field.key)).toEqual(["subject", "recipient", "body"]);
    expect(fields.find((field) => field.key === "recipient")?.kind).toBe("template");
    expect(fields.find((field) => field.key === "recipient")?.maxLines).toBe(4);
    expect(fields.find((field) => field.key === "hidden")).toBeUndefined();
  });

  it("includes floating custom fields in word templates even when zones are missing", () => {
    const layout: TemplateLayout = {
      mode: "word_template",
      page: { direction: "rtl", heightMm: 297, widthMm: 210 },
      zones: [
        { id: "subject", key: "subject", label: "Subject", kind: "subject" },
        { id: "body", key: "body", label: "Body", kind: "body" }
      ],
      blocks: [
        { id: "floating-custom", type: "dynamic_field", x: 20, y: 40, width: 60, height: 12, field: "document.template.decision", maxLines: 3, placeholder: "Decision" }
      ]
    };

    const fields = staffTemplateFieldsForLayout(layout);

    expect(fields.map((field) => field.key)).toEqual(["subject", "body", "decision"]);
    expect(fields.find((field) => field.key === "decision")?.label).toBe("Decision");
    expect(fields.find((field) => field.key === "decision")?.maxLines).toBe(3);
  });

  it("reports missing required subject, body, and custom fields", () => {
    const fields = staffTemplateFieldsForLayout({
      mode: "word_template",
      page: { direction: "rtl", heightMm: 297, widthMm: 210 },
      blocks: [],
      zones: [
        { id: "subject", key: "subject", label: "Subject", kind: "subject", required: true },
        { id: "body", key: "body", label: "Body", kind: "body", required: true },
        { id: "recipient", key: "recipient", label: "Recipient", kind: "recipient", required: true }
      ]
    });

    const missing = missingRequiredStaffTemplateFields(fields, {
      bodyText: "",
      subject: "",
      templateFields: { recipient: "" }
    });

    expect(missing.map((field) => field.key)).toEqual(["subject", "body", "recipient"]);
    expect(missingRequiredStaffTemplateFields(fields, {
      bodyText: "Document body",
      subject: "Document subject",
      templateFields: { recipient: "Rector office" }
    })).toEqual([]);
  });

  it("limits staff field values by line count and max length", () => {
    const fields = staffTemplateFieldsForLayout({
      mode: "word_template",
      page: { direction: "rtl", heightMm: 297, widthMm: 210 },
      blocks: [],
      zones: [
        { id: "recipient", key: "recipient", label: "Recipient", kind: "recipient", maxLength: 12, maxLines: 2 }
      ]
    });
    const field = fields.find((item) => item.key === "recipient")!;

    expect(limitStaffTemplateFieldValue("first line\nsecond line\nthird line", field)).toBe("first line\ns");
  });
});
