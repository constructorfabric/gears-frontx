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

### 2.2 System Actors

#### Collector Endpoint

**ID**: `cpt-frontx-telemetry-actor-collector`

**Role**: Receives batches over HTTP POST and is responsible for storage, querying and retention. Operated by the deployment. The SDK treats it as opaque and holds no expectation about it beyond accepting the request.

#### Browser Runtime

**ID**: `cpt-frontx-telemetry-actor-browser-runtime`

**Role**: Supplies the capabilities the SDK is built on — `document` and its event system, `localStorage`, `fetch` with `keepalive`, `crypto.randomUUID`, `Intl.Locale`, and the History API events the navigation plugin observes.

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

### 4.2 Out of Scope

- Collector storage, querying, dashboards and retention.
- Consent decisions or consent persistence.
- Guaranteed delivery, offline queueing or retry policy.
- Error monitoring, performance monitoring or tracing.
- Framework-specific application wiring.
- Server-side collection.

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

The system **MUST** send telemetry only to the collector destination selected by application configuration, and **MUST** identify the batch format a collector receives.

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

#### Identifying values in recorded addresses

- [x] `p2` - **ID**: `cpt-frontx-telemetry-fr-url-redaction`

The system **MUST** offer to record a page address with the values that identify a person or a record replaced by a placeholder that preserves the address's shape, and **MUST** let an application supply its own replacement rule for the values only it can recognize.

**Rationale**: Applications put people and records in the address itself, so an address stream carries identity even where no field does — and dropping the address instead would remove the unit the whole usage question is asked in.

**Actors**: `cpt-frontx-telemetry-actor-end-user`, `cpt-frontx-telemetry-actor-application-developer`

### 5.6 Distribution

#### Independent publication

- [x] `p1` - **ID**: `cpt-frontx-telemetry-fr-independent-publication`

The system **MUST** be published as an independent package with its own version line and required distribution notices.

**Rationale**: Telemetry fixes and improvements should not force unrelated ecosystem upgrades.

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

## 9. Acceptance Criteria

- [x] An application can create a client, start it, log an event and see an enriched record reach the configured collector.
- [x] Event identity and trigger timing are SDK-owned.
- [x] Queued records are delivered in batches and flushed at important page lifecycle points.
- [x] Session identity survives ordinary navigation and is replaced after inactivity.
- [x] Device identity is stable for the configured browser storage scope.
- [x] Autocapture records common DOM interaction without per-element instrumentation.
- [x] A subtree opt-out suppresses capture for that subtree.
- [x] Pattern-based redaction reduces accidental sensitive-value capture.
- [x] A recorded page address can carry placeholders in place of the values that identify a person or a record, with the application able to name the values only it recognizes.
- [x] Element attribution works across independently loaded SDK copies.
- [x] Published code contains no ecosystem, UI-framework or template-territory imports.
- [x] Server-side import and lifecycle calls complete without error.
- [x] The package distribution contains required library files, license and notice.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| Browser runtime | Supplies active collection, storage, DOM observation and delivery capabilities. | p1 |
| Collector endpoint | Receives event batches. | p1 |
| User-agent parser | Supports device and browser context. | p2 |
| Application locale source | Supplies application-selected locale when configured. | p3 |

## 11. Assumptions

- The application controls consent and starts the SDK only when collection is allowed.
- The collector accepts the selected batch contract.
- Browser storage may be unavailable; persistent identity then degrades.
- Element hooks are written by deployment-owned code but are treated as untrusted at runtime.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Delivery can fail after a batch leaves the queue. | Some records can be lost without application recovery. | Document the limitation and treat reliable transport as future scope. |
| Delivery suppression is mistaken for collection suppression. | A deployment may store identifiers it did not intend to create. | State that the flag suppresses delivery only and consent should gate start. |
| Redaction is pattern-based. | Sensitive data outside known patterns may be captured. | Present redaction as a safety net and provide subtree opt-out and hook suppression. |
| A plugin registered too late may not enrich records. | Application context can be missing. | Document plugin registration order and keep start behavior explicit. |
