# Feature: UI Libraries Choice

- [x] `p1` - **ID**: `cpt-frontx-featstatus-ui-libraries-choice`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Create MFE Project with Shadcn UI Kit](#create-mfe-project-with-shadcn-ui-kit)
  - [Create MFE Project with a Third-Party UI Library](#create-mfe-project-with-a-third-party-ui-library)
  - [Create MFE Project with No UI Library](#create-mfe-project-with-no-ui-library)
  - [Generate Screenset Respecting the Active UI Kit](#generate-screenset-respecting-the-active-ui-kit)
  - [Add Shadcn Component to an Existing MFE (Manual Process)](#add-shadcn-component-to-an-existing-mfe-manual-process)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [UI Kit Type Resolution from frontx.config.json](#ui-kit-type-resolution-from-frontxconfigjson)
  - [CLI Template Selection Based on UI Kit Type](#cli-template-selection-based-on-ui-kit-type)
  - [UIKit Bridge Generation for Third-Party Libraries](#uikit-bridge-generation-for-third-party-libraries)
  - [CSS Variable Theme Propagation for All UI Kit Types](#css-variable-theme-propagation-for-all-ui-kit-types)
- [4. States (CDSL)](#4-states-cdsl)
  - [Not Applicable](#not-applicable)
- [5. Definitions of Done](#5-definitions-of-done)
  - [UI Kit Type Resolution](#ui-kit-type-resolution)
  - [CLI Template Selection](#cli-template-selection)
  - [Project Scaffolding for All Three UI Kit Types](#project-scaffolding-for-all-three-ui-kit-types)
  - [Screenset Generation Consistent with UI Kit](#screenset-generation-consistent-with-ui-kit)
  - [UIKit Bridge Generation for Third-Party Libraries](#uikit-bridge-generation-for-third-party-libraries-1)
  - [Theme CSS Variable Propagation Across All UI Kit Types](#theme-css-variable-propagation-across-all-ui-kit-types)
  - [AI Guidelines Updated with UI Kit Discovery](#ai-guidelines-updated-with-ui-kit-discovery)
- [6. Acceptance Criteria](#6-acceptance-criteria)
- [Additional Context](#additional-context)
  - [Known Limitations](#known-limitations)
  - [Not Applicable: Performance, Security, Reliability, Data, Integration, Operations, Compliance, Usability](#not-applicable-performance-security-reliability-data-integration-operations-compliance-usability)

<!-- /toc -->

- [x] `p2` - `cpt-frontx-feature-ui-libraries-choice`

---

## 1. Feature Context

### 1.1 Overview

The UI Libraries Choice feature provides per-project UI component strategy for newly created projects. At project creation time (`frontx create`), the developer selects a UI strategy for the project: copy-owned shadcn/ui components scaffolded locally into `components/ui/`, a declared third-party library such as MUI or Ant Design, or fully custom components with no library dependency. This is a project-level decision recorded in `frontx.config.json` and fixed for the project's lifetime. The CLI (`frontx create`, `frontx screenset`) reads `frontx.config.json` to determine the active UI kit and scaffolds accordingly. Theme propagation via CSS variables remains consistent across all UI kit choices.

### 1.2 Purpose

- Decouple project UI stacks from a shared centralized package that created cross-package coupling and versioning friction
- Establish `frontx.config.json` as the authoritative configuration point for UI kit choice per project
- Enable developers to use mature third-party component libraries (MUI, Ant Design, etc.) without framework-imposed constraints
- Preserve theme consistency across all UI kit choices through CSS variable inheritance
- Align CLI scaffolding (project creation and screenset generation) with the selected UI kit

### 1.3 Actors

- `cpt-frontx-actor-developer` — creates MFE projects, generates screensets, selects and configures UI kit, authors UI components

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **DECOMPOSITION**: `cpt-frontx-feature-ui-libraries-choice`
- **PRD requirements**: `cpt-frontx-fr-cli-commands`, `cpt-frontx-fr-cli-templates`, `cpt-frontx-nfr-maint-zero-crossdeps`
- **Design components**: `cpt-frontx-component-cli`
- **Design constraints**: `cpt-frontx-constraint-typescript-strict-mode`
- **Design ADRs**: `cpt-frontx-adr-react-19-ref-as-prop`
- **Design principles**: `cpt-frontx-principle-mfe-isolation`, `cpt-frontx-principle-self-registering-registries`
- **Related features**: `cpt-frontx-feature-cli-tooling` (CLI commands), `cpt-frontx-feature-react-bindings` (theme propagation)

---

## 2. Actor Flows (CDSL)

### Create MFE Project with Shadcn UI Kit

- [x] `p2` - **ID**: `cpt-frontx-flow-ui-libraries-choice-create-shadcn`

**Actor**: `cpt-frontx-actor-developer`

**Success Scenarios**:
- Project scaffolded with local shadcn components in `components/ui/`

**Error Scenarios**:
- Template entry missing from `manifest.yaml`; CLI surfaces fatal error

**Steps**:
1. [x] - `p2` - Developer invokes `frontx create` and specifies project name and target directory - `inst-create-shadcn-1`
2. [x] - `p2` - CLI presents UI kit selection prompt with options: `shadcn`, `none`, or a custom package name - `inst-create-shadcn-2`
3. [x] - `p2` - Developer selects `shadcn` - `inst-create-shadcn-3`
4. [x] - `p2` - CLI writes `"uikit": "shadcn"` into the generated `frontx.config.json`
5. [x] - `p2` - CLI resolves the shadcn layout template from `manifest.yaml` and scaffolds project files including `components/ui/` directory
6. [x] - `p2` - CLI copies the base set of shadcn/ui components (button, input, card, dialog, form, toast) into `components/ui/` with React 19 ref-as-prop compatibility applied per `cpt-frontx-adr-react-19-ref-as-prop`
7. [x] - `p2` - CLI generates `components/ui/index.ts` barrel export for all scaffolded components
8. [x] - `p2` - **RETURN** project scaffold with locally owned shadcn components - `inst-create-shadcn-8`

### Create MFE Project with a Third-Party UI Library

- [x] `p2` - **ID**: `cpt-frontx-flow-ui-libraries-choice-create-thirdparty`

**Actor**: `cpt-frontx-actor-developer`

**Success Scenarios**:
- Project scaffolded with third-party library wired up via UIKit bridge

**Error Scenarios**:
- Template entry missing from `manifest.yaml`; CLI surfaces fatal error

**Steps**:
1. [x] - `p2` - Developer invokes `frontx create` and specifies project name and target directory - `inst-create-thirdparty-1`
2. [x] - `p2` - CLI presents UI kit selection prompt - `inst-create-thirdparty-2`
3. [x] - `p2` - Developer enters a third-party package name (e.g., `@mui/material`, `antd`) - `inst-create-thirdparty-3`
4. [x] - `p2` - CLI validates that the entered value is not `shadcn` or `none`, treats it as a third-party library identifier, and writes it to `frontx.config.json` as `"uikit"` - `inst-create-thirdparty-4`
5. [x] - `p2` - CLI resolves the `layout-custom-uikit/` template from `manifest.yaml`
6. [x] - `p2` - CLI scaffolds the project with the custom layout template and generates a UIKit bridge file that re-exports primitives from the declared third-party package under normalized names
7. [x] - `p2` - CLI adds the third-party package to `package.json` dependencies
8. [x] - `p2` - **IF** the provided value is a syntactically valid npm package name: query the npm registry to verify the package exists; **IF** unreachable or network error: treat as present with a warning — surfaced as validation logic before the project files are written - `inst-create-thirdparty-validate-npm`
8. [x] - `p2` - **RETURN** project scaffold with the chosen third-party library wired up - `inst-create-thirdparty-8`

### Create MFE Project with No UI Library

- [x] `p2` - **ID**: `cpt-frontx-flow-ui-libraries-choice-create-none`

**Actor**: `cpt-frontx-actor-developer`

**Success Scenarios**:
- Minimal project scaffolded with empty `uikit/` directory for manual component authoring

**Error Scenarios**:
- Template entry missing from `manifest.yaml`; CLI surfaces fatal error

**Steps**:
1. [x] - `p2` - Developer invokes `frontx create` and selects `none` as the UI kit option - `inst-create-none-1`
2. [x] - `p2` - CLI writes `"uikit": "none"` into `frontx.config.json`
3. [x] - `p2` - CLI resolves the `layout-custom-uikit/` template from `manifest.yaml`
4. [x] - `p2` - CLI scaffolds the project with the custom layout template and creates an empty `uikit/` directory containing a placeholder `index.ts`
5. [x] - `p2` - No UI library is added to `package.json` dependencies
6. [x] - `p2` - **RETURN** minimal project scaffold where all UI components are authored manually in `uikit/` - `inst-create-none-6`

### Generate Screenset Respecting the Active UI Kit

- [x] `p2` - **ID**: `cpt-frontx-flow-ui-libraries-choice-screenset-generate`

**Actor**: `cpt-frontx-actor-developer`

**Success Scenarios**:
- Screenset generated with imports matching the project's configured UI kit

**Error Scenarios**:
- `frontx.config.json` absent or `uikit` field missing; CLI surfaces actionable error

**Steps**:
1. [x] - `p2` - Provide template string replacement functions (`applyMfeReplacements`) that substitute blank-MFE placeholders (name, PascalCase name, port) into generated file contents - `inst-screenset-mfe-replacements`
2. [x] - `p2` - Provide file rename function (`applyMfeFileRename`) that renames `_BlankApiService` placeholders in file names to the target screenset name - `inst-screenset-mfe-rename`
3. [x] - `p2` - Provide recursive `readDirRecursive` function that reads all files from a directory tree and returns them as `GeneratedFile[]` with relative paths - `inst-screenset-read-dir`
4. [x] - `p2` - Provide `getUsedMfePorts` function that scans `src/mfe_packages/` to collect port numbers already in use from `mfe.json` manifests - `inst-screenset-port-scan`
5. [x] - `p2` - Provide `assignMfePort` function that finds the next available port starting from 3001, skipping any ports already returned by `getUsedMfePorts` - `inst-screenset-port-assign`
6. [x] - `p2` - Provide `isReservedScreensetName` predicate and `RESERVED_SCREENSET_NAMES` list that prevents using system-reserved names (`screenset`, `screen`, `index`, `api`, `core`) as screenset identifiers - `inst-screenset-reserved-names`
7. [x] - `p2` - Provide `validateNameAndLoadConfig` validation function that checks name validity and loads project config; define TypeScript types for command args and result - `inst-screenset-name-validation`
8. [x] - `p2` - Developer invokes `frontx screenset` with a screenset name from within an MFE project directory; CLI defines command schema (name, port, project root options) - `inst-screenset-cmd-types`
9. [x] - `p2` - CLI registers the `screenset` command definition with validation and execute callbacks - `inst-screenset-cmd-definition`
10. [x] - `p2` - CLI execute handler reads `frontx.config.json`, resolves the screenset name, determines the next available port, resolves uikit type, then delegates to the screenset generator - `inst-screenset-cmd-execute`
11. [x] - `p2` - CLI validates the screenset name; reads `frontx.config.json` from the project root and extracts the `uikit` field - `inst-screenset-generate-setup`
12. [x] - `p2` - Developer invokes `frontx screenset` with a screenset name from within an MFE project directory - `inst-screenset-generate-1`
13. [x] - `p2` - CLI reads `frontx.config.json` from the project root and extracts the `uikit` field - `inst-screenset-generate-2`
14. [x] - `p2` - **IF** `uikit` is `"shadcn"`: CLI selects the shadcn screenset template, imports from `components/ui/` - `inst-screenset-generate-3`
15. [x] - `p2` - **IF** `uikit` is `"none"`: CLI selects the custom screenset template, imports from `uikit/` - `inst-screenset-generate-4`
16. [x] - `p2` - **IF** `uikit` is a third-party identifier: CLI selects the custom-uikit screenset template, imports from the declared package - `inst-screenset-generate-5`
17. [x] - `p2` - Strip shadcn-specific dependencies (`tailwindcss`, `clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-slot`) from the generated MFE `package.json` when uikit is not `shadcn` - `inst-screenset-strip-shadcn-deps`
18. [x] - `p2` - CLI generates the screenset files (screen definitions, registry entry, layout) using the resolved template - `inst-screenset-generate-6`
19. [x] - `p2` - Ensure `src/mfe_packages/shared/` directory exists and write all generated files to the MFE package directory; print a hint that the developer runs `npm run generate:mfe-manifests` (chained from `npm run dev`) to refresh `public/generated-mfe-manifests.json` so the bootstrap picks up the new MFE — same workflow as adding an MFE in the monorepo - `inst-screenset-generate-finalize`
20. [x] - `p2` - **RETURN** fully wired screenset consistent with the project's UI kit choice - `inst-screenset-generate-7`

### Add Shadcn Component to an Existing MFE (Manual Process)

This is a manual developer process using the external shadcn CLI — not implemented by FrontX code.

**Actor**: `cpt-frontx-actor-developer`

**Steps**:
1. Developer runs a shadcn CLI command (e.g., `npx shadcn add <component>`) within the MFE project directory
2. shadcn CLI reads the project's `components.json` configuration (generated by `frontx create` for shadcn projects) and resolves the output path to `components/ui/`
3. shadcn CLI writes the new component source file into `components/ui/`
4. Developer updates the `components/ui/index.ts` barrel export to include the new component
5. **Result**: new component locally owned by the MFE and not shared with other packages

---

## 3. Processes / Business Logic (CDSL)

### UI Kit Type Resolution from frontx.config.json

- [x] `p1` - **ID**: `cpt-frontx-algo-ui-libraries-choice-uikit-resolution`

**Input**: Project root directory path

**Output**: Discriminated union — `shadcn | none | third-party(packageId) | unknown(error)`

**Steps**:
1. [x] - `p1` - Provide project utility module with `CONFIG_FILE` constant, `loadConfig()` helper that reads and parses `frontx.config.json`, and `findProjectRoot()` helper that walks directories upward; export `isCustomUikit` and related predicates — implementation foundation for all config-based UI kit resolution - `inst-uikit-project-utils`
2. [x] - `p1` - Provide `normalizeUikit()` function that maps legacy uikit aliases (e.g., `frontx` → `shadcn`) to current canonical values, and exports the npm package name validation regex and `isValidPackageName` predicate - `inst-uikit-resolution-normalize`
3. [x] - `p1` - Read `frontx.config.json` from the MFE project root - `inst-uikit-resolution-1`
4. [x] - `p1` - Extract the `uikit` string field - `inst-uikit-resolution-2`
5. [x] - `p1` - **IF** the field is absent or the file does not exist: **RETURN** type `unknown`, surface a configuration error to the caller
6. [x] - `p1` - **IF** the value is exactly `"shadcn"`: **RETURN** type `shadcn` - `inst-uikit-resolution-4`
7. [x] - `p1` - **IF** the value is exactly `"none"`: **RETURN** type `none`
8. [x] - `p1` - **IF** the value is a non-empty string that is neither `"shadcn"` nor `"none"`: **RETURN** type `third-party` with the raw string as the package identifier - `inst-uikit-resolution-6`
9. [x] - `p1` - **IF** the value is an empty string or a non-string type: **RETURN** type `unknown`, surface a validation error - `inst-uikit-resolution-7`

### CLI Template Selection Based on UI Kit Type

- [x] `p1` - **ID**: `cpt-frontx-algo-ui-libraries-choice-template-selection`

**Input**: Resolved UI kit type from UI Kit Type Resolution

**Output**: Resolved template path and metadata

**Steps**:
1. [x] - `p1` - Define `NO_UIKIT_UTILS_TEMPLATE` path constant and `NO_UIKIT_UTILS_CONTENT` inline fallback — a minimal `cn()` utility implementation used when the shadcn `utils.ts` template is not applicable - `inst-template-no-uikit-utils`
2. [x] - `p1` - Provide `getProjectUtilsTemplate()` function that returns the correct utils template path: `src/app/lib/utils.ts` for shadcn projects, `src/app/lib/utils.no-uikit.ts` for all others - `inst-template-utils`
3. [x] - `p1` - Define `TemplateCopyInput`, `AiTargetsInput`, and `PackageJsonInput` type shapes; define `TEMPLATE_VARIANT_FILES` (files that have ui-kit-specific variants) and `UI_DEPENDENT_TEMPLATE_FILES` (files only included for shadcn projects) constant arrays - `inst-template-types`
4. [x] - `p1` - Receive resolved UI kit type from the UI Kit Type Resolution algorithm
5. [x] - `p1` - Load `manifest.json` from the CLI templates directory; **IF** not found **RETURN** error directing the developer to rebuild the CLI package - `inst-template-manifest-load`
6. [x] - `p1` - Receive resolved manifest from the manifest load step and extract `rootFiles` and `directories` from `stage1b`
7. [x] - `p1` - **IF** UI kit type is `shadcn`: resolve the standard shadcn layout template entry from the manifest - `inst-template-selection-3`
8. [x] - `p1` - **IF** UI kit type is `none` or `third-party`: resolve the `layout-custom-uikit/` template entry from the manifest - `inst-template-selection-4`
9. [x] - `p1` - **IF** the resolved template entry does not exist in the manifest: surface a fatal CLI error, halt scaffolding
10. [x] - `p1` - **RETURN** the resolved template path and associated metadata for use by the file scaffolding step

### UIKit Bridge Generation for Third-Party Libraries

- [x] `p1` - **ID**: `cpt-frontx-algo-ui-libraries-choice-bridge-generation`

**Input**: Third-party package identifier string

**Output**: Generated bridge TypeScript file

**Steps**:
1. [x] - `p1` - Receive the third-party package identifier from UI Kit Type Resolution - `inst-bridge-generation-1`
2. [x] - `p1` - Validate that the package identifier is a syntactically valid npm package name (matches `^(@[a-z0-9-~][a-z0-9-._~]*/)?[a-z0-9-~][a-z0-9-._~]*$`). **IF** validation fails: surface an error and halt generation — the identifier will be interpolated into generated code and must be safe - `inst-bridge-generation-1b`
3. [x] - `p1` - Load the bridge template appropriate for the `layout-custom-uikit/` scaffold - `inst-bridge-generation-2`
4. [x] - `p1` - Substitute the package identifier into all import statements within the bridge template - `inst-bridge-generation-3`
5. [x] - `p1` - **FOR EACH** normalized primitive name (Button, Input, Card, Dialog, Form, Notification) defined in the bridge contract: emit a re-export statement mapping from the third-party package to the normalized name
6. [x] - `p1` - Write the generated bridge file to the MFE project at the path defined by the template manifest
7. [x] - `p1` - Write the third-party package name into `package.json` dependencies with a permissive semver range
8. [x] - `p1` - **IF** any normalized primitive cannot be mapped (package does not export an obvious match): emit a warning comment in the bridge file at the unmapped export site rather than silently omitting it
9. [x] - `p1` - **FOR EACH** CSS `@import` line in the bridge's `cssImports`: resolve the subpath against the installed package root and verify the CSS file exists; **IF** the package is not installed in the CLI environment treat the import as present to avoid silently dropping imports for unresolved packages - `inst-bridge-css-import-check`

### CSS Variable Theme Propagation for All UI Kit Types

- [x] `p1` - **ID**: `cpt-frontx-algo-ui-libraries-choice-theme-propagation`

**Input**: Active theme object and UI kit type

**Output**: CSS variables applied to document and shadow roots

**Steps**:
1. [x] - `p1` - At MFE bootstrap, the host sets shadcn CSS variables (`--background`, `--foreground`, `--primary`, `--primary-foreground`, `--muted`, `--accent`, `--destructive`, `--border`, `--radius`, and related tokens) on `document.documentElement` - `inst-theme-propagation-1`
2. [x] - `p1` - **FOR EACH** shadow root created by the MFE: inherit CSS variables by including a `:host { ... }` block that forwards the same token set from the shadow root's outer context - `inst-theme-propagation-2` <!-- N/A for CLI: runtime behavior in @gears-frontx/react MFE bootstrap -->
3. [x] - `p1` - **IF** UI kit type is `shadcn`: components consume variables directly; no additional mapping required - `inst-theme-propagation-3` <!-- N/A for CLI: inherent behavior, no code needed -->
4. [x] - `p1` - **IF** UI kit type is `third-party`: the UIKit bridge file is responsible for mapping shadcn CSS variable values to the third-party library's theming API (e.g., MUI `createTheme`, Ant Design `ConfigProvider`) — this mapping is defined in the bridge template - `inst-theme-propagation-4`
5. [x] - `p1` - **IF** UI kit type is `none`: the MFE developer is responsible for consuming the CSS variables in custom components; the scaffolded `uikit/` directory includes a `theme.css` file with variable forwarding - `inst-theme-propagation-5`
6. [x] - `p1` - Theme token changes propagate to all UI kit types through the CSS cascade without requiring re-initialization - `inst-theme-propagation-6` <!-- N/A for CLI: inherent CSS cascade behavior -->
7. [x] - `p1` - Build the `adapter.ts` content for unknown UI libraries: assembles `hai3Themes` export with `ThemeConfig[]` entries containing inline HSL variable values for default light and dark themes - `inst-theme-adapter-build`
8. [x] - `p1` - Generate `globals.css` for custom UI kit projects: **IF** bridge is a known css-alias bridge filter CSS `@import` lines that resolve to missing files, then prepend remaining imports and a `./themes/bridge.css` import; **IF** bridge is unknown generate generic `:root` CSS variables with fallback HSL values - `inst-theme-custom-globals-css`

---

## 4. States (CDSL)

### Not Applicable

Not applicable to this feature. UI Libraries Choice is a configuration and scaffolding concern: it defines what gets generated at project creation and screenset generation time, and what the active UI kit choice is at build time. There is no runtime state machine governing UI kit transitions — the `uikit` field in `frontx.config.json` is fixed for the lifetime of a project and does not change during execution.

---

## 5. Definitions of Done

### UI Kit Type Resolution

- [x] `p1` - **ID**: `cpt-frontx-dod-ui-libraries-choice-uikit-resolution-impl`

The CLI exports a pure function that reads `frontx.config.json` from a given project root, parses the `uikit` field, and returns a discriminated union type (`shadcn | none | third-party | unknown`). Unit tests cover: missing file, absent field, empty string, `"shadcn"`, `"none"`, and an arbitrary third-party identifier. All type branches are exercised. The function is strict-TypeScript compliant per `cpt-frontx-constraint-typescript-strict-mode`.

**Implements**:
- `cpt-frontx-algo-ui-libraries-choice-uikit-resolution`

**Covers (PRD)**:
- `cpt-frontx-fr-cli-commands`

**Covers (DESIGN)**:
- `cpt-frontx-component-cli`
- `cpt-frontx-constraint-typescript-strict-mode`

---

### CLI Template Selection

- [x] `p1` - **ID**: `cpt-frontx-dod-ui-libraries-choice-template-selection-impl`

`manifest.yaml` contains distinct template entries for `shadcn` and `layout-custom-uikit/` types. The CLI template selection function maps each resolved UI kit type to the correct template entry and surfaces a fatal error for missing entries. Tests verify that `shadcn` maps to the standard template, and both `none` and a third-party identifier map to `layout-custom-uikit/`.

**Implements**:
- `cpt-frontx-algo-ui-libraries-choice-template-selection`

**Covers (PRD)**:
- `cpt-frontx-fr-cli-templates`

**Covers (DESIGN)**:
- `cpt-frontx-component-cli`

---

### Project Scaffolding for All Three UI Kit Types

- [x] `p2` - **ID**: `cpt-frontx-dod-ui-libraries-choice-create-scaffolding`

Running `frontx create` for each of the three UI kit types produces a project with the correct directory structure: `components/ui/` with scaffolded shadcn components for `shadcn`; `uikit/` placeholder for `none`; bridge file for third-party. In all cases, `frontx.config.json` contains the correct `uikit` value. Integration tests cover all three paths end-to-end in a temp directory.

**Implements**:
- `cpt-frontx-flow-ui-libraries-choice-create-shadcn`
- `cpt-frontx-flow-ui-libraries-choice-create-thirdparty`
- `cpt-frontx-flow-ui-libraries-choice-create-none`

**Covers (PRD)**:
- `cpt-frontx-fr-cli-commands`
- `cpt-frontx-fr-cli-templates`

**Covers (DESIGN)**:
- `cpt-frontx-component-cli`
- `cpt-frontx-principle-mfe-isolation`

---

### Screenset Generation Consistent with UI Kit

- [x] `p2` - **ID**: `cpt-frontx-dod-ui-libraries-choice-screenset-generation`

`frontx screenset` reads `frontx.config.json` before generating any files. Generated screens import from `components/ui/` for shadcn projects, from `uikit/` for none projects, and from the third-party package identifier for third-party projects. Tests assert that import paths in generated files match the active UI kit and that screenset registry entries are valid for all three UI kit types.

**Implements**:
- `cpt-frontx-flow-ui-libraries-choice-screenset-generate`

**Covers (PRD)**:
- `cpt-frontx-fr-cli-commands`

**Covers (DESIGN)**:
- `cpt-frontx-component-cli`
- `cpt-frontx-principle-self-registering-registries`

---

### UIKit Bridge Generation for Third-Party Libraries

- [x] `p1` - **ID**: `cpt-frontx-dod-ui-libraries-choice-bridge-generation`

The bridge generation algorithm produces a valid TypeScript file when given a third-party package identifier. The file contains re-exports for all six normalized primitives. For any primitive that cannot be automatically mapped, a warning comment is emitted rather than the export being silently dropped. Tests verify: correct import source, all six primitive re-exports present, warning comment emitted for an unknown package.

**Implements**:
- `cpt-frontx-algo-ui-libraries-choice-bridge-generation`

**Covers (PRD)**:
- `cpt-frontx-fr-cli-commands`
- `cpt-frontx-fr-cli-templates`

**Covers (DESIGN)**:
- `cpt-frontx-component-cli`

---

### Theme CSS Variable Propagation Across All UI Kit Types

- [x] `p1` - **ID**: `cpt-frontx-dod-ui-libraries-choice-theme-propagation`

For shadcn projects: scaffolded components consume shadcn CSS variables directly without additional configuration. For third-party projects: the bridge template includes a theme mapping block that reads shadcn CSS variables from `document.documentElement` and passes them to the third-party theming API. For none projects: `uikit/theme.css` forwards all standard shadcn CSS variables. Tests verify that the token set (`--background`, `--foreground`, `--primary`, `--primary-foreground`, `--muted`, `--accent`, `--destructive`, `--border`, `--radius`) is present in all scaffolded outputs.

**Implements**:
- `cpt-frontx-algo-ui-libraries-choice-theme-propagation`

**Covers (PRD)**:
- `cpt-frontx-fr-cli-templates`

**Covers (DESIGN)**:
- `cpt-frontx-principle-mfe-isolation`

---

### AI Guidelines Updated with UI Kit Discovery

- [x] `p1` - **ID**: `cpt-frontx-dod-ui-libraries-choice-ai-guidelines`

`UIKIT.md` in the AI guidelines directory instructs AI agents to use local UI components. `SCREENSETS.md` contains a "UI KIT DISCOVERY" section that instructs AI agents to read `frontx.config.json` before generating any screenset code. For projects using a third-party UI kit, the CLI generates an extended `UIKIT.md` with library-specific discovery instructions. These files are reviewed and accepted before this feature is closed.

**Implements**:
- `cpt-frontx-algo-ui-libraries-choice-uikit-resolution`

**Covers (PRD)**:
- `cpt-frontx-fr-cli-commands`

**Covers (DESIGN)**:
- `cpt-frontx-component-cli`

---

## 6. Acceptance Criteria

- [x] `frontx create` prompts for UI kit choice and writes the selection to `frontx.config.json` as the `uikit` field
- [x] A project created with `"uikit": "shadcn"` contains `components/ui/` with at minimum: button, input, card, dialog, form, and toast components, each compliant with `cpt-frontx-adr-react-19-ref-as-prop`
- [x] A project created with `"uikit": "none"` contains `uikit/` with a placeholder `index.ts` and `theme.css` forwarding all standard shadcn CSS variable tokens
- [x] A project created with a third-party package identifier contains a UIKit bridge file that re-exports all six normalized primitives from the declared package; the package is listed in `package.json` dependencies
- [x] `frontx screenset` fails with an actionable error message when `frontx.config.json` is absent or the `uikit` field is missing or empty
- [x] Generated screenset files import from the correct source path for each UI kit type: `components/ui/` for shadcn, `uikit/` for none, the declared package identifier for third-party
- [x] The full set of shadcn CSS variable tokens is present in all scaffolded output regardless of UI kit type, either directly consumed, forwarded via `theme.css`, or mapped via the UIKit bridge
- [x] No MFE scaffolded by this feature imports from another MFE's `components/ui/` or `uikit/` directory, satisfying `cpt-frontx-principle-mfe-isolation`
- [x] All CLI commands introduced or modified by this feature produce TypeScript output that passes `tsc --noEmit` under strict mode per `cpt-frontx-constraint-typescript-strict-mode`
- [x] The `manifest.yaml` for CLI templates is the single authoritative source for template-to-UI-kit-type mapping; no hardcoded template paths exist in CLI business logic

---

## Additional Context

### Known Limitations

- Only CSS-alias bridges are implemented (e.g., `@acronis-platform/shadcn-uikit`). JS-adapter bridges for ThemeProvider-based libraries (MUI, Ant Design) are reserved for future work — the `JsAdapterBridge` type exists but is not wired up.
- Unknown third-party libraries receive generic themes with inline HSL values and TODO comments in App.tsx; full theme integration requires a known bridge entry in `uikitBridges.ts`.
- Adding a new known bridge requires a code change in `packages/cli/src/generators/uikitBridges.ts` — there is no external bridge registry or plugin mechanism.

### Not Applicable: Performance, Security, Reliability, Data, Integration, Operations, Compliance, Usability

- **PERF**: Not applicable because this feature is a configuration and scaffolding concern; no hot paths, caching strategies, or resource management are introduced. Runtime performance characteristics of UI components are owned by the chosen UI library, not by this feature.
- **SEC**: Not applicable for authentication, authorization, or sensitive data handling. However, the bridge generation algorithm (`inst-bridge-generation-1b`) validates user-supplied package names against npm naming rules before interpolating them into generated code, preventing code injection in scaffolded files. Security of generated code is otherwise inherited from the template sources.
- **REL**: Not applicable because this feature does not introduce error-prone runtime operations, external dependency calls, or data integrity concerns. Scaffolding failures are handled by the CLI's existing error model.
- **DATA**: Not applicable because this feature does not introduce data access patterns, data validation, or data lifecycle management. The `frontx.config.json` file is a static configuration artifact.
- **INT**: Not applicable because this feature does not introduce API interactions, database operations, or external integrations beyond reading a local config file.
- **OPS**: Not applicable because this feature does not introduce observability, configuration management beyond `frontx.config.json`, or health diagnostics.
- **COMPL**: Not applicable because this feature does not handle regulated data, privacy concerns, or audit requirements.
- **UX**: Not applicable because the developer experience of the CLI prompts is inherited from the existing CLI architecture (`cpt-frontx-feature-cli-tooling`). Individual UI component usability is owned by the chosen library.
