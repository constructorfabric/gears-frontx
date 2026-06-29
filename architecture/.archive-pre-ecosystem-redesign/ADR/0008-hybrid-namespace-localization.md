---
status: accepted
date: 2025-11-15
---

# Hybrid Namespace Localization with Lazy Loading


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Single screenset-level translation file containing all content](#single-screenset-level-translation-file-containing-all-content)
  - [Pure per-screen model — each screen owns all its translations including shared titles](#pure-per-screen-model--each-screen-owns-all-its-translations-including-shared-titles)
  - [Two-tier hybrid model — screenset-level for menu titles only, screen-level for all content](#two-tier-hybrid-model--screenset-level-for-menu-titles-only-screen-level-for-all-content)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-hybrid-namespace-localization`
## Context and Problem Statement

Screen lazy-loading requires translation data to be separated so translations do not all load on language switch. A monolithic translation file defeats lazy loading; a pure per-screen model duplicates shared content such as menu titles. A model that satisfies both constraints is required.

## Decision Drivers

* Translation loading must align with screen lazy loading so content translations are fetched only when a screen is visited
* Menu titles shared across a screenset must not be duplicated in every screen translation file

## Considered Options

* Single screenset-level translation file containing all content
* Pure per-screen model — each screen owns all its translations including shared titles
* Two-tier hybrid model — screenset-level for menu titles only, screen-level for all content

## Decision Outcome

Chosen option: "Two-tier hybrid model — screenset-level for menu titles only, screen-level for all content", because it enables true lazy loading of screen content translations while preventing duplication of shared titles, and the strict separation rule makes ownership unambiguous.

### Consequences

* Good, because lazy loading works for translations, ownership is clear, and there is no duplication that defeats optimization
* Bad, because two translation files per screen area (screenset-level and screen-level) must be maintained, and authors must follow the strict separation rule

### Confirmation

Translation directories at `src/screensets/*/translations/` contain separate screenset-level and screen-level files. `packages/i18n/src/registry.ts` provides `I18nRegistry.createLoader()` as a static method that wraps language-specific imports with error handling to satisfy Vite's static analysis requirements.

## Pros and Cons of the Options

### Single screenset-level translation file containing all content

* Good, because simple authoring — one file per language per screenset
* Bad, because the entire translation bundle loads upfront, defeating screen lazy loading

### Pure per-screen model — each screen owns all its translations including shared titles

* Good, because each screen is fully self-contained
* Bad, because menu titles and other shared strings are duplicated across every screen translation file, creating a maintenance burden

### Two-tier hybrid model — screenset-level for menu titles only, screen-level for all content

* Good, because translation chunks align exactly with screen code chunks, and shared titles live in one place per screenset
* Bad, because the strict separation rule (screenset files MUST NOT contain screen content) must be enforced by convention rather than tooling

## More Information

`I18nRegistry.createLoader()` uses a static method signature specifically to satisfy Vite's requirement for statically analysable dynamic import paths. Dynamic import paths constructed at runtime were evaluated and rejected for this reason.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:

* `cpt-frontx-fr-i18n-hybrid-namespace` — two-tier namespace model definition
* `cpt-frontx-fr-i18n-lazy-chunks` — translation chunk loading aligned with screen lazy loading
* `cpt-frontx-component-i18n` — i18n registry and loader implementation
