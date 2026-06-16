# frontx:new-mfe - Create New Microfrontend Package

## PREREQUISITES (CRITICAL - STOP IF FAILED)

1. MFE must be associated with a screenset
2. Screenset must exist (run `frontx-new-screenset` first if needed)
3. Vite and Module Federation must be configured

## QUICK START

For a screenset named `{screensetName}` with a new MFE:

```bash
# 1. Create the MFE package in src/mfe_packages/{screensetName}-mfe/
cp -r packages/cli/template-sources/mfe-package/ src/mfe_packages/{screensetName}-mfe/

# 2. Update variables in package.json and vite.config.ts:
#    - Replace {{mfeName}} with your screenset name (camelCase)
#    - Replace {{port}} with available port (3001, 3010, 3020, etc)

# 3. Install dependencies
cd src/mfe_packages/{screensetName}-mfe
npm install

# 4. Create src/lifecycle.tsx that extends ThemeAwareReactLifecycle

# 5. Add dev script to root package.json:
#    "dev:mfe:{screensetName}": "cd src/mfe_packages/{screensetName}-mfe && npm run dev"

# 6. Add to dev:all command in package.json
```

## CONFIGURATION REQUIREMENTS

✅ **Correct dev script** (for hot reload):
```json
"dev": "vite --port {{port}}"
```

❌ **WRONG** (don't use this):
```json
"dev": "vite build && vite preview --port {{port}}"
```

## PORT ALLOCATION

Reserve ports for MFE packages:
- **3001**: demo-mfe
- **3010+**: (next available: 3010, 3020, 3030, ...)
- **5173**: Main app

## LIFECYCLE TEMPLATE

Create `src/lifecycle.tsx`:

```typescript
import React from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { ThemeAwareReactLifecycle } from '@gears-frontx/react';
import { mfeApp } from './init';
import { YourScreen } from './screens/YourScreen';

class Lifecycle extends ThemeAwareReactLifecycle {
  constructor() {
    super(mfeApp);
  }

  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    return <YourScreen bridge={bridge} />;
  }
}

export default new Lifecycle();
```

## CACHE SETUP

- Host apps already own the shared server-state runtime via `createHAI3App()`.
- `ThemeAwareReactLifecycle` receives that host-owned runtime automatically during `mount_ext`.
- Use endpoint descriptors with `useApiQuery(service.descriptor)` and `useApiMutation({ endpoint: service.descriptor })`.
- Do not add `queryCache()`, `createHAI3App()`, `QueryClientProvider`, or `useQueryClient()` inside the MFE package.
- If you run an MFE outside the host shell, query hooks will not have the host cache/runtime unless you build a dedicated standalone harness.

## ADDING TO dev:all COMMAND

After creating the MFE:

1. Add dev script to root package.json:
   ```json
   "dev:mfe:{screensetName}": "cd src/mfe_packages/{screensetName}-mfe && npm run dev"
   ```

2. Add to dev:all command:
   ```json
   "dev:all": "npm run generate:mfe-manifests && npx tsx scripts/dev-all.ts"
   ```

3. Or use automatic discovery (see `.ai/commands/frontx-dev-all.md`)

## VALIDATION

After creation:

```bash
# Validate TypeScript
npm run type-check

# Check architecture compliance
npm run arch:check

# Run the dev server
npm run dev:all

# Verify MFE loads at http://localhost:5173
# Open Studio Overlay (Ctrl+`) and check screenset
```

## TROUBLESHOOTING

### Issue: MFE not appearing in screenset selector
- Check mfe.json manifest is properly exported
- Verify extensions are registered in manifest
- Check browser console for errors

### Issue: Hot reload not working
- Verify dev script uses `vite --port` (not `vite build && vite preview`)
- Check port is not in use (lsof -i :{{port}})
- Restart dev server

### Issue: Redux/useSelector errors
- MFE must use mock data (no Redux Provider in isolation)
- Use `useState` for local state management
- Do not import Redux hooks (@gears-frontx/react)

## API SERVICE & DATA FETCHING

MFEs use endpoint descriptors on their API service class:

```typescript
class MyApiService extends BaseApiService {
  constructor() {
    const restProtocol = new RestProtocol({ timeout: 30000 });
    const restEndpoints = new RestEndpointProtocol(restProtocol);
    super({ baseURL: '/api/my-domain' }, restProtocol, restEndpoints);
    this.registerPlugin(restProtocol, new RestMockPlugin({ mockMap, delay: 100 }));
  }

  readonly getItems = this.protocol(RestEndpointProtocol).query<ItemsResponse>('/items');
  readonly createItem = this.protocol(RestEndpointProtocol)
    .mutation<Item, CreateItemVars>('POST', '/items');
}
```

Screens consume descriptors directly:
```typescript
const service = apiRegistry.getService(MyApiService);
const { data, isLoading } = useApiQuery(service.getItems);
const { mutateAsync } = useApiMutation({ endpoint: service.createItem });
```

**Cache sharing**: MFEs with the same `baseURL` and path share cache entries automatically.
To isolate cache, use a different `baseURL`.

## BEST PRACTICES

✅ **DO:**
- Define endpoints as descriptors on the service via explicit contracts (for example `this.protocol(RestEndpointProtocol).query()` / `.mutation()`)
- Use `useApiQuery(service.descriptor)` for reads
- Use `useApiMutation({ endpoint: service.descriptor })` for writes
- Let the host own caching; mounted MFEs reuse it automatically
- Keep MFE logic isolated and simple
- Own UI components locally in `components/ui/` (no shared UI kit)
- Test with Chrome DevTools MCP

❌ **DON'T:**
- Add standalone modules with query key factories or `queryOptions()` alongside the service
- Import `queryOptions` from `@tanstack/react-query` or `@gears-frontx/react`
- Add `queryCache()`, `createHAI3App()`, or `QueryClientProvider` inside the MFE bootstrap
- Import Redux hooks directly
- Use vite build && vite preview in dev mode
- Create complex state management in MFE
- Hardcode ports (use config files)

---

See also:
- `/packages/cli/template-sources/mfe-package/` for templates
- `frontx-new-screenset.md` for screenset creation
- `frontx-dev-all.md` for dev server setup
