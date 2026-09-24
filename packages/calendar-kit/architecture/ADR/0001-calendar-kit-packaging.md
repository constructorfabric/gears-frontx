---
status: accepted
date: 2026-09-24
decision-makers: calendar-kit maintainers
---

# Calendar Kit Packaging

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [One installable artifact with a pinned ui-kit dependency behind package-local primitives](#one-installable-artifact-with-a-pinned-ui-kit-dependency-behind-package-local-primitives)
  - [Zero intra-ecosystem edges with forked or re-implemented controls](#zero-intra-ecosystem-edges-with-forked-or-re-implemented-controls)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-calendar-kit-adr-calendar-kit-packaging`

## Context and Problem Statement

`@gears-frontx/calendar-kit` is the ecosystem's published calendar UI component library: the installable React package through which host applications embed calendar views with their own data and permission model, upgrading by bumping a version rather than copying source. Its visual units need design-system controls — button, checkbox, combobox, calendar, field, input, radio group, select, textarea, switch — and the ecosystem already publishes exactly those in `@gears-frontx/ui-kit`. How should the package relate to ui-kit: take it as a declared dependency, or hold zero intra-ecosystem edges and carry its own controls?

## Decision Drivers

* Exact-pinned intra-ecosystem edge — `@gears-frontx/ui-kit` stays a runtime dependency at the exact workspace pin (`0.4.0-alpha.5`), so a ui-kit upgrade is a calendar-kit change the bump-on-change gate sees, never a silent drift.
* Primitives-only import boundary — only `src/ui/primitives/` imports `@gears-frontx/ui-kit`; family units, the React layer and the core never do, so the depended surface is the wrapped set, not the whole kit.
* React-free core as a directory boundary — the pure model and algorithms stay in `src/core` with no React, no ui-kit and no JSX, deferring a separate core package while the property holds.
* ESM-only, source maps shipped — following the ui-kit precedent: ECMAScript-module output only, `sourcemap: true`, with `dist/docs` and the agent index shipping inside the artifact.
* Published-libraries membership — the package is `core: false, standalone: false`: bound to React 19 by peer range and to ui-kit by the single allowed edge, with no other new edge.

## Considered Options

* **One installable artifact with a pinned ui-kit dependency behind package-local primitives** — the package declares the exact-pinned `@gears-frontx/ui-kit` runtime edge, wraps the used controls in `src/ui/primitives/`, ships ESM with source maps, and discovers family-unit entries from `src/**/public.ts` at build time.
* **Zero intra-ecosystem edges with forked or re-implemented controls** — the package carries no ecosystem dependency and re-implements or vendors every control it renders, holding `standalone: true`.

## Decision Outcome

Chosen option: **One installable artifact with a pinned ui-kit dependency behind package-local primitives**, because the controls already exist in the ecosystem with their behaviour and accessibility, and re-implementing them would create the second drifting control set the package exists to prevent for calendars. The pin makes the coupling explicit and reviewable: a ui-kit release never reaches a calendar consumer except through a calendar-kit version that names it.

### Consequences

* Good, because the package renders controls whose behaviour and accessibility already hold, instead of owning a parallel control set.
* Good, because the primitives boundary keeps the depended surface minimal and greppable — one directory to audit for the whole edge.
* Good, because the exact pin plus the bump-on-change gate makes every ui-kit upgrade a visible calendar-kit release decision.
* Bad, because a host on a different ui-kit line receives two ui-kit copies; hosts align on the pinned line or accept the duplication.
* Bad, because the package is not standalone: it cannot release independently of ui-kit's availability on the registry.

### Confirmation

Confirmed the same way the package's other boundaries are confirmed: the boundary guards report exactly one intra-ecosystem edge in the manifest and import graph (`calendar-kit -> ui-kit`), a source scan reports zero `@gears-frontx/ui-kit` imports outside `src/ui/primitives/`, and the published artifact resolves every family-unit entry with declarations under both `bundler` and `nodenext`.

## Pros and Cons of the Options

### One installable artifact with a pinned ui-kit dependency behind package-local primitives

The package declares `@gears-frontx/ui-kit` at the exact workspace pin, imports it only from `src/ui/primitives/`, and ships one ESM artifact with source maps, family-unit subpath entries, and the docs/agent index.

* Good, because no control behaviour is duplicated between the two packages.
* Good, because the edge is a single declared, pinned, mechanically checked dependency rather than an informal import.
* Neutral, because a ui-kit upgrade always costs a calendar-kit release, even when the calendar surface is untouched.
* Bad, because hosts that cannot align on the pinned ui-kit line carry two copies of it.

### Zero intra-ecosystem edges with forked or re-implemented controls

The package vendors or rewrites every control it renders and declares no ecosystem dependency.

* Good, because the package would release on its own line with no coupling at all.
* Bad, because every control fix would land twice, in two packages with two test suites — the exact drift the calendar package exists to end, recreated one layer down.
* Bad, because it contradicts the layer's own reuse property: a published library that cannot depend on another published library.

## More Information

**Scope of impact.** Governs only how `@gears-frontx/calendar-kit` relates to `@gears-frontx/ui-kit` and how it ships: the single allowed edge, the primitives-only import boundary, the React-free core directory boundary, and the ESM-with-sourcemaps artifact shape. It does not decide the package's version line, its export map entries, or its theme contract — those live in the manifest, the build plugin, and the member DESIGN.

**Review trigger.** Revisit if the depended ui-kit surface grows past the wrapped set (new direct imports outside primitives), or if the core's no-React property fails and forces the separate-package extraction this boundary defers.

**Checklist applicability.**

* ARCH — applicable and addressed above (a hard-to-reverse coupling decision binding every calendar consumer to a ui-kit line).
* SEC — Not applicable because this decision moves no trust boundary: it reuses already-published controls rather than introducing a credential, authorization, or data-handling concern.
* PERF — Not applicable because a declared dependency on the same controls carries no different runtime cost than vendored copies of them at the volumes this package operates at.
* REL — Not applicable because it governs a compile-time/import-graph edge, not runtime availability or fault tolerance.
* DATA — Not applicable because no persistent data store or schema is involved.
* INT — applicable: the ui-kit edge is itself an integration contract between two published members; its shape (exact pin, primitives-only imports) is owned by this package going forward, and a breaking change to the wrapped surface is scoped the same way the member release policy scopes any breaking change.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.
* MAINT — applicable: the pinned edge keeps the calendar package's own blast radius bounded to one directory when the wrapped controls change, at the cost that every ui-kit upgrade requires a calendar-kit release, noted above.

## Traceability

- **PRD**: [../PRD.md](../PRD.md)
- **DESIGN**: [../DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-calendar-kit-fr-installable-artifact` — one installable versioned artifact adopted by dependency declaration is the decided shape.
* `cpt-frontx-calendar-kit-nfr-react-free-core` — the React-free core directory boundary is what the separate-package extraction defers to.
* `cpt-frontx-calendar-kit-nfr-independent-versioning` — the exact pin behind the primitives is what keeps a calendar-only change releaseable on its own line.
* `cpt-frontx-calendar-kit-nfr-tree-shakeable-units` — per-family entries with injected CSS keep the pinned edge from costing unimported families.
* `cpt-frontx-constraint-calendar-kit-no-solution-content` — the package ships generic creation UI (`CreateEventPopover`) driven by host callbacks; persistence, backend and scheduling rules stay with the host.
* `cpt-frontx-constraint-calendar-kit-react-free-core` — the core carries no React, ui-kit, or browser-global import.
* `cpt-frontx-constraint-calendar-kit-single-peer-edge` — ui-kit is the only intra-ecosystem UI edge, reached only through the primitives.
* `cpt-frontx-calendar-kit-component-ui-data-model` — the neutral model the host maps into before rendering.
* `cpt-frontx-calendar-kit-component-react-free-core` — the pure calculations the edge never touches.
* `cpt-frontx-calendar-kit-component-ui-family-units` — the per-family entries the artifact ships.
* `cpt-frontx-calendar-kit-component-theme-contract` — the token surface that keeps branding host-owned despite the shared controls.
