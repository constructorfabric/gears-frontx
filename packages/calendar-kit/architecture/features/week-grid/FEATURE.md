# Feature: Week Grid With Host-Owned Interaction Modes

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-featstatus-week-grid`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Embed The Week Grid In A Host Page](#embed-the-week-grid-in-a-host-page)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Interaction Mode Gating](#interaction-mode-gating)
  - [Paint Range Building](#paint-range-building)
  - [Move Request Handshake](#move-request-handshake)
- [4. States (CDSL)](#4-states-cdsl)
  - [Interaction Mode State Machine](#interaction-mode-state-machine)
  - [Pending Move State Machine](#pending-move-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Host Data And Mode Boundary](#host-data-and-mode-boundary)
  - [Mode-Gated Callbacks With Confirmed-Only Move Commit](#mode-gated-callbacks-with-confirmed-only-move-commit)
  - [Host Rendering Through Slots](#host-rendering-through-slots)
  - [Keyboard And Focus Contract](#keyboard-and-focus-contract)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

## 1. Feature Context

The feature-entry identifier the kit's template places here is deliberately absent. That identifier kind is owned by a DECOMPOSITION, and a layer member owns no DECOMPOSITION, so declaring one here would be a reference with no definition. `cpt-frontx-calendar-kit-featstatus-week-grid` above carries this feature's identity instead.

### 1.1 Overview

This feature is the first-delivery family unit of `@gears-frontx/calendar-kit`: the `WeekGrid` component (`WeekGridProps`) over the shared low-level `CalendarGrid` (`CalendarGridProps`), shipped as the flat `./week-grid` and `./grid` entries. It renders a host-supplied week of neutral UI-model events with all-day spans and deterministic overlap geometry, and exposes exactly three host-selected interaction modes — `quick-create`, `paint-and-move`, and `read-only` (`WeekGridInteractionMode`) — each emitting only its own typed callbacks: `onQuickCreate` (serializable range plus optional browser anchor), `onPaintSelect` (ordered serializable range), `onMoveRequest` (confirm/cancel handshake) and `onEventSelect`. Host-specific card, conflict and detail content enters only through the `renderEvent`, `renderConflict` and `renderDetail` slots; the library holds no backend, planning, solver or permission state.

### 1.2 Purpose

This feature makes the week-grid family unit concrete: installable entries whose grid a host embeds with its own data and permission model, per `cpt-frontx-calendar-kit-adr-calendar-kit-packaging`. It is the executable specification behind the acceptance suites named in §6, which pin the mode gating, the move handshake, and the slot rendering.

**Requirements**: `cpt-frontx-calendar-kit-fr-neutral-ui-data-model`, `cpt-frontx-calendar-kit-fr-host-owned-interaction-modes`, `cpt-frontx-calendar-kit-fr-product-render-slots`, `cpt-frontx-calendar-kit-fr-conflict-dimension-rendering`, `cpt-frontx-calendar-kit-fr-controlled-uncontrolled-apis`, `cpt-frontx-calendar-kit-fr-accessibility`

**Principles**: `cpt-frontx-calendar-kit-principle-host-owned-control`, `cpt-frontx-calendar-kit-principle-solution-behavior-via-callbacks-slots`

**Components**: `cpt-frontx-calendar-kit-component-ui-data-model`, `cpt-frontx-calendar-kit-component-react-free-core`, `cpt-frontx-calendar-kit-component-react-adapters`, `cpt-frontx-calendar-kit-component-ui-family-units`

### 1.3 Actors

| Actor | Role in Feature |
| --- | --- |
| `cpt-frontx-calendar-kit-actor-consumer-developer` | Maps host events into the UI model, renders `WeekGrid` with host data, mode and permission state, and wires callbacks and slots. |
| `cpt-frontx-calendar-kit-actor-host-application` | Owns data, version state, permissions and backend operations; confirms or cancels move requests. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR**: `cpt-frontx-calendar-kit-adr-calendar-kit-packaging`
- **Acceptance tests**: `src/ui/week-grid/tests/`, `src/ui/grid/tests/`, `src/react/controllers/tests/use-week-grid-controller.test.ts`, `src/react/hooks/tests/use-interaction-controller.test.ts`, `src/core/tests/model.test.ts`, `src/core/tests/grid.test.ts`, `src/core/tests/interactions.test.ts`, `src/core/tests/layout.test.ts`, `src/core/tests/temporal.test.ts`, `src/ui/week-grid/tests/week-grid-detail-slot.test.tsx`, `src/styles/tests/theme.test.ts`, `scripts/tests/docs.test.ts`, `dist-tests/dist-import.test.ts`

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-calendar-kit-usecase-embed-week-grid`

