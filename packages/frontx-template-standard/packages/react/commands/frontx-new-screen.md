<!-- @standalone -->
# frontx:new-screen - Add New Screen

## AI WORKFLOW (REQUIRED)
1) Read .ai/targets/SCREENSETS.md and .ai/targets/EVENTS.md before starting.
2) Read `.ai/project/GUIDELINES.md` and `.ai/project/targets/UNIT_TESTING.md` when they exist **before** planning unit tests, validation, or any test-related tasks in this command (project-owned overrides take precedence over defaults here).
3) Gather requirements from user (including UI sections).
4) Implement.

## GATHER REQUIREMENTS
Ask user for:
- Screenset path (e.g., src/screensets/chat).
- Screen name (camelCase).
- UI sections (e.g., "header, form, data table").
- Add to menu? (Y/N)

## STEP 1: Implementation
1) Add screen ID to ids.ts.
2) Create components BEFORE screen file per Component Plan.
3) Create screen following data flow rules from .ai/targets/EVENTS.md:
   - Use actions to trigger state changes
   - FORBIDDEN: Direct slice dispatch from screen
4) Add i18n with useScreenTranslations(). Export default.
5) Add or update a screen test that covers stable render or behavior for the new screen and place any test-only helpers in a sibling `__test-utils__/` folder.
6) Add to menu if requested.
7) Validate: run `test:unit`, `type-check`, and `arch:check` via this project's package manager per `.ai/project/targets/UNIT_TESTING.md` (which defines the exact commands). Apply constraints from workflow step 2.
8) Test via Chrome DevTools MCP (REQUIRED):
   - Navigate to new screen
   - Verify screen renders without console errors
   - Test UI interactions and data flow
   - Verify translations load correctly
   - STOP if MCP connection fails

## TESTING
- REQUIRED: Load `.ai/project/GUIDELINES.md` and `.ai/project/targets/UNIT_TESTING.md` when they exist **before** interpreting unit-test requirements elsewhere in this command.
- REQUIRED: Use neutral fixtures, translation mocks, and stable keys, roles, or IDs instead of placeholder-derived copy when adding or updating generated screen tests.

## COMPONENT PLAN
- REQUIRED: Use local components (e.g. `components/ui/`) — no shared UI kit package.
- components/ui/: base UI primitives (shadcn components or custom)
- screens/{screen}/components/: screen-specific components

## DATA FLOW
- Uses existing screenset events/slices per EVENTS.md
- Screen dispatches actions, never direct slice updates
