// @cpt-state:cpt-frontx-state-template-resolution-inventory-lifecycle:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-install-by-spec:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-list-inventory:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-bounded-local-update:p1

// @cpt-begin:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-to-resolved
export enum InventoryState {
  UNRESOLVED = 'UNRESOLVED',
  RESOLVED = 'RESOLVED',
  INSTALLED = 'INSTALLED',
  UPDATED = 'UPDATED',
}
// @cpt-end:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-to-resolved

export interface InventoryEntry {
  name: string;
  source: string;
  ref: string;
  status: InventoryState;
  content: string;
}

export interface InventoryError {
  message: string;
}

export type InventoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: InventoryError };
