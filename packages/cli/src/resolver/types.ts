// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1

export type FetchFn = (url: string) => Promise<string>;

export interface InventoryReadyRecord {
  name: string;
  content: string;
  ref: string;
  source: string;
}

export interface ResolutionError {
  message: string;
}

export type ResolveResult =
  | { ok: true; value: InventoryReadyRecord }
  | { ok: false; error: ResolutionError };
