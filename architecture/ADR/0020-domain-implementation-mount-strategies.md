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
- **No back-compat**: the convergent design does not preserve the current solution or its SDLC footprints. Removing scalar API surface and obsolete handlers is acceptable and required.

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

The introduced abstractions in `@cyberfabric/screensets`:

- `ExtensionDomain` (interface, unchanged) remains the GTS-validated declaration. No rename.
- `ExtensionDomainImplementation` (new abstract class). Pure behavior; constructor takes a `DomainContext`. Type-system agnostic: never names GTS.
- `DomainContext` (interface). Carries `mounter: ExtensionMounter` (accessor that throws after registration completes) and `registerHandler(actionType, handler)` (throws after registration completes). Invalidation is performed by the registry in a `finally` block immediately after `factory(ctx)` returns.
- `ExtensionMounter` (new abstract class). Per-domain facade composing the existing internal mount logic and `MfeHandler`. Methods: `mount(extId, container)`, `unmount(extId)`, `getMounted(): readonly string[]`. The internal concrete is `DefaultExtensionMounter`.
- `ContainerHooks` (interface). `{ create(extId): Element; destroy(extId): void }`. The implementation provides hooks; the strategy uses them for container lifecycle.
- Three concrete strategy classes: `ConcurrentMountStrategy`, `OptionalMountStrategy`, `ExclusiveMountStrategy`. All take `(mounter, hooks)` in their constructor and capture both privately. `ExclusiveMountStrategy` exposes only `mount` because the declaration must omit `unmount_ext`; the mediator rejects unmount actions for such domains at registration validation.
- `registerDomain(declaration: ExtensionDomain, factory: (ctx: DomainContext) => ExtensionDomainImplementation): void`. Two-arg form. The factory function lets the implementation's constructor capture `ctx.mounter` synchronously while the registry invalidates `ctx` in a `finally` block.
- `ScreensetsRegistry.getMountedExtensions(domainId): readonly string[]` (plural). Replaces the scalar `getMountedExtension`.
- `ActionHandler.fromFunction(fn)` static helper. Convenience wrap when a strategy method needs to be exposed as an `ActionHandler` instance to the mediator.

Removed from the public surface (no shims, no deprecation aliases):

- `ContainerProvider` (containers are now impl-internal).
- `MountExtSwapHandler`, `MountExtToggleHandler` (replaced by strategies that own mount semantics).
- `getMountedExtension(domainId)` (singular).
- `MountManager` from public surface (becomes strictly internal behind `DefaultExtensionMounter`).

Framework-side changes that follow:

- Slice shape becomes `mountedExtensions: Record<string, string[]>` (per-domain insertion-ordered list).
- Reducers become `addExtensionMounted({ domainId, extensionId })` / `removeExtensionMounted({ domainId, extensionId })`. Old `setExtensionMounted` / `setExtensionUnmounted` are removed.
- Selector becomes `selectMountedExtensions(state, domainId): readonly string[]`. Old `selectMountedExtension` is removed.
- Plugin sync wrapper at `packages/framework/src/plugins/microfrontends/index.ts:137-157` switches from scalar before/after compare to set-diff dispatch: `added = after \ before`, `removed = before \ after`, one reducer call per element.

React-side changes that follow:

- The framework's `ExtensionDomainImplementation` carries no DOM references and no `setRoot` method. The React package introduces a `RootAttachable` structural interface (NOT in framework): `interface RootAttachable { setRoot(root: Element | null): void }`.
- `ExtensionDomainSlot` becomes a singleton root per domain: it does a structural type check (`'setRoot' in impl`) and calls `setRoot` from its ref callback. It does NOT render N children — multi-mount children are managed imperatively under the root by the implementation's container hooks.
- `useActivePackage` is documented as screen-domain specific; reads `getMountedExtensions(HAI3_SCREEN_DOMAIN)[0]`.
- New hook `useMountedExtensions(domainId): Extension[]` for arbitrary domains.

### Consequences

- Good: multi-mount domains are first-class. A domain author picks `ConcurrentMountStrategy`, supplies hooks, and the framework needs no changes.
- Good: cardinality is declared, not inferred. The strategy class IS the declaration; there is no heuristic on `domain.actions`.
- Good: framework gets out of the layout business. Containers are an implementation concern; the framework only sees opaque `Element` references during `mounter.mount(extId, container)` calls.
- Good: encapsulation is mechanical. The `DomainContext` invalidation in the registry's `finally` block ensures the implementation cannot leak mounter access; references captured by strategies survive because they hold the mounter privately.
- Good: type-system agnostic at the behavior boundary. `ExtensionDomainImplementation` and `ExtensionMounter` never reference GTS. The declaration validation is delegated to the pluggable `typeSystem` exactly as today.
- Good: SOLID compliance is high (see Confirmation below).
- Bad: more abstractions to learn for first-time domain authors. The bare minimum to register a domain rises from one function call to: pick a strategy class, write a `ContainerHooks`, supply a factory.
- Bad: no back-compat. Code that calls `getMountedExtension`, `MountExtSwapHandler`, `MountExtToggleHandler`, or `ContainerProvider` will not compile. This is the explicit intent of the user co-design and is a hard requirement of this ADR.
- Bad: `ExclusiveMountStrategy` has an asymmetric public surface (no `unmount`). Domain authors who pick it have to omit `unmount_ext` from the declaration; the mediator enforces this at registration time. The asymmetry is intentional but worth documenting prominently.
- Neutral: the existing `MountManager` continues to live as the internal core. Its public surface goes away, but its logic survives, refactored to be per-domain rather than per-registry.

