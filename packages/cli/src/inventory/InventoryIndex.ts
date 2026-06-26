// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
// @cpt-algo:cpt-frontx-algo-template-resolution-bounded-update:p1
import type { InventoryEntry } from './types.js';
import { InventoryState } from './types.js';

// In-memory JSON-based index; supports in-memory mode for tests and
// can be extended with a file-backed persistence layer.
export class InventoryIndex {
  private readonly entries: Map<string, InventoryEntry> = new Map();

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-index
  record(entry: InventoryEntry): void {
    this.entries.set(entry.name, entry);
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-index

  // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-lookup
  lookup(name: string): InventoryEntry | undefined {
    return this.entries.get(name);
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-lookup

  // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-index-update
  update(name: string, patch: Partial<InventoryEntry>): void {
    const existing = this.entries.get(name);
    if (existing) {
      this.entries.set(name, { ...existing, ...patch });
    }
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-index-update

  all(): InventoryEntry[] {
    return Array.from(this.entries.values());
  }

  getState(name: string): InventoryState {
    const entry = this.entries.get(name);
    return entry?.status ?? InventoryState.UNRESOLVED;
  }

  toJSON(): string {
    const obj: Record<string, InventoryEntry> = {};
    this.entries.forEach((v, k) => { obj[k] = v; });
    return JSON.stringify(obj, null, 2);
  }
}
