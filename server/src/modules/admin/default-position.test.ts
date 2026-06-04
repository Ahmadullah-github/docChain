import { describe, expect, it } from "vitest";
import { defaultHolderPositionDefaults, inferDefaultPositionTitle } from "./default-position";

describe("default unit holder position inference", () => {
  it("uses Afghan administrative title transformations", () => {
    expect(inferDefaultPositionTitle("ریاست پوهنتون بلخ")).toBe("رئیس پوهنتون بلخ");
    expect(inferDefaultPositionTitle("معاونیت امور علمی")).toBe("معاون امور علمی");
    expect(inferDefaultPositionTitle("ریاست پوهنزی کمپیوتر ساینس")).toBe("رئیس پوهنزی کمپیوتر ساینس");
    expect(inferDefaultPositionTitle("مدیریت اجراییه")).toBe("مدیر اجراییه");
    expect(inferDefaultPositionTitle("آمریت تکنالوژی معلوماتی")).toBe("آمر تکنالوژی معلوماتی");
    expect(inferDefaultPositionTitle("دیپارتمنت انجنیری نرم‌افزار")).toBe("آمر دیپارتمنت انجنیری نرم‌افزار");
  });

  it("uses English fallbacks from unit type hints", () => {
    expect(inferDefaultPositionTitle("Computer Science", { code: "faculty", name: "Faculty" })).toBe("Dean of Computer Science");
    expect(inferDefaultPositionTitle("Software Engineering", { code: "department", name: "Department" })).toBe("Head of Software Engineering");
    expect(inferDefaultPositionTitle("Academic Committee", { code: "committee", name: "Committee" })).toBe("Chair of Academic Committee");
    expect(inferDefaultPositionTitle("Executive Office", { code: "office", name: "Office" })).toBe("Manager of Executive Office");
  });

  it("keeps generated defaults ready for holder assignment", () => {
    expect(defaultHolderPositionDefaults).toEqual({
      allowsMultipleActiveAssignments: false,
      authorityLevel: 20,
      isSigningAuthority: true,
      status: "active"
    });
  });
});
