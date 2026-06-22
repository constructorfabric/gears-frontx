# frontxdev:test-packages - Test Package Changes

## AI WORKFLOW (REQUIRED)
1) Read .ai/targets/CLI.md and relevant package target.
2) Build and validate.
3) Test in dev environment.

## STEP 1: Build All Packages
```bash
npm run build:packages
```

## STEP 2: Run All Checks
```bash
npm run type-check
npm run lint
npm run arch:check
npm run arch:deps
```
REQUIRED: All checks must pass.

## STEP 3: Test in Dev Server
```bash
npm run dev
```
Test affected functionality in browser.

## STEP 4: Verify Package Exports
Check that all public exports are accessible:
```bash
node -e "const pkg = require('@gears-frontx/uicore'); console.log(Object.keys(pkg))"
```

## RULES
- REQUIRED: Build packages before testing.
- REQUIRED: arch:check must pass.
- REQUIRED: Test in browser via Chrome DevTools MCP.
- FORBIDDEN: Committing without passing all checks.
