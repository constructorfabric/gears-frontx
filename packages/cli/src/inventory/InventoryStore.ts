// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
// @cpt-algo:cpt-frontx-algo-template-resolution-bounded-update:p1

// In-memory content store; production usage can back this with the filesystem.
// Keeping it separate from the index enforces the single-responsibility
// principle: index = metadata, store = content blobs.
export class InventoryStore {
  private readonly store: Map<string, string> = new Map();

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-write
  write(name: string, content: string): void {
    this.store.set(name, content);
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-write

  // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-replace
  replace(name: string, content: string): void {
    this.store.set(name, content);
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-replace

  read(name: string): string | undefined {
    return this.store.get(name);
  }

  has(name: string): boolean {
    return this.store.has(name);
  }
}
