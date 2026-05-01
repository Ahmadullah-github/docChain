import ExcelJS from "exceljs";

export type StructureSheetName = "organizations" | "unit_types" | "units";
export type StructureImportOperationType = "create" | "update" | "unchanged";

export type StructureWorkbookError = {
  code: string;
  column?: string;
  message: string;
  row: number;
  sheet: StructureSheetName;
};

export type StructureImportOperation = {
  code: string;
  label: string;
  operation: StructureImportOperationType;
  row: number;
  sheet: StructureSheetName;
};

export type StructureImportSummarySection = {
  create: number;
  unchanged: number;
  update: number;
};

export type StructureImportSummary = {
  organizations: StructureImportSummarySection;
  unitTypes: StructureImportSummarySection;
  units: StructureImportSummarySection;
  errors: number;
};

export type StructureImportPreview = {
  canApply: boolean;
  errors: StructureWorkbookError[];
  operations: StructureImportOperation[];
  summary: StructureImportSummary;
};

export type OrganizationWorkbookRow = {
  code: string;
  description: string | null;
  name: string;
  nameLocal: string | null;
  rowNumber: number;
  status: string;
};

export type UnitTypeWorkbookRow = {
  allowsChildren: boolean;
  code: string;
  description: string | null;
  hierarchyLevel: number;
  name: string;
  rowNumber: number;
  status: string;
};

export type UnitWorkbookRow = {
  code: string;
  description: string | null;
  name: string;
  nameLocal: string | null;
  organizationCode: string;
  parentUnitCode: string | null;
  rowNumber: number;
  status: string;
  unitTypeCode: string;
};

export type ParsedStructureWorkbook = {
  errors: StructureWorkbookError[];
  organizations: OrganizationWorkbookRow[];
  unitTypes: UnitTypeWorkbookRow[];
  units: UnitWorkbookRow[];
};

export type ExistingOrganization = {
  code: string;
  description?: string | null;
  id: number;
  name: string;
  name_local?: string | null;
  status: string;
};

export type ExistingUnitType = {
  allows_children: boolean | number;
  code: string;
  description?: string | null;
  hierarchy_level: number;
  id: number;
  name: string;
  status: string;
};

export type ExistingUnit = {
  code: string;
  description?: string | null;
  id: number;
  name: string;
  name_local?: string | null;
  organizationCode: string;
  organization_id: number;
  parentUnitCode?: string | null;
  parent_unit_id?: number | null;
  status: string;
  unitTypeCode: string;
  unit_type_id: number;
};

export type ExistingStructureState = {
  organizations: ExistingOrganization[];
  unitTypes: ExistingUnitType[];
  units: ExistingUnit[];
};

const headers: Record<StructureSheetName, string[]> = {
  organizations: ["code", "name", "name_local", "description", "status"],
  unit_types: ["code", "name", "hierarchy_level", "allows_children", "status", "description"],
  units: ["organization_code", "unit_type_code", "parent_unit_code", "code", "name", "name_local", "description", "status"]
};

function key(value: string) {
  return value.trim().toLowerCase();
}

function unitKey(organizationCode: string, unitCode: string) {
  return `${key(organizationCode)}\u0000${key(unitCode)}`;
}

function emptySection(): StructureImportSummarySection {
  return { create: 0, unchanged: 0, update: 0 };
}

function emptySummary(): StructureImportSummary {
  return {
    errors: 0,
    organizations: emptySection(),
    unitTypes: emptySection(),
    units: emptySection()
  };
}

function cellText(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") {
      return record.text;
    }
    if (record.result != null) {
      return cellText(record.result);
    }
    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => cellText((part as Record<string, unknown>).text)).join("");
    }
  }
  return String(value);
}

function optionalText(value: unknown) {
  const normalized = cellText(value).trim();
  return normalized ? normalized : null;
}

