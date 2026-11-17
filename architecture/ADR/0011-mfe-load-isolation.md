---
status: accepted
date: 2026-11-03
description: "Decides that each microfrontend load builds its own inline-content module graph over its own chunks and the shared-dependency units it reaches, keyed by extension instance identity, sharing only source text across loads, failing a load whose own chunks form a cycle, and retaining its references for the realm's lifetime, behind a small, audited trust kernel; a fully opaque import(expr) is the one accepted exception to isolation."
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
  - [Share source text only](#share-source-text-only)
  - [Share unit references or instances across loads](#share-unit-references-or-instances-across-loads)
  - [Never revoke until revocation is proven](#never-revoke-until-revocation-is-proven)
  - [Revoke after evaluation](#revoke-after-evaluation)
  - [Revoke on unregistration](#revoke-on-unregistration)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-mfe-load-isolation`
## Context and Problem Statement

The runtime admits independently developed microfrontends — potentially authored by different teams or vendors — and evaluates their code inside the host. Without deliberate isolation, two microfrontends could share a single module instance and silently couple through it, and the small set of dynamic-code primitives an isolation mechanism requires (dynamic import of inline content, dynamic construction of matchers over specifiers) are exactly the primitives that, if used carelessly elsewhere, become an arbitrary-code-execution surface. How should the runtime evaluate a loaded microfrontend so that each load is an isolated module instance, and how should the dangerous primitives the mechanism depends on be contained so the trust surface stays small and auditable?

A load reaches more than its own chunks. It also reaches shared-dependency code, delivered as content-identified units under `cpt-frontx-adr-shared-dep-reuse`, of which a load fetches only the units its exposed module's fetch list names under `cpt-frontx-adr-mfe-asset-discovery`. The source text of those units is reused across microfrontends, so the isolation mechanism must decide how a load binds to text that other loads also hold without binding to their instances, how every import of one unit inside a load resolves to a single instance, and how long the backing references live given that retained memory must stay bounded by the number of distinct extension instances (`cpt-frontx-nfr-resource-efficiency`).

## Decision Drivers

* Per-instance isolation — each loaded microfrontend must evaluate as its own module instance so that distinct occupants cannot couple through a shared module record (anchors `cpt-frontx-nfr-security`).
* Stable references during asynchronous evaluation — a module that continues evaluating after its import resolves (for example via top-level await) must keep its backing reference valid for the lifetime it needs, so isolation must not tear references down mid-evaluation.
* Minimal, audited trust surface — the dynamic-code primitives isolation requires must live in one small, explicitly reviewed location, not be scattered across the codebase.
* Default-deny admission posture — a microfrontend gains no capability beyond what it is granted, and the mechanism that admits its code must not widen that surface (anchors `cpt-frontx-nfr-security`).
* Bounded, non-user inputs to dangerous primitives — the inputs reaching any dynamic-code primitive must be provably bounded and author-declared, never arbitrary user input.
* No exception for cyclic dependency graphs — a bundler routinely emits chunks that import one another circularly, and isolation must admit no exception for them: any specifier a load resolves outside its own graph names a module record shared with every other load that reaches it the same way, and every module reachable from that one is shared too, so the exception is never confined to the single edge that closes the cycle (anchors `cpt-frontx-nfr-security`).
* Substrate neutrality — isolation must hold regardless of the UI framework or type system a microfrontend uses.
* Resource efficiency — `cpt-frontx-nfr-resource-efficiency` asks that the memory the runtime retains grow only with the number of distinct extension instances, never with mount cycles.
* Load latency — `cpt-frontx-nfr-runtime-performance` sets the load-time budget that preparing every reached unit for one load must stay within.

## Considered Options

Isolation mechanism:

* **Per-load inline-content module graph behind an audited trust kernel** — each load produces a fresh isolated module graph for its own chunks and the shared-dependency units it reaches, keyed by the extension instance identity and retained for the realm's lifetime (never torn down mid-evaluation); the dynamic-code primitives the mechanism needs are concentrated in a single audited trust-kernel file, confined there by an ESLint `no-restricted-syntax` rule matching the identifier and its string spellings directly rather than an enumerated list of construction forms, and required by a fail-closed `arch:check` annotation assertion to document every function-valued export's safety rationale; that the file stays side-effect-free and imports no dangerous host capability is held by code review rather than either check.
* **Shared module graph across microfrontends** — all microfrontends evaluate against one shared module instance graph, relying on convention to avoid cross-coupling, with dynamic-code primitives used wherever convenient.

Sharing across loads:

* **Share source text only** — loads reuse the cached source text of a unit, and each load mints its own inline-content references over that text and evaluates its own instances from them.
* **Share unit references or instances across loads** — a unit's inline-content reference, or the module instance evaluated from it, is created once per realm and bound by every load that reaches the unit.

Retention of inline-content references:

* **Never revoke until revocation is proven** — references are retained for the realm's lifetime; revocation is adopted only on cross-browser proof that it is safe and on a measured memory saving.
* **Revoke after evaluation** — the backing inline-content references are revoked as soon as each import resolves, rather than retained for the realm's lifetime.
* **Revoke on unregistration** — references are retained while the extension instance is registered and revoked when it is unregistered.

## Decision Outcome

Chosen options: **per-load inline-content module graph behind an audited trust kernel** as the isolation mechanism, **share source text only** across loads, and **never revoke until revocation is proven** for retention, because together they are the only combination that gives each loaded microfrontend its own module instances while keeping the dynamic-code trust surface small, audited, and provably fed by bounded inputs, and keeping retained memory bounded by the number of distinct extension instances.

**Graph scope.** Each load builds a fresh isolated module graph covering the load's own chunks and the shared-dependency units it reaches. What a unit and an own chunk are follows `cpt-frontx-adr-shared-dep-reuse`; which units and own chunks a load reaches follows `cpt-frontx-adr-mfe-asset-discovery`. The graph is keyed by the extension instance identity, so two extensions sharing the same definition still evaluate as distinct instances.

**Isolation guarantee.** Every module a load reaches evaluates inside that load's own instance, with no exception for dependency cycles. The one accepted exception is a fully opaque `import(expr)`, which stays native as `cpt-frontx-adr-lazy-import-resolution` decides.

**Per-unit minting.** Each load mints one inline-content reference per reached unit. Before minting a unit's reference, the load rewrites the unit's bare and relative imports to that load's own references for the units they name, and rewrites its literal and pattern dynamic imports to the lazy-import call `cpt-frontx-adr-lazy-import-resolution` decides. Minting proceeds leaves-first, so that every reference a unit's text names exists before the unit itself is minted. A per-load map from unit identity to reference ensures that every import of the same unit within one load binds to the same instance. Units that a lazily loaded chunk reaches later are added to the same map, and an existing entry is never replaced, so a unit already bound within the load keeps its single instance. How a lazily loaded chunk's own imports bind is decided in `cpt-frontx-adr-lazy-import-resolution`. The preparation this minting costs stays within the load-time budget of `cpt-frontx-nfr-runtime-performance`.

**Own chunks.** The load's own chunks join the same graph and are minted like units: their imports are rewritten to the load's references and they are minted leaves-first. They carry no content identity, are not shared with any other load and are never admitted to the realm cache.

**What crosses loads.** Only source text is shared across loads. Inline-content references and module instances are never shared: every load mints its own references over the shared text and evaluates its own instances from them, so two loads reaching the same unit cannot couple through it.

**Cycles.** A load whose own chunks import one another in a cycle fails with an `MfeLoadError` naming the chunks on the cycle and the microfrontend. A cycle among list items fails the load in the same way, as `cpt-frontx-adr-shared-dep-reuse` decides. Leaves-first minting therefore always has an order, and no module resolves outside the load's own graph to break a cycle: availability is what a cycle costs, never isolation.

**Graph reuse and memory.** Extension instance identities are stable. A re-load or re-registration of the same extension instance reuses its existing graph and mints nothing new, so the memory the runtime retains is bounded by the number of distinct extension instances, not by the number of mount cycles (`cpt-frontx-nfr-resource-efficiency`). The load cache that holds each extension instance's graph is therefore bounded by the extension instances registered and has no capacity-driven eviction; an entry lives as long as the realm, and a failed load's entry is removed so a later attempt starts fresh (`cpt-frontx-adr-shared-dep-cache-reach` records the load cache's scope beside the other caches). Whether module-level state is cleaned or preserved across unmount is the extension's own choice, made in its unmount lifecycle; the runtime neither resets nor discards it.

**Retention.** The backing inline-content references are retained for the realm's lifetime and are not revoked, because a module may continue evaluating after its import resolves and revoking a reference mid-evaluation would break it. Revocation, whether after evaluation or on unregistration, is adopted only once a cross-browser test proves that importing a revoked but already instantiated reference works for lazily loaded chunks, re-mounts and modules with top-level await, and a real memory saving is measured.

**Trust kernel.** All dynamic-code primitives the mechanism depends on — dynamic import of inline content and dynamic construction of specifier matchers — are concentrated in a single audited trust-kernel file, `packages/mfes/src/handler/mfe-handler-mf/mf-dynamic-module-ops.ts`. The kernel contract splits into what is machine-enforced and what is review-only, and the two are not interchangeable:

* **Machine-enforced.** An ESLint `no-restricted-syntax` rule (`eslint.config.js`) confines the identifier `RegExp` and its string spellings to the kernel file across `packages/mfes/src/**` (with a negation in the global `ignores` array re-including that tree in ESLint's file discovery — see below): `Identifier[name='RegExp']` matches a bare reference, a property name in any member expression (`globalThis.RegExp`, `RegExp.call`), an argument (`Reflect.construct(RegExp, [...])`), and an alias's initializer (`const R = RegExp`) alike, because every one of these is, at the AST level, simply an Identifier node named `RegExp`; `JSXIdentifier[name='RegExp']` matches the same name in JSX tag position (`<RegExp />`), which the parser gives a distinct node type from a plain `Identifier`; `Literal[value='RegExp']` and the matching `TemplateElement` selectors catch the computed-string spellings (`globalThis['RegExp']`, `` globalThis[`RegExp`] ``) that name it as a string instead. `ImportExpression` is confined the same way. Matching the identifier and its string spelling directly, rather than enumerating construction forms, is what makes this sound: a form-by-form list is sound only if it stays exhaustive against every way to write the construction — a property that cannot be guaranteed — whereas every way to invoke or reference the global `RegExp` reduces to one of these AST shapes, so matching them directly needs no enumeration and no custom text processing to stay complete. The match is deliberately over-broad: it also rejects a legitimate local name, import binding, or property named `RegExp` unrelated to the global constructor, and a type-only reference (`function f(p: RegExp)`) that never runs as code — the accepted cost of a lexical quarantine on this one name, since narrowing to only "real" uses would need type information a syntax-only rule does not have and would reopen the enumeration problem this shape avoids.

  `scripts/check-trust-kernel-annotations.mjs` (run via `npm run arch:check`) is fail-closed by classification: it sorts EVERY exported declaration in the kernel file into function-valued (verify `@safety-reviewed`/`@why`, both as real, own-line JSDoc tags via `ts.getJSDocTags` plus a same-line-start check — not a text search fooled by a tag name merely mentioned in prose), provably-not-function-valued (a type/interface/enum declaration, or a `const` with a literal initializer — skipped, no annotation required), or unsupported (anything else: a call-expression initializer, a re-export this file has no local declaration for, an `export =` assignment, an exported `let`/`var` binding whose initializer proves nothing about what a later reassignment might hold, or any shape the script has no rule for). The third outcome FAILS the check unconditionally; there is no fourth "didn't recognize it, skipped silently" outcome, because an export-form list that only checks the spellings it recognizes and quietly passes anything else is the same unsound shape as the construction-form selector list above — classifying every declaration into one of three named outcomes is what keeps recognition exhaustive without enumerating export syntax.

  The import primitive's own runtime guard, and the guard `buildLazyLoaderStubSource` generates into the lazy-loader stub, both read the same shared list, `inlineContentSchemes()`, rather than each hardcoding `'blob:'`/`'data:'` independently — a change to the list changes both checks in the same edit, so the two cannot drift apart the way two hand-copied literals could.
* **Review-only — no automated check holds these.** That the kernel module holds no mutable state and imports no dangerous host capability (`fs`, `child_process`, `process.env`, etc.) are conventions enforced by code review, not by a script. So is resistance to semantic indirection that never writes the word `RegExp` — as an identifier, a JSX tag name, or a matching string — anywhere in the source at all: `globalThis[/RegExp/.source]('x')` (the property name is computed from a regex literal's `.source` at runtime, not spelled as the string `"RegExp"` anywhere the parser sees), `String.fromCharCode(...)` constructing the word at runtime, or the word split across concatenated string parts. This is the one thing an AST-level identifier/literal match cannot reach, and it is inherent — no static check, AST-based or textual, can see a value that is never spelled out. The annotation checker has a comparable residual: `tagStartsOwnLine` rejects a tag name merely mentioned mid-sentence, but a reviewer who deliberately started a fabricated sentence with `@why` at the beginning of a comment line would still produce a real, own-line, non-empty tag the checker cannot distinguish from a genuine one — no annotation checker can verify that a documented rationale is TRUE, only that one was written in the right shape and place.

Together, the machine-enforced half makes the trust kernel the only place `RegExp` (any spelling) and `import()` may appear, and the only place an exported declaration may go unannotated because it is provably not a function — so the residual admission surface a reviewer must reason about is narrowed to semantic indirection that never spells the forbidden word, and to whether a written rationale is honest, not to whether some construction form was missed.

### Consequences

* Good, because each loaded microfrontend evaluates as its own isolated module instance, so distinct occupants cannot couple through a shared module record.
* Good, because retaining backing references for the realm's lifetime keeps modules with post-resolution evaluation (such as top-level await) valid, avoiding mid-evaluation breakage.
* Good, because concentrating all dynamic-code primitives in one audited trust kernel makes the arbitrary-code-admission surface small and reviewable rather than diffuse.
* Good, because the trust-kernel contract makes the safety invariants explicit, with the primitive-confinement and safety-rationale halves machine-checkable and the no-mutable-state/no-dangerous-imports/anti-aliasing halves explicit for review even though no script holds them.
* Good, because every import of one unit within a load binds to one instance, so a load never holds two instances of the same unit's module-level state.
* Good, because sharing only source text keeps the transfer savings of cross-microfrontend reuse while no two loads can couple through a shared reference or instance.
* Good, because retained memory is bounded by the number of distinct extension instances: unmounting, re-mounting or re-registering the same extension instance mints nothing new (`cpt-frontx-nfr-resource-efficiency`).
* Bad, because retaining backing references for the realm's lifetime means the per-instance memory they hold is reclaimed only when the realm ends, not when a microfrontend unmounts or is unregistered, until revocation is proven safe and a saving is measured.
* Bad, because each load mints one reference per reached unit and rewrites each unit's imports, a preparation cost that grows with the number of reached units; it must stay within the load-time budget of `cpt-frontx-nfr-runtime-performance`.
* Bad, because two distinct extension instances that reach the same unit each hold their own reference and instance of it, so memory grows per distinct instance even where the source text is shared.
* Neutral, because module-level state persists across unmount unless the extension cleans it in its unmount lifecycle; the runtime neither resets nor discards it on the extension's behalf.
* Bad, because the trust kernel is a deliberate exception to ordinary static-analysis scanning, so its discipline depends on the enforced contract and review rather than on the general scanner.
* Good, because the per-instance guarantee has exactly one stated exception: every module a load reaches evaluates inside that load's own instance, with no exception for dependency cycles, and only a fully opaque `import(expr)` stays outside it, as `cpt-frontx-adr-lazy-import-resolution` decides.
* Bad, because a static-import cycle among a microfrontend's own chunks fails the load rather than degrading it, so a microfrontend whose build emits circular chunk imports cannot be loaded until it is rebuilt — availability, never isolation, is what a cycle costs.
* Good, because the failure is diagnosed rather than silent: it names the chunks on the cycle and the microfrontend, so it is actionable by the microfrontend's author at build time instead of surfacing as an unexplained runtime error.

### Confirmation

Runtime tests confirm the graph behaviour. Within one load, every import of the same unit binds to one instance. Two extension instances of one definition that reach the same unit evaluate distinct instances over the same cached source text. Two extension instances that reach the same own chunk evaluate distinct instances of it. A unit first reached by a lazily loaded chunk joins the load's existing map, and a unit already in the map keeps its entry. Unmounting and mounting the same extension instance repeatedly mints no new reference. A load whose own chunks import one another in a cycle fails with an `MfeLoadError` that names the chunks on the cycle and the microfrontend, and no module of that load is requested from its origin as a module; the test for a cycle among list items belongs to `cpt-frontx-adr-shared-dep-reuse`. The rewrite of a unit's literal and pattern dynamic imports is confirmed by the tests `cpt-frontx-adr-lazy-import-resolution` lists. Whether minting stays within the load-time budget is checked by the verification `cpt-frontx-nfr-runtime-performance` defines. References stay unrevoked unless a cross-browser test passes for importing a revoked but already instantiated reference from lazily loaded chunks, re-mounts and modules with top-level await, and a measured memory saving accompanies it.

A security review confirms that admission of microfrontend code passes only through the trust kernel, that each load yields a distinct module graph keyed by instance identity, and that no microfrontend can reach a host capability beyond what its domain grants. The same review confirms the review-only invariants: no mutable module-level state, no forbidden host capability import, no semantic indirection that constructs the word `RegExp` without ever writing it, and no dynamic-code text embedded in a string or template literal outside the kernel. Two automated checks confirm the machine-enforced half: the ESLint `no-restricted-syntax` rule in `eslint.config.js` confirms `ImportExpression` and the identifier `RegExp` (or its string spellings, in code position or JSX tag position) appear only in the kernel file — via `Identifier`/`JSXIdentifier`/`Literal`/`TemplateElement` selectors matching the word, complete over how the word can be written in `packages/mfes/src/**` rather than over a list of construction forms (that tree is explicitly re-included in ESLint's file discovery by a negation in the global `ignores` array, closing a discovery gap a same-named `*.config.*`/`*.cjs` file would otherwise fall through); and `scripts/check-trust-kernel-annotations.mjs` (via `npm run arch:check`) confirms every exported declaration in the kernel file is either verified (a non-empty, own-line `@safety-reviewed` and `@why`, via `ts.getJSDocTags`) or classified as provably not function-valued (a `const` with a literal initializer, or a type/interface/enum) — an export this script cannot classify this way, including a mutable `let`/`var` export, an `export =` assignment, or an `export as namespace` declaration, FAILS the check, as does a file that does not parse cleanly. The import primitive's runtime guard, and the guard the kernel's generated lazy-loader stub derives from the same shared `inlineContentSchemes()` list, reject any non-inline-content input at runtime. The grounding mechanisms are the audited trust kernel `packages/mfes/src/handler/mfe-handler-mf/mf-dynamic-module-ops.ts` (the site where production code generates dynamic-import source text and constructs specifier matchers, with its guard and safety annotations) and the per-load isolation in `packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts` (the instance-keyed load, the own-chunk cycle failure and the retain-for-realm-lifetime invariant).

## Pros and Cons of the Options

### Per-load inline-content module graph behind an audited trust kernel

Each load is a fresh instance-keyed module graph retained for the realm's lifetime; all dynamic-code primitives live in one audited, contract-enforced trust kernel.

* Good, because it delivers true per-instance isolation with no cross-microfrontend module sharing.
* Good, because retention keeps post-resolution evaluation valid.
* Good, because the trust surface is one small, audited, lint-enforced location with bounded inputs.
* Neutral, because it requires a maintained trust-kernel contract, an ESLint `no-restricted-syntax` rule, and an `arch:check` annotation assertion to keep the machine-enforced half of the surface closed, plus ongoing code review for the invariants no automated check reaches (no mutable state, no dangerous imports, indirection that never writes the word `RegExp`, string-embedded dynamic-code text).
* Bad, because per-instance backing references are held until the realm ends, deferring their reclamation.

### Shared module graph across microfrontends

All microfrontends evaluate against one shared module instance graph, relying on convention.

* Good, because it minimizes memory and load overhead by sharing instances.
* Bad, because microfrontends can couple through the shared instance, defeating per-instance isolation.
* Bad, because dynamic-code primitives used wherever convenient leave the arbitrary-code-admission surface diffuse and hard to audit.

### Share source text only

Loads reuse a unit's cached source text; each load mints its own references over it and evaluates its own instances.

* Good, because each load keeps its own instance of every unit it reaches, so isolation holds for shared-dependency code as for the load's own chunks.
* Good, because the transfer saving of cross-microfrontend reuse is kept: the text is fetched and cached once.
* Bad, because every load pays the minting and evaluation cost of each unit it reaches, and every distinct extension instance holds its own instances in memory.

### Share unit references or instances across loads

A unit's inline-content reference, or the instance evaluated from it, is created once per realm and bound by every load that reaches the unit.

* Good, because each unit is minted and evaluated once per realm, which minimizes preparation time and memory.
* Bad, because loads that reach the same unit bind to one module record and couple through its module-level state, which breaks per-instance isolation.
* Bad, because every module reachable from a shared instance is shared too, so the exception is never confined to the shared unit itself.

### Never revoke until revocation is proven

References are retained for the realm's lifetime; revocation is adopted only on cross-browser proof and a measured memory saving.

* Good, because post-resolution evaluation, lazily loaded chunks and re-mounts never meet a revoked reference.
* Good, because adopting revocation is tied to evidence rather than to an assumption about browser behaviour.
* Bad, because the memory the references hold is reclaimed only when the realm ends.

### Revoke after evaluation

The same per-load isolation, but backing references are revoked as soon as each import resolves.

* Good, because it reclaims per-instance backing memory promptly on resolution.
* Bad, because a module that keeps evaluating after its import resolves loses its backing reference mid-evaluation and breaks.
* Bad, because a lazily loaded chunk or a re-mount that imports an already instantiated unit depends on browser behaviour for revoked references that is not proven across the supported browsers.
* Neutral, because it keeps per-instance isolation but trades correctness of post-resolution evaluation for earlier reclamation.

### Revoke on unregistration

References are retained while the extension instance is registered and revoked when it is unregistered.

* Good, because memory held by an unregistered extension instance's references can be reclaimed before the realm ends.
* Bad, because a re-registration of the same extension instance reuses its graph and would import revoked references, which is not proven to work across the supported browsers.
* Neutral, because the saving is real only where the browser releases the instantiated modules together with the revoked reference, which must be measured rather than assumed.

## More Information

The present concrete instantiation isolates each load by building a per-load graph of inline-content module URLs for the dependency chain in `packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts`, keyed by the extension instance identity (`extensionId`) so distinct instances get distinct evaluations and a re-load of the same instance reuses its cached graph; each whole-package entry becomes one inline-content module URL, the single-unit case of `cpt-frontx-adr-shared-dep-reuse`; the inline-content URLs are not revoked, because modules with top-level await keep evaluating after the import resolves.

**The sole-site invariant, stated precisely.** All *production* generation of dynamic-import source text and specifier-matcher construction lives in the audited trust kernel, `packages/mfes/src/handler/mfe-handler-mf/mf-dynamic-module-ops.ts` — `importBlobModule`'s own `import()` call, and `buildLazyLoaderStubSource`'s generation of the lazy-loader stub text (which itself contains the substring `import(u)`, evaluated only once the caller blob-URLs that generated text and passes it through `importBlobModule`). This explicitly excludes: inert test fixtures elsewhere in the package that construct dynamic-import-shaped strings or mock the kernel's exports for isolation (they generate no source a production load ever evaluates); and the ESLint enforcement's own inherent blind spot (semantic indirection that never writes the word `RegExp` or `import(` at all — `globalThis[/RegExp/.source]('x')`, character-code construction, split concatenation), which is a review-only concern, not a violation of the invariant. Distinct from this invariant — and not itself dynamic-code admission — is *general dynamically-evaluated source construction*: `MfeHandlerMF.createBlobUrlChain` rewrites bare specifiers and injects the static `import{__frontx_lazy}from"<url>"` binding into a chunk's already-fetched text before blob-URLing the result (around `MfeHandlerMF.ts`'s `createBlobUrlChainInternal`). That is textual rewriting and blob-URL minting of a chunk this load already fetched, using ordinary string operations and a static `import` statement — no `ImportExpression` or dynamic `RegExp` construction is involved, so it is a distinct primitive from what this ADR's trust kernel contains, not an unstated exception to it.

The specific mechanism names, the keying field, and the inline-content scheme are descriptive of the current instantiation and non-binding; the durable decision is per-instance isolated module graphs over each load's own chunks and the units it reaches, source text as the only thing shared across loads, backing references retained until revocation is proven, and a single audited dynamic-code trust kernel.

**Scope of impact.** Applies to how a loaded microfrontend's code is evaluated in isolation and how the dynamic-code primitives that mechanism needs are contained. It does not decide how a microfrontend is matched into a domain (decided in `cpt-frontx-adr-domain-extension-compatibility`) or how a domain's occupancy is governed (decided in `cpt-frontx-adr-extension-domain-occupancy`); those decide admission compatibility and placement, while this decides runtime code isolation and the trust surface. Nor does it decide what a shared-dependency unit is (`cpt-frontx-adr-shared-dep-reuse`), which units a load reaches and fetches (`cpt-frontx-adr-mfe-asset-discovery`), or how a lazily loaded chunk's imports bind (`cpt-frontx-adr-lazy-import-resolution`); it decides how a load turns the units it reaches into its own isolated instances.

**Review trigger.** Revisit if a cross-browser test proves that importing a revoked but already instantiated inline-content reference works for lazily loaded chunks, re-mounts and modules with top-level await and a real memory saving is measured, if per-unit minting exceeds the load-time budget of `cpt-frontx-nfr-runtime-performance`, if a new dynamic-code primitive must be admitted to the trust kernel, if the inputs reaching the trust kernel could cease to be bounded and author-declared, or if a mechanism becomes available that admits a cyclic dependency graph into a load's own isolated instance uniformly across the supported browsers — such a mechanism takes the shape of assigning each module a per-load identity before its content exists.

**Checklist applicability.**

* ARCH — applicable and addressed above (a runtime isolation and trust-surface decision affecting every loaded microfrontend, and hard to reverse once the isolation and trust-kernel contract are relied upon).
* SEC — applicable and addressed above (SEC-ADR-001): the threat model is admission of independently authored — potentially untrusted — microfrontend code into the host; the attack surface is the small set of dynamic-code primitives, contained in a single audited trust kernel. Machine-enforced: an ESLint `no-restricted-syntax` rule (`eslint.config.js`) confining `ImportExpression` and the identifier `RegExp` and its string spellings (`Identifier`/`JSXIdentifier`/`Literal`/`TemplateElement` selectors matching the word, including JSX tag position) to the kernel file across `packages/mfes/src/**` — complete over how the word can be written, not over an enumerated list of construction forms, with a negation in ESLint's global `ignores` array keeping that entire tree in file discovery rather than letting a `*.config.*`/`*.cjs`-named file escape linting while still being compiled and shippable; a fail-closed annotation classifier (`scripts/check-trust-kernel-annotations.mjs` via `arch:check`, AST-based via `ts.getJSDocTags`) that verifies a non-empty, own-line `@safety-reviewed`/`@why` tag on every exported declaration it classifies as function-valued (a `function`, or a `const` bound to an arrow/function expression), classifies as not-function-valued only what can never hold a function (a `const` literal, a type/interface/enum), and FAILS on everything else — including a mutable `let`/`var` export, an `export =` assignment, an `export as namespace` declaration, and a file that does not parse cleanly — rather than skipping it; and a runtime input guard (on both the kernel's `importBlobModule` and its generated lazy-loader stub, both reading the same shared `inlineContentSchemes()` list) rejecting any non-`blob:`/`data:` input. Review-only, not machine-enforced: no mutable module state, no dangerous host-capability imports, no semantic indirection that constructs the word `RegExp` without ever writing it (`globalThis[/RegExp/.source]('x')`, character-code construction, split concatenation — inherent, no static check can see a value never spelled out), no dynamic-code text embedded in a string or template literal outside the kernel, and no verification that a documented `@safety-reviewed`/`@why` rationale is actually true (only that a real, own-line tag with non-empty content exists, in a place the classifier can find it). Separately, the rule's match is deliberately over-broad in the other direction — it also flags a legitimate local name, import binding, property, or type-only reference named `RegExp` that has nothing to do with the global constructor — which is a false-positive cost accepted for a syntax-only lexical quarantine, not a security gap. The blast radius of any one microfrontend is bounded by per-instance module isolation and the default-deny posture that grants a microfrontend nothing beyond its domain's grants. Runtimes in one realm whose type-system providers share type registrations can affect what one another's admission accepts; whether a provider shares registrations, and how it limits the effect, is that provider's concern behind the port `cpt-frontx-adr-runtime-type-system-coupling` decides. That does not widen the blast radius: it gives code already running in the realm no capability it lacks, and it is a correctness coupling between well-behaved runtimes. A fully opaque `import(expr)` is the one accepted exception to isolation, decided in `cpt-frontx-adr-lazy-import-resolution`. No secret or credential is introduced by this decision.
* PERF — applicable and addressed above: per-unit minting and import rewriting are a load-time cost that must stay within the budget of `cpt-frontx-nfr-runtime-performance`; retained memory is bounded by the number of distinct extension instances (`cpt-frontx-nfr-resource-efficiency`); retaining references for the realm's lifetime defers reclamation until revocation is proven safe across the supported browsers and a saving is measured.
* REL — applicable and addressed above: a cycle among a load's own chunks fails that load with an `MfeLoadError` naming the chunks on the cycle and the microfrontend, trading availability for isolation, and retaining references for the realm's lifetime keeps modules that evaluate after their import resolves valid.
* DATA — Not applicable because no persistent data store or schema is involved.
* INT — Not applicable because it shapes internal runtime code isolation, not an external integration contract.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.
* MAINT — applicable and addressed above: the dynamic-code primitives live in one trust-kernel file, held there by the ESLint rule and the annotation check, so a change to them is a change to one reviewed location.
* TEST — applicable and addressed above: the runtime tests, the ESLint rule and the annotation check listed under Confirmation are the verification this decision rests on.
* COMPL — Not applicable because no regulated or personal data is processed.
* UX — Not applicable because the decision shapes code evaluation, not rendered output; its user-visible effect is load time, addressed under PERF.
* BIZ — Not applicable because this is a technical decision; product requirements live in the PRD and are cited by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-nfr-security` — per-instance isolation and the audited trust kernel uphold the default-deny posture by bounding each microfrontend's blast radius and keeping the arbitrary-code-admission surface small and reviewed.
* `cpt-frontx-nfr-resource-efficiency` — sharing only source text, binding every import of a unit within a load to one instance, and reusing an extension instance's graph across mount cycles keep retained memory bounded by the number of distinct extension instances.
* `cpt-frontx-nfr-runtime-performance` — the per-unit minting each load performs stays within the load-time budget this requirement sets.
* `cpt-frontx-fr-mfe-runtime-registration` — isolation is the mechanism by which a registered microfrontend is loaded on demand and evaluated as its own instance within the running application.
* `cpt-frontx-component-mfe-runtime` — this decision shapes the runtime code-isolation and trust-surface behavior of the MFE Runtime component.
* `cpt-frontx-principle-agnostic-core` — isolation holds regardless of the UI framework or type system a microfrontend adopts, keeping the substrate agnostic.
* `cpt-frontx-adr-shared-dep-reuse` — the decision that defines units, own chunks and fetch lists, and fails a load whose list items form a cycle.
* `cpt-frontx-adr-mfe-asset-discovery` — the decision that fixes which units and own chunks a load reaches and fetches.
* `cpt-frontx-adr-lazy-import-resolution` — the decision that binds lazily loaded chunks to this per-load map and states the one accepted exception to isolation.
* `cpt-frontx-adr-shared-dep-cache-reach` — the decision that bounds the realm cache holding the source text loads share.
