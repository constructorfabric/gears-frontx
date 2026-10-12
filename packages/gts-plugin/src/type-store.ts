/**
 * Write rules for the shared store pair
 *
 * Types: the first definition under an identifier stands. Instances: the last
 * valid write stands. Both stores of a pair hold the same entity under every
 * identifier between any two calls, because the scratch store validates a
 * candidate without letting a failure reach the store the rest of the
 * package reads.
 *
 * Every function here does all its store reads and writes synchronously, so
 * calls on one pair never interleave and need no lock.
 *
 * @packageDocumentation
 */

import { Gts, createJsonEntity, type JsonEntity } from '@globaltypesystem/gts-ts';
import { canonicalText, copyContent, cyrb53, deepCopyJson, sameContent } from './canonical';
import { FRONTX_SHARED_PROPERTY_PATTERN } from './constants';
import { keyName, type StorePair, type WriterToken } from './store-pair';

// @cpt-algo:cpt-frontx-algo-gts-type-provider-schema-write:p1
// @cpt-algo:cpt-frontx-algo-gts-type-provider-instance-write:p1
// @cpt-algo:cpt-frontx-algo-gts-type-provider-mirror-restore:p1


export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Identifiers a failed validation may have been missing, from facts the GTS
 * library provides and what the store holds: the entity itself when the store
 * holds none, and for an entity, the schema it names and the references the
 * library found in it (`JsonEntity.references`), keeping only what the library
 * reads as a non-wildcard identifier. The package reads nothing in the content itself.
 */
function missingIds(pair: StorePair, id: string, entity: JsonEntity | undefined): string[] {
  const { store } = pair;
  if (!entity) return [id];
  const wanted = entity.schemaId ? [entity.schemaId, ...entity.references] : [...entity.references];
  const missing = new Set<string>();
  for (const candidate of wanted) {
    // Only what the library reads as a GTS identifier: a schema's own `schemaId` is a meta-schema URL.
    const verdict = Gts.validateGtsID(candidate);
    if (verdict.valid && !verdict.is_wildcard && !store.get(candidate)) missing.add(candidate);
  }
  return [...missing];
}

/**
 * A failure reason that always names the store searched and says the failure
 * may be down to registration order or to a different store. The package
 * cannot tell which references a schema checks (only the library's validator
 * reads `x-gts-ref` values), so the hint is conditional and never depends on
 * finding something missing. When the structural checks do find something
 * missing, it is named too.
 *
 * @param subject.entity - the entity the failure is about, or undefined when the store holds none under `id`
 */
export function describeFailure(
  reason: string,
  pair: StorePair,
  subject: { id: string; entity?: JsonEntity }
): string {
  const missing = missingIds(pair, subject.id, subject.entity);
  return (
    `${reason}\nStore: ${keyName(pair)}` +
    (missing.length > 0 ? `\nNot found on this store: ${missing.join(', ')}.` : '') +
    '\nIf this refers to something that is not registered here, it may be registered later, ' +
    'or by a runtime on a different store.'
  );
}

function ordinalOf(token: WriterToken | undefined): string {
  return token ? String(token.ordinal) : 'unknown';
}

/** Key under which a warning is remembered: the identifier and the offered content. */
function reportKey(kind: 'schema' | 'instance', id: string, content: unknown): string {
  // A hash, not the text: the set lives as long as the realm and must not keep every offered definition.
  const text = canonicalText(content);
  return `${kind}\u0000${id}\u0000${text.ok ? cyrb53(text.text) : 'unrepresentable'}`;
}

/**
 * Write a definition into the pair if no definition is held under its identifier.
 * A later definition never replaces the first, and never throws: it is
 * reported once and dropped.
 *
 * @throws Error when the definition cannot be a stored type
 */
