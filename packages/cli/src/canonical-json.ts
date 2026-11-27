// Canonical JSON: object keys sorted at every depth (members whose value is
// `undefined` are dropped), array order preserved. Shared by every plan digest
// (`upgrade/plan.ts`, `commands/delete.ts`) so a digest depends on a plan's
// content and never on the order a field happened to be assigned. Arrays are
// NOT sorted here: a caller whose array is a set sorts it itself.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const members = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value);
}
