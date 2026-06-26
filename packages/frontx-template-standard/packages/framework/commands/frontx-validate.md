<!-- @standalone -->
# frontx:validate - Validate Changes

## AI WORKFLOW (REQUIRED)
1) Read .ai/GUIDELINES.md and identify target file(s) for your changes.
2) Summarize 3-7 key rules from applicable target file(s).
3) Run validation checks.
4) Report results.

## STEP 1: Route to Target Files
- Use .ai/GUIDELINES.md ROUTING section.
- Read each applicable target file.
- Summarize rules internally (not written).

<!-- @cpt-begin:cpt-frontx-algo-unit-test-generation-and-agent-verification-generate-ai-rules:p1:inst-update-command-templates -->
## STEP 2: Run Unit Tests When Triggers Apply
- REQUIRED: Run the `test:unit` script using this repo's package manager (e.g. `npm run test:unit`, `pnpm run test:unit`, `yarn test:unit`) when colocated tests changed, test setup changed, logic-heavy code changed, or the task is ready for handoff.
- REQUIRED: Read `.ai/project/GUIDELINES.md` and `.ai/project/targets/UNIT_TESTING.md` when project-specific testing rules exist.
- FORBIDDEN: Treating `frontx validate components` as a unit-test runner.
- default frontx validate / validate components is a structural check; unit tests run via package-manager invocation of test:unit.

<!-- @cpt-begin:cpt-frontx-flow-unit-test-generation-and-agent-verification-agent-verify:p1:inst-agent-run-final-checks -->
## STEP 3: Run Type Check and Architecture Check
- REQUIRED: Run the `type-check` script using this repo's package manager as a separate verification step.
- REQUIRED: Run the `arch:check` script using this repo's package manager as a separate verification step.
- REQUIRED: When STEP 2 applied, run `type-check` and `arch:check` after the applicable `test:unit` run to satisfy the project testing contract.
Examples:
```bash
npm run type-check
pnpm run type-check
yarn type-check

npm run arch:check
pnpm run arch:check
yarn arch:check
```
REQUIRED: Both commands must pass with zero errors.
<!-- @cpt-end:cpt-frontx-flow-unit-test-generation-and-agent-verification-agent-verify:p1:inst-agent-run-final-checks -->
<!-- @cpt-end:cpt-frontx-algo-unit-test-generation-and-agent-verification-generate-ai-rules:p1:inst-update-command-templates -->

## STEP 4: Check Common Violations
- Direct slice dispatch (use event-driven actions instead).
- Inline styles outside components/ui/ (base primitives only).
- Import violations (package internals, circular dependencies).
- String literal IDs (must use constants or enums).
- Inline component definitions in *Screen.tsx files.
- Inline data arrays (must use API services).
- New dependency on removed packages (use local UI per MFE).
- Duplicate component when equivalent exists in project's UI components (components/ui/).

## STEP 5: Verify Event-Driven Flow
- Actions emit events (not dispatch slices).
- Effects listen to events and update slices.
- No prop drilling or callback-based state mutation.

## STEP 6: Test via Chrome DevTools MCP
STOP: If MCP WebSocket is closed, fix connection first.
- Exercise all affected flows and screens.
- Verify UI uses local components and theme tokens.
- Verify event-driven behavior (no direct slice dispatch).
- Check for console errors or missing registrations.

## STEP 7: Report Results
- List rules verified.
- List any violations found.
- Confirm the `type-check` script passed (via the package manager you used).
- Confirm the `arch:check` script passed (via the package manager you used).
- REQUIRED: Report `test:unit` status aligned with STEP 2:
  - If STEP 2 applied: confirm `test:unit` completed and passed (or list failures).
  - If STEP 2 did not apply: state that `test:unit` was not run and why triggers did not apply (one line; e.g. no colocated test or setup changes, no logic-heavy edits, task not at handoff).
  - Omitting `test:unit` status (run result or skip reason) invalidates this workflow.

## IF VIOLATIONS FOUND
Use frontx:fix-violation command to correct issues.