function requiredText(value: unknown, sheet: StructureSheetName, row: number, column: string, errors: StructureWorkbookError[]) {
  const normalized = optionalText(value);
  if (!normalized) {
    errors.push({ code: "required", column, message: `${column} is required.`, row, sheet });
    return "";
  }
  return normalized;
}

function statusText(value: unknown) {
  return optionalText(value) || "active";
}

function integerValue(value: unknown, sheet: StructureSheetName, row: number, column: string, errors: StructureWorkbookError[], fallback = 0) {
  const text = optionalText(value);
  if (!text) {
    return fallback;
  }
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 0) {
    errors.push({ code: "invalid_number", column, message: `${column} must be a non-negative integer.`, row, sheet });
    return fallback;
  }
  return parsed;
}

function booleanValue(value: unknown, sheet: StructureSheetName, row: number, column: string, errors: StructureWorkbookError[], fallback = true) {
  const text = optionalText(value);
  if (!text) {
    return fallback;
  }
  const normalized = text.toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0"].includes(normalized)) {
    return false;
  }
  errors.push({ code: "invalid_boolean", column, message: `${column} must be yes/no or true/false.`, row, sheet });
  return fallback;
}

function readSheet(workbook: ExcelJS.Workbook, sheet: StructureSheetName, errors: StructureWorkbookError[]) {
  const worksheet = workbook.getWorksheet(sheet);
  if (!worksheet) {
    errors.push({ code: "missing_sheet", message: `Workbook is missing the ${sheet} sheet.`, row: 1, sheet });
    return [];
  }

  const headerValues = worksheet.getRow(1).values;
  const headerRow = Array.isArray(headerValues)
    ? headerValues.slice(1).map((item) => cellText(item).trim().toLowerCase())
    : [];
  for (const expected of headers[sheet]) {
    if (!headerRow.includes(expected)) {
      errors.push({ code: "missing_column", column: expected, message: `${sheet} is missing the ${expected} column.`, row: 1, sheet });
    }
  }

  const rows: Array<{ rowNumber: number; values: Record<string, unknown> }> = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rowValues = Array.isArray(row.values) ? row.values.slice(1) : [];
    const values: Record<string, unknown> = {};
    headerRow.forEach((header, cellIndex) => {
      if (header) {
        values[header] = rowValues[cellIndex] ?? "";
      }
    });
    if (Object.values(values).some((value) => optionalText(value))) {
      rows.push({ rowNumber, values });
    }
  }

  return rows;
}

export async function parseStructureWorkbook(buffer: Buffer): Promise<ParsedStructureWorkbook> {
  const errors: StructureWorkbookError[] = [];
  const workbook = new ExcelJS.Workbook();
  try {
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    return {
      errors: [{ code: "invalid_workbook", message: "The uploaded file is not a readable Excel workbook.", row: 1, sheet: "organizations" }],
      organizations: [],
      unitTypes: [],
      units: []
    };
  }

  const organizations = readSheet(workbook, "organizations", errors).map(({ rowNumber, values }) => ({
    code: requiredText(values.code, "organizations", rowNumber, "code", errors),
    description: optionalText(values.description),
    name: requiredText(values.name, "organizations", rowNumber, "name", errors),
    nameLocal: optionalText(values.name_local),
    rowNumber,
    status: statusText(values.status)
  }));

  const unitTypes = readSheet(workbook, "unit_types", errors).map(({ rowNumber, values }) => ({
    allowsChildren: booleanValue(values.allows_children, "unit_types", rowNumber, "allows_children", errors),
    code: requiredText(values.code, "unit_types", rowNumber, "code", errors),
    description: optionalText(values.description),
    hierarchyLevel: integerValue(values.hierarchy_level, "unit_types", rowNumber, "hierarchy_level", errors),
    name: requiredText(values.name, "unit_types", rowNumber, "name", errors),
    rowNumber,
    status: statusText(values.status)
  }));

  const units = readSheet(workbook, "units", errors).map(({ rowNumber, values }) => ({
    code: requiredText(values.code, "units", rowNumber, "code", errors),
    description: optionalText(values.description),
    name: requiredText(values.name, "units", rowNumber, "name", errors),
    nameLocal: optionalText(values.name_local),
    organizationCode: requiredText(values.organization_code, "units", rowNumber, "organization_code", errors),
    parentUnitCode: optionalText(values.parent_unit_code),
    rowNumber,
    status: statusText(values.status),
    unitTypeCode: requiredText(values.unit_type_code, "units", rowNumber, "unit_type_code", errors)
  }));

  return { errors, organizations, unitTypes, units };
}

