# hai3:new-mfe - Create New Microfrontend Package

## PREREQUISITES (CRITICAL - STOP IF FAILED)

1. MFE must be associated with a screenset
2. Screenset must exist (run `hai3-new-screenset` first if needed)
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
import { ThemeAwareReactLifecycle } from '@gears-frontx/screensets/mfe/handler';
import { YourScreen } from './screens/YourScreen';

class Lifecycle extends ThemeAwareReactLifecycle {
  constructor() {
    super({
      name: '{screensetName}',
      version: '1.0.0',
    });
  }

  async mount(shadowRoot: ShadowRoot, bridge: ChildMfeBridge) {
    const div = document.createElement('div');
    shadowRoot.appendChild(div);

    const style = document.createElement('style');
    style.textContent = tailwindStyles;
    shadowRoot.appendChild(style);

    // Render component
    const root = ReactDOM.createRoot(div);
    root.render(<YourScreen bridge={bridge} />);

    return { root, div };
  }
}

export default new Lifecycle();
```

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

3. Or use automatic discovery (see `.ai/commands/hai3-dev-all.md`)

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

## BEST PRACTICES

✅ **DO:**
- Use mock data with useState for UI-only MFEs
- Keep MFE logic isolated and simple
- Own UI components locally in `components/ui/` (no shared UI kit)
- Test with Chrome DevTools MCP

❌ **DON'T:**
- Import Redux hooks directly
- Use vite build && vite preview in dev mode
- Create complex state management in MFE
- Hardcode ports (use config files)

---

See also:
- `/packages/cli/template-sources/mfe-package/` for templates
- `hai3-new-screenset.md` for screenset creation
- `hai3-dev-all.md` for dev server setup
