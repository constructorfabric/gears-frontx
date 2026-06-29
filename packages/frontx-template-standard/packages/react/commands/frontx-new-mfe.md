<!-- @standalone -->
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
#    - IMPORTANT: set preview script to "vite preview --port {{port}}"

# 3. Install dependencies
cd src/mfe_packages/{screensetName}-mfe
npm install

# 4. Create src/lifecycle.tsx that extends ThemeAwareReactLifecycle

# 5. Regenerate MFE manifests so bootstrap.ts picks up the new package
npm run generate:mfe-manifests
```

## CONFIGURATION REQUIREMENTS

✅ **Correct preview script** (required for port auto-discovery):
```json
"preview": "vite preview --port {{port}}"
```

✅ **Correct dev script** (for hot reload):
```json
"dev": "vite --port {{port}}"
```

❌ **WRONG** (don't use this for dev):
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

## dev:all INTEGRATION (AUTOMATIC)

After creating the MFE and running `npm run generate:mfe-manifests`, the `dev:all`
script auto-discovers your new package — no manual configuration needed.

`dev-all.ts` scans `src/mfe_packages/*/package.json` and reads the port from the
`preview` (or `dev`) script using `--port NNNN`. The new MFE will automatically
appear in the next `npm run dev:all` run.

## VALIDATION

After creation:

```bash
# Regenerate manifests (required after adding new MFE)
npm run generate:mfe-manifests

# Validate TypeScript
npm run type-check

# Check architecture compliance
npm run arch:check

# Run the dev server (picks up new MFE automatically)
npm run dev:all

# Verify MFE loads at http://localhost:5173
# Open Studio Overlay (Ctrl+`) and check screenset
```

## TROUBLESHOOTING

### Issue: MFE not appearing in screenset selector
- Run `npm run generate:mfe-manifests` to regenerate manifests
- Check mfe.json manifest is properly exported
- Verify extensions are registered in manifest
- Check browser console for errors

### Issue: dev:all not picking up MFE port
- Verify `preview` script has `--port NNNN` (e.g., `"vite preview --port 3010"`)
- Check port is not in use (`lsof -i :3010`)
- Restart dev server

### Issue: Hot reload not working
- Verify dev script uses `vite --port` (not `vite build && vite preview`)
- Check port is not in use
- Restart dev server

### Issue: Redux/useSelector errors
- MFE must use mock data (no Redux Provider in isolation)
- Use `useState` for local state management
- Do not import Redux hooks (@gears-frontx/react)

## BEST PRACTICES

✅ **DO:**
- Set `preview` script with `--port NNNN` for port auto-discovery
- Use mock data with useState for UI-only MFEs
- Keep MFE logic isolated and simple
- Use local components (e.g. components/ui/)
- Run `npm run generate:mfe-manifests` after creating the MFE

❌ **DON'T:**
- Import Redux hooks directly
- Use vite build && vite preview in dev mode
- Create complex state management in MFE
- Hardcode ports without updating package.json preview script

---

See also:
- `/packages/cli/template-sources/mfe-package/` for templates
- `frontx-new-screenset.md` for screenset creation