function addDuplicateErrors<T extends { code: string; rowNumber: number }>(
  rows: T[],
  sheet: StructureSheetName,
  errors: StructureWorkbookError[],
  keyForRow: (row: T) => string = (row) => key(row.code)
) {
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (!row.code) {
      continue;
    }
    const rowKey = keyForRow(row);
    const firstRow = seen.get(rowKey);
    if (firstRow) {
      errors.push({
        code: "duplicate_code",
        column: "code",
        message: `Duplicate code. First seen on row ${firstRow}.`,
        row: row.rowNumber,
        sheet
      });
    } else {
      seen.set(rowKey, row.rowNumber);
    }
  }
}

function different(left: unknown, right: unknown) {
  return String(left ?? "") !== String(right ?? "");
}

function boolOf(value: boolean | number) {
  return value === true || value === 1;
}

function operationFor(changed: boolean, exists: boolean): StructureImportOperationType {
  if (!exists) {
    return "create";
  }
  return changed ? "update" : "unchanged";
}

function sectionName(sheet: StructureSheetName): keyof Omit<StructureImportSummary, "errors"> {
  if (sheet === "unit_types") {
    return "unitTypes";
  }
  return sheet;
}

function addOperation(preview: StructureImportPreview, operation: StructureImportOperation) {
  preview.operations.push(operation);
  preview.summary[sectionName(operation.sheet)][operation.operation] += 1;
}

function invalidRows(errors: StructureWorkbookError[]) {
  return new Set(errors.map((error) => `${error.sheet}:${error.row}`));
}

