// @cpt-algo:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-mfe-scaffold:p1

// Injected write function — caller supplies; no direct filesystem access in core logic.
export type WriteFileFn = (destPath: string, content: string) => Promise<void>;

// Injected conflict check — returns true when the target directory has conflicting content.
export type ConflictCheckFn = (targetDir: string) => Promise<boolean>;

export type ScaffoldResult =
  | { ok: true; message: string }
  | { ok: false; reason: 'unresolved' | 'conflict' | 'kind-mismatch'; message: string };
