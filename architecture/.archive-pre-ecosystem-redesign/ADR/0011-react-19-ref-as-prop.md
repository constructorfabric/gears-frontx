---
status: accepted
date: 2026-02-03
---

# React 19 Migration with Ref-as-Prop Pattern


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Two-phase staged migration using official codemod](#two-phase-staged-migration-using-official-codemod)
  - [Big-bang migration](#big-bang-migration)
  - [Manual migration of all forwardRef declarations](#manual-migration-of-all-forwardref-declarations)
  - [Keep forwardRef indefinitely](#keep-forwardref-indefinitely)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-react-19-ref-as-prop`
## Context and Problem Statement

React 19 introduces ref as a regular prop, deprecating `forwardRef`. App-owned UI components may have `forwardRef` declarations that need updating. A big-bang migration risks a high failure rate and difficult rollback. The upgrade also brings other breaking changes: string refs removed and implicit children type changes.

## Decision Drivers

* Reduce risk by separating dependency risk from refactoring risk
* Eliminate deprecated `forwardRef` usage to adopt modern React 19 patterns
* Maintain rollback capability at each migration phase
* Keep human error low across 100 `forwardRef` declarations

## Considered Options

* Two-phase staged migration using official codemod
* Big-bang migration (upgrade and refactor simultaneously)
* Manual migration of all `forwardRef` declarations
* Keep `forwardRef` indefinitely

## Decision Outcome

Chosen option: "Two-phase staged migration using official codemod", because separating dependency risk from refactoring risk makes each phase independently verifiable and rollback-capable. React 19 maintains backward compatibility with `forwardRef` during Phase 1, enabling faster rollback if issues arise. The official codemod reduces human error across 100 declarations.

### Consequences

* Good, because modern React patterns are adopted, component signatures are simpler, and the codebase is future-proof
* Bad, because two phases of effort are required and the codemod may miss edge cases — one manual fix is needed for `textarea.tsx` where `useImperativeHandle` is used

### Confirmation

All app-owned UI components accept ref as a prop without a `forwardRef` wrapper. React 19 is declared as a peer dependency in `packages/react/package.json`.

## Pros and Cons of the Options

### Two-phase staged migration using official codemod

* Good, because each phase is independently verifiable and rollback boundaries are clear
* Good, because the official codemod reduces human error across 100 declarations
* Bad, because `useImperativeHandle` edge cases require manual handling after codemod runs

### Big-bang migration

* Good, because it completes the upgrade in a single effort
* Bad, because simultaneous dependency risk and refactoring risk make rollback difficult and the failure surface is large

### Manual migration of all forwardRef declarations

* Good, because each component can be reviewed individually during migration
* Bad, because migrating 100 declarations by hand is time-consuming and error-prone

### Keep forwardRef indefinitely

* Good, because no migration effort is required
* Bad, because `forwardRef` is deprecated in React 19 and blocks adoption of new React patterns

## More Information

- React 19 upgrade guide: https://react.dev/blog/2024/12/05/react-19
- Official `forwardRef` → ref-as-prop codemod: https://react.dev/blog/2024/12/05/react-19#ref-as-a-prop

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:

* `cpt-frontx-nfr-compat-react` — React 19 compatibility requirement
* `cpt-frontx-component-react` — React package peer dependency declarations
