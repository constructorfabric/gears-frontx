<!-- @standalone -->
# frontx:new-api-service - Add New API Service (SDK Layer)

## AI WORKFLOW (REQUIRED)
1) Read .ai/targets/API.md before starting.
2) Gather requirements from user.
3) Implement.
4) Validate.

## GATHER REQUIREMENTS
- Service name and domain.
- Endpoints/methods needed.
- Base URL.
- Protocol type (REST, SSE).

## STEP 1: Implementation
- REQUIRED: Create packages/api/src/{domain}/{Name}ApiService.ts.
- REQUIRED: Extend BaseApiService with protocol instance.
- REQUIRED: Define TypeScript interfaces for requests/responses.
- REQUIRED: Register with apiRegistry.register({Name}ApiService).
- REQUIRED: Export from packages/api/src/index.ts.
- REQUIRED: Run npm run type-check to validate.
- See packages/api/CLAUDE.md for code examples.

## PROTOCOL OPTIONS
- REST: Use RestProtocol with optional timeout, headers config.
- SSE: Use SseProtocol for streaming endpoints.
- Multiple: Pass multiple protocols to super() constructor.

## RETRY PATTERN
- REQUIRED: Use ApiPluginErrorContext in onError for retry support.
- REQUIRED: Check retryCount === 0 before retrying (prevent infinite loops).
- REQUIRED: Call context.retry() with optional modified headers.
- REQUIRED: Return context.error if retry should not happen.
- See packages/api/CLAUDE.md for AuthPlugin example.

## RULES
- REQUIRED: Extend BaseApiService.
- REQUIRED: Register with apiRegistry.register(ServiceClass).
- REQUIRED: Define TypeScript interfaces for all requests/responses.
- FORBIDDEN: String domain constants for registration.
- FORBIDDEN: Framework dependencies (@gears-frontx/framework, @gears-frontx/state).
- FORBIDDEN: React dependencies (@gears-frontx/react).
- FORBIDDEN: Event system integration (eventBus).
- FORBIDDEN: Store/slice references.
- SDK LAYER: Pure data layer only.
