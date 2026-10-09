/** Any non-null object, arrays included: the shape a value must have to be read by key. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
