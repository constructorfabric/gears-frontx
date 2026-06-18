# HAI3 MFE Setup Guidelines

## Overview

This document describes the HAI3 Microfrontend (MFE) architecture and setup requirements for creating and managing MFE packages in a monorepo environment.

## Architecture

### Directory Structure
```
src/mfe_packages/
├── demo-mfe/              (Demo/example MFE)
└── {name}-mfe/            (New MFEs follow this pattern)
```

### Port Assignment
- **3001**: demo-mfe (Module Federation dev server)
- **3010+**: Reserved for additional MFEs (3010, 3020, 3030, ...)
- **5173**: Main application (Vite dev server)

## MFE Package Structure

### Required Files

Each MFE package must contain:

```
{screenset}-mfe/
├── package.json              # NPM package definition
├── vite.config.ts            # Vite + Module Federation config
├── tsconfig.json             # TypeScript configuration
├── src/
│   ├── lifecycle.tsx          # MFE lifecycle & entry point
│   ├── screens/
│   │   ├── home/
│   │   ├── list/
│   │   └── details/
│   └── components/            # Shared UI components
├── mfe.json                   # Module Federation manifest
└── index.html                 # Entry HTML
```

## Key Configuration

### ✅ CORRECT: dev script for hot reload

```json
// package.json
"scripts": {
  "dev": "vite --port {{port}}"
}
```

**Benefits:**
- ⚡ Hot Module Replacement (HMR) enabled
- 🔄 Changes auto-reload without full rebuild
- ⏱️ Faster startup time
- 🐛 Better debugging experience

### ❌ WRONG: Avoid this pattern

```json
"dev": "vite build && vite preview --port {{port}}"
```

**Problems:**
- ❌ Full build required on every run
- ❌ No hot reload capability
- ❌ Slow development experience
- ❌ Hides live changes

## Development Workflow

### Running All Servers

```bash
npm run dev:all
```

This starts:
1. All enabled MFE servers (demo-mfe on port 3001, etc.)
2. Main app Vite server (port 5173+)

### Adding a New MFE

1. **Create package from template:**
   ```bash
   cp -r packages/cli/template-sources/mfe-package/ \
     src/mfe_packages/{screensetName}-mfe/
   ```

2. **Update variables in package.json and vite.config.ts:**
   - Replace `{{mfeName}}` with screenset name (camelCase)
   - Replace `{{port}}` with available port

3. **Add dev script to root package.json:**
   ```json
   "dev:mfe:{screensetName}": "cd src/mfe_packages/{screensetName}-mfe && npm run dev"
   ```

4. **Update dev:all command:**
   ```json
   "dev:all": "npm run generate:mfe-manifests && npx tsx scripts/dev-all.ts"
   ```

## MFE Implementation Best Practices

### ✅ DO

- **Use mock data** with `useState` for UI-only MFEs
- **Isolate MFE logic** - keep it simple and focused
- **Own UI components locally** in `components/ui/` — no shared UI kit required
- **Test with Chrome DevTools MCP** before submission
- **Use local state** for temporary UI state
- **Document component APIs** clearly

### ❌ DON'T

- **Import Redux hooks** - MFEs don't have Redux Provider
- **Use useAppSelector/useDispatch** directly
- **Add complex state management** in MFEs
- **Hardcode configuration** - use environment variables
- **Use vite build && preview** in dev script
- **Ignore TypeScript errors** - run type-check regularly

## State Management in MFEs

### Wrong Pattern (Redux hooks in MFE)
```tsx
// ❌ FAILS - Redux context not available
import { useAppSelector } from '@gears-frontx/react';

export const MyComponent = () => {
  const data = useAppSelector(state => state.myData); // ❌ Error!
  return <div>{data}</div>;
};
```

### Correct Pattern (Mock data + useState)
```tsx
// ✅ WORKS - Using mock data
const MOCK_DATA = [
  { id: 1, name: 'Item 1' },
  { id: 2, name: 'Item 2' },
];

export const MyComponent = () => {
  const [data] = useState(MOCK_DATA);
  return <div>{data.map(item => <div key={item.id}>{item.name}</div>)}</div>;
};
```

## CLI Commands

### Create New Screenset
```bash
hai3 add-mfe {name}
```

### Create New MFE (use template)
See `hai3-new-mfe.md` in `.ai/commands/user/`

### Validate Setup
```bash
npm run type-check
npm run arch:check
npm run lint
```

## Troubleshooting

### MFE not loading in screenset
1. Check `mfe.json` manifest has correct extension definitions
2. Verify port numbers match in `mfe.json` and `package.json`
3. Check browser console for Module Federation errors
4. Ensure `remoteEntry.js` is accessible at configured URL

### Redux context errors
1. Remove Redux hook imports from MFE
2. Convert to mock data + `useState`
3. See State Management section above

### Hot reload not working
1. Verify dev script: `vite --port {{port}}` (not `vite build && preview`)
2. Check port is not already in use
3. Restart dev server: `npm run dev:all`

### Module Federation errors
1. Check `vite.config.ts` exposes configuration
2. Verify Federation name matches across configs
3. Ensure shared dependencies are declared correctly

## References

- **Template location**: `/packages/cli/template-sources/mfe-package/`
- **Commands**: `.ai/commands/user/hai3-new-mfe.md`, `hai3-dev-all.md`
- **Architecture**: `.ai/GUIDELINES.md`
- **Implementation examples**: `src/mfe_packages/`

## Implementation Checklist

When creating a new MFE:

- [ ] Create package from template
- [ ] Update all `{{variable}}` placeholders
- [ ] Install dependencies
- [ ] Create `src/lifecycle.tsx` with proper lifecycle methods
- [ ] Add screens in `src/screens/`
- [ ] Use mock data (no Redux)
- [ ] Add `dev:mfe:{name}` script to root package.json
- [ ] Update `dev:all` command
- [ ] Run `npm run type-check`
- [ ] Run `npm run arch:check`
- [ ] Test with `npm run dev:all`
- [ ] Verify in Studio Overlay (Ctrl+`)

---

**Last Updated:** 2026-03-04
**Version:** 1.0.0
**Status:** Active
