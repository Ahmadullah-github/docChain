type UnitTypeHint = {
  code?: string | null;
  name?: string | null;
};

const titleMaxLength = 140;

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function truncateTitle(value: string) {
  const title = cleanText(value);
  return title.length > titleMaxLength ? title.slice(0, titleMaxLength).trim() : title;
}

function replaceLeading(value: string, patterns: Array<[RegExp, string]>) {
  const text = cleanText(value);
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(text)) {
      return truncateTitle(text.replace(pattern, replacement));
    }
  }

  return null;
}

const localTitlePatterns: Array<[RegExp, string]> = [
  [/^ریاست(?=\s|$)/u, "رئیس"],
  [/^رياست(?=\s|$)/u, "رئیس"],
  [/^معاونیت(?=\s|$)/u, "معاون"],
  [/^معاونيت(?=\s|$)/u, "معاون"],
  [/^مدیریت(?=\s|$)/u, "مدیر"],
  [/^مديريت(?=\s|$)/u, "مدیر"],
  [/^آمریت(?=\s|$)/u, "آمر"],
  [/^آمريت(?=\s|$)/u, "آمر"],
  [/^پوهنزی(?=\s|$)/u, "رئیس پوهنزی"],
  [/^پوهنځی(?=\s|$)/u, "رئیس پوهنځی"],
  [/^دیپارتمنت(?=\s|$)/u, "آمر دیپارتمنت"],
  [/^ديپارتمنت(?=\s|$)/u, "آمر دیپارتمنت"],
  [/^دیپارتمان(?=\s|$)/u, "آمر دیپارتمان"],
  [/^ديپارتمان(?=\s|$)/u, "آمر دیپارتمان"]
];

function englishFallbackTitle(unitName: string, unitType?: UnitTypeHint | null) {
  const type = `${unitType?.code || ""} ${unitType?.name || ""}`.toLowerCase();
  const name = cleanText(unitName);

  if (type.includes("faculty")) {
    return `Dean of ${name}`;
  }
  if (type.includes("department")) {
    return `Head of ${name}`;
  }
  if (type.includes("committee")) {
    return `Chair of ${name}`;
  }
  if (type.includes("office")) {
    return `Manager of ${name}`;
  }
  if (type.includes("university") || type.includes("organization")) {
    return `Head of ${name}`;
  }

  return `Head of ${name}`;
}

export function inferDefaultPositionTitle(unitName: string, unitType?: UnitTypeHint | null) {
  const localTitle = replaceLeading(unitName, localTitlePatterns);
  return truncateTitle(localTitle || englishFallbackTitle(unitName, unitType));
}

export const defaultHolderPositionDefaults = {
  allowsMultipleActiveAssignments: false,
  authorityLevel: 20,
  isSigningAuthority: true,
  status: "active"
} as const;

export const defaultPositionInternals = {
  truncateTitle
};
