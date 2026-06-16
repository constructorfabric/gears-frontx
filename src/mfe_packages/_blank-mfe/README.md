# Blank MFE Template

This is a template for creating new FrontX Microfrontend packages. It provides a complete, working MFE structure with:

- Shadow DOM isolation
- Bridge communication with the host
- Theme and language property subscriptions
- MFE-local i18n with 36 language files
- UIKit component integration
- TypeScript strict mode
- Module Federation setup

## How to Use This Template

### 1. Copy the Template

Copy the entire `_blank-mfe` directory to a new name:

```bash
cp -r src/mfe_packages/_blank-mfe src/mfe_packages/your-mfe-name
```

### 2. Update Package Metadata

Edit `package.json`:
- Change `"name"` from `"@gears-frontx/blank-mfe"` to `"@gears-frontx/your-mfe-name"`
- Change the port in the `"dev"` and `"preview"` scripts (e.g., from `3099` to your chosen port)

Edit `vite.config.ts`:
- Change `name` in the federation config from `"blankMfe"` to `"yourMfeName"` (camelCase)
- Update the port in the dev server config if needed

### 3. Update GTS IDs in mfe.json

Replace all placeholder IDs with your actual GTS IDs. The placeholders are marked with `[YOUR_ORG]`, `[YOUR_APP]`, `[YOUR_MFE_NAME]`, and `[YOUR_SCREEN_NAME]`.

**Manifest ID Pattern:**
```
gts.hai3.mfes.mfe.mf_manifest.v1~[YOUR_ORG].[YOUR_APP].mfe.[YOUR_MFE_NAME].manifest.v1
```

Example:
```
gts.hai3.mfes.mfe.mf_manifest.v1~acme.crm.mfe.customer.manifest.v1
```

**Entry ID Pattern:**
```
gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~[YOUR_ORG].[YOUR_APP].mfe.[YOUR_MFE_NAME].[YOUR_SCREEN_NAME].v1
```

Example:
```
gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~acme.crm.mfe.customer.details.v1
```

**Extension ID Pattern:**
```
gts.hai3.mfes.ext.extension.v1~[YOUR_ORG].[YOUR_APP].ext.[YOUR_SCREEN_NAME]_screen.v1
```

Example:
```
gts.hai3.mfes.ext.extension.v1~acme.crm.ext.customer_details_screen.v1
```

**Update the `remoteEntry` URL:**
```json
"remoteEntry": "http://localhost:[YOUR_PORT]/assets/remoteEntry.js"
```

**Update the `remoteName`:**
```json
"remoteName": "yourMfeName"
```

**Update the presentation metadata:**
```json
"presentation": {
  "label": "Your Screen Label",
  "icon": "lucide:your-icon",
  "route": "/your-route",
  "order": 100
}
```

### 4. Customize the Screen Component

Edit `src/screens/home/HomeScreen.tsx`:
- Rename the component if needed
- Add your business logic
- Customize the UI using UIKit components

### 5. Update Translations

Edit the i18n files in `src/screens/home/i18n/`:
- Update the `title` and `description` keys for all 36 language files
- Add any additional translation keys your screen needs
- Ensure all keys used in `t()` calls exist in the translation files

### 6. Add to Workspace (Optional)

If you want to run the MFE locally for development:

1. Add to root `package.json` workspaces:
```json
"workspaces": [
  "src/mfe_packages/your-mfe-name"
]
```

2. Add dev scripts to root `package.json`:
```json
"dev:mfe:your-name": "npm run dev --workspace=@gears-frontx/your-mfe-name",
"dev:all": "concurrently \"npm run dev\" \"npm run dev:mfe:your-name\""
```

3. Install dependencies:
```bash
npm install
```

### 7. Register with Host

In the host app's MFE bootstrap file (e.g., `src/app/mfe/bootstrap.ts`):

```typescript
import yourMfeConfig from '@gears-frontx/your-mfe-name/mfe.json';

// Register manifest
runtime.registerManifest(yourMfeConfig.manifest);

// Register entries
yourMfeConfig.entries.forEach(entry => {
  runtime.registerEntry(entry);
});

// Register extensions
yourMfeConfig.extensions.forEach(extension => {
  runtime.registerExtension(extension);
});
```

## Project Structure

```
_blank-mfe/
├── package.json              # Package metadata and dependencies
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite and Module Federation config
├── mfe.json                  # MFE manifest, entries, and extensions
├── README.md                 # This file
└── src/
    ├── lifecycle.tsx         # MFE lifecycle implementation
    ├── shared/
    │   └── useScreenTranslations.ts  # i18n hook
    └── screens/
        └── home/
            ├── HomeScreen.tsx        # Screen component
            └── i18n/                 # 36 language files
                ├── en.json
                ├── es.json
                └── ... (34 more)
```

## Key Concepts

### Shadow DOM Isolation

All MFE content renders inside a Shadow DOM root, ensuring complete CSS isolation from the host application. Styles are injected by the lifecycle class in `initializeStyles()`.

### Bridge Communication

The `ChildMfeBridge` provides APIs for:
- Property subscriptions (theme, language)
- Actions chain execution (navigation, custom actions)
- Bidirectional communication with the host

### MFE-Local i18n

Each screen manages its own translations using `useScreenTranslations`:
- Translations are loaded dynamically based on the current language
- Language changes trigger automatic translation reload
- No host-side i18n dependencies

### UI Components

Use local components (e.g. `components/ui/`) for styling. Add your own primitives (Card, Button, Input, Select, Skeleton, etc.) or use the project’s chosen UI library. Keep components Shadow DOM compatible.

## Development

### Run Locally

```bash
npm run dev
```

The MFE will be served at `http://localhost:[YOUR_PORT]/assets/remoteEntry.js`.

### Build

```bash
npm run build
```

### Type Check

```bash
tsc --noEmit
```

## CI Validation

This template is NOT a workspace member by design. To validate the template structure in CI without adding it to the workspace:

1. Copy the template to a temporary workspace location
2. Run `tsc --noEmit` to validate TypeScript
3. Run `eslint` to validate code style
4. Discard the temporary copy

Example CI script:

```bash
# Validate blank-mfe template
cp -r src/mfe_packages/_blank-mfe /tmp/blank-mfe-validation
cd /tmp/blank-mfe-validation
npm install --package-lock-only
npm run type-check
npx eslint src/
cd -
rm -rf /tmp/blank-mfe-validation
```

## Troubleshooting

### Module Federation Errors

If you see "Shared module not available" errors:
- Ensure all shared dependencies in `mfe.json` match those in `vite.config.ts`
- Verify the host app is configured to consume your remote

### Type Errors

If TypeScript cannot resolve `@gears-frontx/*` imports:
- Ensure `@gears-frontx/react` is in `dependencies`
- Run `npm install` to symlink workspace packages

### Style Issues

If styles don't apply inside Shadow DOM:
- Verify `initializeStyles()` is called in `mount()`
- Check that CSS variable names match UIKit theme tokens
- Ensure Tailwind utilities are defined in the injected `<style>` block
