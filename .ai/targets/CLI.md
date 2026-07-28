<!-- @standalone:override -->
# CLI Guidelines

## STATUS (READ FIRST)

- PARTIALLY STALE: sections SCOPE, PRESET HIERARCHY, PRESET STRUCTURE, CRITICAL RULES, BUILD PROCESS, UPDATE COMMAND, SCREENSET COMMANDS and PROJECT GENERATOR describe the pre-split CLI.
- Those sections have no referent in the current tree: presets/ and templates/ do not exist, copy-templates.ts and syncTemplates do not exist, and commands create / update / screenset create|copy do not exist.
- Current command surface -> install, list, update-local, validate, seed, add, upgrade.
- Source of truth for packages/cli -> architecture/ADR/0016, 0018, 0019, 0020, 0021, 0033 and the FEATUREs under architecture/features/ that own each area (template-resolution, cli-invocation, cli-scaffolding, composed-provenance, upgrade-changeset, template-manifest).
- Still in force here -> DEPENDENCY-CRUISER, TESTING, and the non-preset items of PRE-DIFF CHECKLIST.
- Code in packages/cli carries @cpt-begin / @cpt-end markers bound to FEATURE instruction IDs. Change the FEATURE first, then the code, then run cfs validate.

## AI WORKFLOW (REQUIRED)
1) Summarize 3-6 rules from this file before proposing changes.
2) STOP if you modify templates directly, bypass preset hierarchy, or add rules to root files.

## SCOPE
- packages/cli/**.
- presets/standalone/** and presets/monorepo/**.
- Build scripts that copy templates.
- Commands: create, update, screenset create/copy.

## PRESET HIERARCHY
- presets/standalone/configs/ is the SINGLE SOURCE OF TRUTH for standalone project configs.
- presets/standalone/scripts/ is the SINGLE SOURCE OF TRUTH for standalone project scripts.
- presets/monorepo/ extends presets/standalone/ with monorepo-specific rules.
- Root files only re-export from presets/monorepo/.
- templates/ is a BUILD ARTIFACT (gitignored); NEVER commit or reference as source.

## PRESET STRUCTURE
- presets/standalone/configs/: eslint.config.js, .dependency-cruiser.cjs, tsconfig.json
- presets/standalone/scripts/: test-architecture.ts
- presets/monorepo/configs/: extends standalone/configs/ with package rules
- presets/monorepo/scripts/: imports standalone/scripts/ and adds monorepo checks

## CRITICAL RULES
- REQUIRED: presets/monorepo/ extends presets/standalone/ (not reverse).
- REQUIRED: Root eslint.config.js re-exports presets/monorepo/configs/eslint.config.js.
- REQUIRED: Root .dependency-cruiser.cjs re-exports presets/monorepo/configs/.dependency-cruiser.cjs.
- REQUIRED: Root tsconfig.json extends presets/monorepo/configs/tsconfig.json.
- REQUIRED: npm run arch:check runs presets/monorepo/scripts/test-architecture.ts directly.
- REQUIRED: tsconfig paths are relative to file location; include/references must be duplicated.
- FORBIDDEN: Standalone presets importing monorepo presets.
- FORBIDDEN: Direct modifications to templates/ directory.

## DEPENDENCY-CRUISER
- REQUIRED: Use $1, $2 for backreferences (dependency-cruiser syntax).
- FORBIDDEN: Use backslash-1 or backslash-2 (grep syntax does NOT work).

## BUILD PROCESS (copy-templates.ts)
- REQUIRED: Clean templates/ before copying.
- REQUIRED: Copy standalone presets from presets/standalone/configs/ and presets/standalone/scripts/.
- REQUIRED: Copy directories (.ai, .cursor, .windsurf, src/themes, src/icons, eslint-plugin-local).
- REQUIRED: Copy demo screenset and _blank as screenset-template.
- REQUIRED: Write manifest.json for runtime discovery.
- REQUIRED: Exclude generated files from templates.

## UPDATE COMMAND (templates.ts syncTemplates)
- REQUIRED: Preserve user-created content in src/screensets/ and src/themes/.
- REQUIRED: Only replace items that exist in templates (selective sync).
- FORBIDDEN: Exclusion lists to preserve files; use selective sync instead.

## SCREENSET COMMANDS
- REQUIRED: frontx screenset create uses screenset-template (from _blank).
- REQUIRED: frontx screenset copy transforms all IDs using AST.
- REQUIRED: All IDs use template literals with screenset ID.
- REQUIRED: Event names follow ${SCREENSET_ID}/${DOMAIN_ID}/eventName.
- REQUIRED: Icon IDs follow ${SCREENSET_ID}:iconName.
- REQUIRED: Translation keys follow screenset.${ID}:key or screen.${ID}.${SCREEN}:key.

## PROJECT GENERATOR
- REQUIRED: Include eslint-plugin-unused-imports in devDependencies.
- REQUIRED: Include the default UI kit styles import (users can swap UI kit in main.tsx).
- REQUIRED: Use workspace pattern for eslint-plugin-local.
- FORBIDDEN: Hardcode package versions (except for initial template).

## TESTING
- REQUIRED: npm run type-check passes.
- REQUIRED: npm run lint passes.
- REQUIRED: npm run arch:check passes.
- REQUIRED: npm run arch:deps passes.
- REQUIRED: npm run dev starts without errors.

## PRE-DIFF CHECKLIST
- presets/standalone/ is source of truth.
- Root files only extend from presets/monorepo/.
- Monorepo presets properly extend standalone.
- templates/ not committed.
- copy-templates.ts copies from presets/standalone/, not templates/.
- Dependency-cruiser uses $1/$2 for backreferences.
- Generated projects pass all validation checks.
