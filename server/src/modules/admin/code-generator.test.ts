import { describe, expect, it } from "vitest";
import { codeGeneratorInternals, generateAdminCode } from "./code-generator";

type ExistingRows = {
  confidentiality_level?: string[];
  document_type?: string[];
  organization?: string[];
  position?: Array<{ code: string; unit_id: number }>;
  priority_level?: string[];
  serial_rule?: string[];
  unit?: Array<{ code: string; organization_id: number }>;
};

function mockExecutor(existing: ExistingRows = {}) {
  return {
    async execute(sql: string, values: unknown[]) {
      if (sql.includes("FROM organizations WHERE code LIKE")) {
        return [(existing.organization || []).map((code, id) => ({ code, id })), []];
      }
      if (sql.includes("FROM document_types WHERE code LIKE")) {
        return [(existing.document_type || []).map((code, id) => ({ code, id })), []];
      }
      if (sql.includes("FROM confidentiality_levels WHERE code LIKE")) {
        return [(existing.confidentiality_level || []).map((code, id) => ({ code, id })), []];
      }
      if (sql.includes("FROM priority_levels WHERE code LIKE")) {
        return [(existing.priority_level || []).map((code, id) => ({ code, id })), []];
      }
      if (sql.includes("FROM serial_rules WHERE code LIKE")) {
        return [(existing.serial_rule || []).map((code, id) => ({ code, id })), []];
      }
      if (sql.includes("FROM units WHERE code LIKE")) {
        const organizationId = Number(values[1]);
        return [(existing.unit || []).filter((row) => row.organization_id === organizationId).map((row, id) => ({ ...row, id })), []];
      }
      if (sql.includes("FROM positions WHERE code LIKE")) {
        const unitId = Number(values[1]);
        return [(existing.position || []).filter((row) => row.unit_id === unitId).map((row, id) => ({ ...row, id })), []];
      }

      return [[], []];
    }
  } as any;
}

describe("admin code generator", () => {
  it("builds compact three-character abbreviations from typed names", () => {
    expect(codeGeneratorInternals.abbreviationFromHint("Faculty Of Computer Science", "UNT")).toBe("FCS");
    expect(codeGeneratorInternals.abbreviationFromHint("Vice Chancellery", "UNT")).toBe("VCH");
    expect(codeGeneratorInternals.abbreviationFromHint("Executive", "UNT")).toBe("EXE");
    expect(codeGeneratorInternals.abbreviationFromHint("ریاست مالی", "UNT")).toBe("UNT");
  });

  it("increments organization codes globally with four digit suffixes", async () => {
    const suggestion = await generateAdminCode(mockExecutor({
      organization: ["KUN-0001", "KUN-0002"]
    }), {
      entity_type: "organization",
      name: "Kabul University"
    });

    expect(suggestion).toEqual({
      base: "KUN",
      code: "KUN-0003",
      sequence: 3
    });
  });

  it("increments unit codes inside the selected organization only", async () => {
    const suggestion = await generateAdminCode(mockExecutor({
      unit: [
        { code: "SCI-0001", organization_id: 1 },
        { code: "SCI-0002", organization_id: 2 }
      ]
    }), {
      entity_type: "unit",
      name: "Science",
      organization_id: 1,
      unit_type_id: 10
    });

    expect(suggestion.code).toBe("SCI-0002");
  });

  it("increments position codes inside the selected unit only", async () => {
    const suggestion = await generateAdminCode(mockExecutor({
      position: [
        { code: "DEA-0001", unit_id: 100 },
        { code: "DEA-0002", unit_id: 101 }
      ]
    }), {
      entity_type: "position",
      title: "Dean",
      unit_id: 100
    });

    expect(suggestion.code).toBe("DEA-0002");
  });

  it("uses entity fallback hints for names without ASCII letters", async () => {
    const suggestion = await generateAdminCode(mockExecutor(), {
      entity_type: "document_type",
      name: "مکتوب رسمی"
    });

    expect(suggestion.code).toBe("DOC-0001");
    expect(codeGeneratorInternals.codeWithSequence("ABC", 1)).toBe("ABC-0001");
  });

  it("generates global setting and serial rule codes", async () => {
    await expect(generateAdminCode(mockExecutor({
      confidentiality_level: ["SEC-0001"]
    }), {
      entity_type: "confidentiality_level",
      name: "Secret"
    })).resolves.toMatchObject({ code: "SEC-0002" });

    await expect(generateAdminCode(mockExecutor({
      priority_level: ["HIG-0001", "HIG-0002"]
    }), {
      entity_type: "priority_level",
      name: "High"
    })).resolves.toMatchObject({ code: "HIG-0003" });

    await expect(generateAdminCode(mockExecutor({
      serial_rule: ["YEA-0001"]
    }), {
      entity_type: "serial_rule",
      name: "Yearly"
    })).resolves.toMatchObject({ code: "YEA-0002" });
  });
});
