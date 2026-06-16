# Feature: Studio DevTools

<!-- artifact-version: 1.2 -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-studio-devtools`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Panel Toggle and Keyboard Access](#panel-toggle-and-keyboard-access)
  - [Panel Drag and Reposition](#panel-drag-and-reposition)
  - [CollapsedButton Drag with Click Distinction](#collapsedbutton-drag-with-click-distinction)
  - [Panel Resize](#panel-resize)
  - [Theme Change](#theme-change)
  - [Language Change](#language-change)
  - [API Mock Mode Toggle](#api-mock-mode-toggle)
  - [Settings Restore on Mount](#settings-restore-on-mount)
  - [Viewport Position Clamping](#viewport-position-clamping)
  - [Conditional Loading and Production Exclusion](#conditional-loading-and-production-exclusion)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Position Clamping Algorithm](#position-clamping-algorithm)
  - [Default Position Derivation](#default-position-derivation)
  - [Persistence Initialization](#persistence-initialization)
  - [localStorage Read/Write with Error Guard](#localstorage-readwrite-with-error-guard)
  - [Event Routing for Dual Draggable Elements](#event-routing-for-dual-draggable-elements)
  - [Dropdown Portal Management](#dropdown-portal-management)
- [4. States (CDSL)](#4-states-cdsl)
  - [Panel Visibility State Machine](#panel-visibility-state-machine)
  - [Drag State Machine](#drag-state-machine)
  - [Resize State Machine](#resize-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [DoD: Floating Panel and Glassmorphic Overlay](#dod-floating-panel-and-glassmorphic-overlay)
  - [DoD: Control Panel Sections](#dod-control-panel-sections)
  - [DoD: Settings Persistence and Restore](#dod-settings-persistence-and-restore)
  - [DoD: Viewport Position Clamping](#dod-viewport-position-clamping)
  - [DoD: Keyboard Shortcut and Focus](#dod-keyboard-shortcut-and-focus)
  - [DoD: Conditional Loading and Zero Production Footprint](#dod-conditional-loading-and-zero-production-footprint)
- [6. Acceptance Criteria](#6-acceptance-criteria)
- [Additional Context](#additional-context)
  - [Storage Key Namespace](#storage-key-namespace)
  - [Studio Event Namespace](#studio-event-namespace)
  - [UIKit Component Organization](#uikit-component-organization)
  - [Panel Constraints](#panel-constraints)
  - [Dependency Boundary](#dependency-boundary)
  - [i18n Self-Registration](#i18n-self-registration)

<!-- /toc -->

- [x] `p2` - `cpt-frontx-feature-studio-devtools`

---

## 1. Feature Context

### 1.1 Overview

Studio DevTools is the development-time overlay package (`@gears-frontx/studio`) for FrontX applications. It provides a floating glassmorphic panel that developers can use to switch themes, languages, and API mock mode without leaving the running application.

Problem: During development, iterating on theme, language, and API mock states requires either page reloads, hard-coded configuration, or direct Redux DevTools manipulation — all of which break the iterative feedback loop.

Primary value: A single persistent panel accessible via keyboard shortcut gives developers instant control over the application's runtime configuration, with all changes preserved across page reloads through localStorage persistence.

Key assumptions: Studio is only mounted when `import.meta.env.DEV` is true. All state changes flow through the existing framework event bus — Studio does not bypass the standard Action → Event → Effect → Reducer flow. No framework or application code is modified to support Studio; all logic lives inside `@gears-frontx/studio`.

### 1.2 Purpose

Enable the Studio User to inspect and manipulate runtime configuration (theme, language, mock API state) through a draggable, resizable, collapsible overlay panel during development, with settings persisted to localStorage for session continuity.

Success criteria: A developer can toggle theme, language, and API mock mode in under two seconds from anywhere in the application, and the settings survive a page reload.

### 1.3 Actors

- `cpt-frontx-actor-studio-user` — Developer using the floating panel to adjust runtime configuration
- `cpt-frontx-actor-build-system` — Vite build process that tree-shakes Studio from production bundles
- `cpt-frontx-actor-runtime` — Browser that evaluates conditional imports, manages localStorage, and fires resize events
- `cpt-frontx-actor-framework-plugin` — Framework plugins (`themes()`, `i18n()`, `mock()`) that respond to events Studio emits during settings restore

### 1.4 References

- Overall Design: [DESIGN.md](../../DESIGN.md) — `cpt-frontx-component-studio`
- Decomposition: [DECOMPOSITION.md](../../DECOMPOSITION.md) — `cpt-frontx-feature-studio-devtools` (section 2.9)
- ADR: `cpt-frontx-adr-standalone-studio-dev-conditional`

---

## 2. Actor Flows (CDSL)

### Panel Toggle and Keyboard Access

- [x] `p1` - **ID**: `cpt-frontx-flow-studio-devtools-panel-toggle`

**Actors**: `cpt-frontx-actor-studio-user`

1. [ ] `p1` - Studio User presses `Shift+\`` (Backquote) — `inst-keyboard-shortcut`
2. [ ] `p1` - **IF** panel is currently collapsed **THEN** expand panel, show `StudioPanel`, hide `CollapsedButton` — `inst-expand-on-shortcut`
3. [ ] `p1` - **IF** panel is currently expanded **THEN** collapse panel, hide `StudioPanel`, show `CollapsedButton` — `inst-collapse-on-shortcut`
4. [ ] `p1` - Collapsed state is saved to `hai3:studio:collapsed` in localStorage — `inst-persist-collapsed`
5. [ ] `p1` - **RETURN** focus to the previously focused element — `inst-restore-focus`

