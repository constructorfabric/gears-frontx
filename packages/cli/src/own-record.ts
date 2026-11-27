// Name-keyed lookups against records that hold USER-CHOSEN names (template
// names in `.frontx/project.json`, the inventory index, the official-defaults
// map, a batch's `templates`).
//
// A plain object literal or a `JSON.parse` result inherits `Object.prototype`,
// so `record['toString']` resolves to an inherited function instead of
// `undefined`, and `record['__proto__'] = x` rewires the prototype instead of
// storing an entry. Either turns "this name is absent" into a crash or a
// silently dropped entry. Every by-name read or write of such a record goes
// through these two helpers so only OWN properties ever count.

/** The value stored under `key` as an OWN property, else `undefined`. */
export function getOwn<V>(record: Readonly<Record<string, V>>, key: string): V | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

/** Stores `value` under `key` as an OWN property, including for `__proto__`. */
export function setOwn<V>(record: Record<string, V>, key: string, value: V): void {
  Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true });
}
