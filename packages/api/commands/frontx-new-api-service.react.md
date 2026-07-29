<!-- @standalone -->
# frontx:new-api-service - Add New API Service (React Layer)

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
- UI components that will consume data.

## STEP 1: Implementation
- REQUIRED: Create src/screensets/{screenset}/api/{Name}ApiService.ts.
- REQUIRED: Create src/screensets/{screenset}/events/{domain}Events.ts.
- REQUIRED: Create src/screensets/{screenset}/actions/{domain}Actions.ts.
- REQUIRED: Create src/screensets/{screenset}/slices/{domain}Slice.ts.
- REQUIRED: Create src/screensets/{screenset}/effects/{domain}Effects.ts.
- REQUIRED: Create typed selectors for React components.
- REQUIRED: Register mock map in service constructor for DEV mode.
- REQUIRED: Register slice and initialize effects in screenset config.
- REQUIRED: Run npm run type-check && npm run arch:check.
- See packages/api/CLAUDE.md for examples.

## REACT INTEGRATION
- REQUIRED: Use useSelector with typed selectors for data access.
- REQUIRED: Use useAction hook for dispatching actions.
- REQUIRED: Handle loading and error states in components.
- FORBIDDEN: Direct API calls in components (use actions/effects).

## RETRY PATTERN
- REQUIRED: Use ApiPluginErrorContext in onError for retry support.
- REQUIRED: Check retryCount === 0 before retrying.
- REQUIRED: Call context.retry() with modified headers for token refresh.
- See packages/api/CLAUDE.md for AuthPlugin example.

## VALIDATION
- REQUIRED: Test via Chrome DevTools MCP if available.
- REQUIRED: Verify events emit correctly.
- REQUIRED: Verify slice updates via Redux DevTools.
- REQUIRED: Verify UI updates when data loads.
- REQUIRED: Toggle mock mode and verify both modes work.

## RULES
- REQUIRED: Screenset-local services in src/screensets/*/api/.
- REQUIRED: Actions emit events via eventBus.emit() (never async).
- REQUIRED: Effects subscribe to events and make API calls.
- REQUIRED: Effects update their own slice only.
- REQUIRED: Components use selectors for data access.
- FORBIDDEN: Centralized src/api/ directory.
- FORBIDDEN: Sharing API services between screensets.
- FORBIDDEN: Direct API calls in React components.
- FORBIDDEN: Async thunks (use event-driven pattern).
