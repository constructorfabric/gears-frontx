<!-- @standalone -->
# frontx:new-api-service - Add New API Service (Framework Layer)

## AI WORKFLOW (REQUIRED)
1) Read packages/api/CLAUDE.md before starting.
2) Gather requirements from user.
3) Implement.
4) Validate.

## GATHER REQUIREMENTS
- Which screenset will use the service.
- Domain name.
- Endpoints/methods needed.
- Base URL.

## STEP 1: Implementation
- REQUIRED: Create src/screensets/{screenset}/api/{Name}ApiService.ts.
- REQUIRED: Create src/screensets/{screenset}/events/{domain}Events.ts.
- REQUIRED: Create src/screensets/{screenset}/actions/{domain}Actions.ts.
- REQUIRED: Create src/screensets/{screenset}/slices/{domain}Slice.ts.
- REQUIRED: Create src/screensets/{screenset}/effects/{domain}Effects.ts.
- REQUIRED: Register mock map in service constructor for DEV mode.
- REQUIRED: Register slice and initialize effects in screenset config.
- REQUIRED: Run npm run type-check && npm run arch:check.
- See packages/api/CLAUDE.md for examples.

## RETRY PATTERN
- REQUIRED: Use ApiPluginErrorContext in onError for retry support.
- REQUIRED: Check retryCount === 0 before retrying.
- REQUIRED: Call context.retry() with modified headers for token refresh.
- See packages/api/CLAUDE.md for AuthPlugin example.

## VALIDATION
- REQUIRED: Test via Chrome DevTools MCP if available.
- REQUIRED: Verify events emit correctly.
- REQUIRED: Verify slice updates via Redux DevTools.
- REQUIRED: Toggle mock mode and verify both modes work.

## RULES
- REQUIRED: Screenset-local services in src/screensets/*/api/.
- REQUIRED: Actions emit events via eventBus.emit() (never async).
- REQUIRED: Effects subscribe to events and make API calls.
- REQUIRED: Effects update their own slice only.
- REQUIRED: Unique domain constant per screenset.
- FORBIDDEN: Centralized src/api/ directory.
- FORBIDDEN: Sharing API services between screensets.
- FORBIDDEN: Direct slice dispatch from actions.
- FORBIDDEN: Actions calling API directly (use effects).
- FORBIDDEN: Async thunks (use event-driven pattern).