### Embed The Week Grid In A Host Page

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-flow-week-grid-host-embedding`

**Actor**: `cpt-frontx-calendar-kit-actor-consumer-developer`

**Realizes**: `cpt-frontx-calendar-kit-seq-week-grid-host-embedding`

**Success Scenarios**:

- The host maps its events into the neutral UI model and renders the week grid; every user action returns to the host as a typed callback, and host-specific content renders through slots.

**Error Scenarios**:

- The host owns loading, error, and empty-state presentation; the supplied event collection renders as the ordinary grid surface, including when it is empty.
- The host cancels a pending move: the grid restores the pre-drag state and commits nothing.

**Steps**:

1. [ ] - `p1` - The host maps its backend events into `CalendarEvent` values and renders `WeekGrid` with `date`, `events`, the selected `interactionMode`, and `t`/`direction`/`locale`/`timeZone` - `inst-wg-render`
2. [ ] - `p1` - The core builds the week range, segments multi-day events, allocates all-day spans and computes overlap geometry; the grid renders day columns, an all-day row and timed cells - `inst-wg-derive`
3. [ ] - `p1` - The user selects an event; the grid calls `onEventSelect` with the event and its render context, updating the controlled or uncontrolled `selectedEventId` - `inst-wg-select`
4. [ ] - `p1` - **IF** the mode is `quick-create` and the user activates an empty cell, the grid calls `onQuickCreate` with the `CalendarSelectionRange` and an optional anchor rectangle - `inst-wg-quick-create`
5. [ ] - `p1` - **IF** the mode is `paint-and-move`: - `inst-wg-if-paint-move`
   1. [ ] - `p1` - The user drags over cells; the grid calls `onPaintSelect` with the ordered, serializable range - `inst-wg-paint`
   2. [ ] - `p1` - The user drags an event to another slot; the grid calls `onMoveRequest` with the event, source and target cells, and `confirm`/`cancel` functions - `inst-wg-move-request`
   3. [ ] - `p1` - **IF** the host calls `confirm`, the pending move commits; **IF** the host calls `cancel`, it is discarded and the pre-drag state is restored - `inst-wg-move-resolve`
6. [ ] - `p1` - **IF** the mode is `read-only`, the grid renders the same surface and emits none of the create, paint or move callbacks - `inst-wg-read-only`
7. [ ] - `p1` - Host-specific card, conflict and detail content renders through `renderEvent`, `renderConflict` and `renderDetail`; conflicts show their dimension plus the host-supplied label - `inst-wg-slots`
8. [ ] - `p1` - **RETURN** PASS — every consumer-visible action resolved to a host callback and the library performed no backend operation - `inst-wg-return-pass`

## 3. Processes / Business Logic (CDSL)

### Interaction Mode Gating

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-algo-week-grid-mode-gating`

Pure core transition logic over `WeekGridInteractionMode`, adapted to React state by the controller hook.

**Steps**:

