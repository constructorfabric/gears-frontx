# PRD — Telemetry SDK (`@gears-frontx/telemetry`)


<!-- toc -->

- [1. Overview](#1-overview)
  - [1.1 Purpose](#11-purpose)
  - [1.2 Background / Problem Statement](#12-background--problem-statement)
  - [1.3 Goals (Business Outcomes)](#13-goals-business-outcomes)
  - [1.4 Glossary](#14-glossary)
- [2. Actors](#2-actors)
  - [2.1 Human Actors](#21-human-actors)
  - [2.2 System Actors](#22-system-actors)
- [3. Operational Concept & Environment](#3-operational-concept--environment)
  - [3.1 Module-Specific Environment Constraints](#31-module-specific-environment-constraints)
- [4. Scope](#4-scope)
  - [4.1 In Scope](#41-in-scope)
  - [4.2 Delivered by a Separate Package](#42-delivered-by-a-separate-package)
  - [4.3 Out of Scope](#43-out-of-scope)
- [5. Functional Requirements](#5-functional-requirements)
  - [5.1 Signal Capture](#51-signal-capture)
  - [5.2 Identity and Attribution](#52-identity-and-attribution)
  - [5.3 Consent and Privacy Controls](#53-consent-and-privacy-controls)
  - [5.4 Delivery](#54-delivery)
  - [5.5 Extensibility](#55-extensibility)
- [6. Non-Functional Requirements](#6-non-functional-requirements)
  - [6.1 NFRs](#61-nfrs)
  - [6.2 NFR Exclusions](#62-nfr-exclusions)
- [7. Public Library Interfaces](#7-public-library-interfaces)
  - [7.1 Public API Surface](#71-public-api-surface)
  - [7.2 External Integration Contracts](#72-external-integration-contracts)
- [8. Use Cases](#8-use-cases)
- [9. Acceptance Criteria](#9-acceptance-criteria)
- [10. Dependencies](#10-dependencies)
- [11. Assumptions](#11-assumptions)
- [12. Risks](#12-risks)
- [Open Questions](#open-questions)

<!-- /toc -->

**Status**: Draft for review · **Date**: 2026-08-04

---

## 1. Overview

### 1.1 Purpose

`@gears-frontx/telemetry` is an embeddable browser SDK that captures device, session, content, and
behavioral signals while a person interacts with a host web application, and delivers them to an
endpoint the host controls. It is standalone by construction — no framework coupling, no dependency
on any other package in the repository — so any web application can embed it.

The SDK observes; it does not decide. It captures signals, applies privacy controls at the point of
capture, and ships records. Aggregation, normalization, and any derived pattern above the raw
stream — engagement curves, focus dips, session-to-session trends — belong to whatever consumes the
records, not to the SDK.

Where capture would reach sensitive material — webcam, microphone, screen, or biometric-adjacent
behavioral dynamics — processing happens on the user's device and only derived signals leave it. Raw
media is never transmitted.

### 1.2 Background / Problem Statement

A host that wants to understand engagement needs three things: the signal stream in systems it owns,
capture that reaches past page views and clicks, and privacy controls inside the collection mechanism
rather than layered over it.

General-purpose analytics products hold the data on the vendor's terms and expose little of the
richer behavioral signal. Building collection in-house means re-solving session identity,
autocapture, batching, redaction, and browser variance in every application that needs it.

**Host App Integrators** need a small, stable integration surface, explicit control over which signal
categories are active, and honest documentation of what the SDK stores and transmits. **Observed
Users** need transparency, a real opt-out, and no perceptible cost to their experience. **Privacy
Reviewers** in the deploying organization need to know exactly what is collected, what identifiers
persist, and where the boundaries of the SDK's guarantees lie.

### 1.3 Goals (Business Outcomes)

- **Single-call integration** — A host embeds the SDK, configures a destination, and receives session,
  device, navigation, and interaction records without writing per-event code. Baseline: shipped for
  the built-in signal set; Target: the full signal set of §4.1 reachable by configuration alone;
  Timeframe: first stable release.
- **Host owns the data** — Every record goes to an endpoint the host configures; the SDK has no
  default vendor destination and no side channel. Baseline: configurable endpoint shipped; Target:
  pluggable transport so hosts control envelope and headers as well as destination; Timeframe: first
  stable release.
- **Privacy controls that hold by default** — Sensitive capture is off until consented, and the
  documented guarantees match the implementation's actual behavior. Baseline: redaction safety net
  shipped, consent primitives absent; Target: per-category consent gating enforced at capture, with
  no collection or identifier write before consent; Timeframe: before any sensitive signal category
  ships.
- **No perceptible cost to the observed user** — Capture is passive and non-blocking, with a published
  overhead budget. Baseline: not yet measured; Target: budget established and verified in CI;
  Timeframe: first stable release.
- **Compatibility within a major version** — Published surfaces, the element-hook registry contract,
  and the stored-identifier layout preserve backward compatibility within a major version. Baseline:
  pre-1.0, unstable; Target: zero breaking changes to published contracts within a major line;
  Timeframe: from the first stable release.

### 1.4 Glossary

| Term | Definition |
|------|------------|
| SDK | The `@gears-frontx/telemetry` package — the embeddable browser library described by this document. |
| host application | A web application that embeds the SDK, supplies application and identity context, and owns the destination the records go to. |
| observed user | Any person whose interaction with a host application the SDK captures. The SDK does not distinguish roles. |
| record | One captured event as transmitted, carrying its own fields plus the context fields contributed by active plugins. |
| signal | An observed property of a session, a device, a page, or an interaction, expressed in one or more records. |
| signal category | A group of signals governed as a unit for consent and configuration — device and environment, session and content, interaction, micro-behavioral, media. |
| autocapture | Collection of standard interaction signals from the DOM without per-event host code. |
| plugin | A unit registered with a client that contributes context fields to every record, emits its own records, or both. The SDK's own signal groups are plugins. |
| element hook | A marker a host places on a DOM element, read through a published registry symbol, that adds or suppresses capture for that element's subtree. |
| session | A bounded interaction window for one observed user in one browser, ending after a configured period without activity. |
| device identifier | A persistent pseudonymous identifier the SDK mints and stores locally, correlating records from one browser across sessions. |
| consent-gated capture | Capture of a signal category that occurs only after the required consent has been granted, and that writes nothing — including identifiers — before then. |
| on-device processing | Analysis of captured media performed entirely in the browser, where only derived signals are transmitted and the media itself never leaves the device. |
| derived signal | A signal computed from raw material that is discarded, rather than transmitted, after computation. |
| destination | The endpoint a host configures to receive records. The SDK has no default vendor destination. |

## 2. Actors

### 2.1 Human Actors

#### Observed User

**ID**: `cpt-telemetry-actor-observed-user`

**Role**: Any person whose interaction with a host application the SDK captures.
**Needs**: Transparency about what is collected; a consent decision that is honored at the point of
capture, including before any identifier is written; the ability to withdraw it and to stop media
capture at any moment; no perceptible effect on the application's responsiveness.

#### Host App Integrator

**ID**: `cpt-telemetry-actor-integrator`

**Role**: An engineer who embeds the SDK in a host application, configures the destination, wires
consent, marks or suppresses parts of the markup, emits custom events, and adds plugins for
application-specific signals.
**Needs**: A small, stable integration surface; per-category control over what is active; documented
behavior for storage, transmission, and failure; and no coupling to a UI framework or another
package.

#### Privacy Reviewer

**ID**: `cpt-telemetry-actor-privacy-reviewer`

**Role**: The person accountable for the deploying organization's privacy and regulatory posture for
what the SDK collects. External to the product.
**Needs**: A complete statement of collected signals and stored identifiers; auditable consent
records; an explicit boundary between mechanisms the SDK provides and posture the deploying
organization owns.

### 2.2 System Actors

#### Host Application

**ID**: `cpt-telemetry-actor-host-app`

**Role**: Hosts the page the observed user interacts with, embeds the SDK, supplies application,
identity, and tenant context, marks its own markup, and consumes nothing back — records flow
outward to the destination it configures.

**Direction**: Inbound (embeds and configures the SDK); outbound (supplies context and custom events).

**Availability**: Required whenever capture is active.

#### Destination Endpoint

**ID**: `cpt-telemetry-actor-destination`

**Role**: The HTTP endpoint, chosen and operated by the host, that receives batched records.
Third-party to the SDK.

**Direction**: Outbound (records flow to it).

**Conformance expectation**: Accepts the SDK's request contract (`cpt-telemetry-contract-ingestion`).

**Availability**: Required for delivery; capture continues while it is unreachable.

#### Package Registry

**ID**: `cpt-telemetry-actor-package-registry`

**Role**: npm-compatible registry hosting the published package.

**Direction**: Outbound (the package is published to it); inbound (hosts install from it).

**Availability**: Required at publish and install time.

#### Browser Runtime

**ID**: `cpt-telemetry-actor-browser`

**Role**: Provides the capture and storage primitives the SDK depends on, and the permission prompts
that gate media access.

**Direction**: Inbound (the SDK observes through its APIs).

**Availability**: Required; capability varies by browser and is the source of most per-signal
variance.

## 3. Operational Concept & Environment

The SDK is embedded once in a host application and runs for the lifetime of each page. A host creates
a client, registers any plugins it adds, and starts it; from that point capture is passive. Records
accumulate in memory and are delivered in batches, with an immediate delivery attempt when the page
becomes hidden. On teardown the host destroys the client, which releases listeners and delivers what
remains.

Records leave the browser and stop being this SDK's concern. Where they land is the host's choice: any
endpoint that accepts the ingestion contract (`cpt-telemetry-contract-ingestion`). Ingesting, storing,
normalizing, and querying them is a separate package in the product, described in §4.2 — the SDK's
only relationship to it is the contract at that boundary, so a host can run the SDK against its own
endpoint before that package exists and after it does.

### 3.1 Module-Specific Environment Constraints

- The SDK MUST operate as a passive, non-blocking background observer inside host pages; it never
  interposes on the host's own event handling or rendering.
- Importing the package outside a browser MUST be safe: lifecycle calls are inert without a browser
  environment, so server-side rendering neither fails nor collects.
- Media capture and biometric-adjacent behavioral dynamics require explicit consent per observed
  user, per host, and per activity, and are subject to regional regulatory variation.
- Capture APIs differ across browsers in availability and behavior; every signal's browser support is
  determined per signal, not assumed from one engine.
- The SDK stores its identifiers in browser-local storage under keys it owns; a second client on the
  same origin isolates its own via a configured prefix.

## 4. Scope

### 4.1 In Scope

#### Signal capture

- Device and environment context on every record — device, operating system, client, viewport,
  locale, timezone.
- Session lifecycle — session start, session continuation, and expiry after a configured period of
  inactivity.
- Navigation — a page-view record on every path change, including history-API navigation.
- DOM autocapture of standard interactions, with redaction applied before a value is recorded.
- Host-emitted custom events with arbitrary payloads.
- Content-engagement signals — time on section, scroll depth, tab focus and blur, reading pace, and
  video start, progress, and completion.
- Interaction-quality signals — rage clicks, dead clicks, clipboard actions, and referrer.
- Micro-behavioral signals — keystroke and mouse dynamics, idle and active spans, and interaction
  timing; consent-gated as a category.
- Media-derived signals from webcam, microphone, and screen capture; consent-gated, captured **and**
  processed on the device, with only derived signals transmitted.

#### Identity and attribution

- A persistent pseudonymous device identifier, minted and stored by the SDK.
- Host-asserted user identity, supplied when the host has one and absent when it does not.
- Multi-tenant attribution — tenant, application, and service context carried on every record.

#### Privacy controls

- Per-category consent capture, enforcement at the point of capture, and withdrawal.
- A halt that stops collection and identifier writes, not merely transmission.
- Sensitive-value redaction as a capture-time safety net — password and hidden inputs, sensitive-looking
  field names, and values matching payment-card or government-identifier patterns.
- Markup-level suppression of any subtree the host declares off-limits.

#### Delivery

- A destination the host configures, with no default vendor endpoint.
- Batched delivery with an immediate attempt when the page becomes hidden.
- Durable delivery — a failed batch is retried rather than dropped.
- A pluggable transport, so the host controls request envelope and headers as well as destination.

#### Extensibility

- A plugin contract for host-specific signals, on the same footing as the SDK's built-in groups.
- A published element-hook registry contract, so markup-level annotations are readable across mixed
  SDK versions on one page.

### 4.2 Delivered by a Separate Package

These belong to the product as a whole and are planned as their own package, not built into this SDK.
They shape this document only where the SDK's contract with them does — the ingestion contract
(`cpt-telemetry-contract-ingestion`) and the pluggable transport
(`cpt-telemetry-fr-pluggable-transport`).

- The ingestion and storage layer that receives records — ingest, normalization, retention, and query.
- Derivation of aggregate patterns above the raw stream — engagement curves, focus dips, and the like.

Until that package exists, a host points the SDK at a destination of its own; the SDK carries no
default destination either way (`cpt-telemetry-fr-configurable-destination`).

### 4.3 Out of Scope

- Any presentation layer — dashboards, reports, or user-facing profiles.
- The decision logic a host builds on the signals, including personalization and recommendation.
- Session replay and heatmaps.
- Native mobile capture; the SDK is a browser library.
- Migration or backfill of a host's pre-existing analytics.
- Coupling to any UI framework, state library, or other package in the repository.
- Higher-order inference over raw media — facial or voice recognition, emotion, attention scoring —
  which would be a separate product decision, not a capability of this SDK.

## 5. Functional Requirements

### 5.1 Signal Capture

#### Session lifecycle tracking

- [x] `p1` - **ID**: `cpt-telemetry-fr-session-lifecycle`

The SDK **MUST** establish a session for an observed user in a browser, carry its identity on every
record, and expire it after a configurable period without activity.

**Rationale**: A session is the unit every other signal is interpreted against; without it records
are unordered and unattributable.

**Actors**: `cpt-telemetry-actor-integrator`

#### Device and environment context

- [x] `p1` - **ID**: `cpt-telemetry-fr-device-context`

The SDK **MUST** attach device, operating-system, client, viewport, locale, and timezone context to
every record without per-event host code.

**Rationale**: Engagement is not comparable across devices and locales unless every record carries
the conditions it was produced under.

**Actors**: `cpt-telemetry-actor-integrator`

#### Navigation capture

- [x] `p1` - **ID**: `cpt-telemetry-fr-navigation`

The SDK **MUST** record a page view on every path change, including changes made through the history
API rather than a document load.

**Rationale**: Host applications are predominantly client-routed; document-load-only capture would
miss most navigation.

**Actors**: `cpt-telemetry-actor-integrator`

#### DOM autocapture

- [x] `p1` - **ID**: `cpt-telemetry-fr-autocapture`

The SDK **MUST** capture standard user interactions from the DOM without per-event host code, and
**MUST** apply redaction before recording any element value.

**Rationale**: Removes the per-interaction instrumentation burden that makes in-house collection
expensive to maintain.

**Actors**: `cpt-telemetry-actor-integrator`, `cpt-telemetry-actor-observed-user`

#### Host-emitted custom events

- [x] `p1` - **ID**: `cpt-telemetry-fr-custom-events`

The SDK **MUST** let a host emit named events with arbitrary payloads that receive the same context
enrichment as captured records.

**Rationale**: Application-meaningful moments are invisible to generic capture; the host must be able
to name them.

**Actors**: `cpt-telemetry-actor-integrator`

#### Content-engagement signals

- [ ] `p1` - **ID**: `cpt-telemetry-fr-content-engagement`

The SDK **MUST** capture time on section, scroll depth, tab focus and blur, reading pace, and video
start, progress, and completion.

**Rationale**: This is the signal set engagement analysis actually rests on; clicks and page views
alone cannot distinguish reading from idling.

**Actors**: `cpt-telemetry-actor-integrator`

#### Interaction-quality signals

- [ ] `p2` - **ID**: `cpt-telemetry-fr-interaction-quality`

The SDK **MUST** capture rage clicks, dead clicks, clipboard actions, and referrer.

**Rationale**: These identify friction and provenance, which raw interaction counts do not express.

**Actors**: `cpt-telemetry-actor-integrator`

#### Micro-behavioral signals

- [ ] `p2` - **ID**: `cpt-telemetry-fr-micro-behavioral`

The SDK **MUST** capture keystroke and mouse dynamics, idle and active spans, and interaction timing
as one consent-gated category, and **MUST NOT** capture any of them before consent for that category
is granted.

**Rationale**: These signals distinguish engaged work from mechanical activity, and their
biometric-adjacent nature makes consent gating part of the requirement rather than a policy layer
above it.

**Actors**: `cpt-telemetry-actor-observed-user`, `cpt-telemetry-actor-privacy-reviewer`

#### On-device media signals

- [ ] `p2` - **ID**: `cpt-telemetry-fr-media-on-device`

The SDK **MUST** support consent-gated webcam, microphone, and screen capture in which both capture
and processing occur on the observed user's device, **MUST** transmit only derived signals, and
**MUST NOT** transmit or persist the media itself.

**Rationale**: The media categories carry the highest privacy cost of anything in scope; the
on-device boundary is what makes them admissible at all, so it belongs in the requirement.

**Actors**: `cpt-telemetry-actor-observed-user`, `cpt-telemetry-actor-privacy-reviewer`

### 5.2 Identity and Attribution

#### Pseudonymous device identity

- [x] `p1` - **ID**: `cpt-telemetry-fr-device-identity`

The SDK **MUST** mint and persist a pseudonymous device identifier, derived from nothing the observed
user supplied, and carry it on every record.

**Rationale**: Correlating a browser's records across sessions is required for any longitudinal
signal, and deriving the identifier from nothing user-supplied keeps it pseudonymous.

**Actors**: `cpt-telemetry-actor-integrator`, `cpt-telemetry-actor-privacy-reviewer`

#### Host-asserted user identity

- [x] `p1` - **ID**: `cpt-telemetry-fr-host-identity`

The SDK **MUST** accept a user identity asserted by the host and **MUST** remain fully functional
when the host asserts none.

**Rationale**: Hosts differ in whether and when they know who the user is; capture cannot depend on
an identity that may never arrive.

**Actors**: `cpt-telemetry-actor-integrator`

#### Multi-tenant attribution

- [ ] `p1` - **ID**: `cpt-telemetry-fr-tenant-attribution`

The SDK **MUST** carry host-supplied tenant, application, and service attribution on every record.

**Rationale**: A single destination serving several tenants and applications cannot separate their
streams without attribution on each record.

**Actors**: `cpt-telemetry-actor-integrator`

### 5.3 Consent and Privacy Controls

#### Per-category consent gating

- [ ] `p1` - **ID**: `cpt-telemetry-fr-consent-gating`

The SDK **MUST** gate each signal category on a recorded consent decision, enforce that decision at
the point of capture, and honor withdrawal without requiring a page reload.

**Rationale**: Consent enforced anywhere other than at capture is a promise the mechanism cannot
keep; the observed user's decision has to bind the code that collects.

**Actors**: `cpt-telemetry-actor-observed-user`, `cpt-telemetry-actor-privacy-reviewer`

#### Collection halt

- [ ] `p1` - **ID**: `cpt-telemetry-fr-collection-halt`

The SDK **MUST** provide a state in which nothing is collected and no identifier is written, distinct
from a state in which collection continues and only delivery is suppressed. Each state **MUST** be
named for what it actually does.

**Rationale**: A switch that reads as "off" while still minting a persistent identifier misleads the
integrator who relies on it and the reviewer who audits it.

**Actors**: `cpt-telemetry-actor-integrator`, `cpt-telemetry-actor-privacy-reviewer`

#### Sensitive-value redaction

- [x] `p1` - **ID**: `cpt-telemetry-fr-redaction`

The SDK **MUST** apply capture-time redaction that drops values from password and hidden inputs,
from fields whose identifiers look sensitive, and from values matching payment-card or
government-identifier patterns. The SDK **MUST** document this as a safety net and not as a
compliance guarantee.

**Rationale**: Pattern matching catches the common accident but cannot know a host's markup;
overstating it would let integrators skip the audit only they can perform.

**Actors**: `cpt-telemetry-actor-observed-user`, `cpt-telemetry-actor-privacy-reviewer`

#### Markup-level suppression

- [x] `p1` - **ID**: `cpt-telemetry-fr-markup-suppression`

The SDK **MUST** let a host suppress capture for a DOM subtree by annotating its markup.

**Rationale**: Only the host knows which parts of its own pages render personal data; suppression has
to be expressible where that knowledge lives.

**Actors**: `cpt-telemetry-actor-integrator`

### 5.4 Delivery

#### Host-configured destination

- [x] `p1` - **ID**: `cpt-telemetry-fr-configurable-destination`

The SDK **MUST** deliver records only to a destination the host configures, and **MUST NOT** carry a
default vendor destination or any secondary channel.

**Rationale**: Host ownership of the data is the product's central claim, and a fallback destination
would void it.

**Actors**: `cpt-telemetry-actor-integrator`, `cpt-telemetry-actor-destination`

#### Batched delivery

- [x] `p1` - **ID**: `cpt-telemetry-fr-batched-delivery`

The SDK **MUST** accumulate records and deliver them in batches, and **MUST** attempt delivery
immediately when the page becomes hidden.

**Rationale**: Per-record requests would cost the observed user network and battery; page-hide is the
last moment a batch can still be sent.

**Actors**: `cpt-telemetry-actor-integrator`

#### Durable delivery

- [ ] `p1` - **ID**: `cpt-telemetry-fr-delivery-durability`

The SDK **MUST** retry a failed batch rather than discard it, and **MUST** surface delivery failure
to the host rather than only to the console.

**Rationale**: Silent batch loss makes every downstream count unreliable in exactly the conditions —
poor networks, endpoint incidents — where the data matters most.

**Actors**: `cpt-telemetry-actor-integrator`, `cpt-telemetry-actor-destination`

#### Pluggable transport

- [ ] `p1` - **ID**: `cpt-telemetry-fr-pluggable-transport`

The SDK **MUST** let a host supply the transport that serializes and sends batches, including request
envelope and headers, with the built-in transport as the default.

**Rationale**: A fixed envelope forces every host to accept one destination's ingestion shape,
contradicting the host-owns-the-data goal for anyone whose endpoint expects something else.

**Actors**: `cpt-telemetry-actor-integrator`, `cpt-telemetry-actor-destination`

### 5.5 Extensibility

#### Plugin contract

- [x] `p1` - **ID**: `cpt-telemetry-fr-plugin-contract`

The SDK **MUST** let a host register plugins that contribute context fields to every record, emit
their own records, or both, on the same footing as the SDK's built-in signal groups.

**Rationale**: The signal set a host needs is never exactly the built-in one; extension is what keeps
that from becoming a fork.

**Actors**: `cpt-telemetry-actor-integrator`

#### Element-hook registry contract

- [x] `p1` - **ID**: `cpt-telemetry-fr-element-hook-contract`

The SDK **MUST** read markup-level element annotations through a published registry identifier whose
meaning evolves additively, so that mixed SDK versions on one page interpret the same annotation
identically.

**Rationale**: Independently-versioned units on one page will read each other's annotations; a
changed meaning under a stable identifier would silently corrupt whichever side is older.

**Actors**: `cpt-telemetry-actor-integrator`

#### Environment-safe import

- [x] `p1` - **ID**: `cpt-telemetry-fr-environment-safe-import`

Importing the package outside a browser **MUST** be safe: lifecycle calls are inert and collect
nothing rather than failing.

**Rationale**: Host applications are commonly server-rendered, and an import that throws there would
force every such host into conditional loading.

**Actors**: `cpt-telemetry-actor-integrator`

## 6. Non-Functional Requirements

### 6.1 NFRs

#### Passive, non-blocking capture

- [ ] `p1` - **ID**: `cpt-telemetry-nfr-passive-capture`

The SDK **MUST NOT** perceptibly affect the host application's responsiveness.

**Threshold**: A published per-interaction overhead budget and bundle-size budget, both verified in
CI; capture never interposes on the host's own event handling; no synchronous work on the main thread
beyond recording a queued entry. Concrete figures to be established at the first stable release.

**Rationale**: An observer that costs the observed user responsiveness fails its own premise, and an
unmeasured budget is not a budget.

#### Dependency isolation

- [x] `p1` - **ID**: `cpt-telemetry-nfr-dependency-isolation`

The SDK **MUST** remain embeddable in any web application regardless of its framework or library
choices.

**Threshold**: No imports of any other `@gears-frontx` package, no UI-framework imports, and a
runtime dependency count in the low single digits; enforced by lint and dependency rules rather than
convention.

**Rationale**: Every dependency the SDK adds is one the host must accept; isolation is what makes it
embeddable outside the ecosystem it was built in.

#### Privacy by default

- [ ] `p1` - **ID**: `cpt-telemetry-nfr-privacy-by-default`

The SDK **MUST** default to the least collection consistent with being useful, and its documented
guarantees **MUST** match its implemented behavior.

**Threshold**: Sensitive categories inactive until consented; raw media never transmitted or
persisted; every stored identifier and transmitted field documented; each documented guarantee
covered by a test that fails if behavior diverges.

**Rationale**: For a collection library the documentation is the interface a reviewer audits, so a
gap between claim and behavior is a defect rather than a wording problem.

#### Browser compatibility

- [ ] `p1` - **ID**: `cpt-telemetry-nfr-browser-compatibility`

The SDK **MUST** work across current evergreen browsers, with per-signal capability differences
determined rather than assumed.

**Threshold**: Verified on the current versions of the major engines; each signal's support stated
per browser; graceful degradation of an unsupported signal without loss of the rest.

**Rationale**: Capture APIs are exactly where browsers diverge most, and a signal silently absent on
one engine skews every comparison drawn from it.

#### Evolvability

- [x] `p1` - **ID**: `cpt-telemetry-nfr-evolvability`

The SDK **MUST** evolve through versioned releases without forcing hosts to upgrade in lockstep.

**Threshold**: Semantic-versioning discipline on the published surface; the element-hook registry
contract and the stored-identifier layout evolve additively, with a new identifier required for any
change of meaning; every removal preceded by a deprecation cycle of at least one minor version.

**Rationale**: Mixed versions coexist on one page and stored identifiers outlive the version that
wrote them, so additive evolution is a correctness constraint rather than a courtesy.

### 6.2 NFR Exclusions

- **Accessibility** and **Inclusivity** — Not applicable: the SDK ships no user-facing interface. The
  consent interface a host builds around it is the host's to make accessible.
- **Internationalization** — Not applicable: the SDK ships no user-facing text. It captures locale as
  a signal; it does not present anything.
- **Safety** — Not applicable as a safety-critical concern: the SDK observes browser interaction and
  does not control physical or safety-critical systems.
- **Regulatory Compliance** — **Partially applicable, and deliberately so.** The SDK provides
  mechanisms — consent gating, collection halt, redaction, suppression, on-device processing, and a
  complete statement of what is stored and transmitted. The deploying organization owns the posture
  built on them: lawful basis, controller and processor roles, retention, regional variation, and
  disclosure. Neither side's obligations are discharged by the other's.

## 7. Public Library Interfaces

### 7.1 Public API Surface

#### Telemetry SDK

- [x] `p1` - **ID**: `cpt-telemetry-interface-sdk`

**Type**: Library

**Stability**: unstable (pre-1.0)

**Description**: A browser library that creates a configured client, registers plugins, starts and
tears down capture, accepts host-asserted identity, and emits host-named events. One entry point,
published as both module formats with type declarations.

**Breaking Change Policy**: While pre-1.0, minor versions may break the surface, with each break
stated in the changelog. From 1.0, a major version bump is required for any incompatible change;
minor and patch versions preserve backward compatibility.

### 7.2 External Integration Contracts

#### Record ingestion

- [ ] `p1` - **ID**: `cpt-telemetry-contract-ingestion`

**Party**: `cpt-telemetry-actor-destination`

**Direction**: Outbound.

**Description**: Batched records delivered over HTTP to the host-configured destination, using a
delivery mode that survives page teardown.

**Compatibility commitment**: The request contract — envelope shape, headers, and batch semantics —
is versioned with the package. Until `cpt-telemetry-fr-pluggable-transport` lands, the built-in
envelope is the only one available, and any change to it is a breaking change to this contract.

#### Element-hook registry

- [x] `p1` - **ID**: `cpt-telemetry-contract-element-hook`

**Party**: `cpt-telemetry-actor-host-app`

**Direction**: Inbound (the SDK reads what the host writes onto its own elements).

**Description**: A published registry identifier under which a host annotates DOM elements to add
capture fields or suppress a subtree, readable by any SDK version present on the page.

**Compatibility commitment**: Field meanings, the suppression rule, and the merge rule evolve
additively under a given identifier; a change of meaning requires a new identifier. Host-reserved
and SDK-reserved key namespaces stay disjoint.

#### Local identifier storage

- [x] `p1` - **ID**: `cpt-telemetry-contract-local-storage`

**Party**: `cpt-telemetry-actor-browser`

**Direction**: Outbound (the SDK writes) and inbound (the SDK reads back on later visits).

**Description**: Browser-local keys, owned by the SDK and namespaced by an optional host-configured
prefix, holding the device identifier and the current session state.

**Compatibility commitment**: Key names and value layout are documented and evolve additively; a host
may remove a key to forget a device. Records written by an older version remain readable by a newer
one within a major line.

## 8. Use Cases

#### Integrator embeds the SDK in a host application

- [ ] `p1` - **ID**: `cpt-telemetry-usecase-embed`

**Actor**: `cpt-telemetry-actor-integrator`

**Preconditions**:
- A destination endpoint exists and accepts the ingestion contract (`cpt-telemetry-contract-ingestion`).
- The package is installed from the registry (`cpt-telemetry-actor-package-registry`).

**Main Flow**:
1. The integrator creates a client with application identity and the destination.
2. The integrator registers any additional plugins (`cpt-telemetry-fr-plugin-contract`).
3. The integrator starts the client, which activates the built-in signal groups
   (`cpt-telemetry-fr-session-lifecycle`, `cpt-telemetry-fr-device-context`,
   `cpt-telemetry-fr-navigation`, `cpt-telemetry-fr-autocapture`).
4. The host asserts a user identity when it has one (`cpt-telemetry-fr-host-identity`).
5. Records accumulate and are delivered in batches (`cpt-telemetry-fr-batched-delivery`).
6. On teardown the integrator destroys the client, which delivers what remains.

**Postconditions**:
- The destination receives session, device, navigation, and interaction records attributed to the
  host application.

**Alternative Flows**:
- **Destination unreachable**: capture continues and the batch is retried
  (`cpt-telemetry-fr-delivery-durability`).
- **Imported outside a browser**: lifecycle calls are inert and nothing is collected
  (`cpt-telemetry-fr-environment-safe-import`).

#### Observed user grants, then withdraws, consent for a sensitive category

- [ ] `p1` - **ID**: `cpt-telemetry-usecase-consent-withdrawal`

**Actor**: `cpt-telemetry-actor-observed-user`

**Preconditions**:
- The host presents a consent interface for the sensitive signal categories it wants.
- No consent has yet been granted, so no sensitive capture is active and no identifier has been
  written for it (`cpt-telemetry-fr-consent-gating`, `cpt-telemetry-fr-collection-halt`).

**Main Flow**:
1. The observed user grants consent for a category — micro-behavioral or media.
2. The host records the decision and the SDK activates that category's capture
   (`cpt-telemetry-fr-micro-behavioral`, `cpt-telemetry-fr-media-on-device`).
3. For media, capture and processing run on the device and only derived signals are delivered.
4. The observed user withdraws consent.
5. The SDK stops that category's capture immediately, without a page reload
   (`cpt-telemetry-fr-consent-gating`).

**Postconditions**:
- No further records for the withdrawn category; other categories unaffected; the withdrawal is
  auditable by the privacy reviewer.

**Alternative Flows**:
- **Consent declined outright**: no sensitive capture ever starts; the non-sensitive signal set
  continues to be useful on its own.
- **Browser permission denied for media**: the media category stays inactive and the rest of capture
  is unaffected (`cpt-telemetry-nfr-browser-compatibility`).

#### Integrator suppresses a subtree that renders personal data

- [ ] `p1` - **ID**: `cpt-telemetry-usecase-suppress-subtree`

**Actor**: `cpt-telemetry-actor-integrator`

**Preconditions**:
- Autocapture is active.
- The host has identified markup that renders personal data.

**Main Flow**:
1. The integrator annotates the subtree through the element-hook registry contract
   (`cpt-telemetry-contract-element-hook`, `cpt-telemetry-fr-markup-suppression`).
2. Autocapture drops events originating in that subtree, in addition to the capture-time redaction it
   already applies (`cpt-telemetry-fr-redaction`).

**Postconditions**:
- No record carries values from the suppressed subtree.

**Alternative Flows**:
- **Annotation missing on a page that needs it**: redaction still catches recognizable patterns, but
  the documented boundary of that safety net applies — the audit remains the host's.

#### Integrator adds an application-specific signal

- [ ] `p2` - **ID**: `cpt-telemetry-usecase-custom-plugin`

**Actor**: `cpt-telemetry-actor-integrator`

**Preconditions**:
- A client is created and not yet started.

**Main Flow**:
1. The integrator writes a plugin that contributes context fields, emits its own records, or both
   (`cpt-telemetry-fr-plugin-contract`).
2. The integrator registers it before starting the client.
3. The integrator emits host-named events where generic capture cannot see the meaning
   (`cpt-telemetry-fr-custom-events`).

**Postconditions**:
- Application-specific signals arrive at the destination with the same context enrichment as
  built-in ones.

**Alternative Flows**:
- **Registered after start**: the plugin is not set up; the SDK makes the ordering requirement
  explicit rather than failing silently.
- **Name collides with a built-in group**: the collision is reported rather than silently replacing
  the built-in.

## 9. Acceptance Criteria

- [ ] A host can integrate the SDK, receive the built-in signal set at a destination it controls, and
  extend it with its own plugin — verifiable via `cpt-telemetry-usecase-embed` and
  `cpt-telemetry-usecase-custom-plugin`.
- [ ] No sensitive signal category can capture, or cause an identifier write, before consent for that
  category is granted — verifiable via `cpt-telemetry-usecase-consent-withdrawal` and
  `cpt-telemetry-fr-consent-gating`.
- [ ] Every documented privacy guarantee is covered by a test that fails if behavior diverges —
  verifiable via `cpt-telemetry-nfr-privacy-by-default`.
- [ ] No raw media leaves the device in any media-category flow — verifiable via
  `cpt-telemetry-fr-media-on-device`.
- [ ] A failed delivery is retried and surfaced rather than dropped — verifiable via
  `cpt-telemetry-fr-delivery-durability`.
- [ ] Every stored identifier and every transmitted context field is documented, with its lifetime —
  verifiable via `cpt-telemetry-contract-local-storage`.
- [ ] The published surface contains no import of another `@gears-frontx` package and no UI-framework
  import, enforced
  by tooling — verifiable via `cpt-telemetry-nfr-dependency-isolation`.
- [ ] Overhead and bundle-size budgets are published and verified in CI — verifiable via
  `cpt-telemetry-nfr-passive-capture`.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| Browser runtime (`cpt-telemetry-actor-browser`) | Provides the capture, storage, identifier, and locale primitives the SDK observes through, and the permission prompts gating media access. | p1 |
| Destination endpoint (`cpt-telemetry-actor-destination`) | Host-operated HTTP endpoint receiving batched records under the ingestion contract. Required for delivery, not for capture. | p1 |
| npm-compatible package registry (`cpt-telemetry-actor-package-registry`) | Hosts the published package for installation by hosts. | p1 |
| Host application (`cpt-telemetry-actor-host-app`) | Embeds and configures the SDK, supplies identity, tenant, and attribution context, and owns its own consent interface and markup annotations. | p1 |
| Device and client detection | Classification of device, operating system, and client from browser-reported data; the SDK's one substantive runtime dependency. | p2 |

## 11. Assumptions

- Host applications run in current evergreen browsers with the capture primitives the SDK requires;
  no polyfills are bundled.
- Hosts operate, or can point at, a destination endpoint of their own; there is no product-provided
  default.
- Hosts own the consent interface presented to observed users; the SDK enforces the decision but does
  not render the request for it.
- Observed users may decline every optional category, and the SDK remains useful on the
  non-sensitive signal set alone.
- On-device processing capacity is sufficient for media-derived signals on the devices hosts target;
  where it is not, the category degrades rather than shifting work off the device.
- Independently-versioned units may run on one page, so markup annotations and stored identifiers are
  read by SDK versions other than the one that wrote them.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| A collection library with keystroke, mouse, webcam, microphone, and screen capture in scope reads as surveillance to a public audience. | Adoption resistance and reputational cost regardless of the implemented safeguards. | Lead the public documentation with the privacy model rather than the signal catalogue; keep sensitive categories inactive by default; make the on-device boundary and the collection halt testable claims; publish a threat model alongside the first stable release. |
| Documented guarantees drift from implemented behavior as capture grows. | A reviewer's audit rests on documentation; drift turns it into a false assurance and a compliance exposure for the deploying organization. | Cover each documented guarantee with a test that fails on divergence (`cpt-telemetry-nfr-privacy-by-default`); treat any gap as a defect, not a documentation task. |
| Per-signal browser variance is discovered late, after signals are already consumed downstream. | Silently absent signals on one engine skew every comparison drawn from the data. | Determine support per signal before it ships; state it per browser; degrade one signal without affecting the rest. |
| The built-in transport's fixed envelope constrains which destinations a host can realistically use. | The host-owns-the-data claim weakens for any host whose endpoint expects a different shape, narrowing adoption to those that accept one ingestion format. | Land `cpt-telemetry-fr-pluggable-transport` before the first stable release; keep the built-in transport a default rather than the only path. |
| Silent batch loss on delivery failure. | Downstream counts are unreliable precisely under poor networks and endpoint incidents, and the loss is invisible. | Land `cpt-telemetry-fr-delivery-durability` with retry and host-visible failure; treat delivery loss as a reportable condition. |
| A persistent pseudonymous device identifier is written independently of the host's consent flow. | An identifier correlating a browser across sessions may exist before the observed user has decided anything. | Land `cpt-telemetry-fr-collection-halt` so no identifier is written before consent; document the identifier, its lifetime, and how to forget it until then. |

## Open Questions

- [ ] **Default signal set** — which categories are active on a bare integration, and which a host
  opts into. Bears directly on the privacy-by-default NFR.
- [ ] **Controller and processor split** — how responsibilities divide between the SDK's publisher and
  the deploying organization, per tenant and in some cases per activity, since media may fall
  differently from ordinary signal collection.
- [ ] **Concrete overhead budget** — the per-interaction and bundle-size figures for
  `cpt-telemetry-nfr-passive-capture`, and how they are measured in CI.
- [ ] **Screen-content and application-switch detection feasibility** — browser limitations and
  on-device compute constraints make this an open feasibility question, not a committed capability.
- [ ] **Consent record format** — whether the SDK defines a portable shape for consent decisions or
  accepts whatever the host supplies. Auditability depends on the answer.
- [ ] **Retention and deletion reach** — what the SDK can offer for deletion beyond forgetting the
  local device identifier, given that transmitted records live at the host's destination.
