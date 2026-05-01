import { Router } from "express";
import type { ResultSetHeader } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { created } from "../../shared/http";
import { fetchById, listRoute, optionalNullableString } from "../../shared/route-utils";
import { uuid } from "../../shared/ids";

export const adminExternalDirectoryRouter = Router();

adminExternalDirectoryRouter.use(requireAuth, requireAnyRole(["system_admin", "admin_staff"]));

const createExternalOrganizationSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(180),
  organization_type: z.string().trim().min(1).max(80).default("external"),
  email: z.string().trim().email().nullable().optional(),
  phone: optionalNullableString,
  address: optionalNullableString,
  status: z.string().trim().min(1).max(40).default("active"),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const createExternalRecipientSchema = z.object({
  external_organization_id: z.coerce.number().int().positive(),
  full_name: z.string().trim().min(1).max(180),
  position_title: optionalNullableString,
  email: z.string().trim().email().nullable().optional(),
  phone: optionalNullableString,
  is_authorized: z.boolean().default(true),
  status: z.string().trim().min(1).max(40).default("active"),
  metadata: z.record(z.string(), z.unknown()).optional()
});

adminExternalDirectoryRouter.get("/external-organizations", listRoute("external_organizations"));
adminExternalDirectoryRouter.post("/external-organizations", asyncHandler(async (request, response) => {
  const input = createExternalOrganizationSchema.parse(request.body);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO external_organizations (
      uuid, code, name, organization_type, email, phone,
      address, status, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.code,
      input.name,
      input.organization_type,
      input.email || null,
      input.phone || null,
      input.address || null,
      input.status,
      JSON.stringify(input.metadata || {})
    ]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "admin.external_organization.create", entityType: "external_organization", entityId: id });
  created(response, await fetchById("external_organizations", Number(id)));
}));

adminExternalDirectoryRouter.get("/external-recipients", listRoute("external_recipients"));
adminExternalDirectoryRouter.post("/external-recipients", asyncHandler(async (request, response) => {
  const input = createExternalRecipientSchema.parse(request.body);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO external_recipients (
      uuid, external_organization_id, full_name, position_title, email,
      phone, is_authorized, status, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.external_organization_id,
      input.full_name,
      input.position_title || null,
      input.email || null,
      input.phone || null,
      input.is_authorized,
      input.status,
      JSON.stringify(input.metadata || {})
    ]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "admin.external_recipient.create", entityType: "external_recipient", entityId: id });
  created(response, await fetchById("external_recipients", Number(id)));
}));
