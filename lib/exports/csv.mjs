const FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/u;

export function neutralizeCsvFormula(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

export function encodeCsvCell(value) {
  const text = neutralizeCsvFormula(value);
  const escaped = text.replaceAll('"', '""');
  return /[",\r\n]/u.test(escaped) ? `"${escaped}"` : escaped;
}

export function encodeCsvRow(values) {
  return values.map((value) => encodeCsvCell(value)).join(",");
}
