# Studio Guidelines

## AI WORKFLOW (REQUIRED)
1) Summarize 3-6 rules from this file before proposing changes.
2) STOP if you add Redux, hardcode strings, bypass event flow, or change z-index pattern.

## SCOPE
- All code under packages/studio/**.
- Dev-only overlay for testing and inspection.
- Separate workspace package; no imports from app-level src/**.

## CRITICAL RULES
- Studio is presentational and tooling-only; no business or domain logic.
- Studio reads and controls app state through @gears-frontx/react hooks and actions.
- Studio uses the configured UI kit components directly (do not use uikitRegistry).
- All user-facing text uses i18n namespace "studio:key" via useTranslation().
- Studio UI state (position, size, collapsed, visible) lives in React state or context, not Redux.
- Persistence (localStorage) must be event-driven (see Event and Persistence Rules).

## STATE MANAGEMENT RULES
- REQUIRED: Use React state and context for Studio UI state.
- REQUIRED: Read business state via @gears-frontx/react hooks (for example useAppSelector).
- REQUIRED: Keep Studio state separate from app Redux store.
- FORBIDDEN: Studio Redux slices, Zustand-style stores, or manual subscribe/notify patterns.

## EVENT AND PERSISTENCE RULES
- REQUIRED: Define Studio events in a single events file and extend EventPayloadMap.
- REQUIRED: Emit events for UI state changes (position, size, collapsed, visible, button position).
- REQUIRED: Effects subscribe to Studio events and handle persistence (localStorage reads and writes).
- REQUIRED: Components and hooks must not call localStorage directly.
- FORBIDDEN: Direct localStorage usage in sections or hooks.
- DETECT: grep -rn "localStorage.setItem" packages/studio/src/{sections,hooks}/

## UI KIT AND STYLING RULES
- REQUIRED: Use the configured UI kit base and composite components; do not create raw HTML controls.
- REQUIRED: Follow STYLING.md for units, tokens, and dark mode behavior.
- REQUIRED: Use a shared glassmorphism pattern or composite for Studio shell.
- FORBIDDEN: Hex color literals, inline style props, or external CSS files for Studio.
- FORBIDDEN: Screenset-specific visual components inside Studio; keep Studio visuals generic.

## LOCALIZATION RULES
- REQUIRED: All text uses t("studio:key") via useTranslation().
- REQUIRED: Use the same loader pattern as UICORE (I18nRegistry.createLoader with full language map).
- REQUIRED: Pass direction-related props (for example RTL) to dropdown or menu components as needed.
- FORBIDDEN: Hardcoded labels such as "Theme:", "Screenset:", or "Language:".

## Z-INDEX AND PORTAL RULES
- REQUIRED: Studio panel renders above app at a fixed high z-index (for example z-10000).
- REQUIRED: Shared portal container below panel (for example z-99999) with pointer-events-none by default.
- REQUIRED: Dropdown or overlay content inside Studio must:
  - Use the shared portal container.
  - Enable pointer events on actual content only.
- REQUIRED: Provide portal container through a Studio context hook (for example useStudioContext).

## DEPENDENCY RULES
- REQUIRED: @gears-frontx/react and @gears-frontx/framework as peer dependencies.
- REQUIRED: The configured UI kit as direct dependency.
- FORBIDDEN: Importing from app-level src/** or screensets.

## INTEGRATION RULES
- REQUIRED: Studio must be imported dynamically only when import.meta.env.DEV is true.
- REQUIRED: Studio overlay rendered as a sibling to main app content.
- FORBIDDEN: Studio bundle included or rendered in production builds.

## PRE-DIFF CHECKLIST
- [ ] No Redux or custom store for Studio; UI state uses React state or context.
- [ ] Controls read app state via @gears-frontx/react hooks and emit events via eventBus.
- [ ] All text uses t("studio:key") and follows @gears-frontx/i18n loader pattern.
- [ ] No direct localStorage usage in components or hooks; persistence handled in effects.
- [ ] Components imported from the configured UI kit; no raw HTML controls.
- [ ] Styling follows STYLING.md; no hex colors or inline styles.
- [ ] Z-index and portal behavior follow the high z-index panel plus shared portal container pattern.
- [ ] No imports from app-level src/** or screensets.
- [ ] Studio loaded only in dev mode and excluded from production builds.
