---
status: proposed
date: 2026-04-29
decision-makers: FrontX core team
---

# ADR-0020: Domain-implementation as composable behavior class with mount strategies and encapsulated mounter


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [A. Inheritance-based domain base classes per cardinality](#a-inheritance-based-domain-base-classes-per-cardinality)
  - [B. Strategies as static-method classes registered directly as ActionHandlers](#b-strategies-as-static-method-classes-registered-directly-as-actionhandlers)
  - [C. Pull-based getActionHandlers() registration on the implementation](#c-pull-based-getactionhandlers-registration-on-the-implementation)
  - [D. Two-phase init(ctx) initialization on the implementation](#d-two-phase-initctx-initialization-on-the-implementation)
  - [E. ContainerManager abstract class on the framework's surface](#e-containermanager-abstract-class-on-the-frameworks-surface)
  - [F. Mounter exposed on ScreensetsRegistry public surface](#f-mounter-exposed-on-screensetsregistry-public-surface)
  - [G. Mount/unmount primitives on MfeHandler](#g-mountunmount-primitives-on-mfehandler)
  - [H. Chosen — Domain-implementation class with constructor-bound strategies and encapsulated mounter](#h-chosen--domain-implementation-class-with-constructor-bound-strategies-and-encapsulated-mounter)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-domain-implementation-mount-strategies`
## Context and Problem Statement

GitHub issue cyberfabric/frontx#278 reports that the MFE extensions stack hard-wires a "0 or exactly 1 mounted extension per domain" invariant through bookkeeping rather than declared semantics. Multi-mount domains such as `widgets` are blocked at the bookkeeping level even though the underlying DOM mount path can host multiple children concurrently.

The invariant is encoded across four layers, each citing the line in the current source tree:

- `ExtensionDomainState.mountedExtension: string | undefined` — `packages/screensets/src/mfe/runtime/extension-manager.ts:28`, `:140`, `:149`. The state slot is scalar; there is no array shape.
- `MountManager` overwrites the scalar unconditionally on every mount — `packages/screensets/src/mfe/runtime/default-mount-manager.ts:289-290`, `:381-385`. There is no append path.
- `ScreensetsRegistry.getMountedExtension(domainId): string | undefined` — singular, declared on the abstract class in `packages/screensets/src/mfe/runtime/ScreensetsRegistry.ts`. Consumers cannot ask for "all mounted extensions" because the registry does not know.
- Framework slice `mountedExtensions: Record<string, string | undefined>` — `packages/framework/src/plugins/microfrontends/slice.ts:26`, `:77-83`, `:142-143`. Reducers `setExtensionMounted` / `setExtensionUnmounted` operate on a scalar.
- Plugin sync wrapper does scalar before/after compare — `packages/framework/src/plugins/microfrontends/index.ts:137-157`. It dispatches one set or one unset per chain completion; there is no diff dispatch.
- `useActivePackage` reads the scalar — `packages/react/src/mfe/hooks/useActivePackage.ts:83`. It cannot reflect a multi-mount state.

The invariant is also reinforced by framework-selected mount handlers. `MountExtSwapHandler` and `MountExtToggleHandler` are picked by a heuristic on `domain.actions.includes(unmount_ext)` — the framework decides mount semantics for the domain, and domain authors have no say. This is why fixing only the data shape (turn the scalar into an array) is insufficient: the centralized mount path is the root cause. The framework owns mount semantics through implicit heuristics, the domain declaration cannot express its intent, and adding a third cardinality (concurrent / "widgets") means adding another framework heuristic and another framework-side handler.

Historically the scalar invariant was acceptable because all in-tree domains (screen, sidebar, popup, overlay) were 0-or-1. The heuristic-driven handler selection was a low-friction shortcut for two cases. Once a third case (multi-mount) is introduced, the shortcut breaks: the framework cannot infer cardinality from `domain.actions` alone, and the bookkeeping cannot represent the result.

The question this ADR answers: where should mount semantics live, and what abstractions are needed so that domain authors can declare the cardinality (exclusive single, optional single, concurrent multiple) their domain wants without the framework having to know about them?

## Decision Drivers

- **Issue 278**: multi-mount domains must work without ad-hoc framework changes when a new domain ships.
- **Domain-author authority**: cardinality is a property of the domain, not of the framework. Domain authors must declare it explicitly.
- **Framework agnosticism about layout**: the framework already does not know how containers are created, positioned, or styled — this should remain true. Containers are an implementation concern, not a framework concern.
- **Type-system agnosticism at L1**: the screensets package must not assume GTS in its behavior abstractions. GTS already validates the declaration; behavior code never names GTS.
- **Class-first OOP**: per project convention, every new component is a class with private state. No standalone functions, no closure-only registration.
- **Encapsulation enforcement, not convention**: where the design says "the mounter must not be accessible after registration", that constraint must be mechanically enforced, not left to discipline.
- **No back-compat**: the design ships the chosen surface directly. Public-API shape is chosen on architectural merits without preservation constraints.

## Considered Options

A. Inheritance-based domain base classes per cardinality (`PinnedDomain` / `SwapDomain` / `MultiDomain`)
B. Strategies as static-method classes registered directly as `ActionHandler`s
C. Pull-based `getActionHandlers()` on the implementation
D. Two-phase `init(ctx)` initialization on the implementation
E. `ContainerManager` abstract class on the framework's surface
F. Mounter exposed on the `ScreensetsRegistry` public surface
G. Mount/unmount primitives on `MfeHandler`
H. Domain-implementation class with constructor-bound strategies and encapsulated mounter (chosen)

## Decision Outcome

Chosen option: **H. Domain-implementation class with constructor-bound strategies and encapsulated mounter**, because it inverts the responsibility correctly — the framework owns mount-set state and MFE primitives only, and the domain implementation owns mount/unmount policy through a small set of shipped strategy classes — while remaining type-system agnostic, mechanically encapsulated, and free of framework-side knowledge of how containers are created or positioned.

The decision introduces a small set of new abstractions in `@cyberfabric/screensets` that together establish where mount semantics live:

- A pure-behavior domain implementation (abstract class) constructed by an abstract factory; the factory's `build` is synchronous so async construction is rejected by the type system.
- A construction-time context object that carries the per-domain mounter, lifecycle trigger, and per-action-type handler registration entry point — invalidated mechanically by the registry once construction returns.
- A per-domain mount facade that owns root attachment, per-extension mount/unmount, and mass-unmount on detach. The mounter does not own mount-set state; the registry does, as the canonical source.
- An abstract `MountStrategy` base with three shipped concrete strategies — `ConcurrentMountStrategy`, `OptionalMountStrategy`, `ExclusiveMountStrategy` — each capturing the mounter and an implementation-supplied container factory privately at construction.
- An implementation-supplied pure container factory; it has no DOM-attachment responsibility (the mounter owns the attached root).
- A per-domain lifecycle trigger facade for implementation-driven transitions; the mounter stays mount/unmount-only.
- A strict cardinality matrix cross-validating the chosen strategy against the declaration's actions at registration time.
- A two-argument `registerDomain(declaration, factory)` entry point on the registry, plus plural `getMountedExtensions(domainId)` and a per-domain `getMounter(domainId)` accessor consumed by the React slot.

Framework-side and React-side consequences that follow: the per-domain MFE slice becomes a per-domain insertion-ordered list with idempotent diff-dispatch reducers; the chain-completion sync wrapper switches from scalar before/after compare to set-diff dispatch (idempotent reducers make this safe under unserialized concurrent chains for multi-mount domains); the React slot becomes a per-domain singleton-root component that delegates to the mounter via attach/detach; `useActivePackage` is documented as `Exclusive`-strategy specific; a domain-agnostic `useMountedExtensions(domainId)` hook is introduced for arbitrary cardinalities.

The full method-level surface and per-flow algorithm steps live in `architecture/DESIGN.md` and the affected FEATURE artifacts. This ADR records the decision and its rationale; method shapes, per-flow algorithm steps, slice payload schemas, and DoD enumerations belong in the linked DESIGN/FEATURE artifacts and are not duplicated here.
- New hook `useMountedExtensions(domainId): Extension[]` for arbitrary domains, including multi-mount.

### Consequences

- Good: multi-mount domains are first-class. A domain author picks `ConcurrentMountStrategy`, supplies hooks, and the framework needs no changes.
- Good: cardinality is declared, not inferred. The strategy class IS the declaration; there is no heuristic on `domain.actions`.
- Good: framework gets out of the layout business. Containers are an implementation concern; the framework only sees opaque `Element` references during `mounter.mount(extId, container)` calls.
- Good: encapsulation is mechanical. The `DomainContext` invalidation in the registry's `finally` block ensures the implementation cannot leak mounter / lifecycle-trigger / registerHandler access. Invalidation is at the function-handle level, so captured references in the implementation's closure also reject after registration. References captured by strategies (held privately on bound class fields) survive because they bypass the `ctx` object. Atomic rollback on factory-throw guarantees no partial registration is observable.
- Good: type-system agnostic at the behavior boundary. `ExtensionDomainImplementation` and `ExtensionMounter` never reference GTS. The declaration validation is delegated to the pluggable `typeSystem` exactly as today.
- Good: SOLID compliance is high (see Confirmation below).
- Bad: more abstractions to learn for first-time domain authors. The bare minimum to register a domain is: pick a strategy class, write a `ContainerHooks`, supply a factory.
- Bad: `ExclusiveMountStrategy` has an asymmetric public surface (no `unmount`). Domain authors who pick it must omit `unmount_ext` from the declaration; the mediator enforces this at registration time. The asymmetry is intentional but worth documenting prominently.
- Neutral: `MountManager` is internal to the package — `DefaultExtensionMounter` composes it per domain to execute mount/unmount primitives.

### Confirmation

Compliance with this ADR is confirmed by:

- Design review of `architecture/DESIGN.md` reflecting the L1 Domain Model entities — per-domain mounter, mount strategies, container hooks, lifecycle trigger, implementation factory — and the array-shaped `mountedExtensions` mount-set on `ExtensionDomainState`.
- Design review of the affected FEATURE specs that own the spec-level detail:
  - `architecture/features/feature-screenset-registry/FEATURE.md` for the two-arg `registerDomain` form, the abstract `MountStrategy` base and shipped subclasses, the strict cardinality cross-validation matrix, and the per-domain lifecycle trigger.
  - `architecture/features/feature-framework-composition/FEATURE.md` for the array-shaped per-domain slice, the idempotent diff reducer pair, and the diff-dispatch sync wrapper algorithm.
  - `architecture/features/feature-react-bindings/FEATURE.md` for the per-domain singleton-root `ExtensionDomainSlot`, the `useMountedExtensions` flow, and the screen-domain-specific framing of `useActivePackage`.

Acceptance criteria, per-method method shapes, slice payload schemas, and verification tests live in those FEATURE artifacts; this ADR does not restate them.

SOLID verdicts (under this ADR):

- SRP: PASS. Each new class has one reason to change — declaration (interface), behavior (implementation), per-domain mount facade (mounter), cardinality policy (strategies), per-domain lifecycle facade (lifecycle trigger), factory shape (implementation factory).
- OCP: PASS. New cardinalities are added by introducing new `MountStrategy` subclasses; the registry, framework, and React layers are not modified.
- LSP: PASS. The abstract `MountStrategy` makes `mount` abstract and `unmount` optional; every concrete strategy satisfies the abstract base contract on the abstract surface. The strict cardinality matrix (`cpt-frontx-algo-screenset-registry-cross-validate-handlers`) enforces cardinality declaration at registration time; LSP-substitutability on the abstract surface is preserved.
- ISP: PASS. `DomainContext` exposes only what the implementation needs at construction (mounter, lifecycle trigger, register handler) and is invalidated immediately after. Strategies depend on a narrow pure-factory container interface and a narrow per-domain mounter abstraction. The mounter does not carry mount-set queries; mount-set reads go through the registry, decoupling consumers from mounter internals.
- DIP: PASS. The registry depends on the abstract `ExtensionDomainImplementation`, `ExtensionDomainImplementationFactory`, `MountStrategy`, `ActionHandler`, `MfeHandler`, and `TypeSystemPlugin` abstractions. Strategies depend on the abstract mounter, container hooks, and lifecycle trigger. Internal default implementations are hidden behind their abstractions.

## Pros and Cons of the Options

### A. Inheritance-based domain base classes per cardinality

Author defines a domain by extending one of `PinnedDomain`, `SwapDomain`, `MultiDomain`. The cardinality is encoded by the base class.

- Good: zero-config for the common cases.
- Bad: combinatorial explosion when cardinality combines with other orthogonal concerns (Shadow DOM yes/no, lazy load yes/no, route-aware yes/no). Each combination spawns a new base class.
- Bad: subclassing locks the author into one taxonomy axis (cardinality) at the expense of others.

### B. Strategies as static-method classes registered directly as ActionHandlers

Strategies expose static `mount`/`unmount` methods and are registered directly as `ActionHandler` instances by some auto-wiring layer.

- Good: no instances to manage.
- Bad: static methods cannot access the per-domain mounter without a hidden global. The strict `ActionHandler.handleAction(actionType, payload)` signature has no slot for "the mounter for this domain". A static method either reads from a global (rejected on isolation grounds) or takes a context arg the framework would have to inject (rejected — this is what `ExtensionMounter` already provides cleanly through instance state).

### C. Pull-based getActionHandlers() registration on the implementation

`ExtensionDomainImplementation` has a public `getActionHandlers(): Record<actionType, ActionHandler>` method that the registry calls to discover handlers.

- Good: discoverable surface; no registration call required from the implementation.
- Bad: `ActionHandler` is a framework-invoked contract, never an app-invoked contract. Putting it on the implementation's public surface invites consumers to call it directly, which they should never do. Push-based registration via `ctx.registerHandler` keeps this surface invisible to consumers while still letting the implementation supply its handlers.

### D. Two-phase init(ctx) initialization on the implementation

Implementation has a no-arg constructor and an `init(ctx)` method called by the registry to bind dependencies.

- Good: simple subclassing; no factory needed at the call site.
- Bad: implementations end up with optional fields (`private mounter?: ExtensionMounter`) that must be checked everywhere because TypeScript cannot narrow them after a separate `init` call. Single-phase constructor with a factory function avoids the optional-field problem entirely. The factory is also where the registry can mechanically invalidate `ctx` after construction returns — `init` would require a separate "I'm done" signal that the implementation could forget to send.

### E. ContainerManager abstract class on the framework's surface

Framework exposes a `ContainerManager` abstraction with `getContainer(extId)`, `releaseContainer(extId)`. Domain authors implement this. Mount/unmount handlers consume it through framework wiring.

- Good: explicit container lifecycle.
- Bad: containers are now framework-visible, contradicting the convergent goal that the framework knows nothing about how containers are created or positioned. The framework would have to manage the container lifecycle (request, hold, release) for every mount/unmount, which is exactly the responsibility we want to push down. `ContainerHooks` lives on the implementation side, the strategy uses it directly, and the framework never holds container references.

### F. Mounter exposed on ScreensetsRegistry public surface

`registry.mount(domainId, extId, container)` / `registry.unmount(domainId, extId)` are public app-facing methods.

- Good: simplest possible API.
- Bad: conflates two separate audiences. `ScreensetsRegistry` is the host-app surface (register domains, register extensions, execute action chains, query state). The mounter is the implementation-side surface (mount/unmount within one domain). Putting the mounter on the registry invites host apps to bypass action chains and call mount directly — which would skip lifecycle stages, validation, and serialization. Keeping the mounter scoped to the implementation via `DomainContext` enforces the architectural invariant.

### G. Mount/unmount primitives on MfeHandler

`MfeHandler` already loads bundles. Add `mount(entry, container)` / `unmount(entry)` and let the registry call them.

- Good: one fewer class.
- Bad: `MfeHandler` is per-bundle-type (`MfeHandlerMF`, `MfeHandlerEsm`, etc.). Mount-set state is per-domain. Pinning mount/unmount to `MfeHandler` would either replicate domain mount-set state across all handlers or force one designated handler to own it — both are wrong shapes. `ExtensionMounter` is per-domain (one instance per registered domain), composes a `MfeHandler` privately, and owns the mount-set state for its single domain — this is the correct scoping.

### H. Chosen — Domain-implementation class with constructor-bound strategies and encapsulated mounter

See Decision Outcome. The strengths are: (1) the framework loses knowledge of layout / containers / cardinality without losing knowledge of state and MFE primitives; (2) the implementation gains authority over mount semantics without learning GTS; (3) encapsulation is mechanical via `finally`-block ctx invalidation; (4) the strategies are reusable building blocks that domain authors compose with their own hooks.

The trade-off accepted is that domain authors face more abstractions on day one. The mitigation is that the three strategies cover the empirically observed cases (screen / sidebar-popup-overlay / widgets), and most domain authors will use one of them unmodified — they only write `ContainerHooks` and the implementation wrapper.

## More Information

- **GitHub issue**: cyberfabric/frontx#278
- **Affected ADRs**:
  - `cpt-frontx-adr-blob-url-mfe-isolation` (ADR-0004) — unchanged. Blob URL isolation is orthogonal to mount cardinality.
  - `cpt-frontx-adr-per-action-type-handler-routing` (ADR-0018) — this ADR builds on ADR-0018's per-action-type `ActionHandler` pattern: per-domain handlers are constructed by the domain implementation (via strategies) and registered through `ctx.registerHandler` into the unified mediator handler map.
- **Anti-pattern check**:
  - Premature abstraction: NO. Each new abstraction maps to a concrete responsibility identified in the convergent design — there is no speculation about "future cardinalities" that the strategies do not already cover.
  - Golden hammer: NO. The strategies-and-context pattern is matched to the problem (composable per-domain behavior under a class-first OOP convention), not borrowed reflexively.
  - Big ball of mud: NO. Each layer's responsibility is sharper after this ADR than before.
  - Tight coupling: NO. Mount semantics are owned by the domain implementation (strategies plus `ContainerHooks`); the framework receives only opaque `Element` references through the mounter. The implementation does not depend on GTS — declaration validation is delegated to the pluggable `typeSystem`.
  - Magic: NO. The `finally`-block invalidation is explicit; the strategy registration is explicit via `ctx.registerHandler`.
  - Over-engineering: this is the closest thing to a risk on this list. Mitigation: the three strategy classes are shipped from the package, the typical implementation wrapper is small (constructor + hooks), and the structural type check in `ExtensionDomainSlot` is one line.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

- `cpt-frontx-fr-sdk-screensets-package` — defines the L1 contract surface for domain implementations and mount semantics.
- `cpt-frontx-fr-mfe-ext-domain` — extends domain semantics from declaration-only to declaration+behavior pairing without modifying the GTS-validated declaration.
- `cpt-frontx-fr-mfe-dynamic-registration` — preserves runtime domain registration and adds the mounter encapsulation invariant.
- `cpt-frontx-component-screensets` — introduces `ExtensionDomainImplementation`, `ExtensionMounter`, `DomainContext`, `ContainerHooks`, and the three strategy classes; `MountManager` is internal-only.
- `cpt-frontx-component-framework` — the MFE slice carries per-domain insertion-ordered lists with idempotent diff-dispatch reducers.
- `cpt-frontx-component-react` — `ExtensionDomainSlot` is a per-domain singleton-root component that calls `registry.getMounter(domainId).attach(element)` / `detach()`; root attachment is a mounter responsibility. `useMountedExtensions(domainId)` exposes the per-domain mount-set.
- `cpt-frontx-feature-screenset-registry` — owns the algorithm and public-API surface.
- `cpt-frontx-feature-framework-composition` — owns the slice and sync wrapper algorithm.
- `cpt-frontx-feature-react-bindings` — owns the slot and hook flows.
