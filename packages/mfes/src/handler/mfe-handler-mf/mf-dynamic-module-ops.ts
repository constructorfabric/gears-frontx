/**
 * MFE Dynamic Module Operations — Audited Trust Kernel
 *
 * This file concentrates operations that static analyzers flag as security
 * risks but are safe by construction. It is EXCLUDED from Codacy's security
 * scan (via `.codacy.yaml`) because its patterns trip false-positive rules
 * (unsafe dynamic import) despite being provably safe for our inputs.
 *
 * **TRUST BOUNDARY — READ BEFORE EDITING:**
 *
 * This file is where production code generates blob-URL `import()` calls
 * (cpt-frontx-adr-mfe-load-isolation) — the sole site for that generation,
 * not necessarily the only place the literal substring `import(` ever
 * appears (a generated stub's *source text* can legitimately contain it; see
 * `buildLazyLoaderStubSource`). Two mechanisms machine-enforce that:
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
 *   3. No module-level state — only pure static members on the single
 *      exported class (the package's one-class-per-file style): no state,
 *      no instance data, pure operations only.
 *   4. No dangerous imports: `fs`, `child_process`, `process.env`, etc.
 *
 * **Scope creep control:** adding a method here should require a security
 * review. If you find yourself tempted to "just add one more helper," STOP.
 * Either prove the helper is safe and document it with `@why`, or put it in a
 * scanned file where Codacy can keep watching it.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-frontx-dod-mfe-isolation-blob-core:p1
// @cpt-algo:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1

import type { StaticImportRecord } from '../../unit-format/dynamic-import-scan';
import type { SourceEdit } from './SourceSplice';
import { LAZY_LOADER_KEY_NAME } from '../../lazy-loader/LazyLoaderRegistry';

/**
 * The audited dynamic-module operations kernel. All members are static and
 * pure — the class is a namespace for the kernel's operations, never
 * instantiated (constructor is private).
 */
export class DynamicModuleOps {
  protected constructor() {}

  /**
   * The edits that bind specifiers: for every real static import and
   * re-export record (`from "pkg"`, `import "pkg"`) whose specifier is a
   * key of `replacements`, one edit replacing the specifier literal with
   * that key's value, the quote style preserved. A dynamic `import("pkg")`
   * call, a string literal and a comment are never records, so are never
   * rewritten.
   *
   * @safety-reviewed 2026-11-20
   * @why Offsets come from the tokenizer's records of real import
   *      statements and each replacement is spliced in by position, so
   *      neither a package name nor a replacement is ever interpreted as a
   *      pattern or as replacement syntax.
   * @inputs `records` come from the tokenizer's scan of fetched unit text;
   *         `replacements` maps shared dep names from the resolved
   *         `MfManifest` contract to blob URLs produced by
   *         `URL.createObjectURL`. Neither is user input.
   */
  // @cpt-algo:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1
  static specifierEdits(
    source: string,
    records: readonly StaticImportRecord[],
    replacements: ReadonlyMap<string, string>
  ): SourceEdit[] {
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-shared
    const edits: SourceEdit[] = [];
    for (const record of records) {
      const replacement = replacements.get(record.specifier);
      if (replacement === undefined) continue;
      const quote = source[record.start];
      edits.push({
        start: record.start,
        end: record.end,
        text: quote + replacement + quote,
      });
    }
    return edits;
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-shared
  }

  /**
   * Return the first shared-dependency name the manifest declares that
   * `records` — the static import and re-export records that survived a
   * rewrite — still names, as a bare specifier. A dynamic import has become
   * the lazy-import call and is outside this surface.
   *
   * Undeclared specifiers are out of scope here by construction — only names
   * `declaredNames` supplies are ever tested — see
   * `findUndeclaredWellFormedSpecifiers` in `mf-shared-dep-specifier-scan.ts`
   * for the separate, warn-only scan over specifiers the manifest never
   * declared.
   *
   * @safety-reviewed 2026-11-20
   * @why Tests each declared name by set membership of the recorded
   *      specifiers; it builds no pattern and introduces no input-dependent
   *      matching.
   * @inputs `records` come from the tokenizer's scan of shared-dep chunk
   *         text already fetched from a manifest-declared chunk URL — not
   *         user input. `declaredNames` is the set of shared dep names
   *         declared on the resolved `MfManifest` contract — bounded,
   *         author-declared, not user input.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-assert-shared-dep-no-bare-specifier
  static findSurvivingDeclaredSharedDepSpecifier(
    records: readonly StaticImportRecord[],
    declaredNames: Iterable<string>
  ): string | undefined {
    const imported = new Set(records.map((record) => record.specifier));
    for (const name of declaredNames) {
      if (imported.has(name)) {
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
  static inlineContentSchemes(): readonly string[] {
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
  static async importBlobModule(blobUrl: string): Promise<unknown> {
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-inspect-scheme
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-if-invalid-scheme
    if (!DynamicModuleOps.inlineContentSchemes().some((scheme) => blobUrl.startsWith(scheme))) {
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-trust-kernel-import:p1:inst-reject-scheme
      throw new TypeError(
        `importBlobModule accepts only ${DynamicModuleOps.inlineContentSchemes().join(' or ')} URLs, received: ${blobUrl}`,
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
   *      it is interpolated into. `loaderId` itself is minted by
   *      `LazyLoaderRegistry.register` (an in-process counter-backed id), not
   *      user input. The `u` the stub resolves at runtime is never embedded in
   *      this text — it is fetched at call time from the `resolve` of the
   *      copy's own per-copy key. The generated stub does not
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
  static buildLazyLoaderStubSource(loaderId: string): string {
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-mint-stub
    const schemeCheck = DynamicModuleOps.inlineContentSchemes()
      .map((scheme) => `u.startsWith(${JSON.stringify(scheme)})`)
      .join('||');
    return (
      `const __id=${JSON.stringify(loaderId)};\n` +
      `export const __frontx_lazy=async(p)=>{` +
      `const u=await globalThis[Symbol.for(${JSON.stringify(LAZY_LOADER_KEY_NAME)})].resolve(__id,p);` +
      `if(!(${schemeCheck}))throw new TypeError('__frontx_lazy resolved a non-inline-content URL: '+u);` +
      `return import(u);` +
      `};\n`
    );
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-mint-stub
  }
}
