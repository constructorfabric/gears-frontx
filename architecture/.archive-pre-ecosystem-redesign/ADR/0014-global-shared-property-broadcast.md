---
status: accepted
date: 2026-03-07
---

# Global Shared Property Broadcast


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Replace per-domain API with single updateSharedProperty on ScreensetsRegistry](#replace-per-domain-api-with-single-updatesharedproperty-on-screensetsregistry)
  - [Keep per-domain methods but enforce identical values across domains](#keep-per-domain-methods-but-enforce-identical-values-across-domains)
  - [Keep all propagation in the microfrontends plugin](#keep-all-propagation-in-the-microfrontends-plugin)
  - [Add new TypeSystemPlugin methods for property validation](#add-new-typesystemplugin-methods-for-property-validation)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-global-shared-property-broadcast`
## Context and Problem Statement

The previous per-domain `updateDomainProperty()` API implied that shared properties such as theme and language could hold different values per MFE domain. In reality, shared properties are global values — theme is "dark" everywhere, not "dark" in one domain and "light" in another. Additionally, the microfrontends plugin was propagating theme and i18n values, mixing concerns that belong to the themes and i18n plugins respectively.

## Decision Drivers

* API semantics must match the actual value model — shared properties are global, not per-domain
* Each plugin must own the full lifecycle of its data without delegating to an unrelated plugin
* Callers must not need domain knowledge to set a global value
* GTS validation must work without introducing new `TypeSystemPlugin` methods

## Considered Options

* Replace per-domain API with single `updateSharedProperty(propertyId, value)` on ScreensetsRegistry
* Keep per-domain methods but enforce identical values across domains
* Keep all propagation in the microfrontends plugin
* Add new `TypeSystemPlugin` methods for property validation

## Decision Outcome

Chosen option: "Replace per-domain API with single `updateSharedProperty(propertyId, value)` on ScreensetsRegistry", because it matches the reality that shared properties are global, gives callers a simpler API that requires no domain knowledge, and moves theme and i18n propagation to their respective plugins so each owns its data lifecycle. GTS validation reuses the existing actions chain validation pattern with ephemeral chained instance IDs — no new infrastructure needed. Full preset config is forwarded without injecting implicit domain defaults, enabling apps without MFEs.

### Consequences

* Good, because the API is simpler and semantically correct, plugin responsibility is clearly localized, and validation reuses existing infrastructure without new abstractions
* Bad, because this is a breaking API change from per-domain to global, and plugins must guard against a missing `screensetsRegistry` reference when operating outside a screensets context

### Confirmation

`updateSharedProperty()` is present on `MfeRegistry` in `packages/screensets/src/mfe/runtime/MfeRegistry.ts`. Theme propagation logic is in `packages/framework/src/plugins/themes/`. Language propagation logic is in `packages/framework/src/plugins/i18n/`. GTS validation uses ephemeral chained instance IDs in the validation effects files in those same directories.

## Pros and Cons of the Options

### Replace per-domain API with single updateSharedProperty on ScreensetsRegistry

* Good, because the API surface matches the actual semantics, and callers are shielded from domain topology details
* Bad, because it is a breaking change for any caller that used the per-domain methods

### Keep per-domain methods but enforce identical values across domains

* Good, because existing call sites are unaffected
* Bad, because the API still misrepresents the value model and enforcement logic adds unnecessary complexity

### Keep all propagation in the microfrontends plugin

* Good, because no plugin restructuring is required
* Bad, because the microfrontends plugin becomes a catch-all for unrelated concerns, violating single responsibility

### Add new TypeSystemPlugin methods for property validation

* Good, because validation would be explicitly modeled in the type system plugin's interface
* Bad, because the existing actions chain validation pattern already handles this, making new methods redundant overhead

## More Information

- Related: ADR 0003 (Plugin-Based Framework Composition)
- Related: ADR 0006 (Screenset Vertical Slice Isolation)

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:

* `cpt-frontx-fr-broadcast-write-api` — `updateSharedProperty()` as the single write API for shared properties
* `cpt-frontx-fr-broadcast-matching` — registry iterates all domains to find property declarations
* `cpt-frontx-fr-broadcast-validate` — validation before broadcasting shared property values
* `cpt-frontx-fr-validation-gts` — GTS validation reusing ephemeral chained instance IDs
* `cpt-frontx-fr-validation-reject` — rejection flow when GTS validation fails
* `cpt-frontx-interface-shared-property` — shared property interface definition
* `cpt-frontx-seq-shared-property-broadcast` — sequence of broadcast from caller to all MFE domains