---

### Panel Drag and Reposition

- [x] `p1` - **ID**: `cpt-frontx-flow-studio-devtools-drag-panel`

**Actors**: `cpt-frontx-actor-studio-user`, `cpt-frontx-actor-runtime`

1. [ ] `p1` - Studio User presses mouse button down on panel header — `inst-drag-mousedown`
2. [ ] `p1` - `useDraggable` hook records drag start offset (cursor position relative to panel top-left) — `inst-record-offset`
3. [ ] `p1` - `isDragging` state transitions to `true`; cursor changes to `grabbing` — `inst-dragging-state`
4. [ ] `p1` - **FOR EACH** `mousemove` event while dragging — `inst-mousemove-loop`
   - [x] `p1` - Compute candidate new position from cursor coordinates minus recorded offset — `inst-compute-candidate`
   - [x] `p1` - Clamp position to viewport bounds using `clampToViewport` with `VIEWPORT_MARGIN = 20` — `inst-clamp-during-drag`
   - [x] `p1` - Set panel position state to clamped value — `inst-set-position`
   - [x] `p1` - Emit `studio/positionChanged` event with new position — `inst-emit-position`
5. [ ] `p1` - On `mouseup`, `isDragging` transitions to `false`; cursor reverts to `grab` — `inst-mouseup`
6. [ ] `p1` - Persistence effect receives `studio/positionChanged` and writes position to `hai3:studio:position` — `inst-persist-panel-pos`

---

### CollapsedButton Drag with Click Distinction

- [x] `p1` - **ID**: `cpt-frontx-flow-studio-devtools-drag-button`

**Actors**: `cpt-frontx-actor-studio-user`, `cpt-frontx-actor-runtime`

1. [ ] `p1` - Studio User presses mouse button down on `CollapsedButton` — `inst-button-mousedown`
2. [ ] `p1` - Record drag start cursor position — `inst-record-start-pos`
3. [ ] `p1` - `useDraggable` hook activates with `storageKey = hai3:studio:buttonPosition` — `inst-button-draggable`
4. [ ] `p1` - On `mouseup`, compute total cursor displacement from start position — `inst-compute-displacement`
5. [ ] `p1` - **IF** displacement is less than 5px in both axes — `inst-click-threshold`
   - [x] `p1` - Treat interaction as a click: call `toggleCollapsed()` to expand the panel — `inst-toggle-on-click`
   - [x] `p1` - Button position does NOT change — `inst-no-pos-change-on-click`
6. [ ] `p1` - **IF** displacement is 5px or more in any axis — `inst-drag-threshold`
   - [x] `p1` - Treat interaction as a drag: follow cursor with viewport clamping — `inst-drag-button`
   - [x] `p1` - Emit `studio/buttonPositionChanged` with new position — `inst-emit-button-pos`
   - [x] `p1` - Panel does NOT expand — `inst-no-expand-on-drag`
7. [ ] `p1` - Persistence effect receives `studio/buttonPositionChanged` and writes to `hai3:studio:buttonPosition` — `inst-persist-button-pos`

---

### Panel Resize

- [x] `p1` - **ID**: `cpt-frontx-flow-studio-devtools-resize-panel`

**Actors**: `cpt-frontx-actor-studio-user`, `cpt-frontx-actor-runtime`