1. [ ] - `p1` - **IF** the mode is `read-only`, permit only event selection; no create/paint/move callback is returned for any other action - `inst-gate-read-only`
2. [ ] - `p1` - **IF** the mode is `quick-create`, permit empty-cell activation as `onQuickCreate` and event selection; paint and drag actions produce no callback - `inst-gate-quick-create`
3. [ ] - `p1` - **IF** the mode is `paint-and-move`, permit cell painting as `onPaintSelect`, event dragging as `onMoveRequest`, and event selection - `inst-gate-paint-move`
4. [ ] - `p1` - **RETURN** the permitted callback identity; the UI layer emits it and nothing else - `inst-gate-return`

### Paint Range Building

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-algo-week-grid-paint-range`

**Steps**:

1. [ ] - `p1` - Record the anchor cell on pointer down - `inst-paint-anchor`
2. [ ] - `p1` - **FOR EACH** entered cell, extend the contiguous range between the anchor and the current cell, keeping the collected cells ordered chronologically within the week - `inst-paint-extend`
3. [ ] - `p1` - **RETURN** the ordered, serializable `CalendarSelectionRange` (start cell, end cell, full cell list); the browser-only anchor rectangle stays out of the range and travels separately in the quick-create payload - `inst-paint-return`

### Move Request Handshake

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-algo-week-grid-move-handshake`

**Steps**:

1. [ ] - `p1` - On drag end over a valid target cell, enter the pending state and call `onMoveRequest` with the event, `from`, `to`, and `confirm`/`cancel` - `inst-move-request`
2. [ ] - `p1` - **IF** the host calls `confirm`, commit the pending move; **IF** the host calls `cancel`, discard it and restore the pre-drag render state - `inst-move-resolve`
3. [ ] - `p1` - **RETURN** without committing when neither function is called; the grid performs no backend mutation itself - `inst-move-return`

## 4. States (CDSL)

### Interaction Mode State Machine

- [ ] `p2` - **ID**: `cpt-frontx-calendar-kit-state-week-grid-interaction-mode`

**States**: QUICK_CREATE, PAINT_AND_MOVE, READ_ONLY

**Initial State**: The host's `interactionMode`, or `defaultInteractionMode` when uncontrolled

**Transitions**:

1. [ ] - `p1` - **FROM** any state **TO** the host-selected mode **WHEN** the controlled `interactionMode` prop changes, or the uncontrolled default applies on mount; each state exposes exactly its own action paths - `inst-mode-switch`

### Pending Move State Machine

- [ ] `p2` - **ID**: `cpt-frontx-calendar-kit-state-week-grid-pending-move`

**States**: IDLE, PENDING, COMMITTED, DISCARDED

**Initial State**: IDLE

**Transitions**:

1. [ ] - `p1` - **FROM** IDLE **TO** PENDING **WHEN** a drag ends over a valid target cell in `paint-and-move` mode and `onMoveRequest` fires - `inst-pm-idle-to-pending`
2. [ ] - `p1` - **FROM** PENDING **TO** COMMITTED **WHEN** the host calls `confirm` — the only committing transition - `inst-pm-confirm`
3. [ ] - `p1` - **FROM** PENDING **TO** DISCARDED **WHEN** the host calls `cancel`; the pre-drag state is restored - `inst-pm-cancel`
4. [ ] - `p1` - **FROM** COMMITTED or DISCARDED **TO** IDLE **WHEN** the next interaction begins - `inst-pm-reset`

## 5. Definitions of Done

### Host Data And Mode Boundary

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-dod-week-grid-host-data-boundary`

The system **MUST** receive all events, the active date, the interaction mode and permission/read-only state from the host as props over the neutral UI model, and **MUST NOT** import or call any host scheduling backend, solver, planning service, Redux slice or i18n registry; version switching stays host state.

**Implements**: `cpt-frontx-calendar-kit-flow-week-grid-host-embedding`

**Constraints**: `cpt-frontx-constraint-calendar-kit-no-solution-content`, `cpt-frontx-constraint-calendar-kit-react-free-core`

**Touches**: `CalendarEvent`, `WeekGridProps`

### Mode-Gated Callbacks With Confirmed-Only Move Commit

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-dod-week-grid-mode-callbacks`

