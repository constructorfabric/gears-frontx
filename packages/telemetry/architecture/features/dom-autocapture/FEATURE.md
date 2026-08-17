# Feature: DOM Autocapture And Element Attribution

- [x] `p1` - **ID**: `cpt-frontx-telemetry-featstatus-dom-autocapture`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Attribute A Component's Captured Events](#attribute-a-components-captured-events)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Listener Installation](#listener-installation)
  - [Captured Event Handling](#captured-event-handling)
  - [Ancestor Walk](#ancestor-walk)
  - [Element Hook Application](#element-hook-application)
  - [Contribution Merge](#contribution-merge)
  - [Attribute Collection And Redaction](#attribute-collection-and-redaction)
  - [Sensitivity And Value Safety Decisions](#sensitivity-and-value-safety-decisions)
- [4. States (CDSL)](#4-states-cdsl)
  - [Capture Decision State Machine](#capture-decision-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Listener Lifecycle](#listener-lifecycle)
  - [Interaction Capture Without Instrumentation](#interaction-capture-without-instrumentation)
  - [Subtree Opt-Out By Presence](#subtree-opt-out-by-presence)
  - [Whole-Event Redaction](#whole-event-redaction)
  - [Cross-Realm Element Hook Contract](#cross-realm-element-hook-contract)
  - [Hook Contribution Semantics](#hook-contribution-semantics)
  - [Untrusted Hook Error Discipline](#untrusted-hook-error-discipline)
  - [Veto Precedence](#veto-precedence)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

## 1. Feature Context

The feature-entry identifier the kit's template places here is deliberately absent. That identifier kind is owned by a DECOMPOSITION, and a layer member owns no DECOMPOSITION, so declaring one here would be a reference with no definition. `cpt-frontx-telemetry-featstatus-dom-autocapture` above carries this feature's identity instead.

### 1.1 Overview

Covers recording user interaction from the DOM without per-element instrumentation: the document listeners, the ancestor walk that performs suppression, redaction, attribution and field collection in one pass, the element-hook contract by which a subtree governs its own capture, and the error discipline that keeps an untrusted hook from costing an event.

### 1.2 Purpose

Realizes the automatic-capture requirements and the sequence `cpt-frontx-telemetry-seq-autocapture-walk`. This is the feature that makes interaction data available without an instrumentation project, and it is also where every safety decision lives, because it is the only part of the SDK that records data nobody wrote for the purpose.

**Requirements**: `cpt-frontx-telemetry-fr-dom-autocapture`, `cpt-frontx-telemetry-fr-element-attribution`, `cpt-frontx-telemetry-fr-capture-opt-out`, `cpt-frontx-telemetry-fr-redaction`, `cpt-frontx-telemetry-nfr-hook-compatibility`

**Principles**: `cpt-frontx-telemetry-principle-untrusted-extensions`, `cpt-frontx-telemetry-principle-additive-cross-version`, `cpt-frontx-telemetry-principle-enrichment-via-plugins`

**Components**: `cpt-frontx-telemetry-component-autocapture`, `cpt-frontx-telemetry-component-events-manager`, `cpt-frontx-telemetry-component-plugins-manager`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-telemetry-actor-end-user` | Their interaction with the page is what is captured, and their data is what redaction and opt-out protect |
| `cpt-frontx-telemetry-actor-application-developer` | Enables or disables autocapture, marks subtrees as opted out, and registers element hooks for attribution |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**: The event-collection feature — autocapture is registered through its plugin registry and emits its events through its events manager. Named rather than cited by identifier for the reason given above: the identifier kind that would name a sibling feature belongs to a DECOMPOSITION.

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-telemetry-usecase-attribute-component`

### Attribute A Component's Captured Events

- [x] `p1` - **ID**: `cpt-frontx-telemetry-flow-dom-autocapture-attribute`

**Actor**: `cpt-frontx-telemetry-actor-application-developer`

**Realizes**: `cpt-frontx-telemetry-seq-autocapture-walk`

**Success Scenarios**:
- Developer assigns an element hook to a subtree root; an end user interacts inside it; the captured event carries the component's service attribution and the hook's custom data alongside autocapture's own fields.

**Error Scenarios**:
- An ancestor hook declines capture: the event is suppressed entirely.
- An ancestor carries the opt-out attribute: the event is suppressed before anything is read.
- An element on the path is sensitive: the whole event is dropped, not just that element's fields.
- A hook fails: that element contributes nothing, the event is still emitted, and the failure is rethrown afterwards so it reaches the page's error handling.
- A hook returns reserved-prefix data keys or fields outside the permitted attribution set: those are dropped.

**Steps**:
1. [x] - `p1` - Developer assigns a hook function to the subtree's root element under the SDK's registry key - `inst-assign-hook`
2. [x] - `p1` - End user interacts with a descendant of that element - `inst-user-interacts`
3. [x] - `p1` - System receives the interaction on its capture-phase document listener - `inst-receive-event`
4. [x] - `p1` - System resolves the event target, substituting the parent when the target is a text node - `inst-resolve-target`
5. [x] - `p1` - **IF** the target is absent or the interaction is not one autocapture records - `inst-check-capturable`
   1. [x] - `p1` - **RETURN** without capturing - `inst-return-not-capturable`
6. [x] - `p1` - System walks from the target upward through its ancestors, crossing shadow-root hosts - `inst-walk-ancestors`
7. [x] - `p1` - **IF** any ancestor suppresses capture by opt-out attribute, sensitivity or hook veto - `inst-check-suppression`
   1. [x] - `p1` - **RETURN** without emitting anything - `inst-return-suppressed`
8. [x] - `p1` - System takes attribution from the closest hook that contributed it, and merges hook data beneath its own captured fields - `inst-merge-contribution`
9. [x] - `p1` - System emits the event named after the interaction type through the events manager - `inst-emit-event`
10. [x] - `p1` - **IF** a hook failed during the walk - `inst-check-hook-error`
    1. [x] - `p1` - Rethrow the failure after emission, so it reaches the page's error handling with a real stack - `inst-rethrow-hook-error`

## 3. Processes / Business Logic (CDSL)

### Listener Installation

- [x] `p2` - **ID**: `cpt-frontx-telemetry-algo-dom-autocapture-listener-install`

**Input**: The plugin context, at setup

**Output**: Document listeners installed, or nothing where autocapture is disabled

**Steps**:
1. [x] - `p1` - **IF** autocapture is disabled in normalized configuration - `inst-check-autocapture-enabled`
   1. [x] - `p1` - **RETURN** without installing anything - `inst-return-disabled`
2. [x] - `p1` - Install one capture-phase passive listener per recorded interaction type on the document - `inst-install-listeners`
3. [x] - `p1` - Register a teardown hook that removes each listener using options whose capture flag matches, since removal only matches on that flag - `inst-register-removal`

### Captured Event Handling

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-dom-autocapture-capture-event`

**Input**: A DOM interaction event

**Output**: An emitted telemetry event, or none; plus a rethrown hook failure where one occurred

**Steps**:
1. [x] - `p1` - Resolve the event target - `inst-get-target`
2. [x] - `p1` - **IF** the target is a text node, substitute its parent - `inst-normalize-text-node`
3. [x] - `p1` - **IF** the target is absent or the interaction is not capturable - `inst-guard-capturable`
   1. [x] - `p1` - **RETURN** no result - `inst-return-no-capture`
4. [x] - `p1` - Run the ancestor walk, passing a holder for any hook failure - `inst-run-walk`
5. [x] - `p1` - **IF** the walk did not abandon the event - `inst-check-walk-result`
   1. [x] - `p1` - Emit an event named after the interaction type, carrying the merged data and the attribution - `inst-log-captured-event`
6. [x] - `p1` - **RETURN** the hook failure if one was stashed, so the caller can rethrow it after emission - `inst-return-hook-error`

### Ancestor Walk

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk`

**Input**: The resolved target element, the interaction event, and a holder for a hook failure

**Output**: Merged data and attribution, or an abandonment signal

**Steps**:
1. [x] - `p1` - **FOR EACH** element from the target upward, including the target itself - `inst-each-ancestor`
   1. [x] - `p1` - **IF** the element carries the opt-out attribute, testing presence only and never reading its value - `inst-check-opt-out`
      1. [x] - `p1` - **RETURN** abandonment for the whole event - `inst-abandon-opt-out`
   2. [x] - `p1` - **IF** the element fails the capture predicate - `inst-check-element-capturable`
      1. [x] - `p1` - **RETURN** abandonment for the whole event - `inst-abandon-not-capturable`
   3. [x] - `p1` - Apply the element's hook, which may veto, contribute, or do nothing - `inst-apply-hook`
   4. [x] - `p1` - **IF** the hook vetoed capture - `inst-check-veto`
      1. [x] - `p1` - **RETURN** abandonment for the whole event - `inst-abandon-veto`
   5. [x] - `p1` - Collect the element's tag name and its safe attributes - `inst-collect-element-fields`
   6. [x] - `p1` - **IF** the element is an anchor and its target value is safe to record, remember that value - `inst-remember-anchor-target`
   7. [x] - `p1` - **IF** the element has label text, record it truncated - `inst-collect-text`
   8. [x] - `p1` - **IF** the element's tag is one autocapture records and no result has been chosen yet, adopt this element's fields as the result - `inst-adopt-result`
2. [x] - `p1` - **IF** no element on the path was one autocapture records - `inst-check-no-result`
   1. [x] - `p1` - **RETURN** abandonment - `inst-abandon-no-result`
3. [x] - `p1` - **IF** an anchor target was remembered - `inst-check-anchor`
   1. [x] - `p1` - Record it through the url redaction policy, and **IF** its host differs from the page's host on a click, mark the interaction as leaving the site with the same redacted url - `inst-mark-external`
4. [x] - `p1` - **IF** the collected result holds no fields - `inst-check-empty-result`
   1. [x] - `p1` - **RETURN** abandonment - `inst-abandon-empty`
5. [x] - `p1` - Merge the hook-contributed data first and autocapture's own fields last, so its own keys always win - `inst-merge-own-last`
6. [x] - `p1` - **RETURN** the merged data and the accumulated attribution - `inst-return-walk-result`

### Element Hook Application

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook`

**Input**: An element, the contribution accumulated so far, and a holder for a hook failure

**Output**: The updated contribution, or a veto

**Steps**:
1. [x] - `p1` - Read the element's hook through the cross-realm registry key - `inst-read-hook`
2. [x] - `p1` - **IF** no hook is present - `inst-check-hook-present`
   1. [x] - `p1` - **RETURN** the contribution unchanged - `inst-return-unchanged`
3. [x] - `p1` - **TRY** invoke the hook, which is untrusted code - `inst-invoke-hook`
4. [x] - `p1` - **CATCH** any thrown value - `inst-catch-hook-throw`
   1. [x] - `p1` - Stash it only if nothing is stashed yet, so the first failure on the path is the one reported and a farther ancestor cannot replace it - `inst-stash-first-failure`
   2. [x] - `p1` - **RETURN** the contribution unchanged, degrading this element to no contribution rather than failing the event - `inst-degrade-element`
5. [x] - `p1` - **IF** the hook returned nothing - `inst-check-empty-result-hook`
   1. [x] - `p1` - **RETURN** the contribution unchanged - `inst-return-no-contribution`
6. [x] - `p1` - **IF** the hook vetoed capture - `inst-check-hook-veto`
   1. [x] - `p1` - **RETURN** the veto - `inst-return-veto`
7. [x] - `p1` - Merge the hook's result into the contribution, outside the failure boundary so a defect here surfaces as an internal error rather than as the consumer's - `inst-merge-outside-try`

### Contribution Merge

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution`

**Input**: The contribution accumulated from closer elements, and a hook's result

**Output**: The updated contribution

**Steps**:
1. [x] - `p1` - **IF** the accumulated contribution already holds attribution or custom data, keep its attribution — the contribution is atomic, so the closest hook that returned either part wins both - `inst-closest-attribution-wins`
2. [x] - `p1` - **ELSE** adopt whichever permitted attribution fields the hook returned — a partial return is adopted as-is, but fields are never mixed across hooks - `inst-adopt-whole-set`
3. [x] - `p1` - Drop any attribution field outside the permitted set - `inst-allowlist-attribution`
4. [x] - `p1` - Strip reserved-prefix keys from the hook's custom data - `inst-strip-reserved-keys`
5. [x] - `p1` - **IF** the accumulated contribution already holds attribution or custom data, keep its custom data — the same atomic rule as step 1 - `inst-closest-data-wins`
6. [x] - `p1` - **RETURN** the updated contribution - `inst-return-contribution`

### Attribute Collection And Redaction

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes`

**Input**: An element

**Output**: Its recordable attribute fields

**Steps**:
1. [x] - `p1` - **FOR EACH** attribute on the element - `inst-each-attribute`
   1. [x] - `p1` - **IF** the attribute is on the ignore list, skip it - `inst-skip-ignored`
   2. [x] - `p1` - **IF** the attribute is the class attribute, record the resolved class list instead of the raw value - `inst-record-class-list`
   3. [x] - `p1` - **IF** the element is sensitive and the attribute is not name, identifier or accessible label, skip it - `inst-restrict-sensitive`
   4. [x] - `p1` - **IF** the value is safe to record, record it truncated - `inst-record-safe-value`
2. [x] - `p1` - **RETURN** the collected fields - `inst-return-attributes`

### Sensitivity And Value Safety Decisions

- [x] `p1` - **ID**: `cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision`

**Input**: An element, or a candidate value

**Output**: Whether the element is sensitive, and whether the value may be recorded

**Steps**:
1. [x] - `p1` - Treat an element as sensitive when it is a password or hidden input - `inst-sensitive-input-type`
2. [x] - `p1` - Treat an element as sensitive when its name or identifier matches a sensitive pattern - `inst-sensitive-name-pattern`
3. [x] - `p1` - Treat a free-text or selection control as sensitive: selection lists, multi-line text, editable regions, and any input whose type is not one of the non-text control types - `inst-sensitive-free-text`
4. [x] - `p1` - Reject a value matching a payment-card pattern - `inst-reject-card-pattern`
5. [x] - `p1` - Reject a value matching a national-identifier pattern - `inst-reject-national-id`
6. [x] - `p1` - **RETURN** the decisions; a password or hidden input, or a sensitive name pattern, anywhere on the walked path abandons the entire event, while free-text or selection sensitivity only restricts that element's own attribute reading - `inst-return-decisions`

## 4. States (CDSL)

### Capture Decision State Machine

- [x] `p2` - **ID**: `cpt-frontx-telemetry-state-dom-autocapture-decision`

**States**: RECEIVED, WALKING, ABANDONED, EMITTED

**Initial State**: RECEIVED

**Transitions**:
1. [x] - `p1` - **FROM** RECEIVED **TO** WALKING **WHEN** the target resolves and the interaction is one autocapture records - `inst-received-to-walking`
2. [x] - `p1` - **FROM** RECEIVED **TO** ABANDONED **WHEN** no target resolves or the interaction is not capturable - `inst-received-to-abandoned`
3. [x] - `p1` - **FROM** WALKING **TO** ABANDONED **WHEN** an ancestor carries the opt-out attribute, is sensitive, or vetoes capture, or when the walk collects no recordable element and no fields - `inst-walking-to-abandoned`
4. [x] - `p1` - **FROM** WALKING **TO** EMITTED **WHEN** the walk completes with a recordable result; a hook failure stashed during the walk does not prevent this transition and is rethrown after it - `inst-walking-to-emitted`

## 5. Definitions of Done

### Listener Lifecycle

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-dom-autocapture-listeners`

The system **MUST** install one capture-phase passive document listener per recorded interaction type when autocapture is enabled, install none when it is disabled, and remove each on teardown using options whose capture flag matches the installation — since listener removal only matches on that flag.

**Implements**:
- `cpt-frontx-telemetry-algo-dom-autocapture-listener-install`

**Touches**:
- Entities: `Record`

### Interaction Capture Without Instrumentation

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-dom-autocapture-capture`

The system **MUST** capture the recorded interaction types from the document with no per-element instrumentation, **MUST** name each captured event after the interaction type, **MUST** substitute the parent element when the event target is a text node, and **MUST** record the recordable element's tag name, its safe attributes, and its label text truncated. An anchor's target **MUST** be recorded, and a click whose target host differs from the page's host **MUST** be marked as leaving the site.

**Implements**:
- `cpt-frontx-telemetry-flow-dom-autocapture-attribute`
- `cpt-frontx-telemetry-algo-dom-autocapture-capture-event`
- `cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk`

**Touches**:
- Entities: `Record`

### Subtree Opt-Out By Presence

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-dom-autocapture-opt-out`

The system **MUST** abandon the entire event when any element from the target upward carries the opt-out attribute, and **MUST** decide on the attribute's presence alone without reading its value — so that the bare attribute and any value whatsoever all opt out. The check **MUST** occur before any of that element's data is read.

**Implements**:
- `cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk`
- `cpt-frontx-telemetry-state-dom-autocapture-decision`

**Touches**:
- Entities: `Record`

### Whole-Event Redaction

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-dom-autocapture-redaction`

The system **MUST** abandon the entire event, not merely the offending element's fields, when any element on the walked path is a password or hidden input or carries a name or identifier matching a sensitive pattern. For free-text and selection controls it **MUST** restrict attribute reading to name, identifier and accessible label. It **MUST** reject values matching payment-card and national-identifier patterns. The documentation **MUST** present this as a pattern-based safety net and not as a compliance guarantee, and **MUST** direct an application to the subtree opt-out or an element-hook veto as the authoritative control.

The url a captured anchor contributes **MUST** pass through the shared url redaction policy rather than a rule of autocapture's own, so an identifying value in a link carries the same treatment as one in a path change.

**Implements**:
- `cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes`
- `cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision`
- `cpt-frontx-telemetry-algo-event-collection-url-redaction`

**Touches**:
- Entities: `Record`

### Cross-Realm Element Hook Contract

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-dom-autocapture-hook-contract`

The system **MUST** expose the element-hook key as a cross-realm registry symbol, so a hook registered against one loaded copy of the SDK is read by another on the same page. The contract **MUST** be evolved additively only: any change to what an existing field, the suppression rule or the merge rule means **MUST** be introduced under a new registry string rather than by reinterpreting the existing one.

**Implements**:
- `cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook`

**Constraints**: `cpt-frontx-telemetry-constraint-external-record-schema`

**Touches**:
- Entities: `ElementHookResult`

### Hook Contribution Semantics

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-dom-autocapture-contribution`

The system **MUST** let the closest contributing hook win its entire field set, **MUST NOT** mix attribution fields across hooks — a partial return is adopted as-is but never combined with another hook's fields — **MUST** allow only the permitted attribution fields and drop the rest, **MUST** strip reserved-prefix keys from a hook's custom data, and **MUST** merge hook data beneath autocapture's own fields so its own keys always win. It **MUST NOT** stitch service call chains across hooks — a hook supplies its own complete chain below the application.

**Implements**:
- `cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution`

**Touches**:
- Entities: `ElementHookResult`, `Record`

### Untrusted Hook Error Discipline

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-dom-autocapture-hook-errors`

The system **MUST** contain a hook's failure to that element's contribution and still emit the event the rest of the walk built. It **MUST** stash only the first failure on the path, so a farther ancestor's later failure does not replace it. It **MUST** rethrow the failure after the event has been emitted so it reaches the page's error handling, wrapping a non-error thrown value while preserving the original as its cause. Processing a hook's result **MUST** stay outside the failure boundary, so a defect in the SDK's own merge logic surfaces as an internal error rather than being attributed to the consumer. The system **MUST NOT** swallow either class of error.

**Implements**:
- `cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook`
- `cpt-frontx-telemetry-algo-dom-autocapture-capture-event`

**Touches**:
- Entities: `ElementHookResult`

### Veto Precedence

- [x] `p1` - **ID**: `cpt-frontx-telemetry-dod-dom-autocapture-veto`

The system **MUST** suppress the whole event when any hook on the walked path vetoes capture, regardless of how far from the target that element sits and regardless of contributions already accumulated from closer elements.

**Implements**:
- `cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook`
- `cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk`
- `cpt-frontx-telemetry-state-dom-autocapture-decision`

**Touches**:
- Entities: `ElementHookResult`, `Record`

## 6. Acceptance Criteria

- [x] With autocapture enabled, interacting with a recordable element produces an event named after the interaction type, carrying the element's tag, safe attributes and label text, with no markup changes.
- [x] With autocapture disabled, no document listener is installed and no interaction produces an event.
- [x] Teardown removes every listener autocapture installed.
- [x] The opt-out attribute on an ancestor suppresses the event whether it is bare, set to a truthy value, or set to a falsy one.
- [x] With url redaction on, a captured link url and an external click url both carry placeholders in place of their identifying values.
- [x] A password input, a hidden input, and an element whose name or identifier matches a sensitive pattern each cause the whole event to be dropped, with no partial record emitted.
- [x] For a selection list, a multi-line text control and an editable region, only name, identifier and accessible label are read.
- [x] A value matching a payment-card or national-identifier pattern is not recorded.
- [x] A hook registered against one loaded copy of the SDK is read by a second copy on the same page.
- [x] Of two hooks on the path, the closer one's attribution is used in its entirety, and no field from the farther one appears alongside it.
- [x] A hook returning only some attribution fields contributes exactly those fields, and the farther hook fills none of the omitted ones.
- [x] Reserved-prefix keys in a hook's custom data do not reach the record, and autocapture's own keys override same-named hook data.
- [x] A hook that throws does not prevent the event; the event is emitted and the failure then reaches the page's error handling, with a non-error thrown value wrapped and its original preserved as the cause.
- [x] Where two hooks on the path both throw, the failure reported is the one closer to the target.
- [x] A veto from any hook on the path suppresses the event even when a closer hook already contributed.