1. [ ] `p1` - Studio User presses mouse button down on bottom-right resize handle — `inst-resize-mousedown`
2. [ ] `p1` - `useResizable` hook records resize start state: current mouse coordinates and current panel dimensions — `inst-record-resize-start`
3. [ ] `p1` - Document cursor changes to `nwse-resize`; text selection disabled on `document.body` — `inst-resize-cursor`
4. [ ] `p1` - **FOR EACH** `mousemove` event while resizing — `inst-resize-mousemove`
   - [x] `p1` - Compute new width and height from delta since drag start — `inst-compute-new-size`
   - [x] `p1` - Clamp width to `[320, 600]` px — `inst-clamp-width`
   - [x] `p1` - Clamp height to `[400, 800]` px — `inst-clamp-height`
   - [x] `p1` - Set size state; emit `studio/sizeChanged` with new size — `inst-emit-size`
5. [ ] `p1` - On `mouseup`, cursor and text selection restored — `inst-resize-mouseup`
6. [ ] `p1` - Persistence effect receives `studio/sizeChanged` and writes size to `hai3:studio:size` — `inst-persist-size`

---

### Theme Change

- [x] `p1` - **ID**: `cpt-frontx-flow-studio-devtools-theme-change`

**Actors**: `cpt-frontx-actor-studio-user`, `cpt-frontx-actor-framework-plugin`

1. [ ] `p1` - Studio User opens theme dropdown in `ThemeSelector` — `inst-open-theme-dropdown`
2. [ ] `p1` - Dropdown reads available themes from `useTheme().themes` — `inst-load-themes`
3. [ ] `p1` - Studio User selects a theme — `inst-select-theme`
4. [ ] `p1` - `ThemeSelector` calls `setTheme(themeId)` — `inst-call-set-theme`
5. [ ] `p1` - Framework emits `theme/changed` event with `{ themeId }` — `inst-theme-event`
6. [ ] `p1` - Persistence effect subscribes to `theme/changed`; writes `themeId` to `hai3:studio:theme` — `inst-persist-theme`
7. [ ] `p1` - Application theme updates immediately — `inst-theme-applied`

---

### Language Change

- [x] `p1` - **ID**: `cpt-frontx-flow-studio-devtools-language-change`

**Actors**: `cpt-frontx-actor-studio-user`, `cpt-frontx-actor-framework-plugin`

1. [ ] `p1` - Studio User opens language dropdown in `LanguageSelector` — `inst-open-lang-dropdown`
2. [ ] `p1` - Dropdown lists all 36 supported languages from `SUPPORTED_LANGUAGES`; native script names displayed by default (`LanguageDisplayMode.Native`) — `inst-load-langs`
3. [ ] `p1` - RTL languages show `(RTL)` suffix — `inst-rtl-indicator`
4. [ ] `p1` - Studio User selects a language — `inst-select-lang`
5. [ ] `p1` - `LanguageSelector` calls `setLanguage(languageCode)` — `inst-call-set-lang`
6. [ ] `p1` - Framework emits `i18n/language/changed` event with `{ language }` — `inst-lang-event`
7. [ ] `p1` - Persistence effect subscribes to `i18n/language/changed`; writes `language` to `hai3:studio:language` — `inst-persist-lang`
8. [ ] `p1` - Application language updates immediately — `inst-lang-applied`

---

### API Mock Mode Toggle

- [x] `p1` - **ID**: `cpt-frontx-flow-studio-devtools-mock-toggle`

**Actors**: `cpt-frontx-actor-studio-user`, `cpt-frontx-actor-framework-plugin`

1. [ ] `p1` - Studio User clicks the `ApiModeToggle` switch — `inst-click-mock-toggle`
2. [ ] `p1` - `ApiModeToggle` reads current mock state from Redux via `useAppSelector` — `inst-read-mock-state`
3. [ ] `p1` - `ApiModeToggle` calls `toggleMockMode(newEnabled)` — `inst-call-toggle-mock`
4. [ ] `p1` - Framework emits `mock/toggle` event with `{ enabled }` — `inst-mock-event`
5. [ ] `p1` - Persistence effect subscribes to `mock/toggle`; writes `enabled` to `hai3:studio:mockEnabled` — `inst-persist-mock`
6. [ ] `p1` - All API services switch between real and mock responses — `inst-api-switched`

---

### Settings Restore on Mount

- [x] `p1` - **ID**: `cpt-frontx-flow-studio-devtools-restore-settings`

**Actors**: `cpt-frontx-actor-runtime`, `cpt-frontx-actor-framework-plugin`

1. [ ] `p1` - `StudioProvider` mounts; `useRestoreStudioSettings()` effect runs once — `inst-restore-effect`
2. [ ] `p1` - Read `hai3:studio:theme` from localStorage — `inst-read-theme`
3. [ ] `p1` - **IF** value is a non-empty string, emit `theme/changed` with `{ themeId }` — `inst-restore-theme`
4. [ ] `p1` - Read `hai3:studio:language` from localStorage — `inst-read-lang`
5. [ ] `p1` - **IF** value is a non-empty string, emit `i18n/language/changed` with `{ language }` — `inst-restore-lang`
6. [ ] `p1` - Read `hai3:studio:mockEnabled` from localStorage — `inst-read-mock`
7. [ ] `p1` - **IF** value is a boolean, emit `mock/toggle` with `{ enabled }` — `inst-restore-mock`

