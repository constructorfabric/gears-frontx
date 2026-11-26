---
description: Product requirements for the telemetry package, a browser SDK that collects product events, adds consistent context and sends batches to a deployment-chosen collector endpoint.
---

# PRD - Telemetry SDK

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
  - [4.2 Out of Scope](#42-out-of-scope)
- [5. Functional Requirements](#5-functional-requirements)
  - [5.1 Client Lifecycle](#51-client-lifecycle)
  - [5.2 Event Collection And Delivery](#52-event-collection-and-delivery)
  - [5.3 Context Enrichment](#53-context-enrichment)
  - [5.4 Extension](#54-extension)
  - [5.5 Automatic Capture](#55-automatic-capture)
  - [5.6 Distribution](#56-distribution)
  - [5.7 Connectors](#57-connectors)
  - [5.8 Declared Events](#58-declared-events)
  - [5.9 Flows](#59-flows)
  - [5.10 Interaction And Error Events](#510-interaction-and-error-events)
  - [5.11 Microfrontend Reporting](#511-microfrontend-reporting)
  - [5.12 Consent And Identity](#512-consent-and-identity)
  - [5.13 Performance Measurement](#513-performance-measurement)
- [6. Non-Functional Requirements](#6-non-functional-requirements)
  - [6.1 NFR Inclusions](#61-nfr-inclusions)
  - [6.2 NFR Exclusions](#62-nfr-exclusions)
- [7. Public Library Interfaces](#7-public-library-interfaces)
  - [7.1 Public API Surface](#71-public-api-surface)
  - [7.2 External Integration Contracts](#72-external-integration-contracts)
- [8. Use Cases](#8-use-cases)
- [9. Acceptance Criteria](#9-acceptance-criteria)
- [10. Dependencies](#10-dependencies)
- [11. Assumptions](#11-assumptions)
- [12. Risks](#12-risks)

<!-- /toc -->

## 1. Overview

### 1.1 Purpose

`@gears-frontx/telemetry` is a browser telemetry SDK published as its own package. It helps an application collect product events, add consistent context, and send batches to a collector endpoint chosen by the deployment.

### 1.2 Background / Problem Statement

The SDK exists so applications do not each invent their own event naming, session rules, device identity and capture controls. It gives teams a small integration surface while keeping destination, consent and retention decisions outside the package.

### 1.3 Goals (Business Outcomes)

- An Application Developer can start collecting useful events with minimal setup.
- Event streams from different applications use consistent session, device, navigation and application context.
- A deployment controls where telemetry is sent.
- DOM interaction can be captured without per-element instrumentation.
- Applications can suppress capture for sensitive subtrees and extend attribution for their own components.
- The package evolves independently as a published-library member.
- A deployment can send telemetry to whichever analytics backend it chooses, through a connector the application supplies.
- A product team can see completion and drop-off for forms and multi-step flows without setting up each flow by hand.
- An application composed of independently delivered microfrontends reports telemetry from all of them through one place.

### 1.4 Glossary

| Term | Definition |
|------|------------|
| Client | The application-owned telemetry instance used to start collection, log events and tear down collection. |
| Record | One telemetry event with an event name, event data and SDK-added context. |
| Batch | A group of records sent together to the collector. |
| Session | A period of user activity represented by a session identifier. |
| Device id | A pseudonymous browser-profile identifier used to connect records across sessions. |
| Plugin | An extension that adds context or behavior the SDK cannot know by itself. |
| Autocapture | Recording DOM interaction without per-element event calls. |
| Element hook | Application code attached to a DOM subtree to contribute attribution or suppress capture. |
| Collector | The deployment-operated endpoint that receives batches. |
| Connector | Application-supplied code that delivers records to one analytics backend. The application writes it and the mapping it applies. |
| Mapping | The translation from the SDK's records to what a chosen analytics backend accepts, written by the application from that backend's documentation. |
| Flow | A user journey of one or more steps that the application describes once. A form is a one-step flow. |
| Attempt | One run through a flow by one user, identified by an attempt identity the SDK assigns. |
| Namespace | The short name a microfrontend declares for the events it owns. |
| Measurement | A performance reading with a name, a numeric value and a unit. |
| Consent | Whether the end user has allowed telemetry: unknown, granted or denied. The application asks, stores the answer and tells the system. |
| Telemetry state | Whether an application has telemetry at all, has it without a connector, or has it with a connector. |

## 2. Actors

### 2.1 Human Actors

#### Application Developer

**ID**: `cpt-frontx-telemetry-actor-application-developer`

**Role**: Integrates the SDK into an application — creates the client, configures the collector endpoint, starts collection at boot and tears it down, logs domain events, and writes plugins or element hooks for context the SDK cannot infer.
**Needs**: A surface small enough to adopt in one sitting, defaults that are safe when left alone, and explicit control over what is captured and where it is sent.

#### Application End User

**ID**: `cpt-frontx-telemetry-actor-end-user`

**Role**: Uses the instrumented application. Does not interact with the SDK directly; their interaction with the page is what autocapture records, and their browser is what holds the device and session identifiers.
**Needs**: That interaction with the application is not degraded by collection, and that data the application did not intend to collect is not collected.

#### Product Analyst

**ID**: `cpt-frontx-telemetry-actor-product-analyst`

**Role**: Reads the collected telemetry in the analytics backend the deployment chose, to see where users leave a form or a multi-step flow and how the application performs. Does not write application code.
**Needs**: Flow records that can be turned into a funnel without per-flow setup, the same event names wherever a flow runs, and a list of the events the application records.

### 2.2 System Actors

#### Collector Endpoint

**ID**: `cpt-frontx-telemetry-actor-collector`

**Role**: Receives batches over HTTP POST and is responsible for storage, querying and retention. Operated by the deployment. The SDK treats it as opaque and holds no expectation about it beyond accepting the request.

#### Browser Runtime

**ID**: `cpt-frontx-telemetry-actor-browser-runtime`

**Role**: Supplies the capabilities the SDK is built on — `document` and its event system, `localStorage`, `fetch` with `keepalive`, `crypto.randomUUID`, `Intl.Locale`, and the History API events the navigation plugin observes.

#### Analytics Backend

**ID**: `cpt-frontx-telemetry-actor-analytics-backend`

**Role**: Whichever analytics or monitoring service the deployment chooses. It receives records through a connector the application supplies. The SDK knows nothing about it: which service it is, what it accepts and how records are mapped to it are the application's decisions.

#### Shell Application

**ID**: `cpt-frontx-telemetry-actor-shell`

**Role**: The host application that composes microfrontends. It owns the telemetry client, its connectors, and the consent and identity state for the whole application.

#### Microfrontend

**ID**: `cpt-frontx-telemetry-actor-microfrontend`

**Role**: An independently developed and delivered part of the application, loaded by the shell at runtime. It reports what happens inside it to the shell's telemetry and holds no connector of its own.

## 3. Operational Concept & Environment

The SDK runs in a browser application. It must remain safe to import in server-side rendering contexts, but active collection requires browser capabilities.

The package ships as a library. It does not host a collector, operate a dashboard, make consent decisions, or bind itself to an application framework.

### 3.1 Module-Specific Environment Constraints

- A browser environment is required for active collection.
- Server-side imports and lifecycle calls must not throw.
- The package must be publishable as a standalone dependency with type declarations.

## 4. Scope

### 4.1 In Scope

- Client lifecycle for starting, stopping and logging events.
- Product event collection and batched delivery to a configured collector.
- Session continuity and pseudonymous device identity.
- Built-in context enrichment for application, navigation, browser, locale and session context.
- Plugin registration for application-owned context.
- DOM interaction autocapture.
- Subtree opt-out, element attribution and pattern-based redaction.
- Independent package publication.
- Delivery through application-supplied connectors to an analytics backend the application chooses.
- An application-declared event catalog with a namespace per microfrontend.
- Flow events for forms and multi-step flows, from which funnels can be built.
- Dialog, key-action and minimal error events.
- Reporting from microfrontends through the shell's telemetry.
- A consent gate driven by the decision the application supplies.
- Performance measurement that an application turns on explicitly.

### 4.2 Out of Scope

- Collector storage, querying, dashboards and retention.
- Consent decisions or consent persistence.
- Guaranteed delivery, offline queueing or retry policy.
- Error monitoring beyond recording that an error occurred: messages, stack traces and grouping. Tracing.
- Framework-specific application wiring.
- Server-side collection.
- Any specific analytics backend, its client, or a mapping to it.
- Rating measurements, thresholds, alerting or dashboards.
- Funnel definitions and reports inside an analytics backend.
- Detecting that a user abandoned a flow.
- Form, wizard or step user interface, and navigation between steps.

## 5. Functional Requirements

### 5.1 Client Lifecycle

#### Client creation and configuration

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-client-creation`

The system **MUST** let an application create a telemetry client with application identity and sensible defaults, and **MUST** remain safe when imported or called without a browser runtime.

**Rationale**: Adoption should not require a custom instrumentation framework, and server rendering should not need defensive imports.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

#### Single-use client lifecycle

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-client-lifecycle`

The system **MUST** start collection only when requested, **MUST** prevent duplicate starts on the same client, and **MUST** tear down owned collection resources when the application is finished with the client.

**Rationale**: Duplicate collection silently corrupts event counts, while incomplete teardown leaves listeners and queued records behind.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

### 5.2 Event Collection And Delivery

#### Custom event logging

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-custom-events`

The system **MUST** let a caller record a named event with optional data, and **MUST** assign event identity and trigger timing itself.

**Rationale**: Application code owns event meaning, but the SDK must own identity and timing so records stay comparable.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

#### Batched delivery

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-batched-delivery`

The system **MUST** collect records in memory and send them to the collector in batches, including when the page lifecycle indicates that pending records should be flushed.

**Rationale**: Batching reduces request volume while still protecting recent records when a page is about to stop running.

**Actors**: `cpt-frontx-telemetry-actor-collector`

#### Configurable collector endpoint

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-collector-endpoint`

The system **MUST** send telemetry only to the collector destination selected by application configuration, and **MUST** identify the batch format a collector receives. This restriction governs the shipped collector delivery, which goes to no other destination; delivery through connectors the application supplies (`cpt-frontx-telemetry-fr-connectors`) is outside it.

**Rationale**: Deployments may be private, on-premise or air-gapped, so the destination cannot be built into the SDK.

**Actors**: `cpt-frontx-telemetry-actor-collector`

#### Collection without delivery

- [x] `p2` - **ID**: `cpt-frontx-telemetry-fr-delivery-disable`

The system **MUST** offer a mode that suppresses delivery while preserving normal collection behavior, and **MUST** describe that mode as delivery suppression rather than collection suppression.

**Rationale**: Development and consent-gated deployments need a no-send mode, but teams must not mistake it for a privacy off switch.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

### 5.3 Context Enrichment

#### Session continuity

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-session-continuity`

The system **MUST** maintain a session identity across page activity and replace it after a configurable inactivity window.

**Rationale**: Product analysis usually asks questions by session, and sessions must survive ordinary navigation.

**Actors**: `cpt-frontx-telemetry-actor-end-user`

#### Persistent device identity

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-device-identity`

The system **MUST** maintain a pseudonymous device identity per configured storage scope and attach it to records.

**Rationale**: Return-visit analysis needs continuity across sessions without requiring a signed-in user.

**Actors**: `cpt-frontx-telemetry-actor-end-user`

#### Built-in context enrichment

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-builtin-context`

The system **MUST** enrich records with common application, session, device, browser, viewport, timezone, locale and navigation context, and **MAY** let an application switch off an enrichment whose signal it already owns.

**Rationale**: Events are useful only when consumers can relate them to the application state and user context around them.

**Actors**: `cpt-frontx-telemetry-actor-end-user`

#### Locale normalization from an application source

- [x] `p2` - **ID**: `cpt-frontx-telemetry-fr-locale-source`

The system **MUST** allow an application-supplied locale source to override the browser fallback for record context.

**Rationale**: The browser language is not always the application's active language.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

### 5.4 Extension

#### Plugin registration

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-plugin-registration`

The system **MUST** let applications register named plugins that add context or behavior during collection.

**Rationale**: No fixed SDK can know every deployment's tenant, account, feature flag, user or domain context.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

#### Element-level attribution

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-element-attribution`

The system **MUST** let application components contribute attribution or suppress autocapture for interaction inside their DOM subtree.

**Rationale**: In composed applications, the component often knows ownership and context better than the page shell.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

### 5.5 Automatic Capture

#### DOM interaction autocapture

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-dom-autocapture`

The system **MUST** capture common DOM interaction without requiring application code at every element.

**Rationale**: Manual interaction instrumentation is expensive and usually incomplete.

**Actors**: `cpt-frontx-telemetry-actor-end-user`

#### Capture opt-out

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-capture-opt-out`

The system **MUST** let an application suppress autocapture for a DOM subtree.

**Rationale**: Applications need an authoritative way to exclude sensitive or irrelevant regions without changing SDK internals.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

#### Sensitive-value redaction

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-redaction`

The system **MUST** reduce accidental sensitive-data capture through default suppression and redaction behavior, and **MUST** present that behavior as a safety net rather than a compliance guarantee.

**Rationale**: Pattern-based protection helps, but only application-owned controls can decide all privacy-sensitive cases.

**Actors**: `cpt-frontx-telemetry-actor-end-user`

### 5.6 Distribution

#### Independent publication

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-independent-publication`

The system **MUST** be published as an independent package with its own version line and required distribution notices.

**Rationale**: Telemetry fixes and improvements should not force unrelated ecosystem upgrades.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

### 5.7 Connectors

#### Application-supplied connectors

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-connectors`

The system **MUST** let an application supply one or more connectors, and **MUST** hand every record to every connector. Each record **MUST** carry the time it was produced, so that a backend can order records whatever order they arrive in. Delivery through a connector is best effort.

**Rationale**: The deployment chooses its analytics backend; the SDK should not have to know which one.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`, `cpt-frontx-telemetry-actor-analytics-backend`

#### Backend-agnostic mapping

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-connector-mapping`

The system **MUST** give a connector the SDK's typed signals - events, measurements, identity changes, consent changes, and requests to flush and to shut down - and **MUST** leave the mapping to a backend entirely to the application. The system **MUST NOT** contain knowledge of any specific analytics backend.

**Rationale**: A mapping written by the application from its backend's own documentation stays correct when that backend changes; one built into the SDK would not.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`, `cpt-frontx-telemetry-actor-analytics-backend`

#### Telemetry states

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-telemetry-states`

An application **MUST** be in exactly one of three telemetry states: no telemetry, in which nothing is captured; telemetry without a connector, in which nothing is sent; and telemetry with a connector, in which records are delivered through it. In the state without a connector, a production build **MUST** capture nothing, and a development build **MUST** show records locally together with a notice that no connector is configured. Until the shipped collector delivery is retired under the decision record on declared capture and connector delivery ([ADR/0001](./ADR/0001-declared-capture-connector-delivery.md)), the collector counts as a configured connector for these states and for nothing else, and the shipped delivery-suppression mode (`cpt-frontx-telemetry-fr-delivery-disable`) stays outside them: an application in that mode keeps collecting and sends nothing, as shipped.

**Rationale**: A team must be able to tell at a glance whether telemetry is absent, present but going nowhere, or live.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`, `cpt-frontx-telemetry-actor-shell`

#### Development visibility

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-dev-visibility`

In a development build the system **MUST** make every record visible locally and readable by tests. This capability **MUST** be absent from a production build.

**Rationale**: Instrumentation that cannot be observed while it is being written breaks without anyone noticing.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

### 5.8 Declared Events

#### Declared events

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-declared-events`

The system **MUST** let an application declare the events it records and the shape of their data, so that recording an undeclared event or mismatched data is reported before the application runs. Recording without a declaration keeps working.

**Rationale**: Event names and data are a contract with whoever reads the analytics; an error in them should fail a build, not a report.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

#### Microfrontend namespace

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-event-namespace`

Each microfrontend **MUST** declare one namespace, and the first segment of the name of every event it declares **MUST** be exactly that namespace. Two microfrontends composed in one application **MUST NOT** declare the same namespace. Events the SDK defines **MUST** use names an application cannot declare.

**Rationale**: Teams that build microfrontends separately must not collide on event names, and an analyst must be able to tell whose event it is from its name.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`, `cpt-frontx-telemetry-actor-microfrontend`, `cpt-frontx-telemetry-actor-product-analyst`

#### Event inventory

- [ ] `p3` - **ID**: `cpt-frontx-telemetry-fr-event-inventory`

The system **MUST** make the declared events and their data shapes available as a machine-readable list.

**Rationale**: Analysts and reviewers need to see what an application records, and what changed between releases, without reading its source.

**Actors**: `cpt-frontx-telemetry-actor-product-analyst`

### 5.9 Flows

#### Flow declaration

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-flow-declaration`

The system **MUST** let an application describe a flow once, with a stable identity and an ordered list of steps. A form **MUST** be describable as a one-step flow. The system **MUST** only observe a flow; presenting steps and moving between them remain the application's.

**Rationale**: One vocabulary for forms and wizards gives one kind of funnel, however the flow is built.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

#### Flow events

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-flow-events`

For a declared flow the system **MUST** record: flow started, step viewed, step validation failed, step failed, step completed, step went back, flow completed and flow discarded. Each **MUST** identify the flow, the step, the step's position, the number of steps, and an attempt identity the system assigns when the flow starts. Step completed and flow completed **MUST** carry the time spent. Step validation failed **MUST** identify the field and the kind of failure, and **MUST NOT** carry the entered value or the message shown.

**Rationale**: A funnel can be built only when the events of one attempt can be told apart and ordered; validation messages often repeat what the user typed.

**Actors**: `cpt-frontx-telemetry-actor-product-analyst`, `cpt-frontx-telemetry-actor-end-user`

#### No abandonment event

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-no-abandonment-event`

The system **MUST NOT** record that a flow was abandoned. Flow discarded **MUST** be recorded only when the user explicitly cancels.

**Rationale**: Leaving cannot be observed reliably: a hidden page may return, and a closed one reports nothing. An attempt that starts and never completes is read as abandoned where the data is analysed.

**Actors**: `cpt-frontx-telemetry-actor-product-analyst`, `cpt-frontx-telemetry-actor-end-user`

#### One set of flow event names

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-uniform-flow-events`

Flow events **MUST** carry the same names wherever the flow runs, including inside a microfrontend.

**Rationale**: An analyst builds one funnel report for the application, not one per microfrontend.

**Actors**: `cpt-frontx-telemetry-actor-product-analyst`, `cpt-frontx-telemetry-actor-microfrontend`

### 5.10 Interaction And Error Events

#### Dialog events

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-dialog-events`

The system **MUST** let an application record that a dialog was opened and that it was closed.

**Rationale**: Closing a dialog is a deliberate user action and is recorded as such, separately from flow progress.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`, `cpt-frontx-telemetry-actor-product-analyst`

#### Key-action events

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-action-events`

The system **MUST** let an application record a primary or destructive action under a stable identity the developer assigns. The visible label **MUST NOT** serve as that identity.

**Rationale**: Key actions must stay comparable across copy changes and translations.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`, `cpt-frontx-telemetry-actor-product-analyst`

#### List and tab events

- [ ] `p3` - **ID**: `cpt-frontx-telemetry-fr-list-tab-events`

The system **MUST** let an application record a search by the length of its query only, a filter or sort being applied, a page change in a list, and a tab switch. Using these is optional.

**Rationale**: They complete the interaction vocabulary for teams that want it, without making every list and tab mandatory to instrument.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

#### Error events

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-error-events`

When the application supplies at least one connector, the system **MUST** record unhandled errors and unhandled promise rejections without application code. An application that delivers only through the shipped collector gets no such records, so what it sends does not change. The system **MUST** let application code report an error it caught. An error event **MUST** carry the kind of error only, and **MUST NOT** carry its message or stack trace.

**Rationale**: Knowing that a flow stopped because of an error explains a drop-off. Errors caught by a UI framework can be reported only by code that uses that framework, which is outside this package.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`, `cpt-frontx-telemetry-actor-end-user`

### 5.11 Microfrontend Reporting

#### Reporting through the shell

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-mfe-reporting`

Records produced inside a microfrontend **MUST** be delivered through the shell's connectors, under the shell's consent and identity state. A microfrontend **MUST NOT** hold a connector or a backend client.

**Rationale**: Flows and forms live in microfrontends; one place for connectors, consent and identity keeps them consistent across the application.

**Actors**: `cpt-frontx-telemetry-actor-microfrontend`, `cpt-frontx-telemetry-actor-shell`

#### What a microfrontend may report

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-mfe-report-scope`

A microfrontend **MUST** be able to report flow progress, dialog, key-action and error events, and the events it declared. It **MUST NOT** be able to produce any other record the SDK defines, identify or reset the user, or change consent.

**Rationale**: Session, navigation, identity and consent belong to the application as a whole, not to one of its parts.

**Actors**: `cpt-frontx-telemetry-actor-microfrontend`, `cpt-frontx-telemetry-actor-shell`

#### Declared attribution

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-mfe-declared-attribution`

Every record a microfrontend reports **MUST** carry the namespace that microfrontend declared, and the system **MUST** present that attribution as declared by the microfrontend, not as verified.

**Rationale**: Per-microfrontend analysis needs attribution from the first release, and its limits must be visible to whoever relies on it.

**Actors**: `cpt-frontx-telemetry-actor-microfrontend`, `cpt-frontx-telemetry-actor-product-analyst`

#### Verified attribution

- [ ] `p2` - **ID**: `cpt-frontx-telemetry-fr-mfe-verified-attribution`

The system **MUST** attribute a reported record to the microfrontend of the extension admitted into the shell through which the record arrived, as the runtime identifies it, independently of what any microfrontend supplied. A record produced by a microfrontend nested inside another **MUST** keep the namespace that nested microfrontend declared, presented as declared (`cpt-frontx-telemetry-fr-mfe-declared-attribution`), beside the verified attribution of the outer one. The system **MUST NOT** present as verified an identity the runtime did not establish.

**Rationale**: A microfrontend built by another team or supplier must not be able to label its records as someone else's. This needs the runtime to tell the shell who is sending, and the runtime establishes that at the shell's boundary only: for a microfrontend nested inside another it identifies the outer one.

**Actors**: `cpt-frontx-telemetry-actor-shell`, `cpt-frontx-telemetry-actor-product-analyst`

#### No loss on removal

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-mfe-no-loss-on-removal`

Records a microfrontend produced before it was removed from the page **MUST NOT** be lost because of the removal.

**Rationale**: The last events of a flow are often produced at the moment its microfrontend goes away.

**Actors**: `cpt-frontx-telemetry-actor-microfrontend`, `cpt-frontx-telemetry-actor-product-analyst`

### 5.12 Consent And Identity

#### Consent gate

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-consent-gate`

The system **MUST** gate what connectors receive by the end user's consent. The application asks for consent, stores the answer and tells the system: the state is unknown, granted or denied, and it applies to every part of the application alike. The application **MUST** be able to configure that a state it has not set counts as granted; without that configuration the state is unknown. Every rule here and in `cpt-frontx-telemetry-fr-identity-consent` reads the effective state after that configuration is applied, so an application that configures it has no unknown state: nothing waits for an answer, and records and identity are passed at once. A connector **MUST** receive a record only while consent is granted. Records produced while consent is unknown **MUST** reach connectors if consent is then granted, up to a limit fixed in DESIGN, and **MUST NOT** reach any connector if it is denied; the application **MUST** be able to turn this off, so that nothing produced before an answer is kept. A consent change **MUST** take effect at once and **MUST** be passed to connectors. A microfrontend **MUST NOT** be able to change consent. The gate applies to connectors the application supplies; it does not apply to the shipped collector delivery, which the application keeps gating by when it starts the system until that delivery is retired under [ADR/0001](./ADR/0001-declared-capture-connector-delivery.md).

**Rationale**: No telemetry may be collected from an end user who has not allowed it, in any part of the application, and an application should not lose what happened before the user answered. Asking and remembering are the product's; the system only acts on the answer.

**Actors**: `cpt-frontx-telemetry-actor-end-user`, `cpt-frontx-telemetry-actor-application-developer`, `cpt-frontx-telemetry-actor-shell`

#### Identity under consent

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-fr-identity-consent`

Identifying the user **MUST** follow the effective consent state (`cpt-frontx-telemetry-fr-consent-gate`): an identity the application supplies **MUST NOT** reach a connector while consent is unknown, **MUST** be passed to connectors when it is granted, and **MUST** be dropped when it is denied. This applies to connectors the application supplies and leaves the shipped collector delivery unchanged until it is retired.

**Rationale**: A user identifier must not reach an analytics backend before the user has allowed telemetry.

**Actors**: `cpt-frontx-telemetry-actor-end-user`, `cpt-frontx-telemetry-actor-application-developer`

### 5.13 Performance Measurement

#### Opt-in performance capture

- [ ] `p2` - **ID**: `cpt-frontx-telemetry-fr-performance-opt-in`

The system **MUST** offer performance measurement as capture an application turns on explicitly, and **MUST** do no measurement work while it is off.

**Rationale**: Performance data has its own cost, so collecting it is the application's decision.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

#### Page performance

- [ ] `p2` - **ID**: `cpt-frontx-telemetry-fr-page-performance`

When performance capture is on, the system **MUST** record the page's loading, responsiveness and visual-stability measurements, and the duration of navigation inside the application.

**Rationale**: These are the measurements teams already compare against public benchmarks, plus the in-application navigation those benchmarks do not cover.

**Actors**: `cpt-frontx-telemetry-actor-end-user`, `cpt-frontx-telemetry-actor-product-analyst`

#### Reported part timing

- [ ] `p2` - **ID**: `cpt-frontx-telemetry-fr-part-timing`

The system **MUST** let an application record how long an independently delivered part took to load and to become usable, attributed to that part.

**Rationale**: In a composed application a duration attributed to one part is actionable; a slow page is not. The package can accept such a timing but cannot observe a part loading.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`, `cpt-frontx-telemetry-actor-product-analyst`

#### Raw measurements

- [ ] `p2` - **ID**: `cpt-frontx-telemetry-fr-raw-measurements`

The system **MUST** record measurements as raw values with their units, and **MUST NOT** rate them or compare them with thresholds.

**Rationale**: What counts as good depends on the application and its history; that judgement belongs where the history is kept.

**Actors**: `cpt-frontx-telemetry-actor-product-analyst`

#### Measurement sampling

- [ ] `p3` - **ID**: `cpt-frontx-telemetry-fr-measurement-sampling`

The system **MUST** let an application limit performance measurement to a share of sessions, applied to a session as a whole.

**Rationale**: Analytics backends charge or cap by volume; sampling whole sessions keeps one session's measurements complete.

**Actors**: `cpt-frontx-telemetry-actor-application-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

#### Standalone Package Boundary

- [x] `p1` - **ID**: `cpt-frontx-telemetry-nfr-standalone`

The system **MUST** remain independent from other FrontX packages, UI frameworks and template territory.

**Threshold**: Zero imports from those sources in published code.

**Rationale**: A telemetry SDK should be usable by applications that consume none of the rest of the ecosystem.

#### Dependency Minimalism

- [x] `p2` - **ID**: `cpt-frontx-telemetry-nfr-dependency-minimalism`

The system **MUST** keep runtime dependencies minimal.

**Threshold**: At most one third-party runtime dependency without a reviewed requirement change.

**Rationale**: Every dependency increases consumer bundle and supply-chain review cost.

#### Element-Hook Forward Compatibility

- [x] `p1` - **ID**: `cpt-frontx-telemetry-nfr-hook-compatibility`

The system **MUST** evolve element-hook behavior additively when independently deployed code may read and write the same contract.

**Threshold**: No semantic reinterpretation of existing element-hook fields or suppression behavior.

**Rationale**: Mixed SDK versions can run on one page, so a changed meaning can corrupt data silently.

#### Server-Import Safety

- [x] `p2` - **ID**: `cpt-frontx-telemetry-nfr-server-import-safety`

The system **MUST NOT** throw when imported or called in an environment without browser globals.

**Threshold**: Import and lifecycle calls complete without error in server-side rendering contexts.

**Rationale**: Applications should not need special import paths only to avoid telemetry startup.

#### Connector Failure Isolation

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-nfr-connector-isolation`

A connector that fails, stalls or is blocked by the browser **MUST NOT** affect the application or what other connectors receive.

**Threshold**: Zero application errors, and zero records withheld from other connectors, when one connector fails on every call.

**Rationale**: Analytics hosts are commonly blocked in end users' browsers; that must never break the product.

#### Non-Blocking Emission

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-nfr-non-blocking-emission`

Recording an event or a measurement **MUST NOT** throw into application code, **MUST NOT** return anything application code can wait on, and **MUST NOT** hold more than a bounded number of undelivered records in memory. Two shipped behaviours are exceptions until they are retired under [ADR/0001](./ADR/0001-declared-capture-connector-delivery.md): the shipped recording call rethrows an error thrown by a plugin's event hook, and the shipped collector queue has no bound.

**Threshold**: Outside the two exceptions, zero exceptions reach application code from recording; the memory bound is fixed in DESIGN from measurement.

**Rationale**: Recording sits on clicks, submits and navigation; it must not change application behaviour or grow without limit.

#### No Cost For Unused Telemetry

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-nfr-unused-cost`

A shell that has no telemetry **MUST NOT** carry capture, connector or measurement code. The part a microfrontend carries in order to report **MUST** stay small, and in a shell without telemetry it **MUST** send nothing and print nothing.

**Threshold**: Zero telemetry capture code in the bundle of a shell that does not include it; zero requests and zero console output from an instrumented microfrontend in a shell without telemetry. The size limit of the microfrontend part is fixed in DESIGN from measurement.

**Rationale**: A microfrontend is built separately and cannot know what its shell will decide, so what it carries must be cheap and silent.

### 6.2 NFR Exclusions

- Delivery success has no guarantee in this scope.
- Collector availability and retention are collector responsibilities.
- Regulatory compliance is an application and deployment responsibility.

## 7. Public Library Interfaces

### 7.1 Public API Surface

#### Client Factory And Service

- [x] `p1` - **ID**: `cpt-frontx-telemetry-interface-client`

**Type**: Public TypeScript library surface.

**Description**: The application-facing surface for creating and operating a telemetry client.

**Breaking Change Policy**: Major version bump after the surface stabilizes.

#### Plugin Contract

- [x] `p1` - **ID**: `cpt-frontx-telemetry-interface-plugin`

**Type**: Public TypeScript extension contract.

**Description**: The application-facing surface for adding context the SDK cannot infer.

**Breaking Change Policy**: Additive within a stable major version.

#### Element Hook Contract

- [x] `p1` - **ID**: `cpt-frontx-telemetry-interface-element-hook`

**Type**: Public DOM integration contract.

**Description**: The surface by which an element subtree contributes attribution or suppresses autocapture.

**Breaking Change Policy**: Additive only for the existing contract identity.

#### Connector Contract

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-interface-connector`

**Type**: Public TypeScript extension contract.

**Description**: The application-facing surface for supplying a connector: what it is given and when.

**Breaking Change Policy**: Additive within a stable major version.

### 7.2 External Integration Contracts

#### Event Batch Envelope

- [x] `p1` - **ID**: `cpt-frontx-telemetry-contract-batch-envelope`

**Direction**: provided by library

**Description**: The collector-facing event batch format selected by application configuration.

**Compatibility**: A collector should receive only the format version the application selected.

#### Locale Source

- [x] `p2` - **ID**: `cpt-frontx-telemetry-contract-locale-source`

**Direction**: required from client

**Description**: The application-owned source of the current locale, when browser language is not authoritative.

**Compatibility**: The source may change during a session.

## 8. Use Cases

#### Instrument An Application

- [x] `p1` - **ID**: `cpt-frontx-telemetry-usecase-instrument-application`

**Actor**: `cpt-frontx-telemetry-actor-application-developer`

**Preconditions**:
- The application knows its name and version.
- A collector destination is available if delivery is enabled.

**Main Flow**:
1. The developer creates a telemetry client.
2. The developer registers any application plugins.
3. The developer starts collection when the application is ready.
4. The developer logs domain events.
5. The SDK enriches records, batches them and delivers them when delivery is enabled.
6. The developer tears down the client when the application no longer needs it.

**Postconditions**:
- The collector receives enriched records when delivery is enabled.
- The client releases collection resources when torn down.

#### Attribute A Component's Events

- [x] `p2` - **ID**: `cpt-frontx-telemetry-usecase-attribute-component`

**Actor**: `cpt-frontx-telemetry-actor-application-developer`

**Preconditions**:
- Autocapture is enabled.
- A component has ownership or context that should appear on captured records.

**Main Flow**:
1. The developer attaches an element hook to the component subtree.
2. An end user interacts inside that subtree.
3. The SDK captures the interaction when it is allowed.
4. The captured record carries attribution or suppression according to the hook.

**Postconditions**:
- Component-owned interaction is either attributed correctly or intentionally not captured.

#### Connect An Analytics Backend

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-usecase-connect-backend`

**Actor**: `cpt-frontx-telemetry-actor-application-developer`

**Preconditions**:
- The deployment has chosen an analytics backend.
- The application has telemetry and no connector.

**Main Flow**:
1. The developer runs the application in development and sees records shown locally with a notice that no connector is configured.
2. The developer writes a connector and its mapping from the backend's documentation.
3. The developer supplies the connector to the telemetry client and connects the application's consent choice to the consent gate.
4. Records reach the backend once the end user has granted consent.

**Postconditions**:
- The application is in the state with a connector, and nothing in the SDK names the backend.

**Alternative Flows**:
- **Consent is not granted**: the connector receives nothing.
- **The backend is blocked in the end user's browser**: the application and other connectors are unaffected.

#### Measure A Flow

- [ ] `p1` - **ID**: `cpt-frontx-telemetry-usecase-measure-flow`

**Actor**: `cpt-frontx-telemetry-actor-product-analyst`

**Preconditions**:
- A microfrontend describes a flow and reports progress through it.
- A connector delivers records to a backend the Product Analyst can query.

**Main Flow**:
1. End users go through the flow; some complete it, some discard it, some simply leave.
2. The SDK records each attempt's flow events under the same names as everywhere else in the application.
3. The Product Analyst selects the flow's events in the backend and builds a funnel.

**Postconditions**:
- Completion, explicit discards and time spent per step are visible; attempts with no completion are read as abandoned.

**Alternative Flows**:
- **A step is skipped or revisited**: the records show the path actually taken.
- **The microfrontend is removed mid-flow**: the events it produced before removal are still delivered.

## 9. Acceptance Criteria

- [x] An application can create a client, start it, log an event and see an enriched record reach the configured collector.
- [x] Event identity and trigger timing are SDK-owned.
- [x] Queued records are delivered in batches and flushed at important page lifecycle points.
- [x] Session identity survives ordinary navigation and is replaced after inactivity.
- [x] Device identity is stable for the configured browser storage scope.
- [x] Autocapture records common DOM interaction without per-element instrumentation.
- [x] A subtree opt-out suppresses capture for that subtree.
- [x] Pattern-based redaction reduces accidental sensitive-value capture.
- [x] Element attribution works across independently loaded SDK copies.
- [x] Published code contains no ecosystem, UI-framework or template-territory imports.
- [x] Server-side import and lifecycle calls complete without error.
- [x] The package distribution contains required library files, license and notice.
- [ ] An application with telemetry and no connector sends nothing; in development it shows records locally with a notice that no connector is configured.
- [ ] An application-supplied connector receives every record, each carrying the time it was produced, and a connector that fails on every call causes no application error and withholds nothing from other connectors.
- [ ] Nothing in the published package names an analytics backend.
- [ ] A form and a multi-step flow each produce the same eight flow events, from which a funnel can be built; no abandonment event is produced.
- [ ] A step validation failure carries no entered value and no message text.
- [ ] Flow events reported by a microfrontend carry the same names as flow events from the shell and the namespace that microfrontend declared.
- [ ] A connector receives no record and no user identity while consent is not granted.
- [ ] An instrumented microfrontend sends nothing and prints nothing in a shell without telemetry.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| Browser runtime | Supplies active collection, storage, DOM observation and delivery capabilities. | p1 |
| Collector endpoint | Receives event batches. | p1 |
| User-agent parser | Supports device and browser context. | p2 |
| Application locale source | Supplies application-selected locale when configured. | p3 |
| Microfrontend runtime | Must tell the shell which microfrontend is sending, for verified attribution. | p2 |
| Page performance measurement | Browser capability, and possibly a measurement library, used only when performance capture is on. A library would be a second runtime dependency and needs the review `cpt-frontx-telemetry-nfr-dependency-minimalism` requires. | p2 |

## 11. Assumptions

- The application controls consent and starts the SDK only when collection is allowed.
- The collector accepts the selected batch contract.
- Browser storage may be unavailable; persistent identity then degrades.
- Element hooks are written by deployment-owned code but are treated as untrusted at runtime.
- The runtime's existing host-microfrontend communication can carry telemetry records; a spike on the shipped runtime showed it does.
- Code that uses a UI framework, such as an error boundary or a form binding, lives outside this package and calls into it.
- One client records a flow from start to end; a journey that continues in another microfrontend is recorded as separate flows.
- The mapping to an analytics backend, and anything that backend's own client collects by itself, are the application's responsibility.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Delivery can fail after a batch leaves the queue. | Some records can be lost without application recovery. | Document the limitation and treat reliable transport as future scope. |
| Delivery suppression is mistaken for collection suppression. | A deployment may store identifiers it did not intend to create. | State that the flag suppresses delivery only and consent should gate start. |
| Redaction is pattern-based. | Sensitive data outside known patterns may be captured. | Present redaction as a safety net and provide subtree opt-out and hook suppression. |
| A plugin registered too late may not enrich records. | Application context can be missing. | Document plugin registration order and keep start behavior explicit. |
| Attribution is declared, not verified, until the runtime supplies sender identity. | A microfrontend can label its records as another's. | State the limit wherever attribution is offered; verified attribution is a separate requirement that depends on the runtime. |
| A backend's own client collects data the SDK does not control. | Data the application did not intend reaches the backend despite the consent gate. | The consent gate covers what the SDK hands to a connector; the connection guide tells developers to start the backend's client switched off and review what it collects. |
| Shipped behaviour and the declared-capture model coexist for a time. | Two ways to record and deliver exist side by side. | Each shipped behaviour is retired in the same change that delivers its replacement, as recorded in the decision record. |
| Performance capture needs a second runtime dependency. | Bundle and supply-chain review cost grows. | Keep it opt-in, load it only when on, and review it under the dependency requirement. |
