<!-- @standalone -->
# hai3:new-screen - Add New Screen

## PREREQUISITES (CRITICAL - STOP IF FAILED)
FORBIDDEN: Proceeding without user approval of the plan.
FORBIDDEN: Creating screen without reading target files first.

## AI WORKFLOW (REQUIRED)
1) Read .ai/targets/SCREENSETS.md and .ai/targets/EVENTS.md before starting.
2) Read `frontx.config.json` at project root to identify the configured `uikit` value.
   - If a third-party package (not `shadcn` or `none`): read its exports to discover available components.
3) Gather requirements from user (including UI sections).
4) Present implementation plan and wait for approval.
5) Implement after approval.

## GATHER REQUIREMENTS
Ask user for:
- Screenset path (e.g., src/screensets/chat).
- Screen name (camelCase).
- UI sections (e.g., "header, form, data table").
- Add to menu? (Y/N)

## STEP 1: Present Plan (REQUIRED)
Present the following to the user for approval:

### Plan structure
- **Summary**: Add new screen "{screenName}" to {screenset} screenset.
- **Screenset**: {screenset}
- **Screen name**: {screenName}
- **Add to menu**: {Y/N}
- **Component Plan**:
  - REQUIRED: Use components from the configured UI kit (from frontx.config.json `uikit` field); create local only if missing.
  - If uikit is a third-party package: import its components directly.
  - components/ui/: base UI primitives (shadcn components or custom)
  - screens/{screen}/components/: screen-specific components
- **Data Flow**: Uses existing screenset events/slices per EVENTS.md; screen dispatches actions, never direct slice updates.
- **Tasks**:
  - Add screen ID to ids.ts
  - Create components per Component Plan (BEFORE screen file)
  - Create screen (orchestrates components, follows EVENTS.md data flow)
  - Add i18n files for all languages
  - Add to menu (if requested)
  - Validate: `npm run type-check && npm run lint`
  - Test via Chrome DevTools MCP

## STEP 2: Wait for Approval
Tell user: "Review the plan above. Confirm to proceed with implementation."

## STEP 3: Implementation
After approval, follow the plan strictly:
1) Add screen ID to ids.ts.
2) Create components BEFORE screen file per Component Plan.
3) Create screen following data flow rules from .ai/targets/EVENTS.md:
   - Use actions to trigger state changes
   - FORBIDDEN: Direct slice dispatch from screen
4) Add i18n with useScreenTranslations(). Export default.
5) Add to menu if requested.
6) Validate: `npm run type-check && npm run lint`.
7) Test via Chrome DevTools MCP (REQUIRED):
   - Navigate to new screen
   - Verify screen renders without console errors
   - Test UI interactions and data flow
   - Verify translations load correctly
   - STOP if MCP connection fails