---

### Viewport Position Clamping

- [x] `p1` - **ID**: `cpt-frontx-flow-studio-devtools-viewport-clamp`

**Actors**: `cpt-frontx-actor-runtime`

1. [ ] `p1` - `useDraggable` initializes position by reading stored value from localStorage (or default) — `inst-init-pos`
2. [ ] `p1` - Immediately clamp the loaded position via `clampToViewport(storedPosition, elementSize)` — `inst-clamp-on-load`
3. [ ] `p1` - `clampToViewport` enforces: `x ∈ [20, innerWidth - elementWidth - 20]`, `y ∈ [20, innerHeight - elementHeight - 20]` — `inst-clamp-formula`
4. [ ] `p1` - **IF** viewport subsequently resizes (window `resize` event) — `inst-resize-event`
   - [x] `p1` - Re-clamp current position against the new viewport dimensions — `inst-re-clamp`
   - [x] `p1` - **IF** clamped position differs from current, update position state and emit position-changed event (so localStorage is updated) — `inst-update-on-resize`
   - [x] `p1` - **IF** clamped position equals current, no state update and no event emission — `inst-no-update-if-same`
5. [ ] `p1` - Same `clampToViewport` function used by both `StudioPanel` and `CollapsedButton` — `inst-shared-clamp`

---

### Conditional Loading and Production Exclusion

- [x] `p1` - **ID**: `cpt-frontx-flow-studio-devtools-conditional-load`

**Actors**: `cpt-frontx-actor-build-system`, `cpt-frontx-actor-runtime`

1. [ ] `p1` - Host application wraps Studio import with `import.meta.env.DEV` guard — `inst-dev-guard`
2. [ ] `p1` - **IF** `import.meta.env.DEV` is true: dynamically import `StudioOverlay` from `@gears-frontx/studio` — `inst-dev-import`
3. [ ] `p1` - Mount `StudioOverlay` inside `StudioProvider` beneath `HAI3Provider` — `inst-mount-overlay`
4. [ ] `p1` - **IF** `import.meta.env.DEV` is false: Vite tree-shakes the entire conditional branch and `@gears-frontx/studio` package — `inst-treeshake`
5. [ ] `p1` - Production bundle contains zero Studio code and zero Studio UIKit imports — `inst-zero-prod-footprint`

---

## 3. Processes / Business Logic (CDSL)

### Position Clamping Algorithm

- [x] `p1` - **ID**: `cpt-frontx-algo-studio-devtools-clamp-to-viewport`

Given element position `{x, y}` and element size `{width, height}`:

1. [ ] `p1` - Compute `maxX = max(VIEWPORT_MARGIN, innerWidth - width - VIEWPORT_MARGIN)` — `inst-compute-max-x`
2. [ ] `p1` - Compute `maxY = max(VIEWPORT_MARGIN, innerHeight - height - VIEWPORT_MARGIN)` — `inst-compute-max-y`
3. [ ] `p1` - **RETURN** `{ x: clamp(x, VIEWPORT_MARGIN, maxX), y: clamp(y, VIEWPORT_MARGIN, maxY) }` — `inst-return-clamped`
4. [ ] `p1` - Where `VIEWPORT_MARGIN = 20` (a single constant shared across all usages) — `inst-margin-constant`

---

### Default Position Derivation

- [x] `p1` - **ID**: `cpt-frontx-algo-studio-devtools-default-position`

Used when no stored position exists in localStorage:

1. [ ] `p1` - Compute `x = innerWidth - elementWidth - VIEWPORT_MARGIN` — `inst-default-x`
2. [ ] `p1` - Compute `y = innerHeight - elementHeight - VIEWPORT_MARGIN` — `inst-default-y`
3. [ ] `p1` - **RETURN** `{ x, y }` — this places the element near the bottom-right corner — `inst-return-default`

---

### Persistence Initialization

- [x] `p1` - **ID**: `cpt-frontx-algo-studio-devtools-persistence-init`

Called once when `StudioProvider` mounts via `initPersistenceEffects()`:

