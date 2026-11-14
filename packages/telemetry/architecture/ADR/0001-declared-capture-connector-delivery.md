---
status: proposed
date: 2026-11-14
decision-makers: Mikhail Petrov
description: Architecture decision that telemetry moves to declared capture delivered through application-supplied connectors, and that each shipped behaviour this reverses is retired in the same change that delivers its replacement.
---

# Declared Capture Delivered Through Application-Supplied Connectors

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Declared capture and connectors, with each reversal landing together with its replacement](#declared-capture-and-connectors-with-each-reversal-landing-together-with-its-replacement)
  - [Keep the shipped model and add connectors and flows beside it](#keep-the-shipped-model-and-add-connectors-and-flows-beside-it)
  - [Replace the shipped model in one change](#replace-the-shipped-model-in-one-change)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-telemetry-adr-declared-capture-connector-delivery`

## Context and Problem Statement

The telemetry package captures DOM interaction automatically, keeps a device identity and the session in browser storage, enriches every record with browser and device context, and batches records to a collector endpoint the deployment operates. That model serves a deployment that runs its own collector. It does not serve an application that wants product analytics in a backend of its own choosing, funnels for forms and multi-step flows, telemetry from independently delivered microfrontends, or control over what is collected before a user has consented.

The requirements for those needs are in the telemetry PRD. Several of them are additions. Others reverse behaviour that is shipped, implemented and traced by the DESIGN, two FEATUREs and code. How does the package move to the new model without a PRD that states opposite requirements at once, and without a release that breaks applications built on the shipped behaviour?

## Decision Drivers

* An application chooses its analytics backend; the package must not know which one.
* Capture must be something a developer and a reviewer can read in code, not something inferred from the DOM.
* Nothing should be stored in the browser, or leave it, unless the application has arranged for that.
* A PRD holds requirements in force. Two requirements that contradict each other cannot both be in force.
* Applications on the shipped package need a path, not a break.
* The package stays standalone (`cpt-frontx-telemetry-nfr-standalone`).

## Considered Options

* Declared capture and connectors, with each reversal landing together with its replacement
* Keep the shipped model and add connectors and flows beside it
* Replace the shipped model in one change

## Decision Outcome

Chosen option: **Declared capture and connectors, with each reversal landing together with its replacement**, because it is the only option that reaches a backend-agnostic, consent-aware model while keeping the PRD free of contradicting requirements at every step.

The target model is:

* Capture is declared. Applications declare events, flows, dialogs and key actions; the package records those and the few things it can observe without help.
* Delivery goes through connectors the application supplies. The application writes the mapping to its backend. The package names no backend and ships no connector for one.
* With no connector, nothing is sent and, in production, nothing is captured.
* The package keeps no identifier in browser storage.
* A consent gate decides what a connector receives. The application asks for consent and stores the answer; the package acts on it.

Requirements that add to the shipped package without contradicting it are in the PRD now. A requirement that reverses a shipped one enters the PRD in the same change that removes the shipped requirement, its DESIGN rows, its FEATURE and its code. Until then the shipped requirement stays in force, with its behaviour unchanged; where its wording would forbid an addition, it is scoped to the shipped behaviour it describes. The reversals are:

| Shipped requirement | What replaces it |
|---|---|
| `cpt-frontx-telemetry-fr-dom-autocapture`, `cpt-frontx-telemetry-fr-capture-opt-out`, `cpt-frontx-telemetry-fr-element-attribution`, `cpt-frontx-telemetry-nfr-hook-compatibility` | No capture at the DOM level; flows, dialogs and key actions are declared (`cpt-frontx-telemetry-fr-flow-events`, `cpt-frontx-telemetry-fr-dialog-events`, `cpt-frontx-telemetry-fr-action-events`); attribution comes from the reporting microfrontend (`cpt-frontx-telemetry-fr-mfe-declared-attribution`) |
| `cpt-frontx-telemetry-fr-redaction` | Declared event data limited to bounded kinds, with no user-typed content |
| `cpt-frontx-telemetry-fr-device-identity`, `cpt-frontx-telemetry-fr-session-continuity` | Identifiers held in memory for one page load only; no device identity |
| `cpt-frontx-telemetry-fr-batched-delivery`, `cpt-frontx-telemetry-fr-collector-endpoint`, `cpt-frontx-telemetry-fr-delivery-disable` | Connectors only (`cpt-frontx-telemetry-fr-connectors`); the three telemetry states (`cpt-frontx-telemetry-fr-telemetry-states`); a deployment that runs a collector supplies a connector for it |
| `cpt-frontx-telemetry-fr-builtin-context` | A fixed context without the full address, user agent or screen dimensions |
| The free-form part of `cpt-frontx-telemetry-fr-custom-events`, and caller-supplied user fields | Declared events only (`cpt-frontx-telemetry-fr-declared-events`) |

Parts of the capability belong to other members, each in its own PRD:

| Member | What it owns |
|---|---|
| Microfrontend runtime | Telling the shell which microfrontend is sending, for `cpt-frontx-telemetry-fr-mfe-verified-attribution`; reporting load and mount to a telemetry contract it declares and calls |
| AI tooling kit | What an agent adds for a flow, a dialog and a key action |
| Protocol surface and routing | Reporting request timing and navigation to a telemetry contract they declare and call |
| Templates, in their own repository | A telemetry template a project adds through the CLI, carrying the shell wiring and the place for the connector; UI-framework bindings such as an error boundary and a form binding; lint rules shipped to projects; reporting which flows and dialogs are not instrumented |

A member that reports what it sees does not expose it for the telemetry package to read. It declares an abstract telemetry contract of its own and calls it, the way the router declares the executor and the type system it needs, and it takes the implementation through one optional port. The telemetry package conforms to those contracts structurally and imports no member.

The CLI owns nothing here. A project gets telemetry by adding a template, which the CLI already does for any template, and the CLI knows nothing of what a template produces.

### Consequences

* Good, because the PRD never states a requirement and its opposite.
* Good, because the package can be adopted for flows and connectors before any shipped behaviour is removed.
* Good, because each reversal is reviewed together with the code it removes, by the people who own that code.
* Good, because no analytics backend is named anywhere in the ecosystem's artifacts.
* Bad, because the shipped model and the target model coexist for a time, and an application can use both ways to record and deliver.
* Bad, because a deployment that runs a collector must write a connector for it, where the shipped package delivered to it directly.
* Bad, because attribution of microfrontend records is declared by the microfrontend until the runtime supplies sender identity.
* Bad, because the full capability is spread over several members' PRDs and one templates repository, so it cannot be read in one document; this record is the index.

### Confirmation

* `cfs validate` passes on every change, which it cannot if a shipped identifier is removed while DESIGN, FEATURE or code still trace to it.
* A change that adds a reversing requirement removes the shipped requirement it reverses in the same change; review checks the pair against the table above.
* No artifact or published file of the package names an analytics backend.

## Pros and Cons of the Options

### Declared capture and connectors, with each reversal landing together with its replacement

* Good, because requirements in force are always consistent.
* Good, because applications on the shipped package keep working until the change that affects them, and that change says what to do.
* Neutral, because the order of the reversals is left to implementation.
* Bad, because it takes several changes across several members to reach the target.

### Keep the shipped model and add connectors and flows beside it

* Good, because nothing shipped changes.
* Bad, because automatic DOM capture and stored identity remain on by default, which is the opposite of collecting only what the application arranged.
* Bad, because built-in delivery to a collector keeps one backend privileged.

### Replace the shipped model in one change

* Good, because the target is reached at once.
* Bad, because it breaks every application on the shipped package in a single release.
* Bad, because it requires the microfrontend runtime, the AI tooling kit and the templates to change in step.

## More Information

A spike on the shipped runtime showed that records reach a handler in the shell through the runtime's existing host-microfrontend communication once their type is registered, that a microfrontend must hand over its pending records inside its own removal, and that the shell is not told who is sending. The first two shape the DESIGN; the third is why verified attribution depends on the runtime.

## Traceability

- **PRD**: [../PRD.md](../PRD.md)
- **DESIGN**: [../DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-telemetry-fr-connectors` and `cpt-frontx-telemetry-fr-connector-mapping` — delivery through application-supplied connectors with no backend known to the package.
* `cpt-frontx-telemetry-fr-telemetry-states` — names the collector as a configured connector, for the three states only, until its delivery is retired under this record, and leaves the shipped delivery-suppression mode outside those states until then.
* `cpt-frontx-telemetry-fr-collector-endpoint` — its restriction to the collector destination is scoped to the shipped collector delivery, so delivery through connectors does not contradict it while both exist.
* `cpt-frontx-telemetry-fr-consent-gate` and `cpt-frontx-telemetry-fr-identity-consent` — apply to connectors the application supplies and leave the shipped collector delivery as it is until it is retired.
* `cpt-frontx-telemetry-fr-declared-events` — keeps undeclared recording working until the free-form part of `cpt-frontx-telemetry-fr-custom-events` is retired.
* `cpt-frontx-telemetry-fr-mfe-declared-attribution` and `cpt-frontx-telemetry-fr-mfe-verified-attribution` — the declared and the verified stage of attribution. Verified attribution covers the extension admitted into the shell; the namespace of a microfrontend nested inside it stays declared.
* `cpt-frontx-telemetry-nfr-standalone` — the reason UI-framework bindings are outside this package, and the reason other members call a contract they declare instead of being imported by it.
