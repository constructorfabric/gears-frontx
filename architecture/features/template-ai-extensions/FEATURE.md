# Feature: Template AI-Extension Contract & Discovery/Activation


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Bundle, Publish, Install, Discover, and Activate AI Extensions](#bundle-publish-install-discover-and-activate-ai-extensions)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Extension Contract Scan and Activation](#extension-contract-scan-and-activation)
- [4. States (CDSL)](#4-states-cdsl)
  - [AiExtension Lifecycle](#aiextension-lifecycle)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Closed-Set Contract and Generalized Discovery Activation](#closed-set-contract-and-generalized-discovery-activation)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-template-ai-extensions`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-template-ai-extensions`

### 1.1 Overview

Defines the closed-set extension-bundle contract a template's AI bundle conforms to — skills, workflows, guidelines, and reference artifacts as named typed slots — and the generalized scan that discovers conforming installed-template extensions and activates them into the agent-visible capability set under explicit precedence, with no manual wiring; malformed extensions are reported as structural errors and not activated.

### 1.2 Purpose

This feature provides the mechanism by which template-specific AI expertise travels with a template to any project that installs it. It addresses the requirement that templates carry AI bundles conforming to a declared extension contract (`cpt-frontx-fr-ai-template-bundle-extensions`) and that installed-template extensions are discovered and activated without manual configuration (`cpt-frontx-fr-ai-extension-discovery-activation`).

**Requirements**: `cpt-frontx-fr-ai-template-bundle-extensions`, `cpt-frontx-fr-ai-extension-discovery-activation`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-template-developer` | Declares AI extensions under the closed-set contract and publishes the template bundle |
| `cpt-frontx-actor-project-developer` | Installs the template into a project; receives template-specific AI capabilities without manual wiring |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**:
  - `cpt-frontx-feature-template-resolution` (F10) — discovery is triggered on template install (cross-pillar edge F16 ← F10)
  - `cpt-frontx-feature-ai-kit-packaging` (F15) — bundled extensions activate into the base kit's capability set

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor (human or external system) and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-bundle-template-ai-extensions`

### Bundle, Publish, Install, Discover, and Activate AI Extensions

- [ ] `p1` - **ID**: `cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate`

**Realizes**: `cpt-frontx-seq-template-ai-extension-discovery-activation`

**Actors**: `cpt-frontx-actor-template-developer` (bundle + publish leg), `cpt-frontx-actor-project-developer` (install + discover + activate leg)

**Success Scenarios**:
- Template Developer declares conforming AI extensions and publishes the template; Project Developer installs the template; the AI Tooling Framework discovers the bundled extension and activates its capabilities for agents with no manual configuration step.

**Error Scenarios**:
- Template Developer provides an extension entry that names a category outside the closed set; pre-publish validation rejects the declaration and the template is not published.
- Template Developer publishes a template with a malformed extension declaration; on install, the AI Tooling Framework reports a structural error and does not activate the non-conforming entry.

**Steps**:

*Bundle and publish leg — Template Developer*

1. [ ] - `p1` - Template Developer declares AI extensions for the template against the closed-set extension contract, providing named typed entries for each category the template bundles (skills, workflows, guidelines, reference artifacts) - `inst-declare-extensions`
2. [ ] - `p1` - **IF** any declared entry names a category outside the closed set or omits a required structural element for its slot - `inst-check-contract-shape`
   1. [ ] - `p1` - Pre-publish validation reports a structural error identifying the non-conforming entry and the violated constraint - `inst-report-prepublish-error`
   2. [ ] - `p1` - **RETURN** validation failure; the template is not published - `inst-return-prepublish-fail`
3. [ ] - `p1` - Pre-publish validation confirms all declared extension entries conform to the closed-set contract - `inst-confirm-contract-conformance`
4. [ ] - `p1` - Template Developer publishes the template to the source registry with the bundled AI-extension declaration included - `inst-publish-template`

*Install, discover, and activate leg — Project Developer*

5. [ ] - `p1` - Project Developer installs the template into the project via the CLI (`cpt-frontx-feature-template-resolution`); the CLI signals the AI Tooling Framework (`cpt-frontx-component-ai-tooling-kit`) that an installed template is present - `inst-install-template`
6. [ ] - `p1` - AI Tooling Framework initiates extension discovery for the installed template, invoking the contract scan algorithm parameterized by the closed-set extension contract - `inst-initiate-discovery`
7. [ ] - `p1` - **FOR EACH** named typed slot in the closed-set contract (skills, workflows, guidelines, reference artifacts) - `inst-scan-each-slot`
   1. [ ] - `p1` - Scan the installed template's declared extension bundle for entries targeting the current slot - `inst-scan-slot-entries`
   2. [ ] - `p1` - **IF** a located entry does not conform structurally to the current slot's required shape - `inst-check-slot-conformance`
      1. [ ] - `p1` - Record a structural error for the non-conforming entry; mark the entry as REJECTED - `inst-record-structural-error`
   3. [ ] - `p1` - **ELSE** add the conforming entry to the discovered set for the current slot - `inst-add-to-discovered`
8. [ ] - `p1` - **IF** any structural errors were recorded during the scan - `inst-check-errors`
   1. [ ] - `p1` - Report all structural errors to the Project Developer; no errored entry is included in activation - `inst-report-errors`
9. [ ] - `p1` - Compose the discovered conforming entries with the base kit's capabilities under explicit precedence, as computed by `cpt-frontx-algo-template-ai-extensions-contract-scan-activate` - `inst-compose-under-precedence`
10. [ ] - `p1` - Activate the composed capability set into the AI agent's visible capability surface with no manual wiring required from the Project Developer - `inst-activate-capabilities`
11. [ ] - `p1` - **RETURN** the activated agent-visible capability set, now including the template-specific extensions alongside the base kit capabilities - `inst-return-activated`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly.

### Extension Contract Scan and Activation

- [ ] `p2` - **ID**: `cpt-frontx-algo-template-ai-extensions-contract-scan-activate`

**Input**: Installed template's declared AI-extension bundle; closed-set extension contract (skills, workflows, guidelines, reference artifacts as named typed slots); base kit's capability set

**Output**: Composed agent-visible capability set and a structural-error list for any non-conforming entries

**Steps**:
1. [ ] - `p1` - Load the closed-set extension contract, enumerating all named typed slots: skills, workflows, guidelines, and reference artifacts - `inst-load-contract`
2. [ ] - `p1` - Load the installed template's declared AI-extension bundle - `inst-load-bundle`
3. [ ] - `p1` - Initialize an empty discovered-extensions map keyed by contract slot - `inst-init-discovered-map`
4. [ ] - `p1` - Initialize an empty structural-error list - `inst-init-error-list`
5. [ ] - `p1` - **FOR EACH** named typed slot defined by the closed-set contract - `inst-iterate-slots`
   1. [ ] - `p1` - Identify all declared entries in the bundle that target the current slot - `inst-identify-slot-entries`
   2. [ ] - `p1` - **FOR EACH** identified entry - `inst-validate-each-entry`
      1. [ ] - `p1` - Validate the entry's structural shape against the required elements for the current slot - `inst-validate-entry-shape`
      2. [ ] - `p1` - **IF** the entry is malformed or missing a required structural element - `inst-check-malformed`
         1. [ ] - `p1` - Append a structural error to the error list, naming the slot and the offending entry - `inst-append-error`
         2. [ ] - `p1` - **SKIP TO** the next entry; do not add to the discovered map - `inst-skip-malformed`
      3. [ ] - `p1` - Add the conforming entry to the discovered-extensions map under the current slot - `inst-add-conforming`
6. [ ] - `p1` - **IF** the structural-error list is non-empty - `inst-check-error-list`
   1. [ ] - `p1` - Surface all structural errors; each errored entry is permanently excluded from the activation set - `inst-surface-errors`
7. [ ] - `p1` - Compose the discovered-extensions map with the base kit's capability set under the explicit precedence rule (`target`: template-contributed entries supersede base-kit entries for the same named slot; among entries from multiple installed templates targeting the same named slot, the defined installation-order precedence determines the surviving entry) - `inst-compose-precedence`
8. [ ] - `p1` - **RETURN** the composed capability set and the structural-error list - `inst-return-result`

## 4. States (CDSL)

### AiExtension Lifecycle

- [ ] `p2` - **ID**: `cpt-frontx-state-template-ai-extensions-extension-lifecycle`

**States**: BUNDLED, DISCOVERED, VALIDATED, ACTIVATED, REJECTED

**Initial State**: BUNDLED

**Transitions**:
1. [ ] - `p1` - **FROM** BUNDLED **TO** DISCOVERED **WHEN** the installed template's AI-extension bundle is scanned and an entry is located for a named typed slot in the closed-set contract - `inst-trans-bundled-to-discovered`
2. [ ] - `p1` - **FROM** DISCOVERED **TO** VALIDATED **WHEN** the entry's structural shape is confirmed to conform to the required elements for its slot - `inst-trans-discovered-to-validated`
3. [ ] - `p1` - **FROM** DISCOVERED **TO** REJECTED **WHEN** the entry's structural shape is malformed or missing a required element for its slot - `inst-trans-discovered-to-rejected`
   1. [ ] - `p1` - Report a structural error to the Project Developer identifying the slot and the non-conforming entry - `inst-action-report-rejection`
4. [ ] - `p1` - **FROM** VALIDATED **TO** ACTIVATED **WHEN** the composed capability set is committed to the AI agent's visible surface after explicit precedence resolution - `inst-trans-validated-to-activated`

## 5. Definitions of Done

### Closed-Set Contract and Generalized Discovery Activation

- [ ] `p1` - **ID**: `cpt-frontx-dod-template-ai-extensions-contract-conformance`

The system **MUST** implement the closed-set extension contract (skills, workflows, guidelines, reference artifacts as named typed slots), the generalized scan parameterized by that contract, composition under explicit precedence, structural-error reporting for non-conforming entries, and the BUNDLED → DISCOVERED → VALIDATED → ACTIVATED / REJECTED lifecycle — realizing the sequence `cpt-frontx-seq-template-ai-extension-discovery-activation` as specified in the flow `cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate` and the algorithm `cpt-frontx-algo-template-ai-extensions-contract-scan-activate`.

**Implements**:
- `cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate`
- `cpt-frontx-algo-template-ai-extensions-contract-scan-activate`
- `cpt-frontx-seq-template-ai-extension-discovery-activation`

**Touches**:
- Entities: AiExtension

## 6. Acceptance Criteria

- [ ] A Template Developer can declare AI extensions (skills, workflows, guidelines, reference artifacts) against the closed-set contract and pre-publish validation confirms conformance before the template is published.
- [ ] Pre-publish validation rejects a template whose AI-extension declaration names a category outside the closed set or omits a required structural element for a slot, reporting the violation before publication.
- [ ] Installing a conforming template in a project makes its declared AI extensions agent-visible with no manual configuration step required in the consuming project.
- [ ] The discovery scan is parameterized over the closed-set extension contract: any conforming template's extensions are found by the same scan path regardless of the template's namespace identity.
- [ ] When base kit capabilities and one or more installed-template extensions contribute entries for the same named slot, the composed result is deterministic and governed by the explicit precedence rule.
- [ ] A malformed extension entry (missing required element, unrecognized category name) is reported as a structural error and is not activated; conforming entries from the same bundle are not affected by the rejection.
- [ ] An AiExtension follows the lifecycle BUNDLED → DISCOVERED → VALIDATED → ACTIVATED; a non-conforming entry transitions to REJECTED instead of ACTIVATED, and no REJECTED entry is present in the activated capability set.
