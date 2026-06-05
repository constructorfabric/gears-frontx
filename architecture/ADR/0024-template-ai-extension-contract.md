---
status: proposed
date: 2026-06-05
---

# Template AI-Extension Bundle Contract


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Declared extension-bundle contract](#declared-extension-bundle-contract)
  - [Convention-only layout](#convention-only-layout)
  - [Inline-in-template-metadata](#inline-in-template-metadata)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-template-ai-extension-contract`
## Context and Problem Statement

A Template Developer must be able to bundle a template with its own AI extensions — skills, workflows, guidelines, and reference artifacts — that operate alongside the framework's base AI capabilities, so that knowledge specific to a template travels with the template rather than being recreated in each consuming project (`cpt-frontx-fr-ai-template-bundle-extensions`). Those bundled extensions are later discovered and activated for AI agents in any project that installs the template (`cpt-frontx-usecase-bundle-template-ai-extensions`). For extensions to be carried predictably and recognized uniformly downstream, they must conform to a defined shape. What governs that shape, and at what altitude is it fixed?

## Decision Drivers

* **Extensions travel with the template** — template-specific AI expertise must be carried inside the template bundle, not recreated per consuming project (`cpt-frontx-fr-ai-template-bundle-extensions`).
* **Uniform recognizability** — a discovery mechanism must recognize and activate bundled extensions the same way for any template, which requires their shape to be predictable rather than ad hoc.
* **Pre-publish validatability** — a malformed extension declaration must be reportable before the template is published (`cpt-frontx-usecase-bundle-template-ai-extensions` alternative flow), which requires a declared structure to validate against.
* **Decoupling from content** — the contract must describe the categories an extension bundle conforms to, independent of any particular template's content, so the framework itself carries zero template-specific content.
* **Right altitude** — the decision must fix the conformance shape without fixing a complete field-level schema, which belongs in design rather than in a decision record.

## Considered Options

* **Declared extension-bundle contract** — the template carries a declaration that enumerates its AI-extension categories — skills, workflows, guidelines, and reference artifacts — as named, typed slots. The contract fixes the categories and the existence of a declared bundle; the concrete field-level schema is left to design.
* **Convention-only layout** — no declared contract; extensions are placed under a well-known directory layout and recognized by location and naming alone.
* **Inline-in-template-metadata** — AI extensions are embedded directly inside the template's existing metadata fields, with no separate AI-extension contract.

## Decision Outcome

Chosen option: **Declared extension-bundle contract**, because a declared structure is what simultaneously makes bundled extensions uniformly recognizable to a discovery mechanism and validatable before publication, while keeping the contract decoupled from any specific template's content. The contract fixes a small, closed set of extension categories — skills, workflows, guidelines, and reference artifacts — each carried as a named, typed part of the bundle. A template that carries AI extensions declares them against this contract; a discovery mechanism relies on the same contract to recognize them in a consuming project.

This decision is at decision altitude: it fixes the existence of a declared contract and the categories it admits. It does NOT define the complete field-level schema of the declaration — that belongs in `architecture/DESIGN.md` (DATA-ADR-NO-001). The scope is the conformance shape of a template's AI-extension bundle; it does not decide how the bundle is found or composed once a template is installed (that is `cpt-frontx-adr-extension-discovery-activation`), nor how the framework itself is packaged (that is `cpt-frontx-adr-kit-packaging-cyber-pilot-kit-frontx`). The convention-only option offers no point at which a malformed declaration can be reported and lets misplacement pass silently; the inline-in-metadata option overloads the template's existing metadata and couples AI extensions to fields that serve unrelated purposes, weakening both recognizability and validatability.

### Consequences

* Good, because a declared contract makes bundled extensions uniformly recognizable to the discovery mechanism for any template.
* Good, because a declared structure gives pre-publish validation a definite shape to check, so a malformed declaration is reported before the template is published.
* Good, because the contract describes categories independent of content, so the framework carries zero template-specific content.
* Neutral, because the concrete field-level schema is deferred to design, so this decision constrains structure without specifying every field.
* Bad, because admitting a new extension category later is a contract change governed by the framework's version policy.
* Bad, because templates must conform to the declared structure, which is an authoring obligation a convention-only approach would not impose.

### Confirmation

Compliance is confirmed by pre-publish validation that rejects a template whose AI-extension declaration is absent when extensions are present, omits a required structural element of a declared category, or names a category outside the closed set. A complementary check confirms the discovery mechanism recognizes a conforming bundle by the declared categories alone. Design and code review confirm the ADR fixes the categories and the declared-contract requirement without embedding a complete field-level schema (DATA-ADR-NO-001).

## Pros and Cons of the Options

### Declared extension-bundle contract

The template carries a declaration enumerating its AI-extension categories — skills, workflows, guidelines, reference artifacts — as named, typed slots; the field-level schema is left to design.

* Good, because a declared structure makes extensions uniformly recognizable across templates.
* Good, because it gives pre-publish validation a definite shape to check.
* Good, because it decouples the contract from any specific template's content.
* Neutral, because it fixes categories at decision altitude and defers the concrete schema to design.
* Bad, because adding a category is a contract change under the version policy.

### Convention-only layout

Extensions are recognized by a well-known directory layout and naming, with no declared contract.

* Good, because authors place files without writing a declaration.
* Bad, because there is no declared structure to validate against, so a malformed or misplaced extension passes silently until discovery fails.
* Bad, because recognition depends on layout and naming conventions that are easy to diverge from across templates.

### Inline-in-template-metadata

AI extensions are embedded in the template's existing metadata fields, with no separate contract.

* Good, because it adds no new declaration surface.
* Bad, because it overloads metadata fields that serve unrelated purposes, coupling AI extensions to them.
* Bad, because the absence of a dedicated contract weakens both uniform recognizability and pre-publish validatability.

## More Information

The categories this contract admits — skills, workflows, guidelines, and reference artifacts — mirror the kinds of AI extension a template is required to be able to carry (`cpt-frontx-fr-ai-template-bundle-extensions`). The mechanism that finds and composes a conforming bundle in a consuming project is decided in `cpt-frontx-adr-extension-discovery-activation`; the framework packaging that delivers the base capabilities these extensions operate alongside is decided in `cpt-frontx-adr-kit-packaging-cyber-pilot-kit-frontx`. These are non-binding pointers to related decisions and are not part of this decision's durable identity. The closed set of four categories is the present admitted set; admitting another category is a contract change, recorded as such rather than carried in this decision's identity.

Integration treatment (INT): the bundle shape is a contract consumed by two parties — Template Developers who declare extensions against it, and the discovery mechanism that reads it. **Contract changes (INT-ADR-002)** — a backward-compatible addition within the contract preserves existing conforming templates, while admitting or removing a category is a breaking contract change governed by the framework's version policy; consumers are notified through the version bump, and pre-publish validation is the consumer-facing check that a declaration still conforms. **Integration impact (INT-ADR-001)** — the contract is the interface between template authoring and downstream discovery; its compatibility posture is anchored to the framework's matched-version policy rather than narrated as a transition.

Applicability of the remaining checklist categories: **PERF** — Not applicable, because no latency or throughput budget is bound to the bundle's conformance shape. **SEC** — Not applicable, because the contract introduces no secret material and no authentication surface. **REL** — Not applicable, because there is no service-availability target attached to a carried declaration. **DATA** — addressed by exclusion: this decision deliberately does NOT define the full field-level schema (DATA-ADR-NO-001); the schema belongs in DESIGN. **OPS** — Not applicable, because there are no operational procedures for a carried bundle. **COMPL** — Not applicable, because no regulatory obligation bears on the bundle shape. **ARCH-ADR-008 (supersession)** — Not applicable, because this ADR supersedes no live ADR. **Review cadence**: revisit if a required extension kind does not fit the four-category model, or if the field-level schema decided in DESIGN forces a category boundary to change.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-fr-ai-template-bundle-extensions` — This decision defines the conformance shape that lets a template carry skills, workflows, guidelines, and reference artifacts as its AI extensions.
* `cpt-frontx-usecase-bundle-template-ai-extensions` — The declared contract is what the Template Developer declares extensions against and what pre-publish validation checks before publication.
