import multer from "multer";
import { Router } from "express";
import type { Request, Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "../../db/mysql";
import type { Database } from "../../db/mysql";
import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { AppError } from "../../shared/errors";
import { ok } from "../../shared/http";
import { uuid } from "../../shared/ids";
import { refreshSearchIndexForEntitySafe } from "../search/global-search.service";
import {
  buildStructureWorkbookBuffer,
  parentFirstUnitRows,
  parseStructureWorkbook,
  validateStructureRows
} from "./structure-workbook";
import type {
  ExistingOrganization,
  ExistingStructureState,
  ExistingUnit,
  ExistingUnitType,
  ParsedStructureWorkbook,
  StructureImportOperationType,
  StructureImportPreview
} from "./structure-workbook";

export const adminStructureRouter = Router();

const upload = multer({
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  },
  storage: multer.memoryStorage()
});

adminStructureRouter.use(requireAuth, requireAnyRole(["system_admin", "admin_staff"]));

function mapKey(value: string) {
  return value.trim().toLowerCase();
}

function unitMapKey(organizationCode: string, unitCode: string) {
  return `${mapKey(organizationCode)}\u0000${mapKey(unitCode)}`;
}

function sendWorkbook(response: Response, filename: string, buffer: Buffer) {
  response.setHeader("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  response.setHeader("content-disposition", `attachment; filename="${filename}"`);
  response.send(buffer);
}

function uploadedWorkbook(request: Request) {
  const file = request.file;
  if (!file) {
    throw new AppError(422, "missing_file", "Upload an Excel workbook.");
  }
  if (!/\.(xlsx|xlsm)$/i.test(file.originalname)) {
    throw new AppError(422, "invalid_file_type", "Structure imports must be Excel workbooks.");
  }
  return file.buffer;
}

async function loadStructureState(connection: Database = pool): Promise<ExistingStructureState> {
  const [organizations] = await connection.execute<RowDataPacket[]>(
    `SELECT id, code, name, name_local, description, status
     FROM organizations
     WHERE deleted_at IS NULL
     ORDER BY code ASC`
  );
  const [unitTypes] = await connection.execute<RowDataPacket[]>(
    `SELECT id, code, name, hierarchy_level, allows_children, status, description
     FROM unit_types
     ORDER BY hierarchy_level ASC, code ASC`
  );
  const [units] = await connection.execute<RowDataPacket[]>(
    `SELECT
      units.id,
      units.organization_id,
      units.unit_type_id,
      units.parent_unit_id,
      units.code,
      units.name,
      units.name_local,
      units.description,
      units.status,
      organizations.code AS organizationCode,
      unit_types.code AS unitTypeCode,
      parent_units.code AS parentUnitCode
    FROM units
    INNER JOIN organizations ON units.organization_id = organizations.id
    INNER JOIN unit_types ON units.unit_type_id = unit_types.id
    LEFT JOIN units AS parent_units ON units.parent_unit_id = parent_units.id
    WHERE units.deleted_at IS NULL
    ORDER BY organizations.code ASC, units.code ASC`
  );

  return {
    organizations: organizations.map((row) => row as ExistingOrganization),
    unitTypes: unitTypes.map((row) => row as ExistingUnitType),
    units: units.map((row) => row as ExistingUnit)
  };
}

function operationMap(preview: StructureImportPreview) {
  return new Map(preview.operations.map((operation) => [`${operation.sheet}:${operation.row}`, operation.operation]));
}

function operationFor(operations: Map<string, StructureImportOperationType>, sheet: string, row: number) {
  return operations.get(`${sheet}:${row}`);
}

async function applyStructureImport(request: Request, parsed: ParsedStructureWorkbook) {
  const connection = await pool.getConnection();
  const changedOrganizations: number[] = [];
  const changedUnits: number[] = [];
  let preview: StructureImportPreview;

  try {
    await connection.beginTransaction();
    const state = await loadStructureState(connection);
    preview = validateStructureRows(parsed, state);
    if (!preview.canApply) {
      throw new AppError(422, "structure_import_invalid", "Resolve import errors before applying the workbook.", preview);
    }

    const organizationsByCode = new Map(state.organizations.map((row) => [mapKey(row.code), row]));
    const organizationIds = new Map(state.organizations.map((row) => [mapKey(row.code), Number(row.id)]));
    const unitTypesByCode = new Map(state.unitTypes.map((row) => [mapKey(row.code), row]));
    const unitTypeIds = new Map(state.unitTypes.map((row) => [mapKey(row.code), Number(row.id)]));
    const unitsByKey = new Map(state.units.map((row) => [unitMapKey(row.organizationCode, row.code), row]));
    const unitIds = new Map(state.units.map((row) => [unitMapKey(row.organizationCode, row.code), Number(row.id)]));
    const operations = operationMap(preview);

    for (const row of parsed.organizations) {
      const operation = operationFor(operations, "organizations", row.rowNumber);
      if (!operation || operation === "unchanged") {
        continue;
      }

      const existing = organizationsByCode.get(mapKey(row.code));
      if (operation === "create" || !existing) {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO organizations (uuid, code, name, name_local, description, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuid(), row.code, row.name, row.nameLocal, row.description, row.status]
        );
        const id = Number(result.insertId);
        organizationIds.set(mapKey(row.code), id);
        changedOrganizations.push(id);
        await writeAuditLog(request, { action: "admin.structure_import.organization.create", entityType: "organization", entityId: id }, connection);
      } else {
        await connection.execute<ResultSetHeader>(
          `UPDATE organizations
           SET name = ?, name_local = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [row.name, row.nameLocal, row.description, row.status, existing.id]
        );
        changedOrganizations.push(Number(existing.id));
        await writeAuditLog(request, { action: "admin.structure_import.organization.update", entityType: "organization", entityId: existing.id }, connection);
      }
    }

    for (const row of parsed.unitTypes) {
      const operation = operationFor(operations, "unit_types", row.rowNumber);
      if (!operation || operation === "unchanged") {
        continue;
      }

      const existing = unitTypesByCode.get(mapKey(row.code));
      if (operation === "create" || !existing) {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO unit_types (uuid, code, name, hierarchy_level, allows_children, status, description)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), row.code, row.name, row.hierarchyLevel, row.allowsChildren, row.status, row.description]
        );
        const id = Number(result.insertId);
        unitTypeIds.set(mapKey(row.code), id);
        await writeAuditLog(request, { action: "admin.structure_import.unit_type.create", entityType: "unit_type", entityId: id }, connection);
      } else {
        await connection.execute<ResultSetHeader>(
          `UPDATE unit_types
           SET name = ?, hierarchy_level = ?, allows_children = ?, status = ?, description = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [row.name, row.hierarchyLevel, row.allowsChildren, row.status, row.description, existing.id]
        );
        await writeAuditLog(request, { action: "admin.structure_import.unit_type.update", entityType: "unit_type", entityId: existing.id }, connection);
      }
    }

    for (const row of parentFirstUnitRows(parsed.units)) {
      const operation = operationFor(operations, "units", row.rowNumber);
      if (!operation || operation === "unchanged") {
        continue;
      }

      const existing = unitsByKey.get(unitMapKey(row.organizationCode, row.code));
      const organizationId = organizationIds.get(mapKey(row.organizationCode));
      const unitTypeId = unitTypeIds.get(mapKey(row.unitTypeCode));
      const parentUnitId = row.parentUnitCode ? unitIds.get(unitMapKey(row.organizationCode, row.parentUnitCode)) || null : null;
      if (!organizationId || !unitTypeId) {
        throw new AppError(422, "invalid_import_state", "Structure import references could not be resolved.");
      }

      if (operation === "create" || !existing) {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO units (
            uuid, organization_id, unit_type_id, parent_unit_id, code,
            name, name_local, description, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), organizationId, unitTypeId, parentUnitId, row.code, row.name, row.nameLocal, row.description, row.status]
        );
        const id = Number(result.insertId);
        unitIds.set(unitMapKey(row.organizationCode, row.code), id);
        changedUnits.push(id);
        await writeAuditLog(request, { action: "admin.structure_import.unit.create", entityType: "unit", entityId: id }, connection);
      } else {
        await connection.execute<ResultSetHeader>(
          `UPDATE units
           SET organization_id = ?, unit_type_id = ?, parent_unit_id = ?, name = ?, name_local = ?,
             description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [organizationId, unitTypeId, parentUnitId, row.name, row.nameLocal, row.description, row.status, existing.id]
        );
        changedUnits.push(Number(existing.id));
        await writeAuditLog(request, { action: "admin.structure_import.unit.update", entityType: "unit", entityId: existing.id }, connection);
      }
    }

    await writeAuditLog(request, {
      action: "admin.structure_import.apply",
      entityType: "structure_import",
      metadata: { summary: preview.summary }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await Promise.all([
    ...changedOrganizations.map((id) => refreshSearchIndexForEntitySafe("organization", id)),
    ...changedUnits.map((id) => refreshSearchIndexForEntitySafe("unit", id))
  ]);

  return preview!;
}

async function previewFor(buffer: Buffer, state: ExistingStructureState) {
  const parsed = await parseStructureWorkbook(buffer);
  return {
    parsed,
    preview: validateStructureRows(parsed, state)
  };
}

adminStructureRouter.get("/template", asyncHandler(async (_request, response) => {
  sendWorkbook(response, "docchain-structure-template.xlsx", await buildStructureWorkbookBuffer());
}));

adminStructureRouter.get("/export", asyncHandler(async (_request, response) => {
  const state = await loadStructureState();
  const buffer = await buildStructureWorkbookBuffer({
    organizations: state.organizations.map((row) => ({
      code: row.code,
      description: row.description || "",
      name: row.name,
      name_local: row.name_local || "",
      status: row.status
    })),
    unitTypes: state.unitTypes.map((row) => ({
      allows_children: row.allows_children ? "yes" : "no",
      code: row.code,
      description: row.description || "",
      hierarchy_level: row.hierarchy_level,
      name: row.name,
      status: row.status
    })),
    units: state.units.map((row) => ({
      code: row.code,
      description: row.description || "",
      name: row.name,
      name_local: row.name_local || "",
      organization_code: row.organizationCode,
      parent_unit_code: row.parentUnitCode || "",
      status: row.status,
      unit_type_code: row.unitTypeCode
    }))
  });
  sendWorkbook(response, "docchain-structure-export.xlsx", buffer);
}));

adminStructureRouter.post("/imports/preview", upload.single("file"), asyncHandler(async (request, response) => {
  const state = await loadStructureState();
  const { preview } = await previewFor(uploadedWorkbook(request), state);
  ok(response, preview);
}));

adminStructureRouter.post("/imports/apply", upload.single("file"), asyncHandler(async (request, response) => {
  const parsed = await parseStructureWorkbook(uploadedWorkbook(request));
  const preview = await applyStructureImport(request, parsed);
  ok(response, preview);
}));
