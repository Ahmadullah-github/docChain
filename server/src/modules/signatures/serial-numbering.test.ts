import { describe, expect, it } from "vitest";
import {
  findUnsupportedSerialTokens,
  formatSerialNumber,
  previewSerialNumber,
  serialPeriodForDate,
  serialScopeForContext
} from "./serial-numbering";

const fixedDate = new Date("2026-05-03T10:20:30.000Z");

describe("serial numbering", () => {
  it("resolves supported tokens with padded sequence values", () => {
    const value = formatSerialNumber(
      { format: "{ORG}-{DOC}-{YY}-{MONTH}-{SEQ}", sequence_padding: 4 },
      {
        context: { documentTypeCode: "LTR", organizationCode: "UNI" },
        date: fixedDate,
        sequenceValue: 7
      }
    );

    expect(value).toBe("UNI-LTR-26-05-0007");
  });

  it("builds scope keys from document context", () => {
    const context = { documentTypeCode: "MEMO", organizationCode: "UNI", originUnitCode: "CS" };

    expect(serialScopeForContext("global", context)).toBe("global");
    expect(serialScopeForContext("organization", context)).toBe("org:UNI");
    expect(serialScopeForContext("origin_unit", context)).toBe("unit:CS");
    expect(serialScopeForContext("document_type", context)).toBe("doc:MEMO");
    expect(serialScopeForContext("origin_unit_document_type", context)).toBe("unit:CS:doc:MEMO");
  });

  it("builds reset periods for yearly, monthly, and never policies", () => {
    expect(serialPeriodForDate("yearly", fixedDate)).toBe("2026");
    expect(serialPeriodForDate("monthly", fixedDate)).toBe("2026-05");
    expect(serialPeriodForDate("never", fixedDate)).toBe("all");
  });

  it("previews without mutating caller sequence state", () => {
    const currentValue = 41;
    const first = previewSerialNumber({ format: "DOC-{YEAR}-{SEQUENCE}", sequence_padding: 6 }, { currentValue, date: fixedDate });
    const second = previewSerialNumber({ format: "DOC-{YEAR}-{SEQUENCE}", sequence_padding: 6 }, { currentValue, date: fixedDate });

    expect(first.serialValue).toBe("DOC-2026-000042");
    expect(second.serialValue).toBe("DOC-2026-000042");
    expect(currentValue).toBe(41);
  });

  it("reports unsupported format tokens", () => {
    expect(findUnsupportedSerialTokens("DOC-{YEAR}-{BAD}-{SEQUENCE}-{BAD}")).toEqual(["BAD"]);
  });
});
