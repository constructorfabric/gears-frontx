---
status: accepted
date: 2025-11-14
---

# Mandatory Screen Lazy Loading


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Union type allowing both eager and lazy screen components](#union-type-allowing-both-eager-and-lazy-screen-components)
  - [Wrap screens with React.lazy() inside the registry during getScreens()](#wrap-screens-with-reactlazy-inside-the-registry-during-getscreens)
  - [Mandatory ScreenLoader type — all screens use lazy loaders; React.lazy() wrapping in Screen rendering component](#mandatory-screenloader-type--all-screens-use-lazy-loaders-reactlazy-wrapping-in-screen-rendering-component)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-mandatory-screen-lazy-loading`
## Context and Problem Statement

FrontX loaded all screen components eagerly, creating larger bundles and slower startup times. With multiple screensets, the initial bundle included all screens regardless of whether they would be viewed. Lazy loading must be enforced uniformly to deliver consistent performance guarantees.

## Decision Drivers

* Initial bundle size must not grow linearly with the number of screens
* The screen registry must remain a plain data structure free of React runtime concerns

## Considered Options

* Union type allowing both eager and lazy screen components
* Wrap screens with React.lazy() inside the registry during getScreens()
* Mandatory ScreenLoader type — all screens use lazy loaders; React.lazy() wrapping in Screen rendering component

## Decision Outcome

Chosen option: "Mandatory ScreenLoader type — all screens use lazy loaders; React.lazy() wrapping in Screen rendering component", because consistent performance guarantees require every screen to be code-split, and the Screen rendering component is the natural boundary where React.lazy() and Suspense belong.

### Consequences

* Good, because predictable performance, smaller initial bundle, and natural code splitting at screen boundaries
* Bad, because every screen requires a dynamic import(), adding slightly more boilerplate per screen definition

### Confirmation

`ScreenLoader` type defined in `packages/screensets/src/types.ts`. `Screen` component wraps with `React.lazy()` in `packages/react/src/components/Screen.tsx`. Suspense boundary with minimal fallback UI lives in the same file.

## Pros and Cons of the Options

### Union type allowing both eager and lazy screen components

* Good, because flexibility for small screens that don't justify the async overhead
* Bad, because inconsistent performance profile across the application; optimization becomes opt-in rather than guaranteed

### Wrap screens with React.lazy() inside the registry during getScreens()

* Good, because centralises the lazy-wrapping logic in one place
* Bad, because mixes React runtime concerns into a registry that should be a plain data structure, violating separation of concerns

### Mandatory ScreenLoader type — all screens use lazy loaders; React.lazy() wrapping in Screen rendering component

* Good, because every screen is code-split by construction; no per-screen decision required
* Bad, because slightly more boilerplate — each screen must export a default component and be referenced via dynamic import()

## More Information

The Suspense fallback is intentionally minimal to avoid over-engineering. Per-screenset configurable fallbacks were explicitly considered and rejected.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:

* `cpt-frontx-nfr-perf-lazy-loading` — performance non-functional requirement for lazy screen loading
* `cpt-frontx-component-screensets` — screen registry type contract
* `cpt-frontx-component-react` — Screen rendering component and Suspense boundary
