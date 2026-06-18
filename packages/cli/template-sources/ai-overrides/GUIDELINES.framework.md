# HAI3 AI Guidelines (Framework Layer)

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
### SDK Layer (L1)
- packages/state -> .ai/targets/STORE.md
- packages/api -> .ai/targets/API.md
- packages/i18n -> .ai/targets/I18N.md
- Event patterns -> .ai/targets/EVENTS.md
### Framework Layer (L2)
- packages/framework -> .ai/targets/FRAMEWORK.md
- Layout patterns -> .ai/targets/LAYOUT.md
- Theme patterns -> .ai/targets/THEMES.md
### Tooling
- .ai documentation -> .ai/targets/AI.md
- .ai/commands -> .ai/targets/AI_COMMANDS.md
- CLI usage -> .ai/targets/CLI.md

## REPO INVARIANTS
- Event-driven architecture only (see EVENTS.md).
- Registries follow Open/Closed; adding items must not modify registry root files.
- Framework layer depends on SDK packages only.
- Cross-domain communication only via events.
- No string literal identifiers; use constants or enums.
- No any, no unknown in type definitions, no "as unknown as" casts.
- REQUIRED: Use lodash for non-trivial object and array operations.

## IMPORT RULES
- Inside same package: relative paths.
- SDK packages: @gears-frontx/state, @gears-frontx/api, @gears-frontx/i18n, @gears-frontx/events.
- External deps: lodash, @reduxjs/toolkit.
- Index files: only when aggregating 3 or more exports.
- Redux slices: import directly (no barrels).

## TYPE RULES
- Use type for objects and unions; interface for React props.
- No hardcoded string IDs.
- Resolve type errors at boundaries using proper generics.
- Class member order: properties -> constructor -> methods.

## STOP CONDITIONS
- Modifying registry root files.
- Adding React dependencies (Framework is React-agnostic).
- Bypassing rules in EVENTS.md.

## PRE-DIFF CHECKLIST
- Routed to correct target file.
- Target rules read and summarized internally.
- Registry root files unchanged.
- Import paths follow Import Rules.
- Types and dependents compile.
- NO React dependencies in Framework layer.

## BLOCKLIST
- Telemetry or tracking code.
- "as unknown as" type casts.
- unknown in public type definitions.
- eslint-disable comments.
- Barrel exports that hide real imports.
- Manual state sync or prop drilling (see EVENTS.md).
- Native helpers where lodash equivalents exist.
- React imports (Framework layer restriction).

## DOC STYLE
- Short, technical, ASCII only.
- Use "->" arrows for flows.
- Use BAD -> GOOD diffs when needed.
- PR description should reference relevant rules or sections.

## CORRECTION POLICY
- Add or update a rule here (short and focused).
- Update the matching target file.
- Store memory of the correction.

## FEATURE CREATION POLICY
- Reuse existing patterns where possible.
- If adding a 3rd or later similar item, consider an index file.
- If new items require central edits, redesign to self-register.
