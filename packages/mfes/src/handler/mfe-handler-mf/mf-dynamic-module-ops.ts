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
 * This file is where production code generates blob-URL `import()` calls and
 * RegExp construction from interpolated strings (cpt-frontx-adr-mfe-load-
 * isolation) — the sole site for that generation, not necessarily the only
 * place the literal substring `import(` ever appears (a generated stub's
 * *source text* can legitimately contain it; see `buildLazyLoaderStubSource`).
 * Two mechanisms machine-enforce that:
 *
 *   1. An ESLint `no-restricted-syntax` rule (`eslint.config.js`) confines
 *      `ImportExpression` and the identifier `RegExp` (or its string
 *      spellings, in code or JSX tag position) to this file, across
 *      `packages/mfes/src/**` (that whole tree is explicitly kept in
 *      ESLint's file discovery by a negation in `eslint.config.js`'s
 *      global `ignores` array, so a source file merely NAMED like a config
 *      file — e.g. `regexp.config.ts` — still reaches this rule instead of
 *      being silently skipped while still compiled and shippable):
 *      `Identifier[name='RegExp']` matches a bare reference, a property
 *      name in any member expression (`globalThis.RegExp`, `RegExp.call`),
 *      an argument (`Reflect.construct(RegExp, [...])`), and an alias's
 *      initializer (`const R = RegExp`) alike — every one of these is, at
 *      the AST level, simply an Identifier node named `RegExp`.
 *      `JSXIdentifier[name='RegExp']` matches the same name in JSX tag
 *      position (`<RegExp />`), a distinct node type the parser gives JSX
 *      element names. `Literal[value='RegExp']` and the matching
 *      `TemplateElement` selectors catch the computed-string spellings
 *      (`globalThis['RegExp']`, `` globalThis[`RegExp`] ``). Matching the
 *      identifier and its string spelling directly, rather than
 *      enumerating construction forms (`new RegExp(...)`, `.call`/`.apply`,
 *      member spellings one by one), is what makes this complete: a
 *      form-by-form list is sound only as long as it stays exhaustive
 *      against every way to write the construction, while every way to
 *      invoke or reference the global `RegExp` reduces, at the AST level,
 *      to one of these node shapes, so matching them directly needs no
 *      enumeration and no custom text processing to stay complete. This
 *      match is deliberately over-broad: it also rejects a legitimate
 *      local name, import binding, or property named `RegExp` unrelated to
 *      the global constructor, and a type-only reference (`function
 *      f(p: RegExp)`) — the accepted cost of a lexical quarantine on this
 *      one name.
 *   2. `scripts/check-trust-kernel-annotations.mjs` (run via
 *      `npm run arch:check`) classifies every exported declaration here into
 *      function-valued (verify `@safety-reviewed`/`@why` as real, own-line
 *      JSDoc tags via `ts.getJSDocTags` — not a text search fooled by a tag
 *      name merely mentioned in prose), provably-not-function-valued (a
 *      type/interface/enum, or a `const` with a literal initializer —
 *      skipped), or unsupported (anything else, including a
 *      call-expression initializer, a re-export this file has no local
 *      declaration for, an `export =` assignment, an `export as namespace`
 *      declaration, or an exported `let`/`var` binding whose initializer
 *      proves nothing once reassignment is possible). The third outcome
 *      FAILS the check, as does a file that does not parse cleanly;
 *      nothing is silently skipped.
 *
 * Neither the RegExp/import confinement nor the annotation checker is
 * airtight, and neither pretends to be:
 *
 *   - The ESLint rule cannot see semantic indirection that never writes
 *     the word `RegExp` — as an identifier, a JSX tag name, or a matching
 *     string — anywhere in the source at all:
 *     `globalThis[/RegExp/.source]('x')` (the computed property name comes
 *     from a regex literal's `.source` at runtime; the `Literal` node
 *     holding `/RegExp/` has a RegExp object as its value, not the string
 *     `"RegExp"`, so no selector above matches it), `String.fromCharCode(...)`
 *     constructing the word at runtime, or the word split across
 *     concatenated string parts. This is inherent to any static check, not
 *     a gap specific to this rule, and it is a code-review concern.
 *   - The annotation checker verifies a tag's SHAPE (real, own-line,
 *     non-empty) — it cannot verify that what a `@why` says is actually
 *     true. That remains what security review is for.
 *
 * Two further invariants are held by convention and code review only — no
 * automated check reaches them at all:
 *
 *   3. No module-level state — only pure function declarations at the top level.
 *   4. No dangerous imports: `fs`, `child_process`, `process.env`, etc.
 *
 * **Scope creep control:** adding a function here should require a security
 * review. If you find yourself tempted to "just add one more helper," STOP.
 * Either prove the helper is safe and document it with `@why`, or put it in a
 * scanned file where Codacy can keep watching it.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-frontx-dod-mfe-isolation-blob-core:p1
