---
status: accepted
date: 2025-11-18
---

# Standalone Studio Package with Dev-Only Conditional Import


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Keep dev tools inside the uicore package behind a flag](#keep-dev-tools-inside-the-uicore-package-behind-a-flag)
  - [Implement dev tools as a browser extension](#implement-dev-tools-as-a-browser-extension)
  - [Standalone `@gears-frontx/studio` workspace package with conditional import guarded by `import.meta.env.DEV`](#standalone-gears-frontxstudio-workspace-package-with-conditional-import-guarded-by-importmetaenvdev)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-standalone-studio-dev-conditional`
## Context and Problem Statement

Footer-based dev tools lacked space and could not be excluded from production builds. Dev tools mixed with production UI components created unnecessary bundle weight and potential security exposure. A solution is needed that provides rich developer tooling in development while contributing zero bytes to production bundles.

## Decision Drivers

* Dev tools must have zero impact on production bundle size and runtime
* Developer UX must not reduce the visible viewport area of the application under development

## Considered Options

* Keep dev tools inside the uicore package behind a flag
* Implement dev tools as a browser extension
* Standalone `@gears-frontx/studio` workspace package with conditional import guarded by `import.meta.env.DEV`

## Decision Outcome

Chosen option: "Standalone `@gears-frontx/studio` workspace package with conditional import guarded by `import.meta.env.DEV`", because Vite eliminates the entire conditional branch at build time, guaranteeing zero production overhead, while the floating glassmorphic overlay provides a modern developer UX without consuming viewport space.

### Consequences

* Good, because zero production bundle overhead, independent package evolution, and a floating overlay that does not reduce the application viewport
* Bad, because an additional package must be maintained in the monorepo, and the floating UI may overlap application content during development

### Confirmation

`packages/studio/` exists as a standalone workspace package. Its `package.json` carries no `@gears-frontx/*` dependencies — Studio reads from store selectors and dispatches through the standard event flow. Studio is imported in host apps exclusively inside an `if (import.meta.env.DEV)` block. Settings are persisted to `localStorage`.

## Pros and Cons of the Options

### Keep dev tools inside the uicore package behind a flag

* Good, because no additional package to maintain
* Bad, because mixing dev-only concerns into a production package increases coupling and requires careful dead-code elimination

### Implement dev tools as a browser extension

* Good, because completely separate from the application bundle regardless of environment
* Bad, because installation friction for every developer; extension must be kept in sync with framework internals

### Standalone `@gears-frontx/studio` workspace package with conditional import guarded by `import.meta.env.DEV`

* Good, because Vite tree-shakes the entire branch in production builds with no configuration required
* Bad, because the floating overlay can obscure application UI during development sessions

## More Information

The `@gears-frontx/studio` package deliberately has no `@gears-frontx/*` framework dependencies to enable independent evolution. It accesses framework state through store selectors rather than importing framework internals directly.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:

* `cpt-frontx-fr-studio-panel` — floating panel UI and glassmorphic overlay design
* `cpt-frontx-fr-studio-controls` — dev tool controls exposed through the panel
* `cpt-frontx-fr-studio-persistence` — localStorage persistence of studio settings
* `cpt-frontx-fr-studio-independence` — zero framework dependency constraint
* `cpt-frontx-component-studio` — studio package as standalone workspace member
