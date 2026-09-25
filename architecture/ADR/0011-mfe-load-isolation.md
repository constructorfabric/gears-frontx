---
status: accepted
date: 2026-06-05
---

# MFE Load Isolation


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Per-load inline-content module graph behind an audited trust kernel](#per-load-inline-content-module-graph-behind-an-audited-trust-kernel)
  - [Shared module graph across microfrontends](#shared-module-graph-across-microfrontends)
  - [Per-load isolation with eager teardown of inline-content references](#per-load-isolation-with-eager-teardown-of-inline-content-references)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-mfe-load-isolation`
## Context and Problem Statement

The runtime admits independently developed microfrontends — potentially authored by different teams or vendors — and evaluates their code inside the host. Without deliberate isolation, two microfrontends could share a single module instance and silently couple through it, and the small set of dynamic-code primitives an isolation mechanism requires (dynamic import of inline content, dynamic construction of matchers over specifiers) are exactly the primitives that, if used carelessly elsewhere, become an arbitrary-code-execution surface. How should the runtime evaluate a loaded microfrontend so that each load is an isolated module instance, and how should the dangerous primitives the mechanism depends on be contained so the trust surface stays small and auditable?

## Decision Drivers

* Per-instance isolation — each loaded microfrontend must evaluate as its own module instance so that distinct occupants cannot couple through a shared module record (anchors `cpt-frontx-nfr-security`).
* Stable references during asynchronous evaluation — a module that continues evaluating after its import resolves (for example via top-level await) must keep its backing reference valid for the lifetime it needs, so isolation must not tear references down mid-evaluation.
* Minimal, audited trust surface — the dynamic-code primitives isolation requires must live in one small, explicitly reviewed location, not be scattered across the codebase.
* Default-deny admission posture — a microfrontend gains no capability beyond what it is granted, and the mechanism that admits its code must not widen that surface (anchors `cpt-frontx-nfr-security`).
* Bounded, non-user inputs to dangerous primitives — the inputs reaching any dynamic-code primitive must be provably bounded and author-declared, never arbitrary user input.
* No exception for cyclic dependency graphs — a bundler routinely emits chunks that import one another circularly, and isolation must admit no exception for them: any specifier a load resolves outside its own graph names a module record shared with every other load that reaches it the same way, and every module reachable from that one is shared too, so the exception is never confined to the single edge that closes the cycle (anchors `cpt-frontx-nfr-security`).
* Substrate neutrality — isolation must hold regardless of the UI framework or type system a microfrontend uses.

## Considered Options

* **Per-load inline-content module graph behind an audited trust kernel** — each load produces a fresh isolated module graph for the whole dependency chain, keyed by the extension instance identity and retained for the page lifetime (never torn down mid-evaluation); the dynamic-code primitives the mechanism needs are concentrated in a single audited trust-kernel file, confined there by an ESLint `no-restricted-syntax` rule matching the identifier and its string spellings directly rather than an enumerated list of construction forms, and required by a fail-closed `arch:check` annotation assertion to document every function-valued export's safety rationale; that the file stays side-effect-free and imports no dangerous host capability is held by code review rather than either check.
* **Shared module graph across microfrontends** — all microfrontends evaluate against one shared module instance graph, relying on convention to avoid cross-coupling, with dynamic-code primitives used wherever convenient.
* **Per-load isolation with eager teardown of inline-content references** — the same per-load isolation, but the backing inline-content references are revoked as soon as each import resolves, rather than retained for the page lifetime.

## Decision Outcome

Chosen option: **per-load inline-content module graph behind an audited trust kernel**, because it is the only option that gives each loaded microfrontend its own module instance while keeping the dynamic-code trust surface small, audited, and provably fed by bounded inputs. Each load builds a fresh isolated module graph covering its entire dependency chain, keyed by the extension instance identity so two extensions sharing the same definition still evaluate as distinct instances and a re-load of the same instance reuses its existing graph. Where a dependency cycle cannot be brought inside the load's own graph, the load fails rather than any module resolving outside it: availability is what a cycle costs, never isolation. The backing inline-content references are retained for the page lifetime rather than revoked, because a module may continue evaluating after its import resolves and revoking a reference mid-evaluation would break it. All dynamic-code primitives the mechanism depends on — dynamic import of inline content and dynamic construction of specifier matchers — are concentrated in a single audited trust-kernel file, `packages/mfes/src/handler/mfe-handler-mf/mf-dynamic-module-ops.ts`. The kernel contract splits into what is machine-enforced and what is review-only, and the two are not interchangeable:

* **Machine-enforced.** An ESLint `no-restricted-syntax` rule (`eslint.config.js`) confines the identifier `RegExp` and its string spellings to the kernel file across `packages/mfes/src/**` (with a negation in the global `ignores` array re-including that tree in ESLint's file discovery — see below): `Identifier[name='RegExp']` matches a bare reference, a property name in any member expression (`globalThis.RegExp`, `RegExp.call`), an argument (`Reflect.construct(RegExp, [...])`), and an alias's initializer (`const R = RegExp`) alike, because every one of these is, at the AST level, simply an Identifier node named `RegExp`; `JSXIdentifier[name='RegExp']` matches the same name in JSX tag position (`<RegExp />`), which the parser gives a distinct node type from a plain `Identifier`; `Literal[value='RegExp']` and the matching `TemplateElement` selectors catch the computed-string spellings (`globalThis['RegExp']`, `` globalThis[`RegExp`] ``) that name it as a string instead. `ImportExpression` is confined the same way. Matching the identifier and its string spelling directly, rather than enumerating construction forms, is what makes this sound: a form-by-form list is sound only if it stays exhaustive against every way to write the construction — a property that cannot be guaranteed — whereas every way to invoke or reference the global `RegExp` reduces to one of these AST shapes, so matching them directly needs no enumeration and no custom text processing to stay complete. The match is deliberately over-broad: it also rejects a legitimate local name, import binding, or property named `RegExp` unrelated to the global constructor, and a type-only reference (`function f(p: RegExp)`) that never runs as code — the accepted cost of a lexical quarantine on this one name, since narrowing to only "real" uses would need type information a syntax-only rule does not have and would reopen the enumeration problem this shape avoids.

  `scripts/check-trust-kernel-annotations.mjs` (run via `npm run arch:check`) is fail-closed by classification: it sorts EVERY exported declaration in the kernel file into function-valued (verify `@safety-reviewed`/`@why`, both as real, own-line JSDoc tags via `ts.getJSDocTags` plus a same-line-start check — not a text search fooled by a tag name merely mentioned in prose), provably-not-function-valued (a type/interface/enum declaration, or a `const` with a literal initializer — skipped, no annotation required), or unsupported (anything else: a call-expression initializer, a re-export this file has no local declaration for, an `export =` assignment, an exported `let`/`var` binding whose initializer proves nothing about what a later reassignment might hold, or any shape the script has no rule for). The third outcome FAILS the check unconditionally; there is no fourth "didn't recognize it, skipped silently" outcome, because an export-form list that only checks the spellings it recognizes and quietly passes anything else is the same unsound shape as the construction-form selector list above — classifying every declaration into one of three named outcomes is what keeps recognition exhaustive without enumerating export syntax.

  The import primitive's own runtime guard, and the guard `buildLazyLoaderStubSource` generates into the lazy-loader stub, both read the same shared list, `inlineContentSchemes()`, rather than each hardcoding `'blob:'`/`'data:'` independently — a change to the list changes both checks in the same edit, so the two cannot drift apart the way two hand-copied literals could.
* **Review-only — no automated check holds these.** That the kernel module holds no mutable state and imports no dangerous host capability (`fs`, `child_process`, `process.env`, etc.) are conventions enforced by code review, not by a script. So is resistance to semantic indirection that never writes the word `RegExp` — as an identifier, a JSX tag name, or a matching string — anywhere in the source at all: `globalThis[/RegExp/.source]('x')` (the property name is computed from a regex literal's `.source` at runtime, not spelled as the string `"RegExp"` anywhere the parser sees), `String.fromCharCode(...)` constructing the word at runtime, or the word split across concatenated string parts. This is the one thing an AST-level identifier/literal match cannot reach, and it is inherent — no static check, AST-based or textual, can see a value that is never spelled out. The annotation checker has a comparable residual: `tagStartsOwnLine` rejects a tag name merely mentioned mid-sentence, but a reviewer who deliberately started a fabricated sentence with `@why` at the beginning of a comment line would still produce a real, own-line, non-empty tag the checker cannot distinguish from a genuine one — no annotation checker can verify that a documented rationale is TRUE, only that one was written in the right shape and place.

Together, the machine-enforced half makes the trust kernel the only place `RegExp` (any spelling) and `import()` may appear, and the only place an exported declaration may go unannotated because it is provably not a function — so the residual admission surface a reviewer must reason about is narrowed to semantic indirection that never spells the forbidden word, and to whether a written rationale is honest, not to whether some construction form was missed.

### Consequences

* Good, because each loaded microfrontend evaluates as its own isolated module instance, so distinct occupants cannot couple through a shared module record.
* Good, because retaining backing references for the page lifetime keeps modules with post-resolution evaluation (such as top-level await) valid, avoiding mid-evaluation breakage.
* Good, because concentrating all dynamic-code primitives in one audited trust kernel makes the arbitrary-code-admission surface small and reviewable rather than diffuse.
* Good, because the trust-kernel contract makes the safety invariants explicit, with the primitive-confinement and safety-rationale halves machine-checkable and the no-mutable-state/no-dangerous-imports/anti-aliasing halves explicit for review even though no script holds them.
* Bad, because retaining backing references for the page lifetime means the per-instance memory they hold is reclaimed only when the page unloads, not when a microfrontend unmounts.
* Bad, because the trust kernel is a deliberate exception to ordinary static-analysis scanning, so its discipline depends on the enforced contract and review rather than on the general scanner.
* Good, because the per-instance guarantee is total: every module a load reaches evaluates inside that load's own instance, with no exception for dependency cycles, so a consumer may rely on it unconditionally rather than reasoning about which modules are covered.
* Bad, because a static-import cycle in a microfrontend's chunk graph fails the load rather than degrading it, so a microfrontend whose build emits circular chunk imports cannot be loaded until it is rebuilt — availability, never isolation, is what a cycle costs.
* Good, because the failure is diagnosed rather than silent: it names the chunks on the cycle and the microfrontend, so it is actionable by the microfrontend's author at build time instead of surfacing as an unexplained runtime error.

### Confirmation

A security review confirms that admission of microfrontend code passes only through the trust kernel, that each load yields a distinct module graph keyed by instance identity, and that no microfrontend can reach a host capability beyond what its domain grants. The same review confirms the review-only invariants: no mutable module-level state, no forbidden host capability import, no semantic indirection that constructs the word `RegExp` without ever writing it, and no dynamic-code text embedded in a string or template literal outside the kernel. Two automated checks confirm the machine-enforced half: the ESLint `no-restricted-syntax` rule in `eslint.config.js` confirms `ImportExpression` and the identifier `RegExp` (or its string spellings, in code position or JSX tag position) appear only in the kernel file — via `Identifier`/`JSXIdentifier`/`Literal`/`TemplateElement` selectors matching the word, complete over how the word can be written in `packages/mfes/src/**` rather than over a list of construction forms (that tree is explicitly re-included in ESLint's file discovery by a negation in the global `ignores` array, closing a discovery gap a same-named `*.config.*`/`*.cjs` file would otherwise fall through); and `scripts/check-trust-kernel-annotations.mjs` (via `npm run arch:check`) confirms every exported declaration in the kernel file is either verified (a non-empty, own-line `@safety-reviewed` and `@why`, via `ts.getJSDocTags`) or classified as provably not function-valued (a `const` with a literal initializer, or a type/interface/enum) — an export this script cannot classify this way, including a mutable `let`/`var` export, an `export =` assignment, or an `export as namespace` declaration, FAILS the check, as does a file that does not parse cleanly. The import primitive's runtime guard, and the guard the kernel's generated lazy-loader stub derives from the same shared `inlineContentSchemes()` list, reject any non-inline-content input at runtime. The grounding mechanisms are the audited trust kernel `packages/mfes/src/handler/mfe-handler-mf/mf-dynamic-module-ops.ts` (the site where production code generates dynamic-import source text and constructs specifier matchers, with its guard and safety annotations) and the per-load isolation in `packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts` (the instance-keyed load and the retain-for-page-lifetime invariant).

## Pros and Cons of the Options

### Per-load inline-content module graph behind an audited trust kernel

Each load is a fresh instance-keyed module graph retained for the page lifetime; all dynamic-code primitives live in one audited, contract-enforced trust kernel.

* Good, because it delivers true per-instance isolation with no cross-microfrontend module sharing.
* Good, because retention keeps post-resolution evaluation valid.
* Good, because the trust surface is one small, audited, lint-enforced location with bounded inputs.
* Neutral, because it requires a maintained trust-kernel contract, an ESLint `no-restricted-syntax` rule, and an `arch:check` annotation assertion to keep the machine-enforced half of the surface closed, plus ongoing code review for the invariants no automated check reaches (no mutable state, no dangerous imports, indirection that never writes the word `RegExp`, string-embedded dynamic-code text).
* Bad, because per-instance backing references are held until page unload, deferring their reclamation.

### Shared module graph across microfrontends

All microfrontends evaluate against one shared module instance graph, relying on convention.

* Good, because it minimizes memory and load overhead by sharing instances.
* Bad, because microfrontends can couple through the shared instance, defeating per-instance isolation.
* Bad, because dynamic-code primitives used wherever convenient leave the arbitrary-code-admission surface diffuse and hard to audit.

### Per-load isolation with eager teardown of inline-content references

The same per-load isolation, but backing references are revoked as soon as each import resolves.

* Good, because it reclaims per-instance backing memory promptly on resolution.
* Bad, because a module that keeps evaluating after its import resolves loses its backing reference mid-evaluation and breaks.
* Neutral, because it keeps per-instance isolation but trades correctness of post-resolution evaluation for earlier reclamation.

## More Information

The present concrete instantiation isolates each load by building a per-load graph of inline-content module URLs for the dependency chain in `packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts`, keyed by the extension instance identity (`extensionId`) so distinct instances get distinct evaluations and a re-load of the same instance reuses its cached graph; the inline-content URLs are not revoked, because modules with top-level await keep evaluating after the import resolves.

**The sole-site invariant, stated precisely.** All *production* generation of dynamic-import source text and specifier-matcher construction lives in the audited trust kernel, `packages/mfes/src/handler/mfe-handler-mf/mf-dynamic-module-ops.ts` — `importBlobModule`'s own `import()` call, and `buildLazyLoaderStubSource`'s generation of the lazy-loader stub text (which itself contains the substring `import(u)`, evaluated only once the caller blob-URLs that generated text and passes it through `importBlobModule`). This explicitly excludes: inert test fixtures elsewhere in the package that construct dynamic-import-shaped strings or mock the kernel's exports for isolation (they generate no source a production load ever evaluates); and the ESLint enforcement's own inherent blind spot (semantic indirection that never writes the word `RegExp` or `import(` at all — `globalThis[/RegExp/.source]('x')`, character-code construction, split concatenation), which is a review-only concern, not a violation of the invariant. Distinct from this invariant — and not itself dynamic-code admission — is *general dynamically-evaluated source construction*: `MfeHandlerMF.createBlobUrlChain` rewrites bare specifiers and injects the static `import{__frontx_lazy}from"<url>"` binding into a chunk's already-fetched text before blob-URLing the result (around `MfeHandlerMF.ts`'s `createBlobUrlChainInternal`). That is textual rewriting and blob-URL minting of a chunk this load already fetched, using ordinary string operations and a static `import` statement — no `ImportExpression` or dynamic `RegExp` construction is involved, so it is a distinct primitive from what this ADR's trust kernel contains, not an unstated exception to it.

The specific mechanism names, the keying field, and the inline-content scheme are descriptive of the current instantiation and non-binding; the durable decision is per-instance isolated module graphs with retained backing references and a single audited dynamic-code trust kernel.

**Scope of impact.** Applies to how a loaded microfrontend's code is evaluated in isolation and how the dynamic-code primitives that mechanism needs are contained. It does not decide how a microfrontend is matched into a domain (decided in `cpt-frontx-adr-domain-extension-compatibility`) or how a domain's occupancy is governed (decided in `cpt-frontx-adr-extension-domain-occupancy`); those decide admission compatibility and placement, while this decides runtime code isolation and the trust surface.

**Review trigger.** Revisit if a runtime mechanism for reclaiming per-instance backing references without breaking post-resolution evaluation becomes available, if a new dynamic-code primitive must be admitted to the trust kernel, if the inputs reaching the trust kernel could cease to be bounded and author-declared, or if a mechanism becomes available that admits a cyclic dependency graph into a load's own isolated instance uniformly across the supported browsers — such a mechanism takes the shape of assigning each module a per-load identity before its content exists.

**Checklist applicability.**

* ARCH — applicable and addressed above (a runtime isolation and trust-surface decision affecting every loaded microfrontend, and hard to reverse once the isolation and trust-kernel contract are relied upon).
* ARCH-ADR-008 (supersession) — Not applicable because this is a standalone, forward-looking decision with no live superseded record to link.
* SEC — applicable and addressed above (SEC-ADR-001): the threat model is admission of independently authored — potentially untrusted — microfrontend code into the host; the attack surface is the small set of dynamic-code primitives, contained in a single audited trust kernel. Machine-enforced: an ESLint `no-restricted-syntax` rule (`eslint.config.js`) confining `ImportExpression` and the identifier `RegExp` and its string spellings (`Identifier`/`JSXIdentifier`/`Literal`/`TemplateElement` selectors matching the word, including JSX tag position) to the kernel file across `packages/mfes/src/**` — complete over how the word can be written, not over an enumerated list of construction forms, with a negation in ESLint's global `ignores` array keeping that entire tree in file discovery rather than letting a `*.config.*`/`*.cjs`-named file escape linting while still being compiled and shippable; a fail-closed annotation classifier (`scripts/check-trust-kernel-annotations.mjs` via `arch:check`, AST-based via `ts.getJSDocTags`) that verifies a non-empty, own-line `@safety-reviewed`/`@why` tag on every exported declaration it classifies as function-valued (a `function`, or a `const` bound to an arrow/function expression), classifies as not-function-valued only what can never hold a function (a `const` literal, a type/interface/enum), and FAILS on everything else — including a mutable `let`/`var` export, an `export =` assignment, an `export as namespace` declaration, and a file that does not parse cleanly — rather than skipping it; and a runtime input guard (on both the kernel's `importBlobModule` and its generated lazy-loader stub, both reading the same shared `inlineContentSchemes()` list) rejecting any non-`blob:`/`data:` input. Review-only, not machine-enforced: no mutable module state, no dangerous host-capability imports, no semantic indirection that constructs the word `RegExp` without ever writing it (`globalThis[/RegExp/.source]('x')`, character-code construction, split concatenation — inherent, no static check can see a value never spelled out), no dynamic-code text embedded in a string or template literal outside the kernel, and no verification that a documented `@safety-reviewed`/`@why` rationale is actually true (only that a real, own-line tag with non-empty content exists, in a place the classifier can find it). Separately, the rule's match is deliberately over-broad in the other direction — it also flags a legitimate local name, import binding, property, or type-only reference named `RegExp` that has nothing to do with the global constructor — which is a false-positive cost accepted for a syntax-only lexical quarantine, not a security gap. The blast radius of any one microfrontend is bounded by per-instance module isolation and the default-deny posture that grants a microfrontend nothing beyond its domain's grants. No secret or credential is introduced by this decision.
* PERF — Not applicable as a primary concern: the retain-for-page-lifetime invariant has a memory consequence (noted under Consequences), but this decision is made on isolation and trust-surface grounds, not performance grounds.
* REL — Not applicable because it governs code isolation and the trust surface, not service availability or fault tolerance.
* DATA — Not applicable because no persistent data store or schema is involved.
* INT — Not applicable because it shapes internal runtime code isolation, not an external integration contract.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-nfr-security` — per-instance isolation and the audited trust kernel uphold the default-deny posture by bounding each microfrontend's blast radius and keeping the arbitrary-code-admission surface small and reviewed.
* `cpt-frontx-fr-mfe-runtime-registration` — isolation is the mechanism by which a registered microfrontend is loaded on demand and evaluated as its own instance within the running application.
* `cpt-frontx-component-mfe-runtime` — this decision shapes the runtime code-isolation and trust-surface behavior of the MFE Runtime component.
* `cpt-frontx-principle-agnostic-core` — isolation holds regardless of the UI framework or type system a microfrontend adopts, keeping the substrate agnostic.
