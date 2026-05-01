import { describe, expect, it } from "vitest";
import {
  buildStructureWorkbookBuffer,
  parseStructureWorkbook,
  validateStructureRows
} from "./structure-workbook";
import type { ExistingStructureState } from "./structure-workbook";

const emptyState: ExistingStructureState = {
  organizations: [],
  unitTypes: [],
  units: []
};

describe("structure workbook import", () => {
  it("parses and plans parent-first structure creates", async () => {
    const parsed = await parseStructureWorkbook(await buildStructureWorkbookBuffer({
      organizations: [
        { code: "UNI", name: "University", status: "active" }
      ],
      unitTypes: [
        { code: "university", name: "University", hierarchy_level: 1, allows_children: "yes", status: "active" },
        { code: "department", name: "Department", hierarchy_level: 2, allows_children: "yes", status: "active" }
      ],
      units: [
        { organization_code: "UNI", unit_type_code: "university", code: "ROOT", name: "Root", status: "active" },
        { organization_code: "UNI", unit_type_code: "department", parent_unit_code: "ROOT", code: "CS", name: "Computer Science", status: "active" }
      ]
    }));

    const preview = validateStructureRows(parsed, emptyState);

    expect(preview.canApply).toBe(true);
    expect(preview.summary.organizations.create).toBe(1);
    expect(preview.summary.unitTypes.create).toBe(2);
    expect(preview.summary.units.create).toBe(2);
  });

  it("rejects duplicate workbook codes and hierarchy cycles", async () => {
    const parsed = await parseStructureWorkbook(await buildStructureWorkbookBuffer({
      organizations: [
        { code: "UNI", name: "University", status: "active" },
        { code: "UNI", name: "Duplicate", status: "active" }
      ],
      unitTypes: [
        { code: "department", name: "Department", hierarchy_level: 2, allows_children: "yes", status: "active" }
      ],
      units: [
        { organization_code: "UNI", unit_type_code: "department", parent_unit_code: "B", code: "A", name: "A", status: "active" },
        { organization_code: "UNI", unit_type_code: "department", parent_unit_code: "A", code: "B", name: "B", status: "active" }
      ]
    }));

    const preview = validateStructureRows(parsed, emptyState);
    const errorCodes = preview.errors.map((error) => error.code);

    expect(preview.canApply).toBe(false);
    expect(errorCodes).toContain("duplicate_code");
    expect(errorCodes).toContain("hierarchy_cycle");
  });

  it("rejects inactive unit type usage", async () => {
    const parsed = await parseStructureWorkbook(await buildStructureWorkbookBuffer({
      organizations: [
        { code: "UNI", name: "University", status: "active" }
      ],
      unitTypes: [
        { code: "department", name: "Department", hierarchy_level: 2, allows_children: "yes", status: "inactive" }
      ],
      units: [
        { organization_code: "UNI", unit_type_code: "department", code: "CS", name: "Computer Science", status: "active" }
      ]
    }));

    const preview = validateStructureRows(parsed, emptyState);

    expect(preview.canApply).toBe(false);
    expect(preview.errors.some((error) => error.code === "inactive_unit_type")).toBe(true);
  });
});
