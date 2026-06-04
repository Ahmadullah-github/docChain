import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { AppError } from "../../shared/errors";

export type AdminCodeEntityType = "organization" | "unit" | "position" | "document_type" | "confidentiality_level" | "priority_level" | "serial_rule";

export type AdminCodeSuggestionInput = {
  entity_type: AdminCodeEntityType;
  exclude_id?: number;
  name?: string;
  organization_id?: number;
  parent_unit_id?: number | null;
  title?: string;
  unit_id?: number;
  unit_type_id?: number;
};

export type AdminCodeSuggestion = {
  base: string;
  code: string;
  sequence: number;
};

const entityFallbackPrefixes: Record<AdminCodeEntityType, string> = {
  confidentiality_level: "CON",
  document_type: "DOC",
  organization: "ORG",
  position: "POS",
  priority_level: "PRI",
  serial_rule: "SER",
  unit: "UNT"
};

const abbreviationStopWords = new Set(["A", "AN", "AND", "DA", "DE", "EL", "FOR", "OF", "THE", "TO"]);

function wordsFromHint(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .split(/[^A-Z0-9]+/g)
    .filter((word) => word && !abbreviationStopWords.has(word));
}

function abbreviationFromHint(value: string | null | undefined, fallback: string) {
  const words = wordsFromHint(value);
  if (!words.length) {
    return fallback;
  }

  let abbreviation = "";
  if (words.length >= 3) {
    abbreviation = words.slice(0, 3).map((word) => word[0]).join("");
  } else if (words.length === 2) {
    abbreviation = `${words[0][0]}${words[1].slice(0, 2)}`;
  } else {
    abbreviation = words[0].slice(0, 3);
  }

  return (abbreviation || fallback).padEnd(3, fallback[0] || "X").slice(0, 3);
}

function codeWithSequence(base: string, sequence: number) {
  const suffix = String(sequence).padStart(4, "0");
  return `${base}-${suffix}`;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureScopedContext(input: AdminCodeSuggestionInput) {
  if (input.entity_type === "unit" && !input.organization_id) {
    throw new AppError(422, "missing_code_context", "Organization is required before a unit code can be generated.");
  }
  if (input.entity_type === "position" && !input.unit_id) {
    throw new AppError(422, "missing_code_context", "Unit is required before a position code can be generated.");
  }
}

async function existingScopedCodes(executor: Pool | PoolConnection, input: AdminCodeSuggestionInput, base: string) {
  const pattern = `${escapeLike(base)}-%`;
  const values: any[] = [pattern];
  let sql = "";

  if (input.entity_type === "organization") {
    sql = "SELECT id, code FROM organizations WHERE code LIKE ? ESCAPE '\\\\'";
  } else if (input.entity_type === "document_type") {
    sql = "SELECT id, code FROM document_types WHERE code LIKE ? ESCAPE '\\\\'";
  } else if (input.entity_type === "confidentiality_level") {
    sql = "SELECT id, code FROM confidentiality_levels WHERE code LIKE ? ESCAPE '\\\\'";
  } else if (input.entity_type === "priority_level") {
    sql = "SELECT id, code FROM priority_levels WHERE code LIKE ? ESCAPE '\\\\'";
  } else if (input.entity_type === "serial_rule") {
    sql = "SELECT id, code FROM serial_rules WHERE code LIKE ? ESCAPE '\\\\'";
  } else if (input.entity_type === "unit") {
    if (!input.organization_id) {
      throw new AppError(422, "missing_code_context", "Organization is required before a unit code can be generated.");
    }
    sql = "SELECT id, code FROM units WHERE code LIKE ? ESCAPE '\\\\' AND organization_id = ?";
    values.push(input.organization_id);
  } else {
    if (!input.unit_id) {
      throw new AppError(422, "missing_code_context", "Unit is required before a position code can be generated.");
    }
    sql = "SELECT id, code FROM positions WHERE code LIKE ? ESCAPE '\\\\' AND unit_id = ?";
    values.push(input.unit_id);
  }

  if (input.exclude_id) {
    sql += " AND id <> ?";
    values.push(input.exclude_id);
  }

  const [rows] = await executor.execute<RowDataPacket[]>(sql, values);
  return rows.map((row) => String(row.code || ""));
}

export async function generateAdminCode(executor: Pool | PoolConnection, input: AdminCodeSuggestionInput): Promise<AdminCodeSuggestion> {
  ensureScopedContext(input);
  const base = abbreviationFromHint(input.title || input.name, entityFallbackPrefixes[input.entity_type]);
  const pattern = new RegExp(`^${escapeRegex(base)}-(\\d+)$`);
  const existingCodes = await existingScopedCodes(executor, input, base);
  const highestSequence = existingCodes.reduce((highest, code) => {
    const match = pattern.exec(code);
    return match ? Math.max(highest, Number(match[1]) || 0) : highest;
  }, 0);
  const sequence = highestSequence + 1;

  return {
    base,
    code: codeWithSequence(base, sequence),
    sequence
  };
}

export const codeGeneratorInternals = {
  abbreviationFromHint,
  codeWithSequence,
  wordsFromHint
};
