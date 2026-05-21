---
status: superseded
superseded-by: MFE architecture (feature-mfe-registry, feature-mfe-isolation)
date: 2025-11-19
---

# Screenset Vertical Slice Isolation


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Centralized API services shared across screensets](#centralized-api-services-shared-across-screensets)
  - [Shared API packages imported by multiple screensets](#shared-api-packages-imported-by-multiple-screensets)
  - [Vertical slice isolation — each screenset owns its entire dependency tree](#vertical-slice-isolation--each-screenset-owns-its-entire-dependency-tree)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-screenset-vertical-slice-isolation`
## Context and Problem Statement

Centralized API services and shared state created implicit coupling between screensets. When one screenset needed API changes, it risked breaking others. Screensets should be independently deployable vertical slices — owning their own screens, translations, API services, state slices, and effects.

## Decision Drivers

* Screensets must be independently deployable and deletable without affecting other screensets
* Teams working on different screensets must not coordinate changes to shared files

## Considered Options

* Centralized API services shared across screensets
* Shared API packages imported by multiple screensets
* Vertical slice isolation — each screenset owns its entire dependency tree

## Decision Outcome

Chosen option: "Vertical slice isolation — each screenset owns its entire dependency tree", because true vertical slice independence requires no coordination between teams, makes dependencies explicit, and allows safe deletion of any screenset without risk of breaking others.

### Consequences

* Good, because full independence between screensets, easy deletion, and no merge conflicts on shared files
* Bad, because code duplication between screensets with similar APIs and more boilerplate per screenset

### Confirmation

Screenset directories in `src/screensets/` contain `api/`, `state/`, `effects/`, and `translations/` subdirectories. Registration validation in `screensetsRegistryFactory` checks that slice name equals state key equals screenset ID. Event names carry a `${screensetId}/` prefix, icon IDs carry `${screensetId}:${iconName}`, and API domains carry `${screensetId}:${serviceName}`.

## Pros and Cons of the Options

### Centralized API services shared across screensets

* Good, because reduced code duplication for similar API calls
* Bad, because API changes for one screenset risk breaking others, creating hidden coupling

### Shared API packages imported by multiple screensets

* Good, because explicit versioned dependency rather than implicit coupling
* Bad, because cross-team coordination overhead when shared package must evolve

### Vertical slice isolation — each screenset owns its entire dependency tree

* Good, because full independence; deleting a screenset removes exactly the files in its directory with no side effects
* Bad, because duplication is preferred over abstraction, which can feel unfamiliar to developers accustomed to DRY conventions

## More Information

Namespacing conventions — slice name = state key = screenset ID — are enforced at registration time. Duplication between screensets is intentional and preferred over premature abstraction.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:

* `cpt-frontx-fr-sdk-screensets-package` — screensets package structure and registration contract
* `cpt-frontx-component-screensets` — screenset component boundary and ownership model
* `cpt-frontx-principle-self-registering-registries` — self-registering registry pattern enforced at slice registration