export function validateStructureRows(parsed: ParsedStructureWorkbook, state: ExistingStructureState): StructureImportPreview {
  const errors = [...parsed.errors];
  addDuplicateErrors(parsed.organizations, "organizations", errors);
  addDuplicateErrors(parsed.unitTypes, "unit_types", errors);
  addDuplicateErrors(parsed.units, "units", errors, (row) => unitKey(row.organizationCode, row.code));

  const badRows = invalidRows(errors);
  const existingOrganizations = new Map(state.organizations.map((row) => [key(row.code), row]));
  const existingUnitTypes = new Map(state.unitTypes.map((row) => [key(row.code), row]));
  const existingUnits = new Map(state.units.map((row) => [unitKey(row.organizationCode, row.code), row]));

  const finalOrganizations = new Map(existingOrganizations);
  const finalUnitTypes = new Map(existingUnitTypes);
  const finalUnits = new Map<string, {
    code: string;
    organizationCode: string;
    parentKey: string | null;
    rowNumber?: number;
    status: string;
    unitTypeCode: string;
  }>();

  for (const unit of state.units) {
    finalUnits.set(unitKey(unit.organizationCode, unit.code), {
      code: unit.code,
      organizationCode: unit.organizationCode,
      parentKey: unit.parentUnitCode ? unitKey(unit.organizationCode, unit.parentUnitCode) : null,
      status: unit.status,
      unitTypeCode: unit.unitTypeCode
    });
  }

  for (const row of parsed.organizations) {
    if (!badRows.has(`organizations:${row.rowNumber}`)) {
      finalOrganizations.set(key(row.code), {
        code: row.code,
        description: row.description,
        id: existingOrganizations.get(key(row.code))?.id || 0,
        name: row.name,
        name_local: row.nameLocal,
        status: row.status
      });
    }
  }

  for (const row of parsed.unitTypes) {
    if (!badRows.has(`unit_types:${row.rowNumber}`)) {
      finalUnitTypes.set(key(row.code), {
        allows_children: row.allowsChildren,
        code: row.code,
        description: row.description,
        hierarchy_level: row.hierarchyLevel,
        id: existingUnitTypes.get(key(row.code))?.id || 0,
        name: row.name,
        status: row.status
      });
    }
  }

  for (const row of parsed.units) {
    if (!badRows.has(`units:${row.rowNumber}`)) {
      finalUnits.set(unitKey(row.organizationCode, row.code), {
        code: row.code,
        organizationCode: row.organizationCode,
        parentKey: row.parentUnitCode ? unitKey(row.organizationCode, row.parentUnitCode) : null,
        rowNumber: row.rowNumber,
        status: row.status,
        unitTypeCode: row.unitTypeCode
      });
    }
  }

  for (const row of parsed.units) {
    if (badRows.has(`units:${row.rowNumber}`)) {
      continue;
    }
    if (!finalOrganizations.has(key(row.organizationCode))) {
      errors.push({ code: "unknown_organization", column: "organization_code", message: "Organization code does not exist in the workbook or database.", row: row.rowNumber, sheet: "units" });
    }
    const unitType = finalUnitTypes.get(key(row.unitTypeCode));
    if (!unitType) {
      errors.push({ code: "unknown_unit_type", column: "unit_type_code", message: "Unit type code does not exist in the workbook or database.", row: row.rowNumber, sheet: "units" });
    } else if (unitType.status !== "active") {
      errors.push({ code: "inactive_unit_type", column: "unit_type_code", message: "Unit type must be active before units can use it.", row: row.rowNumber, sheet: "units" });
    }

    if (row.parentUnitCode) {
      const parentKey = unitKey(row.organizationCode, row.parentUnitCode);
      const parent = finalUnits.get(parentKey);
      if (parentKey === unitKey(row.organizationCode, row.code)) {
        errors.push({ code: "invalid_parent", column: "parent_unit_code", message: "A unit cannot be its own parent.", row: row.rowNumber, sheet: "units" });
      } else if (!parent) {
        errors.push({ code: "unknown_parent_unit", column: "parent_unit_code", message: "Parent unit code does not exist for this organization.", row: row.rowNumber, sheet: "units" });
      } else if (parent.status !== "active") {
        errors.push({ code: "inactive_parent_unit", column: "parent_unit_code", message: "Parent unit must be active.", row: row.rowNumber, sheet: "units" });
      } else {
        const parentType = finalUnitTypes.get(key(parent.unitTypeCode));
        if (parentType && !boolOf(parentType.allows_children)) {
          errors.push({ code: "parent_disallows_children", column: "parent_unit_code", message: "Parent unit type does not allow child units.", row: row.rowNumber, sheet: "units" });
        }
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycleRows = new Set<number>();

  function visit(currentKey: string) {
    if (visited.has(currentKey)) {
      return;
    }
    if (visiting.has(currentKey)) {
      for (const keyInCycle of stack.slice(stack.indexOf(currentKey))) {
        const rowNumber = finalUnits.get(keyInCycle)?.rowNumber;
        if (rowNumber) {
          cycleRows.add(rowNumber);
        }
      }
      return;
    }
    visiting.add(currentKey);
    stack.push(currentKey);
    const parentKey = finalUnits.get(currentKey)?.parentKey;
    if (parentKey && finalUnits.has(parentKey)) {
      visit(parentKey);
    }
    stack.pop();
    visiting.delete(currentKey);
    visited.add(currentKey);
  }

  for (const currentKey of finalUnits.keys()) {
    visit(currentKey);
  }

  for (const row of cycleRows) {
    errors.push({ code: "hierarchy_cycle", column: "parent_unit_code", message: "Unit parent relationships create a hierarchy cycle.", row, sheet: "units" });
  }

  const preview: StructureImportPreview = {
    canApply: errors.length === 0,
    errors,
    operations: [],
    summary: emptySummary()
  };

  const finalBadRows = invalidRows(errors);
  for (const row of parsed.organizations) {
    if (finalBadRows.has(`organizations:${row.rowNumber}`)) {
      continue;
    }
    const existing = existingOrganizations.get(key(row.code));
    const changed = existing ? (
      different(existing.name, row.name)
      || different(existing.name_local, row.nameLocal)
      || different(existing.description, row.description)
      || different(existing.status, row.status)
    ) : false;
    addOperation(preview, { code: row.code, label: row.name, operation: operationFor(changed, Boolean(existing)), row: row.rowNumber, sheet: "organizations" });
  }

  for (const row of parsed.unitTypes) {
    if (finalBadRows.has(`unit_types:${row.rowNumber}`)) {
      continue;
    }
    const existing = existingUnitTypes.get(key(row.code));
    const changed = existing ? (
      different(existing.name, row.name)
      || Number(existing.hierarchy_level) !== row.hierarchyLevel
      || boolOf(existing.allows_children) !== row.allowsChildren
      || different(existing.status, row.status)
      || different(existing.description, row.description)
    ) : false;
    addOperation(preview, { code: row.code, label: row.name, operation: operationFor(changed, Boolean(existing)), row: row.rowNumber, sheet: "unit_types" });
  }

  for (const row of parsed.units) {
    if (finalBadRows.has(`units:${row.rowNumber}`)) {
      continue;
    }
    const existing = existingUnits.get(unitKey(row.organizationCode, row.code));
    const changed = existing ? (
      different(existing.name, row.name)
      || different(existing.name_local, row.nameLocal)
      || different(existing.description, row.description)
      || different(existing.status, row.status)
      || key(existing.unitTypeCode) !== key(row.unitTypeCode)
      || key(existing.parentUnitCode || "") !== key(row.parentUnitCode || "")
    ) : false;
    addOperation(preview, { code: `${row.organizationCode}/${row.code}`, label: row.name, operation: operationFor(changed, Boolean(existing)), row: row.rowNumber, sheet: "units" });
  }

  preview.summary.errors = errors.length;
  return preview;
}

export function parentFirstUnitRows(rows: UnitWorkbookRow[]) {
  const byKey = new Map(rows.map((row) => [unitKey(row.organizationCode, row.code), row]));
  const visited = new Set<string>();
  const ordered: UnitWorkbookRow[] = [];

  function visit(row: UnitWorkbookRow) {
    const currentKey = unitKey(row.organizationCode, row.code);
    if (visited.has(currentKey)) {
      return;
    }
    if (row.parentUnitCode) {
      const parent = byKey.get(unitKey(row.organizationCode, row.parentUnitCode));
      if (parent) {
        visit(parent);
      }
    }
    visited.add(currentKey);
    ordered.push(row);
  }

  for (const row of rows) {
    visit(row);
  }

  return ordered;
}

export async function buildStructureWorkbookBuffer(input?: {
  organizations?: Array<Record<string, unknown>>;
  unitTypes?: Array<Record<string, unknown>>;
  units?: Array<Record<string, unknown>>;
}) {
  const workbook = new ExcelJS.Workbook();
  const sheets: Array<[StructureSheetName, Array<Record<string, unknown>> | undefined]> = [
    ["organizations", input?.organizations],
    ["unit_types", input?.unitTypes],
    ["units", input?.units]
  ];

  for (const [sheet, rows] of sheets) {
    const worksheet = workbook.addWorksheet(sheet);
    worksheet.addRow(headers[sheet]);
    for (const row of rows || []) {
      worksheet.addRow(headers[sheet].map((header) => row[header] ?? ""));
    }
    worksheet.columns.forEach((column) => {
      column.width = 22;
    });
  }

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
