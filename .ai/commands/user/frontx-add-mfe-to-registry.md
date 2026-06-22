# frontx:add-mfe-to-registry - Register New MFE in Centralized Registry

## When to Use

After creating a new MFE package (using `frontx-new-mfe.md`), register it in the centralized system for:
1. **Automatic loading in the app** (bootstrap.ts)
2. **Automatic startup in dev:all** (scripts/dev-all.ts)

## Registration Steps

### 1️⃣ Requirements for New MFE

The new MFE MUST have in its folder `src/mfe_packages/{name}-mfe/`:

✅ **`package.json`** with correct dev script:
```json
{
  "name": "@gears-frontx/notifications-mfe",
  "scripts": {
    "dev": "vite --port 3020",
    "build": "vite build",
    "preview": "vite preview --port 3020"
  },
  "dependencies": {
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "@gears-frontx/react": "file:../../../packages/react"
  }
}
```

✅ **`vite.config.ts`** - Module Federation configuration

✅ **`src/lifecycle.tsx`** - MFE entry point (extends ThemeAwareReactLifecycle)

✅ **`mfe.json`** - extension manifest:
```json
{
  "manifest": {
    "id": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.notifications.mfe.manifest.v1",
    "remoteEntry": "http://localhost:3020/assets/remoteEntry.js"
  },
  "entries": [
    {
      "id": "...",
      "exposedModule": "./lifecycle"
    }
  ],
  "extensions": [
    {
      "id": "...",
      "presentation": {
        "label": "Notifications",
        "icon": "lucide:bell",
        "route": "/notifications"
      }
    }
  ]
}
```

### 2️⃣ Add MFE to `src/app/mfe/registry.ts`

Open the file and add a new entry to the `MFE_REGISTRY` array:

```typescript
export const MFE_REGISTRY: MFERegistryEntry[] = [
  {
    name: 'demo-mfe',
    port: 3001,
    enabled: true,
    description: 'Demo MFE with example screens',
  },
  // 🆕 ADD NEW MFE HERE:
  {
    name: 'notifications-mfe',           // ← Must match src/mfe_packages/{name}-mfe/
    port: 3020,                          // ← Unique port for dev server
    enabled: true,                       // ← true = starts in dev:all and loads in app
    description: 'Notifications MFE',
  },
];
```

### 3️⃣ Done! 🎉

Now:
- **`npm run dev:all`** - automatically:
  1. Generates `src/app/mfe/generated-mfe-manifests.ts` (for Vite)
  2. Starts all enabled MFEs on their ports
  3. Starts the main application
- **The app** - will automatically load all enabled MFEs via bootstrap.ts
- **Independent development** - run `cd src/mfe_packages/{name}-mfe && npm run dev`

**⚠️ NOT NEEDED**:
- ❌ Update root `package.json` (registry.ts is read automatically)
- ❌ Add `dev:mfe:*` scripts (deprecated)
- ❌ Modify `dev:all` command (generated dynamically)
- ❌ Edit `src/app/mfe/generated-mfe-manifests.ts` (auto-generated)

## 🎛️ MFE Management

### Disable MFE Without Deleting
```typescript
{
  name: 'notifications-mfe',
  port: 3020,
  enabled: false,  // ← MFE won't start in dev:all, won't load in app
  description: 'Notifications MFE',
}
```

### Run a Single MFE (Independently)
```bash
cd src/mfe_packages/notifications-mfe
npm run dev
# → only this MFE on port 3020, without main app
```

## 🚀 How the System Works

### **bootstrap.ts** - Loading Extensions into the App
1. Reads `MFE_REGISTRY` from `src/app/mfe/registry.ts`
2. For each MFE with `enabled: true`:
   - Dynamically imports `src/mfe_packages/{name}-mfe/mfe.json`
   - Registers manifest in the type system
   - Registers extensions for URL routing

### **scripts/dev-all.ts** - Starting Dev Servers
1. Reads `MFE_REGISTRY` from `src/app/mfe/registry.ts`
2. For each MFE with `enabled: true`:
   - Generates command: `cd src/mfe_packages/{name}-mfe && npm run dev`
3. Runs all commands simultaneously (concurrently):
   - All MFEs on their ports
   - Main application on 5173+
4. **No package.json changes required!**

## New MFE File Structure

```
src/mfe_packages/notifications-mfe/
├── package.json              # ← updated with correct port
├── vite.config.ts            # ← Module Federation config
├── tsconfig.json
├── mfe.json                  # ← ✅ REQUIRED for registration!
├── index.html
└── src/
    ├── lifecycle.tsx         # ← MFE entry point
    └── screens/
        ├── index.tsx         # Main screen for notifications
        ├── list/
        └── details/
```

## Verification After Registration

```bash
# 1. Check for import errors
npm run type-check

# 2. Start dev server
npm run dev:all

# 3. Check in browser at http://localhost:5173
# - Open Studio Overlay (Ctrl+`)
# - Verify new MFE appears in screensets list
# - Click on MFE - it should load correctly
```

## Debugging

### MFE not loading

1. Check `mfe.json` exists: `ls -la src/mfe_packages/{name}-mfe/mfe.json`
2. Check JSON is valid: `npm run type-check`
3. Check browser console for errors
4. Make sure `enabled: true` in registry.ts

### Error "Failed to load {name}/mfe.json"

- Check path in registry.ts matches folder name
- Make sure `mfe.json` exports an object with correct structure

## Example: Full Workflow for Creating notifications-mfe

```bash
# 1. Copy template
cp -r packages/cli/template-sources/mfe-package/ src/mfe_packages/notifications-mfe/

# 2. Update variables in package.json and vite.config.ts
# {{mfeName}} -> notifications
# {{port}} -> 3020

# 3. Create mfe.json (see example above)

# 4. Add to registry.ts:
# {
#   name: 'notifications-mfe',
#   port: 3020,
#   enabled: true,
#   description: 'Notifications MFE',
# }

# 5. Optionally add to package.json:
# "dev:mfe:notifications": "cd src/mfe_packages/notifications-mfe && npm run dev"

# 6. Run
npm run dev:all
```

---

See also:
- `frontx-new-mfe.md` - creating a new MFE package
- `frontx-dev-all.md` - dev server configuration
- `.ai/GUIDELINES.frontx-mfe-setup.md` - main guidelines