The system **MUST** emit, per mode, exactly its own callbacks — `quick-create`: `onQuickCreate` and `onEventSelect`; `paint-and-move`: `onPaintSelect`, `onMoveRequest` and `onEventSelect`; `read-only`: none of create, paint or move — **MUST** commit a pending move only through the host's `confirm` call, restore the pre-drag state on `cancel`, and never commit when neither is called, and **MUST** keep `selectedEventId` and the interaction mode available as both controlled (value plus change callback) and uncontrolled (`default*`) APIs.

**Implements**: `cpt-frontx-calendar-kit-algo-week-grid-mode-gating`, `cpt-frontx-calendar-kit-algo-week-grid-move-handshake`, `cpt-frontx-calendar-kit-state-week-grid-interaction-mode`, `cpt-frontx-calendar-kit-state-week-grid-pending-move`

**Touches**: `WeekGridInteractionMode`, `CalendarQuickCreatePayload`, `CalendarSelectionRange`, `CalendarMoveRequest`

### Host Rendering Through Slots

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-dod-week-grid-slots`

The system **MUST** render event cards, conflicts and the detail panel through the host's `renderEvent`, `renderConflict` and `renderDetail` slots with their typed contexts, **MUST** display each conflict's dimension plus the host-supplied label without inventing host vocabulary, and **MUST NOT** render loading, empty, or error-state UI.

**Implements**: `cpt-frontx-calendar-kit-flow-week-grid-host-embedding`

**Touches**: `CalendarEventRenderContext`, `CalendarConflict`, `CalendarDetailRenderContext`

### Keyboard And Focus Contract

- [ ] `p1` - **ID**: `cpt-frontx-calendar-kit-dod-week-grid-keyboard`

The system **MUST** provide roving keyboard focus across day columns and cells with accessible labels from `getCellLabel`, Enter/Space activation of events, and correct focus restoration after a move request, meeting WCAG 2.1 Level AA.

**Implements**: `cpt-frontx-calendar-kit-flow-week-grid-host-embedding`

**Touches**: `CalendarCellContext`, `CalendarGridProps`

## 6. Acceptance Criteria

- [ ] `src/ui/week-grid/tests/` — a read-only `WeekGrid` emits none of the create/paint/move callbacks; quick-create and paint-and-move emit exactly their own; semantic roles, keyboard focus, geometry, and slot rendering are asserted.
- [ ] `src/react/controllers/tests/use-week-grid-controller.test.ts` and `src/react/hooks/tests/use-interaction-controller.test.ts` — controlled/uncontrolled mode and selection state, the ordered paint range, and the confirm/cancel handshake where `confirm` is the only committing path.
- [ ] `src/ui/grid/tests/calendar-grid.test.tsx` and `src/ui/grid/tests/calendar-grid-declaration.test.ts` — the `CalendarGridProps` contract (getCellKey/getCellLabel/renderCell arities and keyboard contract) holds.
- [ ] `src/core/tests/model.test.ts`, `src/core/tests/grid.test.ts`, `src/core/tests/interactions.test.ts`, `src/core/tests/layout.test.ts`, `src/core/tests/temporal.test.ts` — malformed intervals and invalid modes fail for the intended reason; segmentation, span allocation and overlap geometry are deterministic.
- [ ] `src/ui/week-grid/tests/week-grid-detail-slot.test.tsx` — a custom detail slot renders.
- [ ] `src/styles/tests/theme.test.ts` — dark, forced-colors and reduced-motion parity over the `--cal-*` contract.
- [ ] `scripts/tests/docs.test.ts` — generated doc regions stay in step and links resolve to shipped docs.
- [ ] `dist-tests/dist-import.test.ts` — the built package and its family entries import, and chunk cycles stay at the two known family/controller pairs.