export function writeSchema(pair: StorePair, token: WriterToken, entity: JsonEntity): void {
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-refuse
  const offered = canonicalText(entity.content);
  if (!offered.ok) {
    throw new Error(
      `GTS schema '${entity.id || '(no identifier)'}' refused: its content is not representable as JSON (${offered.reason}).`
    );
  }
  // The library decides what a type identifier is and why an identifier is invalid.
  if (!Gts.isType(entity.id)) {
    throw new Error(
      `GTS schema refused: the GTS library does not read '${entity.id || '(no identifier)'}' as a type identifier.`
    );
  }
  const validity = Gts.validateGtsID(entity.id);
  if (!validity.valid) {
    throw new Error(`GTS schema refused: '${entity.id}' is not a valid GTS identifier: ${validity.error}`);
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-refuse

  const { store, scratch } = pair;
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-lookup
  const held = store.get(entity.id);
  // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-lookup

  // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-if-new
  if (!held) {
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-register-both
    // The store keeps its own copy: a later change to the caller's object
    // must never reach a registered definition.
    const stored = createJsonEntity(deepCopyJson(entity.content));
    store.register(stored);
    scratch.register(stored);
    pair.writers.set(stored.id, token);
    // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-register-both
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-return-new
    return;
    // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-return-new
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-if-new

  // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-return-same
  if (sameContent(held.content, entity.content)) return;
  // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-return-same

  // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-warn-conflict
  const reported = reportKey('schema', entity.id, entity.content);
  if (!pair.reported.has(reported)) {
    pair.reported.add(reported);
    console.warn(
      `[gts-plugin] Type '${entity.id}' on store ${keyName(pair)} already has a definition; the offered one is ignored. ` +
        `Kept: registered by copy ${ordinalOf(pair.writers.get(held.id))}. Refused: offered by copy ${token.ordinal}.\n` +
        `Kept definition: ${safeStringify(held.content)}\n` +
        `Refused definition: ${safeStringify(entity.content)}\n` +
        'A changed definition needs a new type identifier. In development, a schema edited without a new identifier takes effect only after a full page reload.'
    );
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-warn-conflict
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-return-conflict
  // Nothing written, nothing thrown: the first definition stands.
  // @cpt-end:cpt-frontx-algo-gts-type-provider-schema-write:p1:inst-sw-return-conflict
}

/**
 * Put the scratch store back in step with the store after a candidate failed
 * validation in it.
 */
// @cpt-begin:cpt-frontx-algo-gts-type-provider-mirror-restore:p1:inst-mr-restore-held
export function restoreMirror(pair: StorePair, candidateId: string): void {
  const heldEntity = pair.store.get(candidateId);
  if (heldEntity) {
    // Writing the candidate into the scratch store replaced exactly this entry.
    pair.scratch.register(heldEntity);
    return;
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-mirror-restore:p1:inst-mr-restore-held
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-mirror-restore:p1:inst-mr-rebuild
  // A store has no removal call, so a candidate under a new identifier can
  // only be dropped by rebuilding. The pair's factory keeps every store of
  // the pair on one copy of the GTS library and of its validator.
  const fresh = pair.createStore();
  for (const entity of pair.store.getAll()) {
    fresh.register(entity);
  }
  pair.scratch = fresh;
  // @cpt-end:cpt-frontx-algo-gts-type-provider-mirror-restore:p1:inst-mr-rebuild
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-mirror-restore:p1:inst-mr-budget
  // Only a rejected candidate under an unheld identifier gets here; the success
  // path never rebuilds. mirror-rebuild-budget.test.ts holds this to 50 ms.
  // @cpt-end:cpt-frontx-algo-gts-type-provider-mirror-restore:p1:inst-mr-budget
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-mirror-restore:p1:inst-mr-return
  // The mirror is restored before the caller raises its error.
  // @cpt-end:cpt-frontx-algo-gts-type-provider-mirror-restore:p1:inst-mr-return
}

/**
 * Validate an instance against the pair's current state, then write it,
 * replacing what the store held under its identifier.
 *
 * @throws Error when validation fails; the store is then exactly as it was
 */
export function writeInstance(pair: StorePair, token: WriterToken, entity: JsonEntity): void {
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-read
  const { store, scratch } = pair;
  // @cpt-end:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-read
  const id = entity.id;
  const held = id === '' ? undefined : store.get(id);

  // @cpt-begin:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-refuse-type
  // Content without a $schema is classified as an instance by the library, even
  // under a type identifier. Writing it would replace a registered definition,
  // which must never change, so refuse before anything is touched.
  if (Gts.isType(id) || held?.isSchema) {
    throw new Error(
      `GTS instance '${id}' refused: the GTS library reads it as a type identifier, or the store holds a type under it, ` +
        'and an instance cannot be written under it.\n' +
        `Store: ${keyName(pair)}`
    );
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-refuse-type

  // @cpt-begin:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-validate
  // Validate the object as offered, not a copy: the JSON copy drops a key whose
  // value is undefined, and the closed action schemas must still reject an
  // undeclared field that is set to undefined. Validation also runs when the
  // content equals what is held, because the canonical form treats undefined
  // as absent and would otherwise let such a field through.
  let failure: string | undefined;
  try {
    scratch.register(entity);
    const result = scratch.validateInstance(id);
    if (!result.ok || !result.valid) {
      failure = result.ok ? 'schema validation returned invalid' : (result.error ?? 'unknown validation error');
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-validate

  // @cpt-begin:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-if-invalid
  if (failure !== undefined) {
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-restore
    restoreMirror(pair, id);
    // @cpt-end:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-restore
    // @cpt-begin:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-raise
    const schema = entity.schemaId ? pair.store.get(entity.schemaId) : undefined;
    throw new Error(
      `GTS validation failed for instance '${id || '(anonymous)'}'\n` +
        `Reason: ${describeFailure(failure, pair, { id, entity })}\n` +
        `Instance: ${safeStringify(entity.content)}\n` +
        `Schema: ${schema ? safeStringify(schema.content) : '(schema not resolved)'}`
    );
    // @cpt-end:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-raise
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-if-invalid

  // @cpt-begin:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-return-same
  if (held && sameContent(held.content, entity.content)) {
    // The scratch store holds the offered object; put back what the store holds.
    scratch.register(held);
    return;
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-return-same

  // @cpt-begin:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-warn-replace
  const writer = pair.writers.get(id);
  if (held && id !== '' && !Gts.matchIDPattern(id, FRONTX_SHARED_PROPERTY_PATTERN).match && writer && writer !== token) {
    const reported = reportKey('instance', id, entity.content);
    if (!pair.reported.has(reported)) {
      pair.reported.add(reported);
      console.warn(
        `[gts-plugin] Instance '${id}' on store ${keyName(pair)} written by copy ${writer.ordinal} is replaced with different content by copy ${token.ordinal}.`
      );
    }
  }
  // @cpt-end:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-warn-replace

  // @cpt-begin:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-commit
  // Both stores take the same copy and neither holds the caller's object: a
  // later change to that object must never reach a stored instance. Content
  // that is not JSON cannot be copied and is kept as given; it never compares
  // equal either.
  const copy = copyContent(entity.content);
  const candidate = copy === entity.content ? entity : createJsonEntity(copy);
  store.register(candidate);
  scratch.register(candidate);
  if (id !== '') pair.writers.set(id, token);
  // @cpt-end:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-commit
  // @cpt-begin:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-return
  // Both stores hold the same entities again.
  // @cpt-end:cpt-frontx-algo-gts-type-provider-instance-write:p1:inst-iw-return
}
