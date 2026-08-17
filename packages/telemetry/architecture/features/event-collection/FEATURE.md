# Feature: Event Collection And Batched Delivery

- [x] `p1` - **ID**: `cpt-frontx-telemetry-featstatus-event-collection`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Instrument An Application](#instrument-an-application)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Configuration Normalization](#configuration-normalization)
  - [Client Start](#client-start)
  - [Client Teardown](#client-teardown)
  - [Record Construction And Enrichment](#record-construction-and-enrichment)
  - [Queue Drain And Delivery](#queue-drain-and-delivery)
  - [Envelope Construction](#envelope-construction)
  - [Forced Drain Triggers](#forced-drain-triggers)
  - [Session Continuation](#session-continuation)
  - [Activity Observation](#activity-observation)
  - [Plugin Registration And Setup](#plugin-registration-and-setup)
  - [Url Redaction](#url-redaction)
- [4. States (CDSL)](#4-states-cdsl)
  - [Client Lifecycle State Machine](#client-lifecycle-state-machine)
  - [Session State Machine](#session-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Client Construction And Environment Safety](#client-construction-and-environment-safety)
  - [Single-Use Client Lifecycle](#single-use-client-lifecycle)
  - [SDK-Owned Record Identity](#sdk-owned-record-identity)
  - [Enrichment Before Queueing](#enrichment-before-queueing)
  - [Batching Policy And Forced Drains](#batching-policy-and-forced-drains)
  - [Delivery Suppression Leaves Collection Unchanged](#delivery-suppression-leaves-collection-unchanged)
  - [Envelope Versions](#envelope-versions)
  - [Session Continuity](#session-continuity)
  - [Plugin Registry Semantics](#plugin-registry-semantics)
  - [Built-In Context Enrichment](#built-in-context-enrichment)
  - [Recorded Url Redaction](#recorded-url-redaction)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

## 1. Feature Context

The feature-entry identifier the kit's template places here is deliberately absent. That identifier kind is owned by a DECOMPOSITION, and a layer member owns no DECOMPOSITION, so declaring one here would be a reference with no definition. `cpt-frontx-telemetry-featstatus-event-collection` above carries this feature's identity instead.

### 1.1 Overview

Covers the client's lifecycle and the path every record takes from a caller's call to a delivered batch: configuration normalization, record construction with SDK-owned identity, enrichment through the plugin hook, the in-memory queue, the debounced drain with its forced triggers, envelope construction, and the request. Also covers session continuity and the plugin registry that all enrichment depends on.

### 1.2 Purpose

Realizes the collection and delivery requirements of the SDK and the sequence `cpt-frontx-telemetry-seq-record-delivery`. The behaviour here is what makes an application's instrumentation reduce to naming events: everything else on a record — identity, timing, session, device, application and navigation context — is added by this feature or by the plugins it sets up.

**Requirements**: `cpt-frontx-telemetry-fr-client-creation`, `cpt-frontx-telemetry-fr-client-lifecycle`, `cpt-frontx-telemetry-fr-custom-events`, `cpt-frontx-telemetry-fr-batched-delivery`, `cpt-frontx-telemetry-fr-collector-endpoint`, `cpt-frontx-telemetry-fr-delivery-disable`, `cpt-frontx-telemetry-fr-session-continuity`, `cpt-frontx-telemetry-fr-device-identity`, `cpt-frontx-telemetry-fr-builtin-context`, `cpt-frontx-telemetry-fr-locale-source`, `cpt-frontx-telemetry-fr-plugin-registration`, `cpt-frontx-telemetry-nfr-server-import-safety`

**Principles**: `cpt-frontx-telemetry-principle-enrichment-via-plugins`, `cpt-frontx-telemetry-principle-collection-delivery-separation`, `cpt-frontx-telemetry-principle-sdk-owned-identity`

**Components**: `cpt-frontx-telemetry-component-client`, `cpt-frontx-telemetry-component-events-manager`, `cpt-frontx-telemetry-component-session-manager`, `cpt-frontx-telemetry-component-user-info-manager`, `cpt-frontx-telemetry-component-plugins-manager`, `cpt-frontx-telemetry-component-builtin-plugins`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-telemetry-actor-application-developer` | Creates and configures the client, registers plugins, identifies the user, starts collection, logs domain events, tears the client down |
| `cpt-frontx-telemetry-actor-end-user` | Their activity continues or ends a session; their browser holds the session and device identifiers |
| `cpt-frontx-telemetry-actor-collector` | Receives delivered batches |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**: None. The autocapture feature depends on this one — it is registered through this feature's plugin registry and emits through its events manager — but this feature depends on nothing.

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-telemetry-usecase-instrument-application`

### Instrument An Application

- [x] `p1` - **ID**: `cpt-frontx-telemetry-flow-event-collection-instrument`

**Actor**: `cpt-frontx-telemetry-actor-application-developer`

**Realizes**: `cpt-frontx-telemetry-seq-record-delivery`

**Success Scenarios**:
- Developer creates a client with name, version and endpoint, starts it at boot, logs domain events, and the collector receives enriched batches; teardown delivers what remains and leaves no listeners installed.

**Error Scenarios**:
- No `window` present: start, plugin registration and teardown return the client unchanged, so collection never starts.
- Start called a second time on the same client: refused and reported; the client stays in its already-started state.
- Plugin registered after start: stored and never set up, so its enrichment silently does nothing.
- Delivery rejected by the network or the collector: the batch is already drained from the queue and is lost; the rejection reaches the console only.

**Steps**:
1. [x] - `p1` - Developer calls the factory with application name, version and collector endpoint - `inst-create-client`
2. [x] - `p1` - System normalizes configuration to concrete values and builds the shared context of configuration, hook registry and logger - `inst-normalize-config`
3. [x] - `p1` - System constructs the events, session, user info and plugins managers over that context and returns the client facade - `inst-construct-managers`
4. [x] - `p1` - Developer optionally registers additional plugins, which are stored by name - `inst-register-plugins`
5. [x] - `p1` - Developer optionally identifies the current user - `inst-identify-user`
6. [x] - `p1` - Developer starts the client where the application boots - `inst-start-client`
7. [x] - `p1` - **IF** `window` is undefined - `inst-check-window`
   1. [x] - `p1` - **RETURN** the client unchanged; no collection occurs - `inst-no-window-noop`
8. [x] - `p1` - **IF** the client has already been started - `inst-check-started`
   1. [x] - `p1` - Report the refusal through the logger (surfaced when verbose) and **RETURN** the client unchanged - `inst-refuse-restart`
9. [x] - `p1` - System registers the built-in plugins after any the developer registered, sets every plugin up, installs listeners, and refreshes the session - `inst-start-collection`
10. [x] - `p1` - Developer logs a domain event by name with optional data - `inst-log-event`
11. [x] - `p1` - System builds the record, offers it to the enrichment hook, queues it and schedules the drain - `inst-collect-record`
12. [x] - `p1` - System drains the queue on the debounce, on the page becoming hidden, or on teardown, and delivers the batch to the collector - `inst-deliver-batch`
13. [x] - `p1` - Developer tears the client down on application teardown - `inst-destroy-client`
14. [x] - `p1` - System detaches session listeners, runs plugin teardown hooks, then delivers whatever the hooks queued along with the remaining records - `inst-teardown-order`
15. [x] - `p1` - **RETURN** control with no listeners and no timers installed, and nothing queued discarded - `inst-teardown-complete`

## 3. Processes / Business Logic (CDSL)

### Configuration Normalization

- [x] `p2` - **ID**: `cpt-frontx-telemetry-algo-event-collection-normalize-config`

**Input**: Raw configuration as supplied by the caller — application name and version required, everything else optional

**Output**: Normalized configuration in which every option holds a concrete value

**Steps**:
1. [x] - `p1` - Carry the required application name and version through unchanged, along with the optional storage prefix and the optional url rewrite hook - `inst-carry-required`
2. [x] - `p1` - Resolve the collector endpoint: use the supplied value, otherwise derive a same-origin default path from the envelope version, defaulting the version when unset - `inst-resolve-endpoint`
3. [x] - `p1` - Default delivery on and verbose logging off - `inst-default-flags`
4. [x] - `p1` - Default autocapture on, url redaction off, and the session inactivity window - `inst-default-values`
5. [x] - `p1` - **RETURN** the normalized configuration, which is the only form any component reads - `inst-return-normalized`

### Client Start

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-event-collection-start`

**Input**: The constructed client and its managers

**Output**: A started client, or an unchanged one where start is not possible or not permitted

**Steps**:
1. [x] - `p1` - **IF** `window` is undefined - `inst-guard-window`
   1. [x] - `p1` - **RETURN** the client without touching any manager - `inst-return-unstarted`
2. [x] - `p1` - **IF** the start flag is already set - `inst-guard-restart`
   1. [x] - `p1` - Report through the logger (surfaced when verbose) that the client is already started and a new client should be built - `inst-log-restart-refused`
   2. [x] - `p1` - **RETURN** the client unchanged - `inst-return-already-started`
3. [x] - `p1` - Set the start flag, which teardown deliberately never clears - `inst-set-started`
4. [x] - `p1` - Register the built-in session, device, navigation, application-info and autocapture plugins, after any the caller registered so a colliding caller plugin is replaced - `inst-register-builtins`
5. [x] - `p1` - Start the session manager's activity listeners - `inst-start-session`
6. [x] - `p1` - Start the events manager's visibility listener - `inst-start-events`
7. [x] - `p1` - Run every registered plugin's setup in one pass - `inst-setup-plugins`
8. [x] - `p1` - Refresh the session so a new session is minted or an existing one continued - `inst-refresh-session`
9. [x] - `p1` - Invoke the start hooks - `inst-call-start-hooks`
10. [x] - `p1` - **RETURN** the client for chaining - `inst-return-started`

### Client Teardown

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-event-collection-destroy`

**Input**: A client, started or not

**Output**: No listeners installed, no timers pending, and everything queued delivered

**Steps**:
1. [x] - `p1` - **IF** `window` is undefined - `inst-guard-window-destroy`
   1. [x] - `p1` - **RETURN** without touching any manager - `inst-return-no-teardown`
2. [x] - `p1` - Detach the session manager's activity listeners - `inst-detach-session`
3. [x] - `p1` - Invoke the teardown hooks, so a plugin may log a parting event - `inst-call-destroy-hooks`
4. [x] - `p1` - Tear the events manager down last, so a parting event reaches the queue before the final delivery - `inst-teardown-events-last`
5. [x] - `p1` - **RETURN** control; the start flag stays set, so this client cannot be restarted - `inst-return-destroyed`

### Record Construction And Enrichment

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-event-collection-record-build`

**Input**: Either an event name with optional data, or a whole record

**Output**: An enriched record, queued, with a drain scheduled

**Steps**:
1. [x] - `p1` - Normalize the arguments: a leading string is a name-and-data call, otherwise the first argument is a whole record - `inst-normalize-params`
2. [x] - `p1` - Log the call through the logger when verbose - `inst-log-call`
3. [x] - `p1` - Build the record from name, data and any caller-supplied field overrides - `inst-build-record`
4. [x] - `p1` - Apply the SDK-assigned identifier and trigger timestamp **after** the caller's fields, so identity cannot be overridden - `inst-apply-identity-last`
5. [x] - `p1` - Invoke the enrichment hook, letting every registered plugin mutate the record - `inst-call-event-hook`
6. [x] - `p1` - Push the record onto the queue - `inst-enqueue`
7. [x] - `p1` - Schedule the drain, resetting the debounce - `inst-schedule-drain`
8. [x] - `p1` - **RETURN** the record to the caller - `inst-return-record`

### Queue Drain And Delivery

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-event-collection-flush`

**Input**: The current queue, and normalized configuration

**Output**: A delivered batch, or none where the queue is empty or delivery is suppressed

**Steps**:
1. [x] - `p1` - **IF** the queue is empty - `inst-check-empty-queue`
   1. [x] - `p1` - **RETURN** without building an envelope or issuing a request - `inst-return-nothing-queued`
2. [x] - `p1` - Build the envelope for the configured version - `inst-build-envelope`
3. [x] - `p1` - Empty the queue - `inst-drain-queue`
4. [x] - `p1` - **IF** delivery is suppressed by configuration - `inst-check-delivery-flag`
   1. [x] - `p1` - **RETURN** without issuing a request; the records are already drained, so collection behaviour is unchanged - `inst-return-delivery-suppressed`
5. [x] - `p1` - **TRY** issue the request to the configured endpoint with `keepalive`, so it survives page teardown - `inst-post-batch`
6. [x] - `p1` - **CATCH** rejection - `inst-catch-rejection`
   1. [x] - `p1` - Report to the console; the batch is not retried and not recovered - `inst-report-loss`

### Envelope Construction

- [x] `p2` - **ID**: `cpt-frontx-telemetry-algo-event-collection-envelope`

**Input**: The drained records, and the configured envelope version

**Output**: A request body in the configured envelope shape

**Steps**:
1. [x] - `p1` - Stamp each record with the send timestamp - `inst-stamp-sent`
2. [x] - `p1` - **FOR EACH** field on a record whose value is a non-array object - `inst-each-object-field`
   1. [x] - `p1` - Convert it to the collector's expected representation - `inst-convert-object-field`
3. [x] - `p1` - **IF** the envelope version is the first - `inst-check-version`
   1. [x] - `p1` - Key each record by its identifier and **RETURN** the record set - `inst-v1-keyed-records`
4. [x] - `p1` - **ELSE** the hoisting version - `inst-version-two`
   1. [x] - `p1` - Remove the two identity fields the version omits - `inst-remove-omitted`
   2. [x] - `p1` - **IF** the batch holds more than one record - `inst-check-multi`
      1. [x] - `p1` - Find every field whose value is identical across all records - `inst-find-common`
      2. [x] - `p1` - Move those fields to the batch-level block and delete them from each record - `inst-hoist-common`
   3. [x] - `p1` - **RETURN** the batch-level block and the record set - `inst-v2-return`

### Forced Drain Triggers

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-event-collection-forced-drain`

**Input**: A document visibility change, or client teardown

**Output**: An immediate drain rather than a scheduled one

**Steps**:
1. [x] - `p1` - On visibility change, **IF** the document is not hidden - `inst-check-hidden`
   1. [x] - `p1` - **RETURN** without draining - `inst-return-still-visible`
2. [x] - `p1` - Execute the drain immediately rather than waiting for the debounce - `inst-exec-drain`
3. [x] - `p1` - On teardown, detach the visibility listener, then drain rather than cancelling the pending timer - `inst-teardown-drain`

### Session Continuation

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-event-collection-session-refresh`

**Input**: The stored session record, if any, and the configured inactivity window

**Output**: A stored session record whose last-activity time is now

**Steps**:
1. [x] - `p1` - Read the stored session record for this client's storage keys - `inst-read-session`
2. [x] - `p1` - **IF** a record exists and is still within the inactivity window - `inst-check-window-elapsed`
   1. [x] - `p1` - Continue it: keep its identifier and start time - `inst-continue-session`
3. [x] - `p1` - **ELSE** - `inst-session-expired`
   1. [x] - `p1` - Mint a new identifier and set the start time to now - `inst-mint-session`
4. [x] - `p1` - Set last activity to now and write the record back - `inst-write-session`
5. [x] - `p1` - **IF** the write failed - `inst-check-write-error`
   1. [x] - `p1` - Report through the logger (surfaced when verbose); collection continues without persisted session continuity - `inst-report-write-error`

### Activity Observation

- [x] `p2` - **ID**: `cpt-frontx-telemetry-algo-event-collection-activity-observation`

**Input**: Scroll, keydown and click events on the window

**Output**: A refreshed session, at most once per debounce interval

**Steps**:
1. [x] - `p1` - Attach one debounced refresh listener per observed activity type - `inst-attach-activity`
2. [x] - `p1` - **FOR EACH** activity event, restart the debounce timer rather than refreshing immediately - `inst-debounce-refresh`
3. [x] - `p1` - Refresh the session once the timer elapses, so an activity burst costs one write - `inst-refresh-once`
4. [x] - `p1` - On teardown, detach every listener using the same references - `inst-detach-activity`

### Plugin Registration And Setup

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-event-collection-plugin-setup`

**Input**: Plugins supplied by the caller and by the client's start path

**Output**: A registry keyed by name, and one setup pass over it

**Steps**:
1. [x] - `p1` - **FOR EACH** supplied entry - `inst-each-plugin`
   1. [x] - `p1` - **IF** the entry is falsy, skip it so conditional registration needs no branch - `inst-skip-falsy`
   2. [x] - `p1` - Store it under its name, replacing any earlier plugin of the same name - `inst-store-by-name`
2. [x] - `p1` - On the setup pass, build the plugin context: normalized configuration, event logger, session accessors, logger, hook registrar - `inst-build-plugin-context`
3. [x] - `p1` - **FOR EACH** registered plugin, invoke its setup with that context - `inst-invoke-setup`
4. [x] - `p1` - Leave any plugin registered after this pass stored but not set up - `inst-late-plugin-unset`

### Url Redaction

- [x] `p2` - **ID**: `cpt-frontx-telemetry-algo-event-collection-url-redaction`

**Input**: A url a recording site is about to put on a record, the application's rewrite hook where one is configured, and whether the built-in patterns are switched on

**Output**: The url as it will be recorded, with recognized identifying values replaced by placeholders naming their shape

**Steps**:
1. [x] - `p2` - **IF** the application configured a rewrite hook - `inst-check-host-hook`
   1. [x] - `p2` - Apply it to the raw url, since only the application can map its own routes and it needs the real value to do so - `inst-apply-host-hook`
   2. [x] - `p2` - **IF** the hook throws, report through the logger and fall through to the built-in patterns over the raw url even where configuration leaves them off, so a failed rewrite never publishes what it was meant to remove - `inst-recover-host-hook`
2. [x] - `p2` - **IF** the built-in patterns are switched off, **RETURN** the url as it stands - `inst-check-patterns-enabled`
3. [x] - `p2` - Separate path, query and fragment, and treat the fragment as a path so a hash-routed application is covered - `inst-split-url`
4. [x] - `p2` - Replace every whole path segment, query value and fragment segment matching a recognized shape with its placeholder, testing the percent-decoded form so an encoded value is not missed - `inst-replace-values`
5. [x] - `p2` - **RETURN** the reassembled url - `inst-return-redacted`

## 4. States (CDSL)

### Client Lifecycle State Machine

- [x] `p2` - **ID**: `cpt-frontx-telemetry-state-event-collection-client-lifecycle`

**States**: CREATED, STARTED, DESTROYED

**Initial State**: CREATED

**Transitions**:
1. [x] - `p1` - **FROM** CREATED **TO** STARTED **WHEN** start is called with `window` present and the start flag unset; built-ins are registered, plugins set up, listeners installed and the session refreshed - `inst-created-to-started`
2. [x] - `p1` - **FROM** STARTED **TO** STARTED **WHEN** start is called again; the call is refused and reported, and no plugin is set up a second time - `inst-started-to-started`
3. [x] - `p1` - **FROM** STARTED **TO** DESTROYED **WHEN** teardown is called; session listeners detach, teardown hooks run, and the queue is delivered - `inst-started-to-destroyed`
4. [x] - `p1` - **FROM** CREATED **TO** DESTROYED **WHEN** teardown is called on a client that was never started - `inst-created-to-destroyed`
5. [x] - `p1` - **FROM** DESTROYED **TO** DESTROYED **WHEN** start is called after teardown; the start flag was never cleared, so the call is refused and the client remains single-use - `inst-destroyed-terminal`

### Session State Machine

- [x] `p2` - **ID**: `cpt-frontx-telemetry-state-event-collection-session`

**States**: ABSENT, ACTIVE, EXPIRED

**Initial State**: ABSENT

**Transitions**:
1. [x] - `p1` - **FROM** ABSENT **TO** ACTIVE **WHEN** the session is refreshed and no stored record exists; a new identifier is minted and the start time set to now - `inst-absent-to-active`
2. [x] - `p1` - **FROM** ACTIVE **TO** ACTIVE **WHEN** observed activity refreshes the session within the inactivity window; identifier and start time are preserved - `inst-active-to-active`
3. [x] - `p1` - **FROM** ACTIVE **TO** EXPIRED **WHEN** the inactivity window elapses with no observed activity - `inst-active-to-expired`
4. [x] - `p1` - **FROM** EXPIRED **TO** ACTIVE **WHEN** the session is next refreshed; a new identifier is minted, so the previous session is not resumed - `inst-expired-to-active`

## 5. Definitions of Done

### Client Construction And Environment Safety

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-event-collection-construction`

The system **MUST** build a client from configuration requiring only application name and version, normalizing every other option to a documented default, and **MUST** return early from start, plugin registration and teardown when `window` is undefined, so that importing and using the package in a server process completes without error and simply collects nothing.

**Implements**:
- `cpt-frontx-telemetry-flow-event-collection-instrument`
- `cpt-frontx-telemetry-algo-event-collection-normalize-config`

**Constraints**: `cpt-frontx-telemetry-constraint-browser-runtime`

**Touches**:
- Entities: `NormalizedConfiguration`

### Single-Use Client Lifecycle

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-event-collection-single-use`

The system **MUST** refuse a second start on the same client and report the refusal, **MUST NOT** clear the start flag during teardown, and **MUST** order teardown so that session listeners detach, then teardown hooks run, then the events manager tears down and delivers — so that an event logged by a teardown hook still reaches the final batch.

**Implements**:
- `cpt-frontx-telemetry-algo-event-collection-start`
- `cpt-frontx-telemetry-algo-event-collection-destroy`
- `cpt-frontx-telemetry-state-event-collection-client-lifecycle`

**Constraints**: `cpt-frontx-telemetry-constraint-browser-runtime`

**Touches**:
- Entities: `Record`

### SDK-Owned Record Identity

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-event-collection-record-identity`

The system **MUST** apply the record identifier and trigger timestamp after every caller-supplied field, so that neither a caller nor a hook contribution merged into those fields can override them, and **MUST** accept both a name-and-data call and a whole-record call.

**Implements**:
- `cpt-frontx-telemetry-algo-event-collection-record-build`

**Touches**:
- Entities: `Record`

### Enrichment Before Queueing

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-event-collection-enrichment`

The system **MUST** invoke the enrichment hook on every record before it enters the queue. Outside envelope building, the events manager **MUST NOT** reference any context field by name: context arrives through plugins, or through the identify surface, which writes the user identifier over the same event hook the plugins use. One exception is recorded: the V2 envelope builder names the context fields that API version does not accept (`context_user_id`, `context_tenant_id`) in order to omit them from the payload. That is a delivery-format rule owned by the envelope algorithm, not enrichment.

**Implements**:
- `cpt-frontx-telemetry-algo-event-collection-record-build`
- `cpt-frontx-telemetry-algo-event-collection-plugin-setup`

**Touches**:
- Entities: `Record`, `Plugin`, `PluginContext`

### Batching Policy And Forced Drains

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-event-collection-batching`

The system **MUST** drain the queue on a debounce that each new record resets, **MUST** additionally drain immediately when the document becomes hidden and on client teardown, **MUST** drain rather than cancel on teardown, and **MUST** issue the request with `keepalive` so a drain triggered by page teardown still completes.

**Implements**:
- `cpt-frontx-telemetry-algo-event-collection-flush`
- `cpt-frontx-telemetry-algo-event-collection-forced-drain`

**Touches**:
- Entities: `BatchEnvelope`

### Delivery Suppression Leaves Collection Unchanged

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-event-collection-delivery-suppression`

The system **MUST** build the envelope and empty the queue before consulting the delivery flag, so that suppressing delivery changes exactly one step and leaves collection, enrichment and queue behaviour identical. The documentation **MUST** state that the flag suppresses delivery only — collection continues and the storage identifiers are still written — and **MUST** direct a consent gate to client start instead.

**Implements**:
- `cpt-frontx-telemetry-algo-event-collection-flush`

**Constraints**: `cpt-frontx-telemetry-constraint-external-record-schema`

**Touches**:
- Entities: `BatchEnvelope`

### Envelope Versions

- [x] `p2` - **ID**: `cpt-frontx-telemetry-dod-event-collection-envelope`

The system **MUST** send only to the endpoint resolved from normalized configuration, **MUST** support both envelope versions, and in the hoisting version **MUST** lift fields whose value is identical across every record in a multi-record batch into the batch-level block and remove them from the records, while omitting the two identity fields that version drops.

**Implements**:
- `cpt-frontx-telemetry-algo-event-collection-envelope`

**Constraints**: `cpt-frontx-telemetry-constraint-external-record-schema`

**Touches**:
- Entities: `BatchEnvelope`, `Record`

### Session Continuity

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-event-collection-session`

The system **MUST** persist the session record in browser storage, continue it while within the configured inactivity window, mint a new identifier once that window has elapsed without observed activity, and treat scroll, keydown and click as activity, debounced so a burst costs one write. A failed write **MUST** be reported through the logger — surfaced only when verbose logging is on — and **MUST NOT** stop collection.

**Implements**:
- `cpt-frontx-telemetry-algo-event-collection-session-refresh`
- `cpt-frontx-telemetry-algo-event-collection-activity-observation`
- `cpt-frontx-telemetry-state-event-collection-session`

**Touches**:
- Entities: `Session`

### Plugin Registry Semantics

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-event-collection-plugin-registry`

The system **MUST** key plugins by name so a later registration replaces an earlier one, **MUST** ignore falsy entries, **MUST** run setup in a single pass triggered by client start, and **MUST** register the built-in plugins after any the caller registered. A plugin registered after the setup pass **MUST** be stored without being set up, and this ordering requirement **MUST** be documented along with the reservation of the built-in plugin names.

**Implements**:
- `cpt-frontx-telemetry-algo-event-collection-plugin-setup`

**Constraints**: `cpt-frontx-telemetry-constraint-reserved-plugin-names`

**Touches**:
- Entities: `Plugin`, `PluginContext`

### Built-In Context Enrichment

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-event-collection-builtin-context`

The system **MUST** supply session, device, navigation and application-info enrichment as plugins registered through the ordinary plugin surface, **MUST** emit a session-start event at client start when no valid stored session exists (a session renewed mid-run after the inactivity window emits no event) and an event on every navigation path change including History API transitions — stamping each later record with that page view's identifier as its `caused_by_id`, so every record links to the page it occurred on — and **MUST** offer a locale plugin that reads the application's required locale source per record rather than capturing it at setup — when no locale enrichment sets a language, the device plugin fills the browser's reported one. Because the History API fires no event for `pushState` and `replaceState`, the navigation plugin **MUST** wrap those two methods to observe transitions, and **MUST** restore the original methods on teardown. Consumers should know the SDK patches `window.history`; any other code wrapping the same methods must compose with this.

**Implements**:
- `cpt-frontx-telemetry-algo-event-collection-plugin-setup`
- `cpt-frontx-telemetry-algo-event-collection-record-build`

**Touches**:
- Entities: `Record`, `Session`, `Plugin`

### Recorded Url Redaction

- [x] `p2` - **ID**: `cpt-frontx-telemetry-dod-event-collection-url-redaction`

The system **MUST** be able to record a url with its identifying values replaced by placeholders rather than dropped, so the address stays usable as the unit an adoption question is asked in, and **MUST** leave that off unless configuration turns it on. An application-supplied rewrite **MUST** run ahead of the built-in patterns and receive the raw url, its output **MUST** still be swept by them, and a rewrite that throws **MUST** be reported and **MUST NOT** result in the raw url being recorded. Recognition **MUST** stay conservative — whole-segment email, uuid, JWT, five-or-more-digit and long-hex shapes — so that a four-digit year and a title-cased slug survive; anything the SDK cannot separate from ordinary content is the application rewrite's to name.

**Implements**:
- `cpt-frontx-telemetry-algo-event-collection-url-redaction`

**Touches**:
- Entities: `Record`, `NormalizedConfiguration`

## 6. Acceptance Criteria

- [x] A client created with only application name, version and endpoint collects and delivers enriched records, with every other option resolved to its documented default.
- [x] Importing the package and calling start, plugin registration and teardown in a process without `window` completes without error and collects nothing.
- [x] A second start on the same client is refused and reported, and no plugin is set up twice; a client destroyed and then started again stays refused.
- [x] An event logged from a teardown hook appears in the batch delivered by teardown.
- [x] A record's identifier and trigger timestamp are SDK-assigned and survive a caller supplying those fields explicitly.
- [x] A record is fully enriched when it enters the queue, and the events manager contains no reference to any context field by name.
- [x] Records logged in a burst are delivered as one batch on the debounce; the page becoming hidden and client teardown each force an immediate delivery.
- [x] With delivery suppressed, records are still built, enriched and drained from the queue, and no request is issued.
- [x] In the hoisting envelope, a field with the same value on every record of a multi-record batch appears once at batch level and on no record; the two omitted identity fields appear nowhere.
- [x] A session survives a page reload within the inactivity window and is replaced by a new identifier once that window elapses without scroll, keypress or click.
- [x] An activity burst produces one session write rather than one per event.
- [x] Registering a plugin under an existing name replaces it; a falsy entry is ignored; a plugin registered after start is never set up.
- [x] With url redaction on, a page view records placeholders in place of an email, uuid, JWT, five-digit and long-hex segment, while a four-digit year and a title-cased slug reach the collector intact.
- [x] An application rewrite hook sees the raw url, its output is still swept by the built-in patterns, and a hook that throws is reported while the patterns run anyway.