1. [ ] `p1` - Subscribe `studio/positionChanged` → write payload `position` to `hai3:studio:position` — `inst-sub-position`
2. [ ] `p1` - Subscribe `studio/sizeChanged` → write payload `size` to `hai3:studio:size` — `inst-sub-size`
3. [ ] `p1` - Subscribe `studio/buttonPositionChanged` → write payload `position` to `hai3:studio:buttonPosition` — `inst-sub-button-pos`
4. [ ] `p1` - Subscribe `theme/changed` → write payload `themeId` to `hai3:studio:theme` — `inst-sub-theme`
5. [ ] `p1` - Subscribe `i18n/language/changed` → write payload `language` to `hai3:studio:language` — `inst-sub-lang`
6. [ ] `p1` - Subscribe `mock/toggle` → write payload `enabled` to `hai3:studio:mockEnabled` — `inst-sub-mock`
7. [ ] `p1` - **RETURN** cleanup function that calls `.unsubscribe()` on all six subscriptions — `inst-return-cleanup`

---

### localStorage Read/Write with Error Guard

- [x] `p1` - **ID**: `cpt-frontx-algo-studio-devtools-localStorage-guard`

All reads and writes to localStorage use guarded utilities:

1. [ ] `p1` - **Save**: `TRY` `localStorage.setItem(key, JSON.stringify(value))` — `inst-save-try`
2. [ ] `p1` - **CATCH** any error (quota exceeded, storage disabled) → log warning, do NOT throw — `inst-save-catch`
3. [ ] `p1` - **Load**: `TRY` read `localStorage.getItem(key)` — `inst-load-try`
4. [ ] `p1` - **IF** item is null, **RETURN** `defaultValue` — `inst-load-null`
5. [ ] `p1` - Parse JSON; **RETURN** parsed value — `inst-load-parse`
6. [ ] `p1` - **CATCH** any parse error → log warning, **RETURN** `defaultValue` — `inst-load-catch`

---

### Event Routing for Dual Draggable Elements

- [x] `p1` - **ID**: `cpt-frontx-algo-studio-devtools-event-routing`

`useDraggable` selects the correct event name based on `storageKey`:

1. [ ] `p1` - **IF** `storageKey === STORAGE_KEYS.BUTTON_POSITION` → emit `studio/buttonPositionChanged` — `inst-route-button`
2. [ ] `p1` - **ELSE** → emit `studio/positionChanged` — `inst-route-panel`
3. [ ] `p1` - This routing applies both during active dragging (`mousemove`) and on viewport resize — `inst-route-both-paths`
4. [ ] `p1` - Panel position and button position are stored under separate keys and never overwrite each other — `inst-independent-keys`

---

### Dropdown Portal Management

- [x] `p1` - **ID**: `cpt-frontx-algo-studio-devtools-portal-management`

Prevents dropdowns from being clipped by the glassmorphic panel's `backdrop-filter` stacking context:

1. [ ] `p1` - `StudioPanel` renders a `<div>` with `z-[99999]`, `fixed` positioning, and `pointer-events-none` as a portal container — `inst-portal-div`
2. [ ] `p1` - On mount, `StudioPanel` registers the portal container with `StudioContext` via `setPortalContainer(ref.current)` — `inst-register-portal`
3. [ ] `p1` - On unmount, `StudioPanel` clears the portal container via `setPortalContainer(null)` — `inst-clear-portal`
4. [ ] `p1` - `ThemeSelector` and `LanguageSelector` each read `portalContainer` from `useStudioContext()` — `inst-read-portal`
5. [ ] `p1` - Each dropdown passes `container={portalContainer}` to `DropdownMenuContent` and adds `className="z-[99999] pointer-events-auto"` — `inst-set-container`

---

## 4. States (CDSL)

### Panel Visibility State Machine

- [x] `p1` - **ID**: `cpt-frontx-state-studio-devtools-panel-visibility`

1. [ ] `p1` - **FROM** `EXPANDED` **TO** `COLLAPSED` **WHEN** Studio User clicks collapse button in panel header — `inst-collapse-via-header`
2. [ ] `p1` - **FROM** `EXPANDED` **TO** `COLLAPSED` **WHEN** Studio User presses `Shift+\`` — `inst-collapse-via-kbd`
3. [ ] `p1` - **FROM** `COLLAPSED` **TO** `EXPANDED` **WHEN** Studio User clicks `CollapsedButton` without dragging (displacement < 5px) — `inst-expand-via-click`
4. [ ] `p1` - **FROM** `COLLAPSED` **TO** `EXPANDED` **WHEN** Studio User presses `Shift+\`` — `inst-expand-via-kbd`
5. [ ] `p1` - **FROM** any state **TO** same state (no transition) **WHEN** Studio User drags `CollapsedButton` (displacement ≥ 5px) — `inst-drag-no-transition`
6. [ ] `p1` - Visibility state is persisted to `hai3:studio:collapsed` on every transition — `inst-persist-visibility`