// @cpt-algo:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1

/**
 * Test whether a source text contains an import of a specific package name.
 * Matches both `from "pkg"` (static imports and re-exports) and `import "pkg"`
 * (side-effect imports). Exact package names only — `react-dom` is not matched
 * by a query for `react`.
 *
 * Builds on {@link bareSpecifierPattern} — the single per-name pattern this
 * file also uses to rewrite and to assert survival — rather than a second,
 * independently escaped `RegExp`, so a boolean "does it import this name"
 * check can never drift from what the rewriter itself matches. A fresh
 * `RegExp` instance is obtained from `bareSpecifierPattern` on every call, so
 * the global (`/g`) flag's `lastIndex` state never carries across calls.
 *
 * @safety-reviewed 2026-09-14
 * @why Delegates entirely to `bareSpecifierPattern`, which regex-escapes
 *      `packageName` before interpolation; this function performs no
 *      interpolation of its own, so it introduces no additional attack
 *      surface beyond what that function already documents.
 * @inputs `packageName` ∈ the set of shared dep names declared on the resolved
 *         `MfManifest` contract — bounded, author-declared, not user input.
 */
export function sourceImports(source: string, packageName: string): boolean {
  return bareSpecifierPattern(packageName).test(source);
}

/**
 * Build the regex that matches the exactly two import forms this trust
 * kernel handles, for one exact package name: `from "x"` (static imports/
 * re-exports) and `import "x"` (bare side-effect imports). Quote style is
 * captured (group 2) so callers can preserve it, and the specifier text is
 * captured (group 3). Deliberately does not match `import("x")` (dynamic
 * import) — neither this function's callers rewrite that form, so nothing
 * may assert against it either.
 *
 * `sourceImports`, `rewriteBareSpecifier`, and
 * `findSurvivingDeclaredSharedDepSpecifier` all build on this single
 * per-name pattern so none of the three can ever drift apart: whatever the
 * rewriter can rewrite for a given declared name is exactly what the
 * membership test and the survival assertion check for that name. The
 * returned `RegExp` carries the `/g` flag (`rewriteBareSpecifier` needs it
 * for `String.prototype.replace` to rewrite every occurrence); callers that
 * only need a boolean or a single match must not retain and reuse one
 * instance across calls; each call here returns a fresh `RegExp`, so
 * `lastIndex` never leaks state between callers. A generic (no package
 * name) form of this matcher intentionally does not live here — see
 * `findUndeclaredWellFormedSpecifiers` in `mf-shared-dep-specifier-scan.ts`,
 * which needs no interpolation and so carries no trust-kernel residency
 * requirement.
 *
 * @safety-reviewed 2026-09-14
 * @why `packageName` is regex-escaped before interpolation, covering every
 *      character with regex meaning; ReDoS requires a pattern capable of
 *      catastrophic backtracking, which the escaped literal cannot produce.
 *      This is the sole place in the file that performs the escaping and
 *      constructs the RegExp — `sourceImports` and `rewriteBareSpecifier`
 *      both delegate here rather than repeating the escape.
 * @inputs `packageName` is a shared dep name from the resolved `MfManifest`
 *         contract — bounded, author-declared, not user input.
 */
