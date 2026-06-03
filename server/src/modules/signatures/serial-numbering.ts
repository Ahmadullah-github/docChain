export const serialStatuses = ["draft", "active", "inactive", "archived"] as const;
export const serialScopes = ["global", "organization", "origin_unit", "document_type", "origin_unit_document_type"] as const;
export const serialResetPolicies = ["yearly", "monthly", "never"] as const;

export type SerialStatus = (typeof serialStatuses)[number];
export type SerialScope = (typeof serialScopes)[number];
export type SerialResetPolicy = (typeof serialResetPolicies)[number];

export type SerialRuleLike = {
  format?: string | null;
  reset_policy?: string | null;
  scope?: string | null;
  sequence_padding?: string | number | null;
};

export type SerialContext = {
  documentTypeCode?: string | null;
  organizationCode?: string | null;
  originUnitCode?: string | null;
};

export type SerialSequenceKey = {
  sequencePeriod: string;
  sequenceScope: string;
  sequenceYear: number;
};

export const supportedSerialTokens = ["YEAR", "YY", "MONTH", "SEQUENCE", "SEQ", "ORG", "DOC"] as const;

const supportedTokenSet = new Set<string>(supportedSerialTokens);

export function serialDateParts(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return {
    month,
    year,
    yy: String(year).slice(-2)
  };
}

export function normalizeSerialScope(value?: string | null): SerialScope {
  return serialScopes.includes(value as SerialScope) ? value as SerialScope : "global";
}

export function normalizeSerialResetPolicy(value?: string | null): SerialResetPolicy {
  return serialResetPolicies.includes(value as SerialResetPolicy) ? value as SerialResetPolicy : "yearly";
}

export function normalizeSerialPadding(value?: string | number | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 6;
  }

  return Math.min(12, Math.max(1, Math.trunc(parsed)));
}

export function findUnsupportedSerialTokens(format: string) {
  const matches = Array.from(format.matchAll(/\{([A-Z_]+)\}/gi));
  const tokens = matches.map((match) => match[1].toUpperCase());

  return Array.from(new Set(tokens.filter((token) => !supportedTokenSet.has(token))));
}

export function serialPeriodForDate(resetPolicy: string | null | undefined, date = new Date()) {
  const { month, year } = serialDateParts(date);

  switch (normalizeSerialResetPolicy(resetPolicy)) {
    case "monthly":
      return `${year}-${month}`;
    case "never":
      return "all";
    case "yearly":
    default:
      return String(year);
  }
}

function cleanCode(value: string | null | undefined, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function serialScopeForContext(scope: string | null | undefined, context: SerialContext = {}) {
  const organizationCode = cleanCode(context.organizationCode, "ORG");
  const originUnitCode = cleanCode(context.originUnitCode, "UNIT");
  const documentTypeCode = cleanCode(context.documentTypeCode, "DOC");

  switch (normalizeSerialScope(scope)) {
    case "organization":
      return `org:${organizationCode}`;
    case "origin_unit":
      return `unit:${originUnitCode}`;
    case "document_type":
      return `doc:${documentTypeCode}`;
    case "origin_unit_document_type":
      return `unit:${originUnitCode}:doc:${documentTypeCode}`;
    case "global":
    default:
      return "global";
  }
}

export function serialSequenceKey(rule: SerialRuleLike, context: SerialContext = {}, date = new Date()): SerialSequenceKey {
  return {
    sequencePeriod: serialPeriodForDate(rule.reset_policy, date),
    sequenceScope: serialScopeForContext(rule.scope, context),
    sequenceYear: date.getUTCFullYear()
  };
}

export function formatSerialNumber(rule: SerialRuleLike, input: {
  context?: SerialContext;
  date?: Date;
  sequenceValue: number;
}) {
  const format = String(rule.format || "DOC-{YEAR}-{SEQUENCE}");
  const padding = normalizeSerialPadding(rule.sequence_padding);
  const sequence = String(input.sequenceValue).padStart(padding, "0");
  const dateParts = serialDateParts(input.date || new Date());
  const context = input.context || {};
  const tokenValues: Record<string, string> = {
    DOC: cleanCode(context.documentTypeCode, "DOC"),
    MONTH: dateParts.month,
    ORG: cleanCode(context.organizationCode, "ORG"),
    SEQ: sequence,
    SEQUENCE: sequence,
    YEAR: String(dateParts.year),
    YY: dateParts.yy
  };

  return format.replace(/\{([A-Z_]+)\}/gi, (token, rawName: string) => {
    const name = rawName.toUpperCase();
    return tokenValues[name] ?? token;
  });
}

export function previewSerialNumber(rule: SerialRuleLike, input: {
  context?: SerialContext;
  currentValue?: number;
  date?: Date;
  sequenceValue?: number;
} = {}) {
  const date = input.date || new Date();
  const sequenceValue = input.sequenceValue ?? Number(input.currentValue || 0) + 1;
  const sequenceKey = serialSequenceKey(rule, input.context, date);

  return {
    serialValue: formatSerialNumber(rule, { context: input.context, date, sequenceValue }),
    sequencePeriod: sequenceKey.sequencePeriod,
    sequenceScope: sequenceKey.sequenceScope,
    sequenceValue,
    sequenceYear: sequenceKey.sequenceYear,
    unsupportedTokens: findUnsupportedSerialTokens(String(rule.format || ""))
  };
}