---

### Drag State Machine

- [x] `p1` - **ID**: `cpt-frontx-state-studio-devtools-drag`

Applies independently to both `StudioPanel` and `CollapsedButton` draggables:

1. [ ] `p1` - **FROM** `IDLE` **TO** `DRAGGING` **WHEN** `mousedown` on drag handle — `inst-drag-start`
2. [ ] `p1` - **FROM** `DRAGGING` **TO** `DRAGGING` **WHEN** `mousemove` (position updates, event emitted) — `inst-drag-move`
3. [ ] `p1` - **FROM** `DRAGGING` **TO** `IDLE` **WHEN** `mouseup` — `inst-drag-end`
4. [ ] `p1` - Cursor is `grabbing` in `DRAGGING` state, `grab` in `IDLE` state — `inst-drag-cursor`

---

### Resize State Machine

- [x] `p1` - **ID**: `cpt-frontx-state-studio-devtools-resize`

1. [ ] `p1` - **FROM** `IDLE` **TO** `RESIZING` **WHEN** `mousedown` on bottom-right resize handle — `inst-resize-start`
2. [ ] `p1` - **FROM** `RESIZING` **TO** `RESIZING` **WHEN** `mousemove` (size updates within constraints, event emitted) — `inst-resize-move`
3. [ ] `p1` - **FROM** `RESIZING` **TO** `IDLE` **WHEN** `mouseup` — `inst-resize-end`
4. [ ] `p1` - In `RESIZING` state: document cursor is `nwse-resize`, `body.userSelect` is `none` — `inst-resize-body-styles`
5. [ ] `p1` - On transition to `IDLE`, body cursor and user-select styles are restored — `inst-resize-restore-styles`

---

## 5. Definitions of Done

### DoD: Floating Panel and Glassmorphic Overlay

- [x] `p1` - **ID**: `cpt-frontx-dod-studio-devtools-panel-overlay`

`StudioPanel` renders as a fixed-position floating overlay with glassmorphic styling, a draggable header, collapsible state, and a bottom-right resize handle. `CollapsedButton` is a 48×48 circular glassmorphic button that appears when the panel is collapsed and supports independent dragging.

**Implementation details**:
- `StudioPanel`: fixed positioning, `z-[10000]`, `Card` component with Tailwind glassmorphic classes (`bg-white/20 dark:bg-black/50 backdrop-blur-md backdrop-saturate-[180%] border-white/30 dark:border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.2)]`)
- `CollapsedButton`: `GlassmorphicButton` with matching glassmorphic Tailwind classes, 48×48px, `ButtonVariant.Ghost`
- `StudioIcon` located at `packages/studio/src/uikit/icons/StudioIcon.tsx`
- `GlassmorphicButton` located at `packages/studio/src/uikit/composite/GlassmorphicButton.tsx`
- Resize handle enforces width `[320, 600]` and height `[400, 800]` via `PANEL_CONSTRAINTS`
- UI components from Studio local `packages/studio/src/uikit/`

**Implements**:
- `cpt-frontx-flow-studio-devtools-drag-panel`
- `cpt-frontx-flow-studio-devtools-drag-button`
- `cpt-frontx-flow-studio-devtools-resize-panel`
- `cpt-frontx-algo-studio-devtools-clamp-to-viewport`
- `cpt-frontx-algo-studio-devtools-portal-management`
- `cpt-frontx-state-studio-devtools-panel-visibility`
- `cpt-frontx-state-studio-devtools-drag`
- `cpt-frontx-state-studio-devtools-resize`

**Covers (PRD)**:
- `cpt-frontx-fr-studio-panel`
- `cpt-frontx-fr-studio-viewport`
- `cpt-frontx-nfr-perf-treeshake`

**Covers (DESIGN)**:
- `cpt-frontx-component-studio`
- `cpt-frontx-constraint-typescript-strict-mode`

---

### DoD: Control Panel Sections

- [x] `p1` - **ID**: `cpt-frontx-dod-studio-devtools-control-panel`

`ControlPanel` renders three sections vertically: `ApiModeToggle`, `ThemeSelector`, `LanguageSelector`. Controls use Studio local UI (`packages/studio/src/uikit/`) or project-chosen components. Dropdowns render inside the high-z-index portal container to prevent clipping by the panel's `backdrop-filter` stacking context. The host application's nav menu — not Studio — surfaces the screens registered against every co-existing GTS package; Studio's scope is bounded to theme, language, and API mock toggles.