function bareSpecifierPattern(packageName: string): RegExp {
  const specifierPart = packageName.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(
    String.raw`(from|import)(\s*["'])(${specifierPart})(["'])`,
    'g',
  );
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
// @cpt-algo:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1
export function rewriteBareSpecifier(
  source: string,
  packageName: string,
  replacement: string,
): string {
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-shared
  return source.replace(
    bareSpecifierPattern(packageName),
    `$1$2${replacement}$4`,
  );
  // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-shared
}

/**
 * Return the first shared-dependency name the manifest declares that still
 * survives, as a bare specifier, a rewrite of `source` — checked in exactly
 * the same two import forms the rewrite handles, `from "x"` and
 * `import "x"`. This is the exact inverse of a rewrite performed per
 * declared name (see `rewriteBareSpecifier` / `bareSpecifierPattern`), so it
 * cannot mistake ordinary code for an import: it only ever tests for the
 * literal declared names it is given, using the same escaped per-name
 * pattern the rewriter itself uses. A dynamically imported specifier
 * (`import("x")`) is outside this surface and is never matched, because the
 * rewrite does not handle that form either.
 *
 * Undeclared specifiers are out of scope here by construction — only names
 * `declaredNames` supplies are ever tested — see
 * `findUndeclaredWellFormedSpecifiers` in `mf-shared-dep-specifier-scan.ts`
 * for the separate, heuristic, warn-only scan over specifiers the manifest
 * never declared.
 *
 * @safety-reviewed 2026-09-14
 * @why Iterates `declaredNames` and delegates each membership test to
 *      `sourceImports`/`bareSpecifierPattern` rather than building any
 *      RegExp of its own; it introduces no new interpolation, only a loop
 *      over an already-safe primitive, so it carries no additional
 *      adversarial-input surface beyond what `bareSpecifierPattern`
 *      documents.
 * @inputs `source` is shared-dep chunk text already fetched from a
 *         manifest-declared chunk URL — not user input. `declaredNames` is
 *         the set of shared dep names declared on the resolved `MfManifest`
 *         contract — bounded, author-declared, not user input.
 */
// @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-assert-shared-dep-no-bare-specifier
export function findSurvivingDeclaredSharedDepSpecifier(
  source: string,
  declaredNames: Iterable<string>,
): string | undefined {
  for (const name of declaredNames) {
    if (sourceImports(source, name)) {
      return name;
    }
  }
  return undefined;
}
// @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-assert-shared-dep-no-bare-specifier

/**
 * The URL schemes the trust kernel treats as inline content — never
 * network-addressed, so importing one carries no cross-origin/user-input
 * risk. `importBlobModule`'s own runtime guard and the scheme guard
 * `buildLazyLoaderStubSource` generates into the lazy-loader stub both read
 * THIS list rather than each hardcoding `'blob:'`/`'data:'` independently,
 * so the two guards cannot drift apart the way two hand-copied literals
 * could: adding, removing, or renaming a scheme here changes both checks at
 * once instead of requiring a second edit someone could forget.
 *
 * @safety-reviewed 2026-09-22
 * @why Returns a fresh array of two hardcoded string literals on every
 *      call — no interpolation, no external input, nothing that could vary
 *      at runtime or be influenced by a caller. This function performs no
 *      dynamic-code admission itself; it exists only so the two real
 *      guards share one source of truth instead of duplicating this list
 *      by hand.
 */
export function inlineContentSchemes(): readonly string[] {
  return ['blob:', 'data:'];
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
 *      guard below (reading {@link inlineContentSchemes}, the single shared
 *      list this file's generated lazy-loader stub also reads — see
 *      `buildLazyLoaderStubSource` — so the two guards cannot drift apart)
 *      makes that invariant executable so accidental call sites that pass a
 *      path or `http:`/`file:` URL fail fast rather than silently loading
 *      untrusted code.
 *
 *      **BUNDLER PRAGMAS — the two inline comments in the `import()` below
 *      are load-bearing. Do not remove or reorder them.**
 *      `webpackIgnore: true` tells webpack/rspack/rsbuild hosts, and
 *      `@vite-ignore` tells Vite hosts, to leave this dynamic import native
 *      instead of rewriting it into their chunk-loading runtime. A bundler
 *      that rewrites it makes MFE mount fail at runtime under that host
 *      with `Cannot find module 'blob:…'` (#504). The pragmas survive the
 *      package's current tsup/esbuild build in both output formats, but
 *      esbuild minification (`minify: true`) strips comments without a
 *      diagnostic — so the build script runs
 *      `scripts/verify-dist-import-pragmas.mjs`, which fails the build if
 *      either pragma is missing from the published dist.
 * @inputs `blobUrl` — a `blob:` URL from `URL.createObjectURL(...)` or a
 *         `data:` URL from the same code path under test mocks.
 */
export async function importBlobModule(blobUrl: string): Promise<unknown> {
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-inspect-scheme
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-if-invalid-scheme
  if (!inlineContentSchemes().some((scheme) => blobUrl.startsWith(scheme))) {
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-reject-scheme
    throw new TypeError(
      `importBlobModule accepts only ${inlineContentSchemes().join(' or ')} URLs, received: ${blobUrl}`,
    );
    // @cpt-end:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-reject-scheme
  }
  // @cpt-end:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-if-invalid-scheme
  // @cpt-end:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-inspect-scheme
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-exec-import
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-return-module
  return await import(/* webpackIgnore: true */ /* @vite-ignore */ blobUrl);
  // @cpt-end:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-return-module
  // @cpt-end:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-exec-import
}

/**
 * Build the source text for a per-load `__frontx_lazy` loader stub module.
 * The stub is a tiny ESM module, blob-URL'd by the caller, that re-exports a
 * `__frontx_lazy` function closed over `loaderId`; vendor chunks transformed
 * by the ADR-0022 build plugin import this binding to resolve lazy chunks
 * through the host-side {@link LazyLoaderRegistry} without threading the
 * resolver id through every call site.
 *
 * This text contains the substring `import(u)`, but only as characters
 * inside a string this function returns — it is never parsed as source by
 * this file, so it is not itself a dynamic-`import()` call site here. It
 * becomes one only once the caller blob-URLs it and passes that URL to
 * {@link importBlobModule}, which is the trust kernel's sole real import()
 * call site — keeping stub-source generation here (rather than at the call
 * site in `MfeHandlerMF`) is what keeps that "sole site" claim true: the
 * only place in this codebase that ever writes the literal text `import(`
 * into dynamically-evaluated source is this file.
 *
 * @safety-reviewed 2026-09-22
 * @why `loaderId` is embedded only after `JSON.stringify`, which escapes
 *      every character that could break out of the string-literal position
 *      it is interpolated into — the same escaping argument
 *      `bareSpecifierPattern` makes for RegExp construction, applied here to
 *      string-literal construction instead. `loaderId` itself is minted by
 *      `LazyLoaderRegistry.register` (an in-process counter-backed id), not
 *      user input. The `u` the stub resolves at runtime is never embedded in
 *      this text — it is fetched at call time from
 *      `globalThis.__FRONTX_LAZY__.resolve`. The generated stub does not
 *      merely trust that resolver to return inline content: the guard
 *      condition below is GENERATED from {@link inlineContentSchemes} (the
 *      same list `importBlobModule` reads its own guard from), one
 *      `u.startsWith(...)` clause per scheme, rather than hand-writing
 *      `'blob:'`/`'data:'` a second time — so the two guards cannot drift
 *      apart the way two independently maintained literals could; a change
 *      to the shared list changes both checks in the same edit. A resolver
 *      defect that ever returned a non-inline-content URL (e.g. an
 *      `http:`/`file:` path) fails this generated check with a `TypeError`
 *      instead of the stub silently importing it.
 * @inputs `loaderId` is an id minted by `LazyLoaderRegistry.register` — an
 *         in-process identifier, not user input. The generated stub's `u` is
 *         runtime-guarded against the same scheme list `importBlobModule`
 *         guards `blobUrl` against.
 */
// @cpt-algo:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1
export function buildLazyLoaderStubSource(loaderId: string): string {
  // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-build-stub-source
  const schemeCheck = inlineContentSchemes()
    .map((scheme) => `u.startsWith(${JSON.stringify(scheme)})`)
    .join('||');
  return (
    `const __id=${JSON.stringify(loaderId)};\n` +
    `export const __frontx_lazy=async(p)=>{` +
    `const u=await globalThis.__FRONTX_LAZY__.resolve(__id,p);` +
    `if(!(${schemeCheck}))throw new TypeError('__frontx_lazy resolved a non-inline-content URL: '+u);` +
    `return import(u);` +
    `};\n`
  );
  // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-build-stub-source
}
