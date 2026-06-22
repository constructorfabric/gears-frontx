<!-- @standalone:override -->
# FrontX AI Guidelines (Canonical)

## AI WORKFLOW (REQUIRED)
- Route: select target file from Routing section.
- Read: MUST read target file before changing code or docs.
- Summarize: list 3-7 rules from target file (internal, not written).
- Verify: pass Pre-diff Checklist before proposing code.
- STOP: if unsure which target applies, ask instead of guessing.

## CRITICAL RULE
- FORBIDDEN: Making changes based on assumed rules without reading target file.
- REQUIRED: When user says "follow X.md rules", read X.md before any change.

## ROUTING

### SDK Layer (L1) - Zero @gears-frontx dependencies
- packages/state -> .ai/targets/STORE.md
- packages/screensets -> .ai/targets/LAYOUT.md
- packages/api -> .ai/targets/API.md
- packages/i18n -> .ai/targets/I18N.md
- packages/auth -> .ai/targets/AUTH.md

### Framework Layer (L2) - Depends on SDK packages
- packages/framework -> .ai/targets/FRAMEWORK.md

### React Layer (L3) - Depends on Framework
- packages/react -> .ai/targets/REACT.md

### UI and Dev Packages
- packages/studio -> .ai/targets/STUDIO.md

### Other
- packages/cli -> .ai/targets/CLI.md
- presets/standalone, presets/monorepo -> .ai/targets/CLI.md
- src/mfe_packages -> .ai/targets/SCREENSETS.md
- src/screensets -> .ai/targets/SCREENSETS.md (legacy — no screensets exist here after MFE conversion)
- src/themes -> .ai/targets/THEMES.md
- Styling anywhere -> .ai/targets/STYLING.md
- .ai documentation -> .ai/targets/AI.md
- .ai/commands, .claude/commands -> .ai/targets/AI_COMMANDS.md

## REPO INVARIANTS
- Event-driven architecture only (see EVENTS.md).
- Registries follow Open/Closed; adding items must not modify registry root files.
- App-level deps limited to: @gears-frontx/react, react, react-dom. Standalone projects must also declare peer deps explicitly: @gears-frontx/framework, @gears-frontx/api, @gears-frontx/i18n, @gears-frontx/screensets, @gears-frontx/state.
- MFE UI autonomy: MFEs own their UI components locally (e.g., components/ui/). No shared UI kit required.
- Cross-domain communication only via events.
- Public system contracts must not carry tooling metadata; keep tooling and runtime handoff state internal; do not export internal-only Flux event names used for L2/L3 wiring (narrow subscribe helpers are OK).
- No string literal identifiers; use constants or enums.
- No any, no unknown in type definitions, no "as unknown as" casts.
- REQUIRED: Use lodash for non-trivial object and array operations.

## IMPORT RULES
- Inside same package: relative paths.
- Cross-branch in app: @/ alias.
- Cross-package: @gears-frontx/framework, @gears-frontx/react. Use local components/ui/ for UI.
- Index files: only when aggregating 3 or more exports.
- Redux slices: import directly (no barrels).

## TYPE RULES
- Use type for objects and unions; interface for React props.
- No hardcoded string IDs.
- Resolve type errors at boundaries using proper generics.
- Class member order: properties -> constructor -> methods.

## STOP CONDITIONS
- Editing /core/runtime or /sdk.
- Modifying registry root files.
- Creating new packages without explicit user approval.
- Adding new top-level dependencies.
- Bypassing rules in EVENTS.md.
- Killing MCP server processes (see MCP_TROUBLESHOOTING.md).

## PRE-DIFF CHECKLIST
- Routed to correct target file.
- Target rules read and summarized internally.
- Registry root files unchanged.
- Import paths follow Import Rules.
- Types and dependents compile.
- npm run arch:check passes.
- Dev server test via Google Chrome MCP Tools:
  - Affected flows and screens exercised.
  - UI uses theme CSS tokens (CSS custom properties from :root).
  - Event-driven behavior (no direct slice dispatch).
  - No console errors or missing registrations.

## BLOCKLIST
- Telemetry or tracking code.
- "as unknown as" type casts.
- unknown in public type definitions.
- eslint-disable comments.
- Barrel exports that hide real imports.
- Manual state sync or prop drilling (see EVENTS.md).
- Native helpers where lodash equivalents exist.

## DOC STYLE
- Short, technical, ASCII only.
- Use "->" arrows for flows.
- Use BAD -> GOOD diffs when needed.
- PR description should reference relevant rules or sections.

## CORRECTION POLICY
- Add or update a rule here (short and focused).
- Update the matching target file.
- Store memory of the correction.
- Re-validate using .ai/targets/AI.md.

## FEATURE CREATION POLICY
- Reuse existing patterns where possible.
- If adding a 3rd or later similar item, consider an index file.
- If new items require central edits, redesign to self-register.