### Confirmation

Compliance with this ADR is confirmed by:

- Design review of `architecture/DESIGN.md` showing the new entities listed under L1 Domain Model and the removal of `ContainerProvider` and the `mountedExtension` scalar.
- Design review of the affected FEATURE specs:
  - `architecture/features/feature-screenset-registry/FEATURE.md` showing the new `registerDomain` two-arg signature, the new strategy algorithms, and the removal of `MountExtSwapHandler` / `MountExtToggleHandler` and `inst-toggle-semantics` / `inst-swap-semantics`.
  - `architecture/features/feature-framework-composition/FEATURE.md` showing the array slice shape, the diff reducer pair, and the diff-dispatch sync wrapper algorithm.
  - `architecture/features/feature-react-bindings/FEATURE.md` showing the singleton-root `ExtensionDomainSlot` description, the `useMountedExtensions` flow, and the screen-domain-specific framing of `useActivePackage`.
- Code review confirming:
  - `ScreensetsRegistry.getMountedExtensions(domainId): readonly string[]` is the only mount-set query method.
  - `ContainerProvider`, `MountExtSwapHandler`, `MountExtToggleHandler`, `getMountedExtension` do not appear in the public barrel of `@cyberfabric/screensets`.
  - The registry's `registerDomain` invalidates `ctx.mounter` in a `finally` block — verified by a unit test that calls `ctx.mounter` after `registerDomain` returns and asserts a thrown error.
  - The framework slice has shape `Record<string, string[]>` and dispatches diffs.
  - `ExtensionDomainSlot` calls `setRoot` exactly once per mount and does not render N children.

SOLID verdicts (under this ADR):

- SRP: PASS. Each new class has one reason to change — declaration (interface), behavior (implementation), per-domain mount facade (mounter), cardinality policy (strategies).
- OCP: PASS. New cardinalities are added by introducing new strategy classes; the registry, framework, and React layers are not modified.
- LSP: PASS. All three strategies satisfy a constructor signature `(mounter, hooks)` and their `mount`/`unmount` methods are interchangeable from the strategy-instance perspective. `ExclusiveMountStrategy` deliberately omits `unmount` from its public surface and the registry rejects unmount actions for such domains at registration — this is enforced as a structural constraint, not a runtime LSP violation.
- ISP: PASS. `DomainContext` exposes only what the implementation needs at construction (mounter accessor, registerHandler) and is invalidated immediately after. Strategies depend on `ContainerHooks` (two methods) and `ExtensionMounter` (three methods) — both narrow.
- DIP: PASS. Registry depends on `ExtensionDomainImplementation`, `ActionHandler`, `MfeHandler`, `TypeSystemPlugin` abstractions. Strategies depend on `ExtensionMounter` and `ContainerHooks` abstractions. The internal `DefaultExtensionMounter` is hidden behind the abstraction.

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
  - `cpt-frontx-adr-per-action-type-handler-routing` (ADR-0018) — partially superseded. ADR-0018 established that per-action-type `ActionHandler` instances replace the monolithic `ExtensionLifecycleActionHandler` switch class. This ADR keeps that pattern and extends it: the per-domain handlers are now constructed by the domain implementation (via strategies) rather than picked by framework heuristic on `domain.actions`. The unified mediator handler map and the `ActionHandler` abstract contract are unchanged.
- **Anti-pattern check**:
  - Premature abstraction: NO. Each new abstraction maps to a concrete responsibility identified in the convergent design — there is no speculation about "future cardinalities" that the strategies do not already cover.
  - Golden hammer: NO. The strategies-and-context pattern is matched to the problem (composable per-domain behavior under a class-first OOP convention), not borrowed reflexively.
  - Big ball of mud: NO. Each layer's responsibility is sharper after this ADR than before.
  - Tight coupling: NO. The framework no longer couples mount semantics to `domain.actions`. The implementation no longer couples to GTS.
  - Magic: NO. The `finally`-block invalidation is explicit; the strategy registration is explicit via `ctx.registerHandler`.
  - Over-engineering: this is the closest thing to a risk on this list. Mitigation: the three strategy classes are shipped from the package, the typical implementation wrapper is small (constructor + hooks), and the structural type check in `ExtensionDomainSlot` is one line.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

- `cpt-frontx-fr-sdk-screensets-package` — defines the L1 contract surface for domain implementations and mount semantics.
- `cpt-frontx-fr-mfe-ext-domain` — extends domain semantics from declaration-only to declaration+behavior pairing without modifying the GTS-validated declaration.
- `cpt-frontx-fr-mfe-dynamic-registration` — preserves runtime domain registration and adds the mounter encapsulation invariant.
- `cpt-frontx-component-screensets` — introduces `ExtensionDomainImplementation`, `ExtensionMounter`, `DomainContext`, `ContainerHooks`, and the three strategy classes; removes `ContainerProvider` and `MountManager` from public surface.
- `cpt-frontx-component-framework` — switches the MFE slice to per-domain ordered lists with diff dispatch.
- `cpt-frontx-component-react` — replaces multi-child rendering in `ExtensionDomainSlot` with singleton-root `RootAttachable` opt-in; adds `useMountedExtensions`.
- `cpt-frontx-feature-screenset-registry` — picks up the algorithm and public-API changes.
- `cpt-frontx-feature-framework-composition` — picks up the slice and sync wrapper changes.
- `cpt-frontx-feature-react-bindings` — picks up the slot and hook changes.