**Implementation details**:
- `ThemeSelector`: reads `useTheme()`, uses `DropdownMenu` / `DropdownButton` with `ButtonVariant.Outline`; formats names with `upperFirst` word-split on `-`
- `LanguageSelector`: reads `useTranslation()`; lists all 36 `SUPPORTED_LANGUAGES`; defaults to `LanguageDisplayMode.Native`; appends `(RTL)` for right-to-left languages
- `ApiModeToggle`: reads Redux mock state via `useAppSelector`; dispatches `toggleMockMode()`; uses UIKit `Switch`
- All dropdown `DropdownMenuContent` elements receive `container={portalContainer}` and `className="z-[99999] pointer-events-auto"`

**Implements**:
- `cpt-frontx-flow-studio-devtools-theme-change`
- `cpt-frontx-flow-studio-devtools-language-change`
- `cpt-frontx-flow-studio-devtools-mock-toggle`
- `cpt-frontx-algo-studio-devtools-portal-management`

**Covers (PRD)**:
- `cpt-frontx-fr-studio-controls`
- `cpt-frontx-fr-mock-toggle`

**Covers (DESIGN)**:
- `cpt-frontx-component-studio`
- `cpt-frontx-principle-event-driven-architecture`

---

### DoD: Settings Persistence and Restore

- [x] `p1` - **ID**: `cpt-frontx-dod-studio-devtools-persistence`

All Studio control panel settings (theme, language, mock mode) and all UI state (panel position, panel size, collapsed state, button position) are persisted to localStorage on change and restored on Studio mount. All persistence logic lives exclusively inside `@gears-frontx/studio`.

**Implementation details**:
- Storage keys under prefix `hai3:studio:` — see `STORAGE_KEYS` in `packages/studio/src/types.ts`
- `initPersistenceEffects()` registers six event subscriptions in `StudioProvider` mount effect; returns cleanup
- `useRestoreStudioSettings()` runs once on mount; emits `theme/changed`, `i18n/language/changed`, `mock/toggle` if values exist
- `StudioProvider` initializes `collapsed` state from `loadStudioState(STORAGE_KEYS.COLLAPSED, false)`
- `useDraggable` initializes position from `loadStudioState(storageKey, getDefaultPosition())`
- `useResizable` initializes size from `loadStudioState(STORAGE_KEYS.SIZE, { width: 400, height: 500 })`
- No framework or application code is modified; restore uses existing framework events

**Implements**:
- `cpt-frontx-flow-studio-devtools-restore-settings`
- `cpt-frontx-algo-studio-devtools-persistence-init`
- `cpt-frontx-algo-studio-devtools-localStorage-guard`

**Covers (PRD)**:
- `cpt-frontx-fr-studio-persistence`

**Covers (DESIGN)**:
- `cpt-frontx-component-studio`

---

### DoD: Viewport Position Clamping

- [x] `p1` - **ID**: `cpt-frontx-dod-studio-devtools-viewport-clamping`

Both `StudioPanel` and `CollapsedButton` always remain fully visible within the viewport with a 20px margin from all edges, both on initial mount and after window resize.

**Implementation details**:
- `clampToViewport(position, size)` shared function used by both elements
- Called on initialization inside `useState` initializer in `useDraggable`
- Window `resize` listener re-clamps and emits position-changed event only when position actually changes
- Single `VIEWPORT_MARGIN = 20` constant defined once in `useDraggable.ts`

**Implements**:
- `cpt-frontx-flow-studio-devtools-viewport-clamp`
- `cpt-frontx-algo-studio-devtools-clamp-to-viewport`
- `cpt-frontx-algo-studio-devtools-default-position`
- `cpt-frontx-algo-studio-devtools-event-routing`

**Covers (PRD)**:
- `cpt-frontx-fr-studio-viewport`

**Covers (DESIGN)**:
- `cpt-frontx-component-studio`

---

### DoD: Keyboard Shortcut and Focus

- [x] `p1` - **ID**: `cpt-frontx-dod-studio-devtools-keyboard`

Studio panel toggling is accessible via `Shift+\`` keyboard shortcut using `e.code === 'Backquote'` for cross-keyboard-layout reliability.

**Implementation details**:
- `useKeyboardShortcut(handler)` registers `window` `keydown` listener; unregisters on cleanup
- Uses `e.code` (physical key) rather than `e.key` (character) to handle international keyboards
- `e.preventDefault()` called on match to suppress browser defaults
- Handler is `toggleCollapsed` from `StudioContext`

**Implements**:
- `cpt-frontx-flow-studio-devtools-panel-toggle` (steps 1–5)

**Covers (PRD)**:
- `cpt-frontx-fr-studio-panel`

**Covers (DESIGN)**:
- `cpt-frontx-component-studio`

---

### DoD: Conditional Loading and Zero Production Footprint

