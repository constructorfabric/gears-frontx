/**
 * Test support for realm-shared store state. Tests that touch the realm slot
 * delete it before they run and after they end, so state never leaks from
 * one test into the next.
 */
import { type JsonEntity } from '@globaltypesystem/gts-ts';
import { loadLifecycleStages, loadSchemas } from '../loader';
import { copyKeyInputs } from '../copy-key';
import { resetLocalPairForTests, slotKey, type StorePair } from '../store-pair';

const OWNED_PREFIX = '@gears-frontx/gts-plugin:';

export function resetRealm(): void {
  for (const sym of Object.getOwnPropertySymbols(globalThis)) {
    if (sym.description?.startsWith(OWNED_PREFIX)) Reflect.deleteProperty(globalThis, sym);
  }
  resetLocalPairForTests();
}

/** Key inputs of the package under test, as a copy of it would derive them. */
export function thisCopyInputs() {
  return copyKeyInputs([...loadSchemas(), ...loadLifecycleStages()]);
}

/** The pair published in the realm slot, if any. */
export function publishedPair(): StorePair | undefined {
  const entry: unknown = Reflect.get(globalThis, slotKey(thisCopyInputs()));
  return typeof entry === 'object' && entry !== null ? (entry as StorePair) : undefined;
}

export const META_SCHEMA = 'https://json-schema.org/draft/2020-12/schema';

export function nodeSchema(typeId: string, extra: Record<string, unknown> = {}) {
  return {
    $id: `gts://${typeId}`,
    $schema: META_SCHEMA,
    type: 'object',
    properties: {
      id: { 'x-gts-ref': '/$id' },
      peer: { type: 'string', 'x-gts-ref': `${typeId}*` },
      ...extra,
    },
    required: ['id'],
  };
}

export function ids(entities: JsonEntity[]): string[] {
  return entities.map((e) => e.id).sort();
}
