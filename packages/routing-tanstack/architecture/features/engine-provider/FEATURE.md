---
description: Feature specification of the Engine Provider, the sole component that imports a concrete router engine and builds a router over an occupant's own entry address.
---

# Feature: Engine Provider


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
  - [1.5 Worked Example: Satisfying The Engine-Provider Port](#15-worked-example-satisfying-the-engine-provider-port)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Swap The Router Engine Used By One Microfrontend](#swap-the-router-engine-used-by-one-microfrontend)
  - [Render The Extension's One Router From Its Route Tree](#render-the-extensions-one-router-from-its-route-tree)
  - [Reach The Own Subroute From Code Outside The Rendered Tree](#reach-the-own-subroute-from-code-outside-the-rendered-tree)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [History Adaptation To The RouterHistory Contract](#history-adaptation-to-the-routerhistory-contract)
  - [Router Creation And Mount Over A Virtual History](#router-creation-and-mount-over-a-virtual-history)
  - [Teardown On Unmount](#teardown-on-unmount)
  - [Extension Router](#extension-router)
  - [Own-Subroute Navigation Outside The Rendered Tree](#own-subroute-navigation-outside-the-rendered-tree)
- [4. States (CDSL)](#4-states-cdsl)
  - [No Feature-Owned State Machine](#no-feature-owned-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [History Adaptation And Router Construction Over A Virtual History](#history-adaptation-and-router-construction-over-a-virtual-history)
  - [Teardown Unsubscription On Unmount](#teardown-unsubscription-on-unmount)
  - [Extension Router And Public Entry](#extension-router-and-public-entry)
  - [Own-Subroute Navigation](#own-subroute-navigation)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-routing-engine-provider`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-routing-engine-provider`

### 1.1 Overview

The Engine Provider is the sole component permitted to import a concrete router engine. This package's own `ExtensionRouter` and `navigation()` read this occupant's entry address from the ready FrontX router of the extension's own runtime, `router` from `@gears-frontx/routing`, through `ownEntryAddress()` (`cpt-frontx-adr-extension-routing-port`), and pass it to the Engine Provider: its own domain key and extension, or none. None is passed in the shell runtime, the runtime whose router was never supplied navigation, and there `ExtensionRouter` and `navigation()` work over the shell's subroute (the pathname) only. When navigation was supplied but the router has no occupant value (an extension with no route of its own or of its domain, or a failed occupant-value exchange), that extension has no access to the router: `ownEntryAddress()` throws there, so its extension router and `navigation()` refuse too. This package shares the runtime's one copy of `@gears-frontx/routing` with the router its runtime's registry receives, as routing DESIGN §3.2 (FrontX Router) states. This package never reads an entry address from the navigation substrate or from anywhere else, and no interface it exposes lets the microfrontend's own code reach one. Once constructed, this package projects that entry's own payload into a **virtual location** (its reserved `route` parameter as pathname, defaulting to `/` when absent, and every other parameter as search), and adapts that virtual location, together with the navigation substrate's `NavigationHistory` contract, into the `RouterHistory` contract a concrete engine expects — filling in the members `NavigationHistory` does not provide and translating `NavigationHistory`'s own notification into the `SubscriberArgs` shape (`location`, `action`) the engine's `subscribe` callback expects — constructs that engine's router with `createRouter({ routeTree, history })`, and `ExtensionRouter` renders it into the microfrontend's own component tree through `EngineProvider`, which mounts it via `RouterProvider`. Adaptation, construction and the provider component are internal to this package. The microfrontend's own code authors its own route tree with this package's re-exported builders alone, renders `ExtensionRouter` with it, reaches its own subroute from code outside the rendered tree through `navigation()`, and may use the engine's own redirect and scoped route hooks from rendered code. Every navigation the constructed router performs is written back to this occupant's own entry alone, through the navigation substrate's own control boundary — never a sibling occupant's entry, another domain's entry, or the pathname. In the shell runtime, every navigation is written to the pathname alone, and the query string stays untouched. A hash passed to a navigation is dropped in every runtime. `createHref` composes a full, shareable composed-application URL from an updated virtual location by calling the navigation substrate's own grammar serializer, never by concatenating path fragments. The default provider this package ships binds this adapter to TanStack Router, using its React binding (`@tanstack/react-router`), the one engine package it declares; a microfrontend may replace this provider with a different one satisfying the same engine-provider port, including one that adopts a different internal-route convention of its own. The `route` parameter's own value, as it sits in the URL, carries no leading `/` — the navigation substrate's `name`/`param-value` grammar admits one just as any other character, but this provider's own convention never writes one there; this adapter prepends exactly one `/` to build the virtual location's own pathname on read, and strips exactly one leading `/` back off before writing the pathname back into the entry's own `route` parameter on write-back.

### 1.2 Purpose

A router engine renders routes and matches search parameters, and concrete engines evolve on their own release cadence, independent of the navigation substrate and of every other microfrontend in the realm. Confining engine choice to a swappable, per-microfrontend adapter is what keeps that evolution — or an outright engine replacement — from reaching the substrate, the host, or a sibling microfrontend. The navigation substrate's own URL grammar carries no notion of pathname and search beyond the shell's subroute (the pathname), which it never interprets; giving a page-shaped engine something to route against therefore requires a convention layered on top of one occupant's own entry, and this feature exists to be that adapter: it is the only place a concrete engine's package is imported, the only place a virtual location is projected from an entry, and the only place `NavigationHistory` is translated into what `createRouter` expects as `RouterHistory`.

**Requirements**: `cpt-frontx-routing-fr-engine-provider-port` (core), `cpt-frontx-routing-tanstack-fr-engine-adaptation`, `cpt-frontx-routing-tanstack-fr-extension-router`, `cpt-frontx-routing-tanstack-fr-extension-navigation`, `cpt-frontx-routing-tanstack-fr-public-entry`, `cpt-frontx-routing-tanstack-fr-scoped-navigation-zone`, `cpt-frontx-routing-tanstack-nfr-single-ecosystem-edge`

**Principles**: `cpt-frontx-routing-tanstack-principle-engine-confined`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-routing-tanstack-actor-microfrontend-developer` | Authors a microfrontend's own route tree using this package's re-exported builders alone, renders `ExtensionRouter` with it, and uses `navigation()` from code outside the rendered tree — never constructs a router, adapts history, or reads an entry address, all of which `ExtensionRouter` and `navigation()` perform inside this package — and redirects with the engine's own redirect, which stays within that same subroute. May replace this package with a different one satisfying the same engine-provider port without touching the navigation substrate or the runtime. |
| `cpt-frontx-routing-actor-frontx-router` | The ready FrontX router of the extension's own runtime, `router` from `@gears-frontx/routing`; returns the runtime's own occupant value, once validated, through `ownEntryAddress()`, which `ExtensionRouter` and `navigation()` read. It starts each routed domain's observer at `startDomain` and sends the `mount_ext` and `unmount_ext` actions chains of a page load or a back or forward step; the runtime executes them. This package mounts nothing and decides no occupancy. |
| `cpt-frontx-routing-tanstack-actor-router-engine` | The pluggable, replaceable engine an engine provider binds the shared history to; TanStack Router is the default, constructed via `createRouter({ routeTree, history })` over this package's own virtual history. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Use case**: `cpt-frontx-routing-tanstack-usecase-swap-router-engine`
- **Component**: `cpt-frontx-component-routing-engine-provider`, `cpt-frontx-component-routing-tanstack-extension-router`, `cpt-frontx-component-routing-tanstack-navigation`
- **Constraints**: `cpt-frontx-constraint-routing-tanstack-sole-engine-import`
- **Dependencies**: `cpt-frontx-feature-routing-navigation-substrate` — the core package's own feature ([routing DESIGN](../../../../routing/architecture/DESIGN.md)); the provider implements the engine port the substrate defines, and projects its own virtual location from the entry and the URL grammar that feature owns; `cpt-frontx-feature-routing-route-ownership-signal` — the core package's own feature; the provider reads the runtime's own entry address through the router's `ownEntryAddress()` and, in an extension runtime, writes its own entry's parameters through the URL back-projection helper; in the shell runtime it writes the pathname through the grammar codec, which copies the query string and current hash unchanged, both owned by that feature.

**Territory boundary**: Replacing this package with a different engine-provider port implementation is scoped to each microfrontend's own route-tree authoring code — rewritten to the replacement's own builders, hooks, extension router and own-subroute navigation — since a microfrontend reaches this package only through its public entry: `ExtensionRouter`, `navigation()`, and the re-exported route-tree builders and scoped route hooks. It reaches no further: the navigation substrate, the URL grammar, and the route ownership signal — all owned by the core package (`cpt-frontx-feature-routing-navigation-substrate`, `cpt-frontx-feature-routing-route-ownership-signal`, [routing DESIGN](../../../../routing/architecture/DESIGN.md)) — the runtime, the host's code, and every sibling microfrontend are unaffected and may remain on a different engine provider of their own, including one that projects a virtual location by a different convention.

**Checklist applicability**:
- PERF — Not applicable because this feature sets no latency or throughput target; each `navigation()` member builds a fresh adapted history at its own call (§3, Own-Subroute Navigation Outside The Rendered Tree, step 4).
- SEC — Not applicable because this feature holds no credential and authorizes no one; confinement to the calling runtime's own private subroute is specified in §3 (Extension Router, step 3; Own-Subroute Navigation Outside The Rendered Tree, step 5).
- REL — Addressed in §6 and §3: a write the shared history refuses is reported through the adapter's own error-reporting channel and leaves the virtual location unchanged (§6), and an unmounted router's registration is released (§3, Teardown On Unmount).
- DATA — Not applicable because this feature stores nothing; the per-entry state argument is discarded (§3, History Adaptation To The RouterHistory Contract, step 6).
- INT — Addressed in §1.5 and §3: the engine-provider port this package satisfies, and the `RouterHistory` and `SubscriberArgs` contract it adapts to (History Adaptation To The RouterHistory Contract).
- OPS — Not applicable because this feature is library code with no deployed service, configuration or monitoring of its own.
- MAINT — Not applicable because this feature sets no maintainability target of its own; its engine dependency is confined by `cpt-frontx-constraint-routing-tanstack-sole-engine-import`.
- TEST — Addressed in §6: the acceptance criteria, Example 1 included, that an implementation is tested against.
- COMPL — Not applicable because this feature handles no regulated or personal data.
- UX — Not applicable because this feature renders no user interface of its own; the degraded `block` and the discarded per-entry state a consumer of the engine observes are recorded in §3 (History Adaptation To The RouterHistory Contract, steps 5 and 6).
- BIZ — Not applicable because this is an internal library feature; its requirements are cited by ID in §1.2.

### 1.5 Worked Example: Satisfying The Engine-Provider Port

The engine-provider port's normative schema — what a conforming provider **MUST** accept from the navigation substrate and what it is responsible for producing — is owned by the navigation substrate's own artifacts, not by this provider (`cpt-frontx-feature-routing-navigation-substrate` §1.5, Engine-provider port shape: [routing FEATURE](../../../../routing/architecture/features/navigation-substrate/FEATURE.md#15-contract-shapes)), per `cpt-frontx-adr-contract-schema-ownership` (owned contract role in DESIGN, decision rationale in the ADR, field-level schema in the owning FEATURE — here, the *port-declaring* feature, since the port belongs to the core package). What follows is this package's own worked example of satisfying that schema with a concrete engine; it demonstrates the normative form, it does not restate it.

This package accepts the navigation substrate's `NavigationHistory` instance, the entry address `ExtensionRouter` and `navigation()` read from the ready FrontX router through `ownEntryAddress()` — its own domain key and extension, or its absence in the shell runtime, which has no occupant value — and the microfrontend's own route tree exactly as the port requires (linked above). The Engine Provider never obtains, derives, or validates an entry address itself. It produces a constructed router — mounting that router into the microfrontend's own component tree is a separate, later act, performed by `ExtensionRouter` through `EngineProvider` (§3, "Router Creation And Mount Over A Virtual History", below), not by these two steps — via two steps the port itself does not mandate but that this provider's own worked example follows throughout, both folded behind the one internal adaptation entry point, `adaptProviderHistory`, which `ExtensionRouter` and `navigation()` call: first, projecting the given entry's own payload into a **virtual location** — the payload parameter reserved by this package's own convention, `route`, becomes the virtual location's pathname (defaulting to `/` when the entry carries no such parameter), and every other parameter of that same entry becomes the virtual location's search; second, deriving this engine's own history-contract object from that virtual location and the substrate's `NavigationHistory` — deriving the members `RouterHistory` requires beyond `location`/`subscribe`/`push`/`replace`/`go`, and translating `NavigationHistory`'s notification into the `SubscriberArgs` shape (`location`, `action`) `RouterHistory`'s `subscribe` callback expects. The full derivation this worked example follows is §3, History Adaptation, below.

**Reserved parameter `route` — this provider's own convention, verbatim.** The navigation substrate treats this reserved parameter only as a convention a provider adopts, never a rule the substrate itself imposes (`packages/routing/architecture/DESIGN.md`, "Navigation Substrate"). This provider's own PRD states the convention normatively and gives its own worked example (`packages/routing-tanstack/architecture/PRD.md` §9, Example 1), reproduced here because this package is the provider that implements it — an implementation **MUST** reproduce this example as one of its own acceptance scenarios:

> **A microfrontend's own router.** Under the default engine provider, an occupant's internal route is the reserved parameter `route`; its remaining parameters are its router's search.
>
> ```
> /en?screen=dashboard;route=settings/general;orientation=left
>    &sheet=tenant-details;route=contacts;tenantId=456
> ```
>
> The dashboard's router sees pathname `/settings/general` and search `orientation=left`.

This is a convention this provider adopts, not a rule the navigation substrate's own port imposes on every conforming provider (routing DESIGN §1.1, Navigation Substrate; §3.3, Engine-provider port); a different engine-provider port implementation is free to project an entry's own payload into a virtual location by a different rule, as long as it, too, reads and writes only its own entry.

**Diagnostic of mismatch, for this worked example**: this provider fails at construction, not at first navigation, if it cannot accept `NavigationHistory` as-is — the same construction-time failure the port's normative definition records at the link above. For this package specifically, that means the router is never constructed and the microfrontend's routing does not initialize (`cpt-frontx-routing-tanstack-usecase-swap-router-engine`, Alternative Flow). This failure is local to the microfrontend that adopted the mismatched provider; it does not reach the substrate, the host, or a sibling microfrontend.

## 2. Actor Flows (CDSL)

### Swap The Router Engine Used By One Microfrontend

- [ ] `p1` - **ID**: `cpt-frontx-flow-routing-engine-provider-swap-engine`

**Actor**: `cpt-frontx-routing-tanstack-actor-microfrontend-developer`

**Use cases**: `cpt-frontx-routing-tanstack-usecase-swap-router-engine`

**Success Scenarios**:
- A microfrontend, currently using the default TanStack Router engine provider, has it replaced with a different one satisfying the same engine-provider port (§1.5); the microfrontend's own route tree, its search-parameter handling, and every one of its own imports of this package move to the new engine, and nothing outside that code moves, not the navigation substrate or the runtime.

**Error Scenarios**:
- The replacement provider does not satisfy the engine-provider port (§1.5): it cannot accept the shared `NavigationHistory` instance and adapt it into whatever history contract its own engine requires, and the microfrontend's routing does not initialize.

**Steps**:
1. [ ] - `p1` - The Microfrontend Developer replaces this package in the microfrontend's own build with a different one satisfying the same engine-provider port - `inst-replace-provider`
2. [ ] - `p1` - The replacement provider is handed the same navigation substrate's shared `NavigationHistory` instance and the same entry address the FrontX router of the extension's own runtime holds (`ownEntryAddress()`) - `inst-hand-same-history-entry`
3. [ ] - `p1` - The replacement provider adapts that shared `NavigationHistory` and entry into whatever virtual location and history contract its own engine expects (the default provider's own worked example is `cpt-frontx-algo-routing-engine-provider-history-adaptation`, translating into `RouterHistory`/`SubscriberArgs`) - `inst-adapt-history`
4. [ ] - `p1` - **IF** the replacement provider does not satisfy the engine-provider port - `inst-if-contract-unsatisfied`
   1. [ ] - `p1` - **RETURN** failure — the microfrontend's routing does not initialize - `inst-return-init-failure`
5. [ ] - `p1` - **ELSE** the replacement provider constructs its engine's router over its own virtual history (`cpt-frontx-algo-routing-engine-provider-router-creation`, steps 1-2, 4); that construction returns a router which is not yet mounted — the replacement's own extension router renders it into the microfrontend's own component tree as a separate act, through the provider's own mount component (same algo, step 3) - `inst-construct-router`
6. [ ] - `p1` - The microfrontend's own route tree, its search-parameter handling, and every one of its own imports of this package — rewritten throughout to the replacement provider's own surface — move to the new engine; nothing outside the microfrontend's own code changes - `inst-territory-confined`

**Postconditions**:
- The navigation substrate, the runtime, the host, and every sibling microfrontend observe no change.

### Render The Extension's One Router From Its Route Tree

- [ ] `p1` - **ID**: `cpt-frontx-flow-routing-engine-provider-render-extension-router`

**Actor**: `cpt-frontx-routing-tanstack-actor-microfrontend-developer`

**Success Scenarios**:
- A microfrontend renders `ExtensionRouter` with its own route tree in its own content, and gets its runtime's one router over that runtime's own private subroute, without constructing a router, adapting history, or reading an entry address.

**Error Scenarios**:
- The router read throws in an extension runtime without router access, one whose FrontX router was supplied navigation but has no occupant value: `router.ownEntryAddress()` throws, and `ExtensionRouter` refuses.
- No other error of this flow's own: a provider that cannot initialize fails as `cpt-frontx-flow-routing-engine-provider-swap-engine` records.

**Steps**:
1. [ ] - `p1` - The Microfrontend Developer authors the microfrontend's own route tree with this package's re-exported route-tree builders - `inst-author-route-tree`
2. [ ] - `p1` - The Microfrontend Developer renders `ExtensionRouter` with that route tree, `{ routeTree }` - `inst-render-extension-router`
3. [x] - `p1` - `ExtensionRouter` builds and renders the runtime's one router (`cpt-frontx-algo-routing-engine-provider-extension-router`) - `inst-run-extension-router`
4. [x] - `p1` - **RETURN** the router, rendered into the microfrontend's own component tree and matching only its runtime's own private subroute - `inst-return-rendered-router`

### Reach The Own Subroute From Code Outside The Rendered Tree

- [ ] `p1` - **ID**: `cpt-frontx-flow-routing-engine-provider-own-subroute-navigation`

**Actor**: `cpt-frontx-routing-tanstack-actor-microfrontend-developer`

**Success Scenarios**:
- Code outside the rendered tree, such as an action handler, calls `navigation()` and navigates, replaces, or reads the location of its runtime's own private subroute, and of nothing else.

**Error Scenarios**:
- The router read throws in an extension runtime without router access, one whose FrontX router was supplied navigation but has no occupant value: `router.ownEntryAddress()` throws, and `navigation()` refuses.
- No other error of this flow's own: no member of `navigation()` reaches anything outside the runtime's own private subroute.

**Steps**:
1. [ ] - `p1` - Code outside the rendered tree calls `navigation()` - `inst-call-navigation`
2. [x] - `p1` - `navigation()` returns its three members over the runtime's own private subroute (`cpt-frontx-algo-routing-engine-provider-navigation`) - `inst-run-navigation`
3. [ ] - `p1` - The code calls `navigate(path)` or `replace(path)` to change its own subroute, or `location()` to read it - `inst-use-navigation-members`
4. [x] - `p1` - **RETURN** the change written to the runtime's own private subroute alone, or that subroute's own `{ pathname, search }` - `inst-return-navigation-result`

## 3. Processes / Business Logic (CDSL)

### History Adaptation To The RouterHistory Contract

- [x] `p2` - **ID**: `cpt-frontx-algo-routing-engine-provider-history-adaptation`

**Input**: The navigation substrate's shared `NavigationHistory` instance, exposing `location`, `subscribe`, `push`, `replace`, `go`; the entry address `ExtensionRouter` or `navigation()` reads from the ready FrontX router through `ownEntryAddress()` — its own domain key and extension — or its absence in the shell runtime, which has no occupant value.

**Output**: An object satisfying the `RouterHistory` contract of `@tanstack/history`, usable as `createRouter`'s `history` input, navigating a virtual location projected from this occupant's own entry.

**Steps**:
1. [x] - `p1` - Project this occupant's own entry into a virtual location — the entry's own reserved `route` parameter, which itself carries no leading `/`, with exactly one `/` prepended to form the pathname (`/` alone when the parameter is absent, or present with an empty value), and every other parameter as search. When an entry address is supplied, obtain that entry by parsing `NavigationHistory`'s own current location via the navigation substrate's own grammar parser (`cpt-frontx-algo-routing-navigation-substrate-grammar-parse`) and selecting, from the resulting entry list, the one entry whose own `{domainKey, extension}` equals the given entry address — equality checked with the navigation substrate's own name-equality predicate (`cpt-frontx-algo-routing-navigation-substrate-name-validity`) on each of the two fields — never by asking the route ownership signal to resolve an owner: this provider never performs, and never depends on, entry resolution. When no entry address is supplied in the shell runtime, whose router was never supplied navigation, project the shell's subroute (the pathname) as the virtual pathname, with an empty search; the query string, which carries every extension's entry, is not part of it. On write, the pathname is written as the `route` parameter only when it is not the root path `/`; a root pathname leaves `route` out of the entry. This entry's own parameter order, on write, is fixed by this provider's own convention: `route` first when present, then every TanStack search key in the order TanStack's own search serializer emits them. Each TanStack search key becomes exactly one parameter name of the identical name; its value is TanStack's own string serialization of that key, which this package's own adapter treats as an opaque string — the navigation substrate's own codec encodes and decodes it, but never inspects or re-parses its content. Reading a search string carrying a malformed percent-escape (a bare `%`, for instance) never throws: `parseSearchString` and `decodeComponentOrRaw` keep that one pair's value raw, still percent-encoded, rather than dropping it or failing construction; the next write re-encodes that raw value through `encodeURIComponent` like any other value, so the malformed escape does not survive unchanged — the URL's own text mutates (a bare `%` becomes `%25`) without a separate signal, since this adapter has no warning channel of its own. A `+` in a search name or value reads as a space, as form decoding reads it, because TanStack's own search serializer (`URLSearchParams`) writes a space as `+`; a literal plus arrives as `%2B` from that serializer and from `buildSearchString` alike, so it still reads back as `+` - `inst-project-virtual-location`
2. [x] - `p1` - Expose the projected virtual location as `RouterHistory`'s `location` member, and derive `push`/`replace`/`go` as functions that write a new virtual location back. In an extension runtime, the write goes through exactly one call to the core's own URL back-projection helper (`cpt-frontx-algo-routing-route-ownership-signal-url-back-projection`) — never through a fragment of the raw URL string, and never through a separate parse/serialize/push sequence of this provider's own, since the helper itself parses the current URL, applies the change, serializes the result, and issues the single history call: the call names this occupant's own entry address, the entry's own new, full parameter list — `route` first, with exactly one leading `/` stripped off the virtual location's own pathname before writing it back as that parameter's value, then every remaining parameter as given, in the order TanStack's own search serializer emits them — and the verb `RouterHistory`'s own caller requested, `push` or `replace`. In an extension runtime, this provider parses the current URL itself, via the grammar parser (`cpt-frontx-algo-routing-navigation-substrate-grammar-parse`), when reading its own virtual location (step 1 above) and once before writing, to confirm its own entry is still present — it writes nothing when that entry is absent (step 8) — and never otherwise when writing one back. Because `payload-changed` replaces an entry's entire parameter list rather than merging into it, any parameter of this occupant's own entry that is not `route` and not a member of TanStack's own current search is dropped unless TanStack's own search still carries it — never a sibling's entry, another domain's entry, or the pathname. In the shell runtime, `push`/`replace` parse the current URL with the grammar parser (`cpt-frontx-algo-routing-navigation-substrate-grammar-parse`) and serialize it with the grammar serializer (`cpt-frontx-algo-routing-navigation-substrate-grammar-serialize`) with only the pathname replaced, the codec copying the query string and the current page hash unchanged, and then issue one `NavigationHistory` call with the requested verb. The page hash stays outside every runtime's reach: a hash passed to `push`/`replace` (via `navigate`/`Link`'s own `hash` option) is dropped and never enters this occupant's own entry, and no helper of this provider takes or builds a hash, in every runtime; the codec copies the current hash unchanged - `inst-expose-direct-members`
3. [x] - `p1` - Derive the `RouterHistory` members that translate directly from the virtual history's own state and calls: `back` and `forward` from `go(-1)` and `go(1)`; `createHref`, `flush`, `destroy`, `notify`, and `subscribers`. `length` and `canGoBack` are not derivable from the virtual location itself, and are **never** this adapter's own bookkeeping (the position of the current entry belongs to the navigation substrate, not to any one engine-provider port's own counter, because only the substrate sits on both sides of every write *and* every externally observed traversal) — this adapter derives `length` as `navigationHistory.location.position + 1` and `canGoBack` as `navigationHistory.location.position > 0`, reading the substrate's own `Location.position` (`cpt-frontx-algo-routing-navigation-substrate-position-tracking`) directly on every access rather than tracking a virtual stack index of its own or reading the page's own `window.history.length`, which counts the whole tab's entries rather than this occupant's own stack - `inst-derive-missing-members`
4. [x] - `p1` - Derive `createHref` specifically as: compose the full composed-application URL by calling the navigation substrate's own grammar serializer (`cpt-frontx-algo-routing-navigation-substrate-grammar-serialize`) over the current parsed entry list with this occupant's own entry replaced by the one the given virtual location projects back to — never by concatenating the virtual location's own pathname and search as if they were a page's own URL. In the shell runtime, the result is the current URL with the pathname replaced and the query string unchanged. A hash given alongside the target href is dropped the identical way `push`/`replace` drop one (step 2 above); the returned href carries no hash - `inst-derive-create-href`
5. [x] - `p1` - Construct `block` as a recognized, degraded adaptation rather than a member routinely derived like steps 3 and 4's: `NavigationHistory`'s fan-out notifies a subscriber only after a navigation has already taken effect (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`), so nothing in the substrate's own contract lets this adapter intercept and cancel a navigation before it happens. The constructed `block` can stop only a navigation issued through this same constructed router's own `RouterHistory` object — a call the engine routes back through this adapter before it ever reaches the shared history; it cannot stop a back/forward step, a `go` call issued by another unit, or a navigation any other unit performs directly through the shared `NavigationHistory` — the shared history commits any of those regardless of a block state this adapter holds. A registered blocker that throws or rejects is treated as blocking the navigation it was asked about — the safest reading of "the blocker could not decide" — and the failure is reported through this adapter's own error-reporting channel (`AdaptHistoryOptions.reportError` — a caller-supplied callback when given, `console.error` otherwise — accepted by `adaptProviderHistory`, the one internal adaptation entry point, and forwarded unchanged to every internal composed- or shell-mode source and adapter folded behind it) rather than left to surface as an unhandled promise rejection - `inst-derive-block-degraded`
6. [x] - `p1` - Accept and discard the per-entry state argument `RouterHistory`'s own `push` and `replace` carry, as a second recognized, degraded adaptation alongside step 5's: the navigation substrate excludes caller-owned per-entry state from its contract outright — `push` and `replace` take a path alone, its `Location` shape carries no field for one, and it owns the browser's own per-entry state exclusively under a single key of its own, rewriting it on every write (`cpt-frontx-feature-routing-navigation-substrate` §1.5, "Entry-carried state — not part of this contract"). This adapter therefore never stores, forwards, or returns that argument, and **MUST NOT** substitute a provider-local map for it: such a map is emptied by the first reload and bypassed by the first back step, so it would promise a durability this provider cannot deliver. The consequence is stated rather than hidden: `useLocation().state` and `navigate({ state })` never carry a consumer's own value, and route masking — which the engine builds on that same per-entry state — does not work. The one member of the state object this adapter does populate is the engine's own index field, derived from the substrate's own `Location.position` (step 3) and never from a caller. A consumer needing entry-carried state gets it from a different engine-provider port implementation over an engine whose own contract provides it, never from this one - `inst-accept-discard-entry-state`
7. [x] - `p1` - Expose `RouterHistory`'s `subscribe(cb)` by registering an internal callback against `NavigationHistory`'s own `subscribe`, re-projecting this occupant's own entry into a virtual location on every notification, and invoking the subscribers only when (1) the re-projected virtual location (pathname and search; it carries no hash) differs from the previously re-projected one, meaning this runtime's own subroute changed, or (2) the history position changed — a push by any runtime, or a back/forward step — so the engine's index (`useCanGoBack`) stays correct, or (3) the notification results from a write this history itself issued through its own `push`/`replace`, so the engine's own navigation always settles — in the shell and extension runtimes alike; a replace by another runtime that leaves this runtime's own virtual location and the history position unchanged notifies nothing, and nothing is dispatched. A write this history refuses because this occupant's own entry is absent (step 8) issues no history write, so no notification arrives and the engine's navigation is not settled; this lies outside clause (3), like the engine's own blocker veto. When any of the three holds, from inside that internal callback, construct the `SubscriberArgs` shape (`location`, `action`) `RouterHistory`'s `cb` expects before invoking `cb` with it: `SubscriberArgs.location` is the re-projected virtual location, and `SubscriberArgs.action` is derived directly from `NavigationHistory`'s own notification's navigation-kind field (`cpt-frontx-feature-routing-navigation-substrate` §1.5, Contract Shapes — `push`, `replace`, or a third kind covering both a history move and an observed third-party addition such as fragment navigation) — `action` is never invented or independently inferred by this adapter. Fan-out to this constructed `RouterHistory`'s own external subscribers is dispatched over a snapshot of the subscriber registry, with each individual subscriber's own invocation isolated in its own error boundary, mirroring the navigation substrate's own fan-out dispatcher (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`): a throwing subscriber's own failure is reported, never left to stop delivery to the subscribers registered after it in the same round - `inst-adapt-subscribe`
8. [x] - `p1` - **IF** this occupant's own entry is absent from the newly parsed entry list at the moment step 7's own re-projection runs — removed by a back step, or by a structural reset, while this occupant has not yet been unmounted - `inst-if-own-entry-absent`
   1. [x] - `p1` - The virtual location keeps its own last-projected value rather than re-projecting to some default; no write-back runs, because there is no longer an entry of this occupant's own to write to; and `cb` is not invoked for this occupant's own `RouterHistory` — the constructed router receives no navigation of its own from this round. Teardown (§3, Teardown On Unmount) still runs normally once this occupant's `EngineProvider` actually unmounts, when the runtime unmounts this occupant in response to the same removal - `inst-own-entry-absent-inert`
9. [x] - `p1` - **RETURN** the adapted `RouterHistory` object - `inst-return-adapted-history`

**Rationale**: `block`'s narrowed scope is a property of the substrate's own contract, not a defect in this adaptation — `NavigationHistory` reports a navigation only once it has already committed (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`), so no adapter built on top of it can synchronously veto a navigation it did not itself initiate. Recording that narrowed scope here, rather than shipping a `block` that reads as general-purpose but is not, is what keeps a consumer that adopts a blocking route guard from assuming a stronger guarantee than this adapter can make. Deriving `createHref` from the substrate's own serializer, rather than from string concatenation of the virtual location alone, is what keeps a link this package hands out valid against the full composed-application URL — including every sibling entry the link must leave untouched — rather than only against this occupant's own slice of it.

### Router Creation And Mount Over A Virtual History

- [x] `p2` - **ID**: `cpt-frontx-algo-routing-engine-provider-router-creation`

**Input**: The adapted `RouterHistory` object, itself built over a virtual location projected from this occupant's own entry; the microfrontend's own route tree.

**Output**: A router instance built via `createRouter({ routeTree, history })` — constructed, not mounted, by steps 1-2 and 4 below — that step 3 below mounts into the microfrontend's own component tree via `RouterProvider`. These are two separate acts, performed by two separate internal entry points (`createProviderRouter` for construction, `EngineProvider` for mounting): `createProviderRouter` returns the constructed router alone; `ExtensionRouter` mounts it by rendering that router through `EngineProvider` (`{router}` form), which is what actually runs step 3. `EngineProvider` takes either a `{routeTree, history}` pair or an already-constructed `{router}`. The types `AdaptHistoryOptions`, `EngineProviderProps`, `EngineProviderFromRouterProps` and `ProviderRouterOptions` are internal to this package, with the functions and component they type.

**Steps**:
1. [x] - `p1` - Call `createRouter({ routeTree, history })` with the microfrontend's own route tree and the adapted, virtual history, and admit alongside them every other construction option the engine accepts, passed through untouched — `context` above all. `routeTree` and `history` are written last, so no supplied option can displace either. This seam lives on this package's own internal construction surface — a third argument to `createProviderRouter` and a prop on `EngineProvider` — which `ExtensionRouter` calls with no such option, and **MUST NOT** be added to the engine-provider port: the port's own input is exactly `{history, entryAddress, routeTree}` (`cpt-frontx-feature-routing-navigation-substrate` §1.5, Engine-provider port shape), and widening it with an engine-shaped options field would put a concrete engine's construction surface in the core package that declares it. The port-typed entry point therefore supplies no options at all, and the router it returns carries no context - `inst-call-create-router`
2. [x] - `p1` - The constructed router matches only its own virtual location — the pathname and search this package projected from the occupant's own entry — and never a sibling occupant's own virtual location or another domain's - `inst-scope-to-entry`
3. [x] - `p1` - Mount the constructed router into the microfrontend's own component tree via `RouterProvider` — a separate act, at a separate call site (`EngineProvider`), from constructing it in steps 1-2 and returning it in step 4 below - `inst-mount-router-provider`
4. [x] - `p1` - **RETURN** the constructed router — not yet mounted at this point; step 3's own mount runs afterward, once `ExtensionRouter` renders the returned router through `EngineProvider` - `inst-return-constructed-router`

### Teardown On Unmount

- [x] `p2` - **ID**: `cpt-frontx-algo-routing-engine-provider-teardown`

**Input**: A constructed router being mounted into, or unmounted from, a microfrontend's own component tree by the `EngineProvider` that `ExtensionRouter` renders; the adapted `RouterHistory` that router carries, and the internal callback (§3, History Adaptation) that history registers against the shared `NavigationHistory`'s `subscribe`.

**Output**: The internal callback registered against the shared `NavigationHistory` for exactly as long as the router is mounted, and unsubscribed once it is not, so an unmounted router's own `RouterHistory` stops receiving the fan-out.

**Steps**:
1. [x] - `p1` - **WHEN** the `EngineProvider` that `ExtensionRouter` renders mounts this constructed router into the microfrontend's own component tree (the same `EngineProvider` that will later unmount it) - `inst-when-mount`
   1. [x] - `p1` - Register this adapter's internal callback against the shared `NavigationHistory`'s `subscribe`, keeping the unsubscribe callback that call returns. This registration is established here, internally, by `EngineProvider`'s own mount boundary, and **MUST NOT** be established when the adapted history is constructed: an adapted history's lifetime is one occupancy of a domain, and construction carries no promise that the object will ever be mounted, so registering there binds a realm-lived resource to an act that may be discarded — a history built and dropped before any mount keeps a live registration with nothing left holding a reference to release it. Constructing an adapted history therefore leaves it inert: its virtual location holds what it projected at construction and no navigation from elsewhere reaches it until this step runs. On attach, this adapter first registers the internal callback and then re-projects this occupant's own virtual location from the shared `NavigationHistory`, and when that virtual location or the history position differs from the last projected one — the substrate having moved while no registration was active — invokes the subscribers once with the `history`-kind action; the subscribers are dispatched over the same snapshot with the same per-subscriber error isolation as step 7. This step and the attach it performs are internal to this package, and no caller performs this step itself: `ExtensionRouter` never builds an adapted history it does not render through `EngineProvider`, and the adapted histories `navigation()` builds per call are never mounted, so they register nothing. Re-establishing a registration that is already active is a no-op, which is what makes this step and step 2 below exact inverses under a mount mechanism that runs setup, cleanup and setup again within one mount - `inst-register-internal-callback`
2. [x] - `p1` - **WHEN** that `EngineProvider` unmounts this constructed router from the microfrontend's own component tree — because the runtime unmounts this occupant's extension, or because the tree drops `ExtensionRouter` for any other reason - `inst-when-unmount`
   1. [x] - `p1` - Invoke the unsubscribe callback returned when this adapter registered its internal callback against the shared `NavigationHistory`'s `subscribe` - `inst-invoke-unsubscribe`
3. [x] - `p1` - **RETURN** - `inst-return-teardown`

**Rationale**: Pairing the registration with the mount rather than with construction is what makes a discarded instance free: a mount mechanism that builds a candidate history and then drops it — React's StrictMode double-invoking a memo that constructs one is the ordinary case — would otherwise leave a live registration against a shared history that outlives the page's interest in it, with no reference left to release it through. If the release half is skipped, the torn-down router's own `RouterHistory` callback keeps receiving the shared history's fan-out for a component tree that no longer exists — a leaked subscription that grows with every mount/unmount cycle a long-lived host session runs through. This is the Engine Provider's own responsibility because it is the component that registered the internal callback in the first place (§3, History Adaptation); the navigation substrate has no notion of "this listener's microfrontend was unmounted" to act on even if it wanted to. The router and its `RouterHistory`'s own subscribers are scoped to that registration, not to any one mount of the Engine Provider: this teardown step releases only the internal callback's registration against the shared `NavigationHistory`, leaving the constructed router and its `RouterHistory`'s own subscribers otherwise untouched, so mounting that same router again re-establishes the internal registration and resumes the fan-out to whichever subscribers stayed registered through the gap — the same remount-survives-by-default property the navigation substrate already grants a bridge's own registrations and subscriptions (`cpt-frontx-adr-child-mfe-host-access`).

### Extension Router

- [x] `p2` - **ID**: `cpt-frontx-algo-routing-engine-provider-extension-router`

**Input**: The microfrontend's own route tree, `{ routeTree }`.

**Output**: The runtime's one router over the runtime's own private subroute, rendered into the microfrontend's own component tree through `EngineProvider`.

**Steps**:
1. [x] - `p1` - Accept the route tree as the only input - `inst-er-accept-route-tree`
2. [x] - `p1` - Build the history with `adaptProviderHistory(resolveNavigationHistory(), router.ownEntryAddress())` (`cpt-frontx-algo-routing-engine-provider-history-adaptation`), reading the entry address only from the ready FrontX router of `@gears-frontx/routing`, never from the navigation substrate's history, and never deriving or validating one. Build it once per mount of `ExtensionRouter`, not again on a re-render - `inst-er-adapt-history`
3. [x] - `p1` - Confine that history to the calling runtime's own private subroute and nothing outside it: an extension's own entry when the FrontX router returns the runtime's entry address; in the shell runtime, whose router was never supplied navigation, the shell's subroute (the pathname); and, in an extension runtime without router access, one whose router was supplied navigation but has no occupant value, none: the router read of step 2 throws, and `ExtensionRouter` refuses - `inst-er-private-subroute`
4. [x] - `p1` - Build the engine router with `createProviderRouter(routeTree, history)`, supplying no further construction option (`cpt-frontx-algo-routing-engine-provider-router-creation`, steps 1-2, 4). Build it again only when the route tree changes - `inst-er-create-router`
5. [x] - `p1` - Render that router with `EngineProvider` (`cpt-frontx-algo-routing-engine-provider-router-creation`, step 3), whose mount boundary registers and releases the history's subscription (`cpt-frontx-algo-routing-engine-provider-teardown`) - `inst-er-render`
6. [x] - `p1` - **RETURN** the rendered `EngineProvider` - `inst-er-return`

### Own-Subroute Navigation Outside The Rendered Tree

- [x] `p2` - **ID**: `cpt-frontx-algo-routing-engine-provider-navigation`

**Input**: A call to `navigation()` from the runtime's own code outside the rendered tree, such as an action handler.

**Output**: Three members, `navigate(path)`, `replace(path)` and `location()`, over the calling runtime's own private subroute.

**Steps**:
1. [x] - `p1` - Define `navigate(path)`: build an adapted history with `adaptProviderHistory(resolveNavigationHistory(), router.ownEntryAddress())` and call its `push(path)` - `inst-nav-navigate`
2. [x] - `p1` - Define `replace(path)`: build an adapted history the same way and call its `replace(path)` - `inst-nav-replace`
3. [x] - `p1` - Define `location()`: build an adapted history the same way and return its virtual location's `{ pathname, search }` - `inst-nav-location`
4. [x] - `p1` - Build a fresh adapted history at each member's own call and hold none across calls. Such a history is never mounted, so it registers no subscription (`cpt-frontx-algo-routing-engine-provider-teardown`, step 1.1), and it reads the current location at its own call - `inst-nav-fresh-per-call`
5. [x] - `p1` - Confine every member to the calling runtime's own private subroute: an extension's own entry; in the shell runtime, whose router was never supplied navigation, the shell's subroute (the pathname); in an extension runtime without router access, one whose router was supplied navigation but has no occupant value, none: each member's router read throws, and `navigation()` refuses; and nothing outside it - `inst-nav-private-subroute`
6. [x] - `p1` - **RETURN** the three members, exposing neither the FrontX router, the occupant value, nor the raw shared history - `inst-nav-return`

## 4. States (CDSL)

### No Feature-Owned State Machine

Not applicable. The Engine Provider projects a virtual location, adapts a history, and constructs a router; it holds no binding or occupancy lifecycle of its own to model as named states with guarded transitions — no feature in this package defines one, since mounting and occupancy belong to the runtime, which executes the `mount_ext` and `unmount_ext` actions (`cpt-frontx-adr-extension-routing-port`); the FrontX router sends the actions chains of a page load or a back or forward step and decides no occupancy either (`cpt-frontx-feature-routing-route-ownership-signal` §4). A constructed router's internal request/route-matching state is the concrete engine's own concern, opaque to this adapter, and not something this package specifies, so no state machine is defined for this feature.

## 5. Definitions of Done

### History Adaptation And Router Construction Over A Virtual History

- [x] `p1` - **ID**: `cpt-frontx-dod-routing-engine-provider-adaptation-and-creation`

The system **MUST** project this occupant's own entry — its reserved `route` parameter as pathname, defaulting to `/` when absent, and every other parameter as search — into a virtual location, **MUST** write the pathname back as the `route` parameter only when it is not the root path, **MUST** adapt that virtual location and the navigation substrate's shared `NavigationHistory` into a `RouterHistory` object — exposing `location` as the projected virtual location, deriving `push`/`replace`/`go` to write only this occupant's own entry back through the navigation substrate's own control boundary, deriving the further members the engine's contract requires beyond those, constructing `block` as the recognized, degraded adaptation specified in `cpt-frontx-algo-routing-engine-provider-history-adaptation` rather than a routinely derived member, deriving `createHref` by calling the navigation substrate's own grammar serializer over the full current entry list, and constructing `SubscriberArgs` (`location`, `action`) for `RouterHistory`'s `subscribe` callback from `NavigationHistory`'s own notification, **MUST** invoke the subscribers only when the own re-projected virtual location changed, the history position changed, or the notification results from this history's own push/replace — another runtime's replace leaving both unchanged dispatches nothing — and **MUST** construct the engine's router via `createRouter({ routeTree, history })`, admitting alongside those two every further construction option the engine accepts — `context` above all — on this package's own internal construction surface and never on the engine-provider port, and carrying no caller-supplied per-entry state into that history at all, because the navigation substrate's own contract has nowhere to keep one. The `EngineProvider` component **MUST** then mount that constructed router into the microfrontend's own component tree via `RouterProvider`, as a separate act from its construction, rendered by `ExtensionRouter`. No package in this ecosystem other than this one **MUST** import a concrete router engine; this package is the sole, deliberate exception to that prohibition.

**Implements**:
- `cpt-frontx-flow-routing-engine-provider-swap-engine`
- `cpt-frontx-algo-routing-engine-provider-history-adaptation`
- `cpt-frontx-algo-routing-engine-provider-router-creation`

**Addresses**:
- `cpt-frontx-routing-fr-engine-provider-port`
- `cpt-frontx-routing-tanstack-fr-engine-adaptation`
- `cpt-frontx-routing-tanstack-fr-scoped-navigation-zone`
- `cpt-frontx-routing-tanstack-principle-engine-confined`

**Constraints**: `cpt-frontx-constraint-routing-tanstack-sole-engine-import`

**Touches**:
- Component: `cpt-frontx-component-routing-engine-provider`

### Teardown Unsubscription On Unmount

- [x] `p1` - **ID**: `cpt-frontx-dod-routing-engine-provider-teardown`

The system **MUST** register a constructed router's adapted `RouterHistory` against the shared `NavigationHistory` when the microfrontend that owns that router mounts it, **MUST NOT** register it when that history is merely constructed, and **MUST** unsubscribe it when that microfrontend is unmounted — so a router discarded before it is ever mounted leaves nothing registered, and a torn-down router's callback stops receiving the fan-out; on attach it **MUST** re-project its own virtual location and, when that location or the history position differs from the last projected one, invoke the subscribers once with the `history`-kind action.

**Implements**:
- `cpt-frontx-algo-routing-engine-provider-teardown`

**Addresses**:
- `cpt-frontx-routing-fr-engine-provider-port`

**Touches**:
- Component: `cpt-frontx-component-routing-engine-provider`

### Extension Router And Public Entry

- [x] `p1` - **ID**: `cpt-frontx-dod-routing-engine-provider-extension-router`

The system **MUST** provide `ExtensionRouter({ routeTree })` that builds the history with `adaptProviderHistory(resolveNavigationHistory(), router.ownEntryAddress())`, builds the engine router with `createProviderRouter(routeTree, history)`, and renders it with `EngineProvider`. It **MUST** read the entry address only from the ready FrontX router of `@gears-frontx/routing`, and **MUST** confine the router to the calling runtime's own private subroute: an extension's own entry, or, in the shell runtime, the shell's subroute (the pathname). It **MUST NOT** mount, load, or place any extension. The package's public entry **MUST** carry `ExtensionRouter`, `navigation`, and the engine's route-tree builders and scoped route hooks re-exported unchanged, **MUST NOT** re-export the engine's `createRouter`, and **MUST** keep `adaptProviderHistory`, `createProviderRouter`, `EngineProvider`, `EngineProviderInput`, `EngineProviderPort` and `EntryAddress` internal.

**Implements**:
- `cpt-frontx-flow-routing-engine-provider-render-extension-router`
- `cpt-frontx-algo-routing-engine-provider-extension-router`

**Addresses**:
- `cpt-frontx-routing-tanstack-fr-extension-router`
- `cpt-frontx-routing-tanstack-fr-public-entry`

**Touches**:
- Component: `cpt-frontx-component-routing-tanstack-extension-router`

### Own-Subroute Navigation

- [x] `p1` - **ID**: `cpt-frontx-dod-routing-engine-provider-navigation`

The system **MUST** provide `navigation()`, giving code outside the rendered tree `navigate(path)`, `replace(path)` and `location()` over the calling runtime's own private subroute alone: an extension's own entry, or, in the shell runtime, the shell's subroute (the pathname). Each member **MUST** build a fresh adapted history at its own call, which is never mounted and registers no subscription. `navigation()` **MUST NOT** expose the FrontX router, the occupant value, or the raw shared history.

**Implements**:
- `cpt-frontx-flow-routing-engine-provider-own-subroute-navigation`
- `cpt-frontx-algo-routing-engine-provider-navigation`

**Addresses**:
- `cpt-frontx-routing-tanstack-fr-extension-navigation`
- `cpt-frontx-routing-tanstack-fr-public-entry`

**Touches**:
- Component: `cpt-frontx-component-routing-tanstack-navigation`

## 6. Acceptance Criteria

- [x] The default engine provider projects this occupant's own entry into a virtual location — the reserved `route` parameter as pathname, defaulting to `/` when absent, and every other parameter as search — and writes the pathname back as `route` only when it is not the root path — and adapts it, together with the navigation substrate's shared `NavigationHistory`, into a `RouterHistory` object: `location` exposed as the projected virtual location; `push`/`replace`/`go` deriving to write only this occupant's own entry back through the navigation substrate's own control boundary; the further members the engine's contract requires beyond those derived per `cpt-frontx-algo-routing-engine-provider-history-adaptation`, including `block` constructed with that algorithm's recognized degraded semantics rather than as a routine derivation; and `SubscriberArgs` (`location`, `action`) constructed for `RouterHistory`'s `subscribe` callback from `NavigationHistory`'s own notification — `action` derived from that notification's navigation-kind field, never invented by this adapter.
- [x] A search value TanStack writes reads back unchanged after the write and after a reload: a `+` reads as a space and `%2B` as a plus, the way TanStack's own search serializer (`URLSearchParams`) writes them, and a malformed percent-escape still never throws.
- [x] Subscribers of the adapted `RouterHistory` are invoked only when the own re-projected virtual location changed, the history position changed, or the notification results from this history's own push/replace; another runtime's replace leaving both the own virtual location and the history position unchanged dispatches nothing.
- [x] The constructed `block` stops only a navigation issued through the same constructed router's own `RouterHistory` object; it does not stop a back/forward step, a `go` call issued by another unit, or a navigation another unit performs directly through the shared `NavigationHistory` — this narrowed scope is documented, not silently assumed.
- [x] `createRouter({ routeTree, history })` is called with the adapted, virtual history and the microfrontend's own route tree, and the resulting router matches only its own virtual location.
- [x] `createProviderRouter` and `EngineProvider`, both internal to this package, admit the engine's further construction options — `context` in particular — and those options reach the constructed router; neither `routeTree` nor `history` can be displaced by them. `ExtensionRouter` supplies no such option, and the engine-provider port's own input stays `{history, entryAddress, routeTree}`, so the port-typed entry point constructs a router with no context.
- [x] The per-entry state argument `push`/`replace` accept is discarded rather than stored anywhere: a consumer's own value never reaches `useLocation().state` or survives a `navigate({ state })`, and route masking does not work — the recognized consequence of the substrate excluding entry-carried state from its contract, recorded rather than worked around with a provider-local map.
- [x] A write the shared history refuses — its bounded fan-out drain raising on a subscriber that navigates from every round it receives — is reported through this adapter's own error-reporting channel and leaves the virtual location unchanged, rather than escaping `push`/`replace` as an unobserved promise rejection.
- [x] The constructed router is mounted into the microfrontend's own component tree via `RouterProvider`, as a separate act, performed by `EngineProvider`, from constructing it.
- [x] `createHref` composes a full composed-application URL by calling the navigation substrate's own grammar serializer over the current entry list with this occupant's own entry replaced, never by concatenating the virtual location's own pathname and search as if they were the page's own URL.
- [ ] Replacing this package with a different engine-provider port implementation changes only the microfrontend's own route-tree authoring code — its route tree, its search-parameter handling, and every one of its own imports of this package, `ExtensionRouter` and `navigation()` included — and changes no file belonging to the navigation substrate, the runtime, the host, or a sibling microfrontend.
- [ ] A replacement provider that cannot accept the shared `NavigationHistory` and adapt it into its own engine's history contract fails to receive the shared history, and the microfrontend's routing does not initialize.
- [x] No package in this ecosystem other than this one imports a concrete router engine or its packages directly; this package is the sole, deliberate exception (`cpt-frontx-constraint-routing-tanstack-sole-engine-import`).
- [x] An undeclared `route=` path inside the microfrontend's own route tree resolves to the engine's own `notFound` — never to whichever level's own consumer shows as a fallback for an entry the route ownership signal reports unresolved, a distinct level this provider never decides.
- [x] When a microfrontend is unmounted, its constructed router's adapted `RouterHistory` is unsubscribed from the shared `NavigationHistory`, so it stops receiving further fan-out.
- [x] Constructing an adapted history registers nothing: two histories built for one mount, only one of which is kept, leave exactly one live registration while mounted and none after unmount. A constructed history observes the shared history only once `EngineProvider`'s own mount boundary attaches it internally; the attach step is not published, since `ExtensionRouter` never builds an adapted history it does not render through `EngineProvider`, and the adapted histories `navigation()` builds per call are never mounted and register nothing.
- [x] On attach, the adapter re-projects its own virtual location and, when it or the history position differs from the last projected one, invokes the subscribers once with the `history`-kind action.
- [x] Mode selection: given an entry address, the constructed history projects its virtual location from that entry's own payload. Given none in the shell runtime, whose router was never supplied navigation, the constructed history projects the shell's subroute (the pathname) with an empty search, and leaves the query string, which carries the extensions' entries, untouched. The same route tree and the same adaptation logic run in both cases, differing only in where the projected pathname and search come from.
- [x] For any navigation the constructed router performs, in every runtime, the provider never writes a sibling occupant's own entry or another domain's own entry, and never changes the page's own hash: a hash passed to `push`, `replace` or `createHref` is dropped. In an extension's runtime, it never writes the pathname; in the shell runtime, it writes the pathname alone and never the query string.
- [x] `ExtensionRouter({ routeTree })` builds the history with `adaptProviderHistory(resolveNavigationHistory(), router.ownEntryAddress())`, builds the router with `createProviderRouter(routeTree, history)`, and renders it with `EngineProvider`; a re-render with an unchanged route tree builds neither again.
- [x] `ExtensionRouter` and `navigation()` work over the calling runtime's own private subroute alone: in an extension's runtime, its own entry; in the shell runtime, the shell's subroute (the pathname). Neither reads nor writes anything outside it.
- [x] In an extension runtime whose FrontX router was supplied navigation but has no occupant value, the extension has no access to the router: `router.ownEntryAddress()` throws, and `ExtensionRouter` and `navigation()` refuse.
- [x] `navigation()` gives `navigate(path)`, `replace(path)` and `location()`; each member builds a fresh adapted history at its own call, sees the result of an earlier call, and leaves no registration against the shared `NavigationHistory`.
- [x] `navigation()` exposes neither the FrontX router, the occupant value, nor the raw shared history.
- [x] The package's public entry carries `ExtensionRouter`, `navigation`, and the engine's route-tree builders and scoped route hooks, and none of `createRouter`, `adaptProviderHistory`, `createProviderRouter`, `EngineProvider`, `EngineProviderInput`, `EngineProviderPort` or `EntryAddress`.
- [x] An implementation **MUST** reproduce this provider's own Example 1 (`packages/routing-tanstack/architecture/PRD.md` §9) as one of its own acceptance scenarios (§1.5):

  ```
  /en?screen=dashboard;route=settings/general;orientation=left
     &sheet=tenant-details;route=contacts;tenantId=456
  ```

  The dashboard's router sees pathname `/settings/general` and search `orientation=left`.
