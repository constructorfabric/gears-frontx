/**
 * MFE Dynamic Module Operations — Audited Trust Kernel
 *
 * This file concentrates operations that static analyzers flag as security
 * risks but are safe by construction. It is EXCLUDED from Codacy's security
 * scan (via `.codacy.yaml`) because its patterns trip too many false-positive
 * rules (non-literal RegExp, unsafe dynamic import) despite being provably
 * safe for our inputs.
 *
 * **TRUST BOUNDARY — READ BEFORE EDITING:**
 *
 * This file is the ONLY place where blob-URL `import()` and RegExp
 * construction from interpolated strings are allowed in production source.
 * A custom ESLint rule (`local/trusted-patterns-file`) enforces:
 *
 *   1. Every exported function must have a JSDoc block with `@safety-reviewed`
 *      and `@why` tags explaining why the pattern is safe.
 *   2. No module-level state — only pure function declarations at the top level.
 *   3. No dangerous imports: `fs`, `child_process`, `process.env`, etc.
 *
 * **Scope creep control:** adding a function here should require a security
 * review. If you find yourself tempted to "just add one more helper," STOP.
 * Either prove the helper is safe and document it with `@why`, or put it in a
 * scanned file where Codacy can keep watching it.
 *
 * @packageDocumentation
 */

/**
 * Test whether a source text contains an import of a specific package name.
 * Matches both `from "pkg"` (static imports and re-exports) and `import "pkg"`
 * (side-effect imports). Exact package names only — `react-dom` is not matched
 * by a query for `react`.
 *
 * @safety-reviewed 2026-04-20
 * @why The `packageName` argument is interpolated into a RegExp. All regex
 *      metacharacters are escaped one line above via
 *      `/[.*+?^${}()|[\]\\]/g` → `String.raw\`\\$&\``. The escape covers every
 *      character that has regex meaning; ReDoS requires a pattern capable of
 *      catastrophic backtracking, which the escaped literal cannot produce.
 * @inputs `packageName` ∈ the set of shared dep names declared on the resolved
 *         `MfManifest` contract — bounded, author-declared, not user input.
 */
export function sourceImports(source: string, packageName: string): boolean {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(String.raw`(?:from|import)\s*["']${escaped}["']`).test(source);
}

/**
 * Rewrite a single bare specifier in source text. Handles both static
 * (`from "pkg"`) and side-effect (`import "pkg"`) import forms. Preserves
 * quote style (single or double). Matches exact package names only.
 *
 * @safety-reviewed 2026-04-20
 * @why Same escaping argument as `sourceImports`: `packageName` is
 *      regex-escaped before interpolation, so the constructed RegExp cannot
 *      be exploited by adversarial inputs.
 * @inputs `packageName` in shared dep names from the resolved `MfManifest` contract.
 *         `replacement` is a blob URL produced by `URL.createObjectURL`.
 *         Neither is user input.
 */
export function rewriteBareSpecifier(
  source: string,
  packageName: string,
  replacement: string,
): string {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const fromPattern = new RegExp(
    String.raw`(from\s*["'])${escaped}(["'])`,
    'g',
  );
  let result = source.replace(fromPattern, `$1${replacement}$2`);
  const sideEffectPattern = new RegExp(
    String.raw`(import\s*["'])${escaped}(["'])`,
    'g',
  );
  result = result.replace(sideEffectPattern, `$1${replacement}$2`);
  return result;
}

/**
 * Dynamically import a blob URL and return the evaluated ES module record.
 * This is the core mechanism of per-MFE module isolation: each MFE load
 * produces a fresh blob URL whose content is evaluated as an isolated ES
 * module instance.
 *
 * @safety-reviewed 2026-04-22
 * @why The URL is ALWAYS a scheme-prefixed inline-content URL constructed
 *      by the handler itself — `blob:` in production (from
 *      `URL.createObjectURL(new Blob([rewrittenSource]))`), or `data:` in
 *      tests that stub `createObjectURL` because jsdom cannot `import()` a
 *      `blob:` URL directly. Both schemes carry inline content with no
 *      network access, so the safety property is identical: no path,
 *      network URL, or user input can reach this function. The runtime
 *      guard below makes that invariant executable so accidental call
 *      sites that pass a path or `http:`/`file:` URL fail fast rather than
 *      silently loading untrusted code.
 * @inputs `blobUrl` — a `blob:` URL from `URL.createObjectURL(...)` or a
 *         `data:` URL from the same code path under test mocks.
 */
export async function importBlobModule(blobUrl: string): Promise<unknown> {
  if (!(blobUrl.startsWith('blob:') || blobUrl.startsWith('data:'))) {
    throw new TypeError(
      `importBlobModule accepts only blob: or data: URLs, received: ${blobUrl}`,
    );
  }
  return await import(/* @vite-ignore */ blobUrl);
}