- [x] `p1` - **ID**: `cpt-frontx-dod-studio-devtools-conditional-loading`

`@gears-frontx/studio` is a standalone workspace package with `"sideEffects": false`. The host application loads it only in development via a `import.meta.env.DEV`-guarded dynamic `import()`. Production builds contain no Studio code.

**Implementation details**:
- Package: `@gears-frontx/studio`, ESM-first, `"type": "module"`, `"sideEffects": false`
- Host entry point pattern: `if (import.meta.env.DEV) { const { StudioOverlay } = await import('@gears-frontx/studio'); ... }`
- Vite tree-shakes the entire branch in production; no Studio chunk emitted
- Studio translations registered automatically when `StudioProvider` is imported (side-effect-free i18n registry call at module scope)

**Implements**:
- `cpt-frontx-flow-studio-devtools-conditional-load`

**Covers (PRD)**:
- `cpt-frontx-fr-studio-independence`
- `cpt-frontx-nfr-perf-treeshake`

**Covers (DESIGN)**:
- `cpt-frontx-component-studio`
- `cpt-frontx-constraint-typescript-strict-mode`
- `cpt-frontx-constraint-esm-first-module-format`

---

## 6. Acceptance Criteria

- [x] Studio panel renders as a fixed glassmorphic overlay in development mode and does not appear in production builds
- [x] Panel can be dragged to any in-viewport position and resized within `[320–600]×[400–800]` px constraints
- [x] Collapsed button and panel maintain independent positions with the 5px click-vs-drag threshold correctly separating the two interactions
- [x] `Shift+\`` toggles panel visibility from any focus point in the application
- [x] Dropdown menus for theme and language render above the panel with no z-index clipping
- [x] Changing theme, language, or mock mode via Studio applies the change immediately to the live application
- [x] All settings survive a page reload — theme, language, mock state, position, size, collapsed state all restore correctly
- [x] Settings restore emits framework events that existing plugin handlers process without any framework code changes
- [x] Panel and button positions are clamped to the visible viewport on load and re-clamped on window resize; no unnecessary persistence occurs when position is unchanged
- [x] No Studio code executes in production (`import.meta.env.DEV` guard confirmed via bundle analysis)
- [x] All `@gears-frontx/studio` code compiles with TypeScript strict mode and zero `any`/`as unknown as` violations

---

## Additional Context

### Storage Key Namespace

All localStorage keys use the prefix `hai3:studio:`. Current keys defined in `STORAGE_KEYS`:

| Key | Value stored |
|-----|-------------|
| `hai3:studio:position` | `{ x: number, y: number }` — panel position |
| `hai3:studio:size` | `{ width: number, height: number }` — panel size |
| `hai3:studio:collapsed` | `boolean` — panel collapsed state |
| `hai3:studio:buttonPosition` | `{ x: number, y: number }` — collapsed button position |
| `hai3:studio:theme` | `string` — theme ID |
| `hai3:studio:language` | `string` — language code |
| `hai3:studio:mockEnabled` | `boolean` — mock API enabled state |

### Studio Event Namespace

Studio-internal events use the `studio/` prefix and are declared via TypeScript module augmentation on `EventPayloadMap` from `@gears-frontx/state`. Framework events consumed by Studio (`theme/changed`, `i18n/language/changed`, `mock/toggle`) are not owned by Studio.

### UIKit Component Organization

Following screenset conventions:
- Icons: `packages/studio/src/uikit/icons/` — `StudioIcon.tsx`
- Composite components: `packages/studio/src/uikit/composite/` — `GlassmorphicButton.tsx`

### Panel Constraints

| Constraint | Value |
|-----------|-------|
| Min width | 320 px |
| Max width | 600 px |
| Min height | 400 px |
| Max height | 800 px |
| Default width | 400 px |
| Default height | 500 px |
| Button size | 48 × 48 px |
| Viewport margin | 20 px |
| Click-vs-drag threshold | 5 px |
| Panel z-index | 10000 |
| Portal container z-index | 99999 |

### Dependency Boundary

`@gears-frontx/studio` depends on `@gears-frontx/react` (for hooks, `eventBus`, `HAI3Provider` context). UI components are supplied from Studio local `packages/studio/src/uikit/`. Dependencies are direct compile-time, tree-shaken in production because the entire Studio conditional branch is eliminated. Studio does NOT depend on `@gears-frontx/framework` or any L1 package directly.

### i18n Self-Registration

Studio registers its own translation namespace (`studio`) via `I18nRegistry.createLoader()` at module import time inside `StudioProvider.tsx`. This fires before any component renders, ensuring translations are available. Studio ships translation JSON files for all 36 supported languages.
