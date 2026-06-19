<!-- @standalone -->
# hai3:new-api-service - Add New API Service

## AI WORKFLOW (REQUIRED)
1) Read .ai/targets/SCREENSETS.md API SERVICE RULES section.
2) Gather requirements from user.
3) Implement.
4) Validate.

## GATHER REQUIREMENTS
Ask user for:
- Which screenset will use it.
- Domain name.
- Endpoints/methods.
- Base URL.

## STEP 1: Implementation

### 1.1 Create Service
File: src/screensets/{screenset}/api/{Name}ApiService.ts
```typescript
import { BaseApiService, apiRegistry } from '@gears-frontx/api';
import { SCREENSET_ID } from '../ids';

export const DOMAIN = `${SCREENSET_ID}:serviceName` as const;

class {Name}ApiService extends BaseApiService {
  protected baseUrl = '/api/v1/{domain}';

  async getData(): Promise<DataType> {
    return this.get('/endpoint');
  }
}

apiRegistry.register(DOMAIN, {Name}ApiService);

declare module '@gears-frontx/api' {
  interface ApiServicesMap {
    [DOMAIN]: {Name}ApiService;
  }
}
```

### 1.2 Create Mocks
File: src/screensets/{screenset}/api/mocks.ts
```typescript
import type { MockMap } from '@gears-frontx/api';

export const mockMap = {
  'GET /endpoint': () => ({ data: mockData }),
} satisfies MockMap;
```

### 1.3 Register in Screenset Config
Import ./api/{Name}ApiService for side effect.
Call apiRegistry.registerMocks(DOMAIN, mockMap).

### 1.4 Validate
```bash
npm run type-check && npm run arch:check
```

### 1.5 Test via Chrome DevTools MCP
STOP: If MCP WebSocket is closed, fix first.
- Test API calls.
- Verify mocks return expected data.
- Toggle API mode in Studio and verify both modes work.

## RULES
- REQUIRED: Screenset-local API services in src/screensets/*/api/.
- REQUIRED: Unique domain constant per screenset.
- FORBIDDEN: Centralized src/api/ directory.
- FORBIDDEN: Sharing API services between screensets.
