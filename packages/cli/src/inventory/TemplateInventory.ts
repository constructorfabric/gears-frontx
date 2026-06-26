// @cpt-flow:cpt-frontx-flow-template-resolution-install:p1
// @cpt-flow:cpt-frontx-flow-template-resolution-list:p1
// @cpt-flow:cpt-frontx-flow-template-resolution-update-local:p1
// @cpt-algo:cpt-frontx-algo-template-resolution-bounded-update:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-install-by-spec:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-list-inventory:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-bounded-local-update:p1
import { parseSourceSpec } from '../spec-parser/parse.js';
import { resolveToInventory } from '../resolver/resolve.js';
import type { FetchFn } from '../resolver/types.js';
import { InventoryIndex } from './InventoryIndex.js';
import { InventoryStore } from './InventoryStore.js';
import { InventoryState } from './types.js';
import type { InventoryEntry, InventoryResult } from './types.js';

export class TemplateInventory {
  private readonly index = new InventoryIndex();
  private readonly store = new InventoryStore();

  // --- install ---

  async install(
    spec: string,
    fetchFn: FetchFn,
  ): Promise<InventoryResult<{ name: string; ref: string }>> {
    // @cpt-begin:cpt-frontx-flow-template-resolution-install:p1:inst-install-invoke
    // entry: install command invoked with spec
    // @cpt-end:cpt-frontx-flow-template-resolution-install:p1:inst-install-invoke

    // @cpt-begin:cpt-frontx-flow-template-resolution-install:p1:inst-install-parse
    const parseResult = parseSourceSpec(spec);
    // @cpt-end:cpt-frontx-flow-template-resolution-install:p1:inst-install-parse

    // @cpt-begin:cpt-frontx-flow-template-resolution-install:p1:inst-install-parse-check
    if (!parseResult.ok) {
      // @cpt-begin:cpt-frontx-flow-template-resolution-install:p1:inst-install-parse-reject
      // @cpt-begin:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-parse-fail-loop
      return { ok: false, error: { message: parseResult.error.message } };
      // @cpt-end:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-parse-fail-loop
      // @cpt-end:cpt-frontx-flow-template-resolution-install:p1:inst-install-parse-reject
    }
    // @cpt-end:cpt-frontx-flow-template-resolution-install:p1:inst-install-parse-check

    // @cpt-begin:cpt-frontx-flow-template-resolution-install:p1:inst-install-resolve
    // @cpt-begin:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-to-resolved
    const resolveResult = await resolveToInventory(parseResult.value, fetchFn);
    // @cpt-end:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-to-resolved
    // @cpt-end:cpt-frontx-flow-template-resolution-install:p1:inst-install-resolve

    // @cpt-begin:cpt-frontx-flow-template-resolution-install:p1:inst-install-fetch
    // @cpt-begin:cpt-frontx-flow-template-resolution-install:p1:inst-install-reach-check
    if (!resolveResult.ok) {
      // @cpt-begin:cpt-frontx-flow-template-resolution-install:p1:inst-install-reach-fail
      // @cpt-begin:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-fetch-fail-loop
      return { ok: false, error: { message: resolveResult.error.message } };
      // @cpt-end:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-fetch-fail-loop
      // @cpt-end:cpt-frontx-flow-template-resolution-install:p1:inst-install-reach-fail
    }
    // @cpt-end:cpt-frontx-flow-template-resolution-install:p1:inst-install-reach-check
    // @cpt-end:cpt-frontx-flow-template-resolution-install:p1:inst-install-fetch

    // @cpt-begin:cpt-frontx-flow-template-resolution-install:p1:inst-install-materialize
    // @cpt-begin:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-to-installed
    const record = resolveResult.value;
    this.store.write(record.name, record.content);
    const entry: InventoryEntry = {
      name: record.name,
      source: record.source,
      ref: record.ref,
      status: InventoryState.INSTALLED,
      content: record.content,
    };
    this.index.record(entry);
    // @cpt-end:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-to-installed
    // @cpt-end:cpt-frontx-flow-template-resolution-install:p1:inst-install-materialize

    // @cpt-begin:cpt-frontx-flow-template-resolution-install:p1:inst-install-success
    return { ok: true, value: { name: record.name, ref: record.ref } };
    // @cpt-end:cpt-frontx-flow-template-resolution-install:p1:inst-install-success
  }

  // --- list ---

