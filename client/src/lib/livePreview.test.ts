import { describe, expect, it } from "vitest";
import { formatLivePreviewDocumentDate, livePreviewFieldValue, type LivePreviewValues } from "./livePreview";

const values: LivePreviewValues = {
  bodyText: "",
  documentDate: "2026-05-05",
  subject: "",
  templateFields: {}
};

describe("live preview date fields", () => {
  it("formats Gregorian dates with Latin digits", () => {
    expect(formatLivePreviewDocumentDate("2026-05-05", "gregorian")).toBe("2026/5/5");
    expect(livePreviewFieldValue("date", values, "gregorian")).toBe("2026/5/5");
  });

  it("formats Shamsi dates with Persian digits", () => {
    expect(formatLivePreviewDocumentDate("2026-05-05", "shamsi")).toBe("۱۴۰۵/۲/۱۵");
    expect(livePreviewFieldValue("date", values, "shamsi")).toBe("۱۴۰۵/۲/۱۵");
  });

  it("formats Hijri dates with Persian digits", () => {
    expect(formatLivePreviewDocumentDate("2026-05-05", "hijri")).toBe("۱۴۴۷/۱۱/۱۸");
    expect(livePreviewFieldValue("date", values, "hijri")).toBe("۱۴۴۷/۱۱/۱۸");
  });

  it("uses Shamsi for legacy date fields without calendar metadata", () => {
    expect(livePreviewFieldValue("date", values)).toBe("۱۴۰۵/۲/۱۵");
    expect(livePreviewFieldValue("date", values, "unknown")).toBe("۱۴۰۵/۲/۱۵");
  });
});
