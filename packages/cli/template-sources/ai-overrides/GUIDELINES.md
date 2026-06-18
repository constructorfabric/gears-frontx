# HAI3 AI Guidelines (React/App Layer)

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
### Application Layer
- src/screensets -> .ai/targets/SCREENSETS.md
- src/themes -> .ai/targets/THEMES.md
- Styling anywhere -> .ai/targets/STYLING.md
- Layout patterns -> .ai/targets/LAYOUT.md
- Event patterns -> .ai/targets/EVENTS.md
### Tooling
- .ai documentation -> .ai/targets/AI.md
- .ai/commands -> .ai/targets/AI_COMMANDS.md
- CLI usage -> .ai/targets/CLI.md
### Custom Guidelines
- Company guidelines -> .ai/company/GUIDELINES.md
- Project guidelines -> .ai/project/GUIDELINES.md

## REPO INVARIANTS
- Event-driven architecture only (see EVENTS.md).
- Registries follow Open/Closed; adding items must not modify registry root files.
- App-level deps limited to: @gears-frontx/react, the configured UI kit, react, react-dom.
- Cross-domain communication only via events.
- No string literal identifiers; use constants or enums.
- No any, no unknown in type definitions, no "as unknown as" casts.
- REQUIRED: Use lodash for non-trivial object and array operations.

## UI KIT DISCOVERY (REQUIRED)
- REQUIRED: Read `frontx.config.json` at project root to find `uikit` value.
- If `uikit` is `"shadcn"`: use local `components/ui/` (shadcn components already scaffolded).
- If `uikit` is `"none"`: no UI library; create all components locally.
- If `uikit` is any other value (e.g., `"@company/ui"`, `"@mui/material"`): it is a third-party npm UI library.
  - REQUIRED: Read the package's exports from `node_modules/<package>/` to discover available components.
  - REQUIRED: Import and use the library's components directly in screens, composites, and layout.
  - REQUIRED: Only create local components for what the library does not provide.
  - REQUIRED: Follow the library's documented patterns and component APIs.
- REQUIRED: Before creating ANY new UI component, verify the configured UI kit does not already provide it.

## IMPORT RULES
- Inside same package: relative paths.
- Cross-branch in app: @/ alias.
- Cross-package: @gears-frontx/framework, @gears-frontx/react, the configured UI kit.
- Index files: only when aggregating 3 or more exports.
- Redux slices: import directly (no barrels).

## TYPE RULES
- Use type for objects and unions; interface for React props.
- No hardcoded string IDs.
- Resolve type errors at boundaries using proper generics.
- Class member order: properties -> constructor -> methods.

## STOP CONDITIONS
- Modifying registry root files.
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
  - UI uses the configured UI kit and theme tokens.
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

## FEATURE CREATION POLICY
- Reuse existing patterns where possible.
- If adding a 3rd or later similar item, consider an index file.
- If new items require central edits, redesign to self-register.