  async list(): Promise<InventoryEntry[]> {
    // @cpt-begin:cpt-frontx-flow-template-resolution-list:p1:inst-list-invoke
    // entry: list command invoked
    // @cpt-end:cpt-frontx-flow-template-resolution-list:p1:inst-list-invoke

    // @cpt-begin:cpt-frontx-flow-template-resolution-list:p1:inst-list-read
    const entries = this.index.all();
    // @cpt-end:cpt-frontx-flow-template-resolution-list:p1:inst-list-read

    // @cpt-begin:cpt-frontx-flow-template-resolution-list:p1:inst-list-empty-check
    if (entries.length === 0) {
      // @cpt-begin:cpt-frontx-flow-template-resolution-list:p1:inst-list-empty-return
      return [];
      // @cpt-end:cpt-frontx-flow-template-resolution-list:p1:inst-list-empty-return
    }
    // @cpt-end:cpt-frontx-flow-template-resolution-list:p1:inst-list-empty-check

    // @cpt-begin:cpt-frontx-flow-template-resolution-list:p1:inst-list-format
    // entries already contain name and ref for formatting
    // @cpt-end:cpt-frontx-flow-template-resolution-list:p1:inst-list-format

    // @cpt-begin:cpt-frontx-flow-template-resolution-list:p1:inst-list-return
    return entries;
    // @cpt-end:cpt-frontx-flow-template-resolution-list:p1:inst-list-return
  }

  // --- update-local ---

  async updateLocal(
    name: string,
    spec: string,
    fetchFn: FetchFn,
  ): Promise<InventoryResult<{ name: string; ref: string }>> {
    // @cpt-begin:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-invoke
    // entry: update-local command invoked
    // @cpt-end:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-invoke

    // @cpt-begin:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-lookup
    // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-lookup
    const existing = this.index.lookup(name);
    // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-lookup
    // @cpt-end:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-lookup

    // @cpt-begin:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-notfound-check
    // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-absent-check
    if (!existing) {
      // @cpt-begin:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-notfound
      // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-absent-fail
      return {
        ok: false,
        error: {
          message: `Template not found in local inventory: "${name}". Install it first with the install command.`,
        },
      };
      // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-absent-fail
      // @cpt-end:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-notfound
    }
    // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-absent-check
    // @cpt-end:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-notfound-check

    // @cpt-begin:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-parse
    const parseResult = parseSourceSpec(spec);
    // @cpt-end:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-parse

    // @cpt-begin:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-parse-check
    if (!parseResult.ok) {
      // @cpt-begin:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-parse-reject
      return { ok: false, error: { message: parseResult.error.message } };
      // @cpt-end:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-parse-reject
    }
    // @cpt-end:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-parse-check

    // @cpt-begin:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-fetch
    // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-fetch
    const resolveResult = await resolveToInventory(parseResult.value, fetchFn);
    // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-fetch
    // @cpt-end:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-fetch

    // @cpt-begin:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-reach-check
    // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-fetch-fail-check
    if (!resolveResult.ok) {
      // @cpt-begin:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-reach-fail
      // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-fetch-fail
      return { ok: false, error: { message: resolveResult.error.message } };
      // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-fetch-fail
      // @cpt-end:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-reach-fail
    }
    // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-fetch-fail-check
    // @cpt-end:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-reach-check

    // @cpt-begin:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-write
    // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-replace
    const record = resolveResult.value;
    this.store.replace(existing.name, record.content);
    // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-replace
    // @cpt-end:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-write

    // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-index-update
    // @cpt-begin:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-to-updated
    this.index.update(existing.name, {
      ref: record.ref,
      source: record.source,
      content: record.content,
      status: InventoryState.UPDATED,
    });
    // @cpt-end:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-to-updated
    // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-index-update

    // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-boundary-confirm
    // Boundary invariant: only paths within this.store and this.index were written.
    // No filesystem paths outside the in-memory inventory store are touched.
    // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-boundary-confirm

    // @cpt-begin:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-success
    // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-return
    return { ok: true, value: { name: existing.name, ref: record.ref } };
    // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-return
    // @cpt-end:cpt-frontx-flow-template-resolution-update-local:p1:inst-update-success
  }

  // --- state machine query ---

  // @cpt-state:cpt-frontx-state-template-resolution-inventory-lifecycle:p1
  getState(name: string): InventoryState {
    return this.index.getState(name);
  }
}
