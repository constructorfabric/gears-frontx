<!-- @standalone -->
# hai3:new-screenset - Create New Screenset

## PREREQUISITES (CRITICAL - STOP IF FAILED)
Run `hai3 --version`.
STOP: If fails, tell user to install.
FORBIDDEN: Proceeding without CLI tools.
FORBIDDEN: Creating screenset manually or by copying peers.

## AI WORKFLOW (REQUIRED)
1) Check prerequisites above.
2) Read .ai/targets/SCREENSETS.md and .ai/targets/EVENTS.md before starting.
3) Read `frontx.config.json` at project root to identify the configured `uikit` value.
   - If a third-party package (not `shadcn` or `none`): read its exports to discover available components.
4) Gather requirements from user (including UI sections).
5) Present implementation plan and wait for approval.
6) Implement after approval.

## GATHER REQUIREMENTS
Ask user for:
- Screenset name (camelCase).
- Category: Drafts | Mockups | Production.
- Initial screens.
- UI sections per screen (e.g., "stats cards, charts, activity feed").

## STEP 1: Present Plan (REQUIRED)
Present the following to the user for approval:

### Plan structure
- **Summary**: Add new {category} screenset "{screensetName}" with {screens} screen(s).
- **Name**: {screensetName}
- **Category**: {category}
- **Initial screens**: {screens}
- **Component Plan**:
  - REQUIRED: Use components from the configured UI kit (from frontx.config.json `uikit` field); create local only if missing.
  - If uikit is a third-party package: import its components directly (e.g., `import { Button } from '@mui/material'`).
  - components/ui/: base UI primitives (shadcn components or custom)
  - components/: multi-screen shared components
  - screens/{screen}/components/: screen-specific components
- **Data Flow**:
  - Events: {domain events per EVENTS.md}
  - State: slices/, events/, effects/, actions/
  - API: api/{Name}ApiService.ts with mocks
- **Tasks**:
  - Create screenset: `hai3 screenset create {name}`
  - Create components per Component Plan (BEFORE screen file)
  - Implement data flow per EVENTS.md (actions emit events, effects update slices)
  - Add API service with mocks
  - Validate: `npm run type-check && npm run arch:check && npm run lint`
  - Test via Chrome DevTools MCP

## STEP 2: Wait for Approval
Tell user: "Review the plan above. Confirm to proceed with implementation."

## STEP 3: Implementation
After approval, follow the plan strictly:
1) Create screenset via `hai3 screenset create` (REQUIRED).
2) Create components BEFORE screen file per Component Plan.
3) Implement data flow per .ai/targets/EVENTS.md:
   - Actions emit events via eventBus.emit()
   - Effects subscribe and update slices
   - FORBIDDEN: Direct slice dispatch from components
4) Add API service with mocks.
5) Validate: `npm run type-check && npm run arch:check && npm run lint`.
6) Test via Chrome DevTools MCP (REQUIRED):
   - Navigate to new screenset
   - Verify screen renders without console errors
   - Test user interactions trigger correct events
   - Verify state updates via Redux DevTools
   - STOP if MCP connection fails
