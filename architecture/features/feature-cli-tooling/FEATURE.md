# Feature: CLI Tooling

- [x] `p1` - **ID**: `cpt-hai3-featstatus-cli-tooling`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Create Project](#create-project)
  - [Scaffold Layout](#scaffold-layout)
  - [Update Project](#update-project)
  - [Update Layout](#update-layout)
  - [Sync AI Configurations](#sync-ai-configurations)
  - [Validate Components](#validate-components)
  - [Apply Code Migrations](#apply-code-migrations)
  - [Run PR E2E Scenario](#run-pr-e2e-scenario)
  - [Run Nightly E2E Scenario](#run-nightly-e2e-scenario)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Validate Project Name](#validate-project-name)
  - [Generate Project Files](#generate-project-files)
  - [Resolve Package Manager Policy](#resolve-package-manager-policy)
  - [Layer Command Variant Selection](#layer-command-variant-selection)
  - [Detect Release Channel](#detect-release-channel)
  - [Sync Templates](#sync-templates)
  - [Generate AI Configuration for Tool](#generate-ai-configuration-for-tool)
  - [Generate Command Adapters](#generate-command-adapters)
  - [Scan Component Violations](#scan-component-violations)
  - [Resolve Pending Migrations](#resolve-pending-migrations)
  - [Apply Migration](#apply-migration)
  - [Build CLI Templates at Build Time](#build-cli-templates-at-build-time)
  - [Execute E2E Harness Step](#execute-e2e-harness-step)
- [4. States (CDSL)](#4-states-cdsl)
  - [Command Execution Lifecycle](#command-execution-lifecycle)
  - [Migration Tracker State](#migration-tracker-state)
- [5. Definitions of Done](#5-definitions-of-done)
  - [CLI Package and Binary](#cli-package-and-binary)
  - [Command Registry and Executor](#command-registry-and-executor)
  - [Template-Based Project Generation](#template-based-project-generation)
  - [Layer-Aware Command Variant Selection](#layer-aware-command-variant-selection)
  - [AI Configuration Sync](#ai-configuration-sync)
  - [Component Structure Validation](#component-structure-validation)
  - [Codemod Migration System](#codemod-migration-system)
  - [CLI PR E2E Workflow](#cli-pr-e2e-workflow)
  - [CLI Nightly E2E Workflow](#cli-nightly-e2e-workflow)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p2` - `cpt-hai3-feature-cli-tooling`

---

## 1. Feature Context

### 1.1 Overview

The CLI Tooling feature provides the `@gears-frontx/cli` package — a standalone scaffolding tool that reduces boilerplate and enforces HAI3 architectural conventions across all project layers. It generates complete project structures, layout components, and AI assistant configurations from real project files used as build-time templates.

Problem: Without tooling, developers must manually assemble multi-file project structures, navigate layer-specific package.json configurations, and keep AI assistant integration files in sync across Claude, Cursor, Windsurf, and GitHub Copilot. Inconsistencies accumulate quickly across teams.

Primary value: A single `hai3 create` command produces a complete, layered HAI3 project with correct dependencies, IDE configs, and AI skill integrations in under a minute.

Key assumptions: The CLI runs in Node.js 18+ environments. It may be installed globally via a supported package manager (`npm` or `pnpm`; `yarn` global install is not managed by the CLI update flow). Templates are packaged into the CLI build and are not loaded from the network at runtime.

### 1.2 Purpose

Enable `cpt-hai3-actor-developer` and `cpt-hai3-actor-cli` to scaffold new HAI3 projects and layer packages, generate layout components on demand, keep AI assistant configurations current, apply codemod migrations across major version upgrades, and validate component structure rules — all through a consistent programmatic interface usable by both humans and AI agents.

Success criteria: A developer runs `hai3 create my-app`, selects or passes a supported package manager (`npm`, `pnpm`, or `yarn`), changes into the directory, runs the generated manager-appropriate install and dev commands, and has a working HAI3 application with all AI configurations set up correctly.

### 1.3 Actors

- `cpt-hai3-actor-developer`
- `cpt-hai3-actor-cli`
- `cpt-hai3-actor-build-system`

### 1.4 References

- Overall Design: [DESIGN.md](../../DESIGN.md) — `cpt-hai3-component-cli`
- DECOMPOSITION: [DECOMPOSITION.md](../../DECOMPOSITION.md) — `cpt-hai3-feature-cli-tooling`
- ADR: `cpt-hai3-adr-cli-template-based-code-generation`
- ADR: `cpt-hai3-adr-two-tier-cli-e2e-verification`
- Related constraint: `cpt-hai3-constraint-esm-first-module-format`

---

## 2. Actor Flows (CDSL)

### Create Project

- [x] `p1` - **ID**: `cpt-hai3-flow-cli-tooling-create-project`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-cli`

1. [x] - `p1` - Developer invokes `hai3 create <project-name>` with optional flags (`--layer`, `--uikit`, `--studio`, `--no-studio`, `--package-manager`) - `inst-invoke-create`
2. [x] - `p1` - Algorithm: validate project name using `cpt-hai3-algo-cli-tooling-validate-project-name` - `inst-run-name-validation`
3. [x] - `p1` - **IF** target directory already exists **THEN** prompt developer to confirm overwrite; **IF** developer declines **RETURN** with abort message - `inst-check-dir-exists`
4. [x] - `p1` - **IF** `--layer` flag is not `app` **THEN** skip uikit/studio prompts and proceed to layer package generation - `inst-branch-layer`
5. [x] - `p1` - **IF** `--studio` flag is absent **THEN** prompt developer: "Include Studio (development overlay)?" - `inst-prompt-studio`
6. [x] - `p1` - **IF** `--uikit` flag is absent **THEN** prompt developer to select UIKit option from `['shadcn', 'none']` or enter a third-party package name - `inst-prompt-uikit`
7. [x] - `p1` - **IF** `--package-manager` flag is absent **THEN** prompt developer to select one of `npm`, `pnpm`, or `yarn` - `inst-prompt-package-manager`
8. [x] - `p1` - Algorithm: generate project files using `cpt-hai3-algo-cli-tooling-generate-project` - `inst-run-generate-project`
9. [x] - `p1` - Write all generated files to the target directory on disk - `inst-write-files`
10. [x] - `p1` - Execute `aiSyncCommand` against the newly created project root to generate IDE configuration files - `inst-run-ai-sync-after-create`
11. [x] - `p1` - Log success message and next-step instructions (`cd <name>`, manager-appropriate install command, manager-appropriate dev/build command) to the developer - `inst-log-success-create`
12. [x] - `p1` - **RETURN** `CreateCommandResult` with `projectPath` and list of written file paths - `inst-return-create`

### Scaffold Layout

- [x] `p1` - **ID**: `cpt-hai3-flow-cli-tooling-scaffold-layout`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-cli`

1. [x] - `p1` - Developer invokes `hai3 scaffold layout` from a HAI3 project directory, optionally with `--force` - `inst-invoke-scaffold-layout`
2. [x] - `p1` - **IF** not inside a HAI3 project root (no `frontx.config.json`) **RETURN** validation error `NOT_IN_PROJECT` - `inst-check-project-root-scaffold`
3. [x] - `p1` - Read layout templates from the bundled CLI templates directory - `inst-read-layout-templates`
4. [x] - `p1` - **IF** `--force` is false **AND** any target layout file already exists **THEN** skip existing files - `inst-check-force-flag`
5. [x] - `p1` - Write layout component files to `src/app/layout/` inside the project root - `inst-write-layout-files`
6. [x] - `p1` - **RETURN** `ScaffoldLayoutResult` with layout path and list of written file paths - `inst-return-scaffold-layout`

### Update Project

- [x] `p1` - **ID**: `cpt-hai3-flow-cli-tooling-update-project`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-cli`

1. [x] - `p1` - Developer invokes `hai3 update` with optional flags (`--alpha`, `--stable`, `--templates-only`, `--skip-ai-sync`) - `inst-invoke-update`
2. [x] - `p1` - **IF** both `--alpha` and `--stable` are specified **RETURN** validation error `CONFLICTING_OPTIONS` - `inst-check-conflicting-update-flags`
3. [x] - `p1` - Algorithm: resolve release channel using `cpt-hai3-algo-cli-tooling-detect-release-channel` - `inst-run-detect-channel`
4. [x] - `p1` - **IF** `--templates-only` is not set **THEN** install `@gears-frontx/cli@<tag>` globally using the detected project package manager; **IF** the manager is `yarn` **THEN** skip global CLI update with a warning because yarn global install is not managed by the command - `inst-update-cli-global`
5. [x] - `p1` - **IF** `--templates-only` is not set **AND** inside a HAI3 project **THEN** locate all `@gears-frontx/*` entries in project `package.json` and install each with the resolved tag - `inst-update-project-packages`
6. [x] - `p1` - **IF** inside a HAI3 project **THEN** sync templates using `cpt-hai3-algo-cli-tooling-sync-templates` - `inst-run-sync-templates`
7. [x] - `p1` - **IF** inside a HAI3 project **AND** `--skip-ai-sync` is not set **THEN** execute `aiSyncCommand` with `detectPackages: true` - `inst-run-ai-sync-after-update`
8. [x] - `p1` - **RETURN** `UpdateCommandResult` with flags for each step completed - `inst-return-update`

### Update Layout

- [x] `p2` - **ID**: `cpt-hai3-flow-cli-tooling-update-layout`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-cli`

1. [x] - `p2` - Developer invokes `hai3 update layout` with optional `--force` flag - `inst-invoke-update-layout`
2. [x] - `p2` - **IF** not inside a HAI3 project root **RETURN** validation error `NOT_IN_PROJECT` - `inst-check-project-root-update-layout`
3. [x] - `p2` - Read current layout files from `src/app/layout/` and compare against bundled templates - `inst-compare-layout-files`
4. [x] - `p2` - **IF** `--force` is false **THEN** prompt developer to confirm each modified file - `inst-prompt-confirm-layout-overwrite`
5. [x] - `p2` - Write updated layout files to `src/app/layout/` - `inst-write-updated-layout`
6. [x] - `p2` - **RETURN** list of files updated - `inst-return-update-layout`

### Sync AI Configurations

- [x] `p1` - **ID**: `cpt-hai3-flow-cli-tooling-ai-sync`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-cli`

1. [x] - `p1` - Developer invokes `hai3 ai sync` with optional `--tool` (default `all`), `--detect-packages`, `--diff` - `inst-invoke-ai-sync`
2. [x] - `p1` - **IF** not inside a HAI3 project root **RETURN** validation error `NOT_IN_PROJECT` - `inst-check-project-root-ai-sync`
3. [x] - `p1` - **IF** `.ai/` directory does not exist **AND** not in `--diff` mode **THEN** create minimal `.ai/GUIDELINES.md` stub - `inst-create-ai-dir`
4. [x] - `p1` - Read user custom rules from `.ai/rules/app.md` if the file exists - `inst-read-user-rules`
5. [x] - `p1` - **IF** `--detect-packages` is set **THEN** scan `node_modules/@gears-frontx/*/commands/*.md` for package command files, skipping `hai3dev-*` prefixed files - `inst-scan-package-commands`
6. [x] - `p1` - **FOR EACH** target tool in resolved tool list: generate tool-specific configuration files using `cpt-hai3-algo-cli-tooling-generate-ai-config` - `inst-generate-per-tool`
7. [x] - `p1` - **IF** `--diff` is set **THEN** print file-level diff summary to logger and **RETURN** without writing files - `inst-diff-mode`
8. [x] - `p1` - Write generated configuration files to the project root - `inst-write-ai-configs`
9. [x] - `p1` - **RETURN** `AiSyncResult` with list of changed files, command count, and tool names - `inst-return-ai-sync`

### Validate Components

- [x] `p1` - **ID**: `cpt-hai3-flow-cli-tooling-validate-components`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-cli`

1. [x] - `p1` - Developer invokes `hai3 validate components [path]` - `inst-invoke-validate`
2. [x] - `p1` - **IF** not inside a HAI3 project root **RETURN** validation error `NOT_IN_PROJECT` - `inst-check-project-root-validate`
3. [x] - `p1` - Determine scan path: use provided path argument if given, otherwise default to `src/screensets/` - `inst-resolve-scan-path`
4. [x] - `p1` - Algorithm: scan all `.ts` and `.tsx` files recursively using `cpt-hai3-algo-cli-tooling-scan-component-violations` - `inst-run-scan`
5. [x] - `p1` - **IF** any `error`-severity violations exist **THEN** print violation report grouped by file and **RETURN** `passed: false` - `inst-report-violations`
6. [x] - `p1` - **IF** no violations **THEN** log success and **RETURN** `passed: true` - `inst-return-clean`
7. [x] - `p1` - **RETURN** `ValidateComponentsResult` with full violation list, scanned file count, and pass/fail flag - `inst-return-validate`

### Apply Code Migrations

- [x] `p2` - **ID**: `cpt-hai3-flow-cli-tooling-migrate`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-cli`

1. [x] - `p2` - Developer invokes `hai3 migrate [targetVersion]` with optional flags (`--dry-run`, `--list`, `--status`, `--path`, `--include`, `--exclude`) - `inst-invoke-migrate`
2. [x] - `p2` - **IF** `--list` is set **THEN** print all registered migrations and **RETURN** - `inst-handle-list`
3. [x] - `p2` - **IF** `--status` is set **THEN** load `.hai3/migrations.json` and print applied and pending migrations, **RETURN** - `inst-handle-status`
4. [x] - `p2` - Algorithm: resolve pending migrations using `cpt-hai3-algo-cli-tooling-resolve-pending-migrations` - `inst-run-resolve-pending`
5. [x] - `p2` - **IF** `--dry-run` is set **THEN** preview each pending migration via `previewMigration()` and print report without writing files - `inst-dry-run-preview`
6. [x] - `p2` - **IF** not dry-run **THEN** apply each pending migration in version order using `cpt-hai3-algo-cli-tooling-apply-migration`; stop on first failure - `inst-apply-migrations`
7. [x] - `p2` - **RETURN** array of `MigrationResult` objects - `inst-return-migrate`

### Run PR E2E Scenario

- [x] `p1` - **ID**: `cpt-hai3-flow-cli-tooling-e2e-pr`

**Actors**: `cpt-hai3-actor-build-system`, `cpt-hai3-actor-cli`

1. [x] - `p1` - CI triggers `.github/workflows/cli-pr.yml` on pull request to `main`; job `cli-pr-e2e` starts on `ubuntu-latest` with Node 24.14.x and a matrix over `package-manager in [npm, pnpm, yarn]` - `inst-e2e-pr-trigger`
2. [x] - `p1` - Build `@gears-frontx/cli` via `npm run build --workspace=@gears-frontx/cli` - `inst-e2e-pr-build-cli`
3. [x] - `p1` - Algorithm: create harness using `cpt-hai3-algo-cli-tooling-e2e-harness-step` with suite name `pr` - `inst-e2e-pr-create-harness`
4. [x] - `p1` - Run `hai3 create smoke-app --no-studio --uikit shadcn --package-manager <matrix package-manager>` in a temporary workspace - `inst-e2e-pr-create-app`
5. [x] - `p1` - Assert scaffolded files exist: `frontx.config.json`, `package.json`, `.ai/GUIDELINES.md`, `src/app/layout/Layout.tsx`, `scripts/generate-mfe-manifests.ts` - `inst-e2e-pr-assert-files`
6. [x] - `p1` - Assert generated `package.json` declares `packageManager`, manager-specific `engines`, manager-specific workspace/config files when applicable, and `frontx.config.json.packageManager` equals the selected manager - `inst-e2e-pr-assert-engines`
7. [x] - `p1` - Run `git init` in generated project, then the manager-appropriate install command (`npm install --no-audit --no-fund`, `pnpm install --no-frozen-lockfile`, or `yarn install --no-immutable`) - `inst-e2e-pr-git-init-install`
8. [x] - `p1` - Run manager-appropriate build and type-check commands on the generated project - `inst-e2e-pr-build-typecheck`
9. [x] - `p1` - Run `hai3 validate components` on clean scaffold and assert exit code 0 - `inst-e2e-pr-validate-clean`
10. [x] - `p1` - Inject invalid screen file with inline style and hex color, run `hai3 validate components` and assert exit code 1 - `inst-e2e-pr-validate-bad`
11. [x] - `p1` - Run `hai3 scaffold layout -f` and assert success - `inst-e2e-pr-scaffold-layout`
12. [x] - `p1` - Run `hai3 ai sync --tool all --diff` and assert success - `inst-e2e-pr-ai-sync`
13. [x] - `p1` - Upload step logs and JSON summary as CI artifacts (runs even on failure) - `inst-e2e-pr-upload-artifacts`
14. [x] - `p1` - **RETURN** harness completion status `passed` or `failed` - `inst-e2e-pr-return`

### Run Nightly E2E Scenario

- [x] `p2` - **ID**: `cpt-hai3-flow-cli-tooling-e2e-nightly`

**Actors**: `cpt-hai3-actor-build-system`, `cpt-hai3-actor-cli`

1. [x] - `p2` - CI triggers `.github/workflows/cli-nightly.yml` on schedule (daily 03:00 UTC) or manual dispatch - `inst-e2e-nightly-trigger`
2. [x] - `p2` - Build `@gears-frontx/cli` via `npm run build --workspace=@gears-frontx/cli` - `inst-e2e-nightly-build-cli`
3. [x] - `p2` - Algorithm: create harness using `cpt-hai3-algo-cli-tooling-e2e-harness-step` with suite name `nightly` - `inst-e2e-nightly-create-harness`
4. [x] - `p2` - Run `hai3 create nightly-app --no-studio --uikit shadcn --package-manager npm`, then install, build, and type-check - `inst-e2e-nightly-create-default`
5. [x] - `p2` - Run `hai3 create nightly-pnpm --no-studio --uikit shadcn --package-manager pnpm` and `hai3 create nightly-yarn --no-studio --uikit shadcn --package-manager yarn`; assert manager-specific metadata/files, then install, build, and type-check using manager-appropriate commands
6. [x] - `p2` - Run `hai3 migrate --list` and `hai3 migrate --status` on the default app - `inst-e2e-nightly-migrate-commands`
7. [x] - `p2` - Run `hai3 ai sync --tool all --diff` twice and assert both succeed (idempotency) - `inst-e2e-nightly-ai-sync-idempotent`
8. [x] - `p2` - Run `hai3 create nightly-custom --no-studio --uikit none`, then install, build, and type-check - `inst-e2e-nightly-custom-uikit`
9. [x] - `p2` - **FOR EACH** layer in `[sdk, framework, react]`: run `hai3 create nightly-{layer} --layer {layer}`, assert README install snippet includes the generated package name, then install, build, and type-check - `inst-e2e-nightly-layer-scaffolds`
10. [x] - `p2` - Run `hai3 create "Invalid Name"` and assert exit code 1 - `inst-e2e-nightly-invalid-name`
11. [x] - `p2` - Upload step logs and JSON summary as CI artifacts (runs even on failure) - `inst-e2e-nightly-upload-artifacts`
12. [x] - `p2` - **RETURN** harness completion status `passed` or `failed` - `inst-e2e-nightly-return`

---

## 3. Processes / Business Logic (CDSL)

### Validate Project Name

- [x] `p1` - **ID**: `cpt-hai3-algo-cli-tooling-validate-project-name`

1. [x] - `p1` - **IF** `projectName` is empty or missing **RETURN** error `MISSING_NAME` - `inst-check-empty-name`
2. [x] - `p1` - **IF** `projectName` does not match a valid npm package name pattern (lowercase, hyphens, no leading dots or underscores, no uppercase) **RETURN** error `INVALID_NAME` - `inst-check-npm-name-pattern`
3. [x] - `p1` - **IF** `layer` argument is present **AND** not one of `['sdk', 'framework', 'react', 'app']` **RETURN** error `INVALID_LAYER` - `inst-check-layer-enum`
4. [x] - `p1` - **RETURN** valid - `inst-return-name-valid`

### Generate Project Files

- [x] `p1` - **ID**: `cpt-hai3-algo-cli-tooling-generate-project`

Constructs the complete set of `GeneratedFile` entries for a new HAI3 project from bundled templates and dynamic content.

1. [x] - `p1` - Load `templates/manifest.json` from the CLI package; **IF** manifest is not found **RETURN** error indicating CLI needs rebuild
2. [x] - `p1` - **FOR EACH** file in `manifest.stage1b.rootFiles`: copy from the templates directory to the file list; apply variant selection for `src/app/main.tsx` (uikit variant) and `src/app/App.tsx` (uikit + studio variant)
3. [x] - `p1` - **IF** `uikit === 'none'` **THEN** exclude `tailwind.config.ts`, `postcss.config.ts`, `src/app/themes/`, `src/app/components/` from the file list
4. [x] - `p1` - **FOR EACH** directory in `manifest.stage1b.directories`: read all files recursively and add to the file list; skip `src/app/themes` and `src/app/components` when `uikit === 'none'`
5. [x] - `p1` - **IF** `uikit === 'shadcn'` **THEN** copy layout templates from the shadcn layout template into `src/app/layout/`
6. [x] - `p1` - Copy `.ai/targets/*.md` files with layer-aware filtering: include only files whose `TARGET_LAYERS` mapping includes the resolved layer
7. [x] - `p1` - Select and copy the GUIDELINES variant for the resolved layer: `GUIDELINES.sdk.md` for sdk, `GUIDELINES.framework.md` for framework, `GUIDELINES.md` for react/app — output always as `.ai/GUIDELINES.md`
8. [x] - `p1` - Copy `.ai/company/` and `.ai/project/` placeholder directories
9. [x] - `p1` - Copy IDE config directories `.claude/`, `.cursor/`, `.windsurf/` from templates
10. [x] - `p1` - **FOR EACH** command group in `templates/commands-bundle/`: select the most specific layer variant using `selectCommandVariant(baseName, layer, availableFiles)` and copy the selected file to `.ai/commands/<baseName>`
11. [x] - `p1` - Copy user command stubs from `templates/.ai/commands/user/`
12. [x] - `p1` - Copy `eslint-plugin-local/` and `scripts/` directories; **IF** `uikit === 'none'` exclude `scripts/generate-colors.ts`
13. [x] - `p1` - Copy root config files: `CLAUDE.md`, `README.md`, `eslint.config.js`, `tsconfig.json`, `vite.config.ts`, `.dependency-cruiser.cjs`, `.pre-commit-config.yaml`, `.npmrc`, `.nvmrc`; **IF** `uikit === 'shadcn'` also include `postcss.config.js`
14. [x] - `p1` - Generate `frontx.config.json` dynamically with `{ hai3: true, layer, uikit, packageManager }`; include `linkerMode: "node-modules"` when the selected manager is `yarn`
15. [x] - `p1` - Generate `package.json` dynamically with resolved dependencies: always include core `@gears-frontx/*` packages at `alpha` tag; include `@gears-frontx/studio` in devDependencies only if `studio === true`; set manager-specific `packageManager`, centralized manager-specific `engines`, and `workspaces: ["eslint-plugin-local"]`
16. [x] - `p1` - Generate manager-specific workspace/config files (`pnpm-workspace.yaml` for pnpm, `.yarnrc.yml` for yarn)
17. [x] - `p1` - Rewrite npm-centric command snippets in generated text files to manager-specific commands using `cpt-hai3-algo-cli-tooling-package-manager-policy`
18. [x] - `p1` - **RETURN** complete `GeneratedFile[]` array

### Resolve Package Manager Policy

- [x] `p1` - **ID**: `cpt-hai3-algo-cli-tooling-package-manager-policy`

Provides package-manager-aware command generation, metadata parsing, engine policy, workspace-file generation, and npm-to-target-manager text transformation.

1. [x] - `p1` - Parse `package.json.packageManager` values into `{ manager, version }`; reject unsupported manager identifiers - `inst-parse-package-manager-field`
2. [x] - `p1` - Resolve package manager context with priority: explicit HAI3 config manager -> `package.json.packageManager` -> default `npm`; preserve legacy `frontx.config.json.packageManagerVersion` only as backwards-compatible fallback - `inst-detect-package-manager`
3. [x] - `p1` - Build `package.json.packageManager` values from a centralized policy that defines exact default versions per supported manager - `inst-build-package-manager-field`
4. [x] - `p1` - Build manager-specific `engines` entries from the same centralized policy while keeping the Node engine range separate - `inst-build-package-manager-engines`
5. [x] - `p1` - Build manager-specific shell commands for install, script execution, workspace script execution, package add/update, and global install where supported - `inst-build-package-manager-commands`
6. [x] - `p1` - Generate manager-specific workspace/config files required by the scaffolded project (`pnpm-workspace.yaml`, `.yarnrc.yml`) - `inst-build-package-manager-workspace-files`
7. [x] - `p1` - Transform npm-centric snippets in docs, scripts, and synced template files into target-manager-specific commands; short-circuit for `npm` - `inst-transform-package-manager-text`

### Layer Command Variant Selection

- [x] `p1` - **ID**: `cpt-hai3-algo-cli-tooling-select-command-variant`

Selects the most specific command file variant for a given HAI3 architecture layer. Implements cascade fallback so higher layers inherit lower-layer commands when no specific override exists.

1. [x] - `p1` - Determine fallback priority chain for the given layer: `sdk` → `['.sdk.md', '.md']`; `framework` → `['.framework.md', '.sdk.md', '.md']`; `react` / `app` → `['.react.md', '.framework.md', '.sdk.md', '.md']` - `inst-build-priority-chain`
2. [x] - `p1` - Strip the `.md` extension from the base command name to produce the base stem - `inst-strip-ext`
3. [x] - `p1` - **FOR EACH** suffix in the priority chain: construct candidate filename as `<base-stem><suffix>` and check whether it exists in `availableFiles` - `inst-iterate-suffixes`
4. [x] - `p1` - **IF** a matching candidate is found **RETURN** that filename - `inst-return-matched-variant`
5. [x] - `p1` - **IF** no candidate matches **RETURN** null — command is excluded for this layer - `inst-return-excluded`

### Detect Release Channel

- [x] `p1` - **ID**: `cpt-hai3-algo-cli-tooling-detect-release-channel`

Determines whether the globally installed `@gears-frontx/cli` is on the `alpha` or `stable` channel.

1. [x] - `p1` - **TRY** locate the current `@gears-frontx/cli` `package.json` by walking upward from the executing module path until a package with `name: "@gears-frontx/cli"` is found - `inst-read-cli-package-version`
2. [x] - `p1` - Read the current CLI version string from that `package.json` - `inst-read-cli-version-string`
3. [x] - `p1` - **IF** version string contains `-alpha`, `-beta`, or `-rc` **RETURN** `'alpha'` - `inst-check-prerelease-tag`
4. [x] - `p1` - **RETURN** `'stable'` - `inst-return-stable`
5. [x] - `p1` - **CATCH** any error from version lookup **RETURN** `'stable'` as safe default - `inst-catch-detect-error`

### Sync Templates

- [x] `p2` - **ID**: `cpt-hai3-algo-cli-tooling-sync-templates`

Updates project template-derived files (AI target docs, IDE configs, command adapters) from the currently installed CLI templates without overwriting user-owned source files.

1. [x] - `p2` - Determine project layer from `frontx.config.json`; default to `'app'` if not present - `inst-read-project-layer`
2. [x] - `p2` - **FOR EACH** `.ai/targets/*.md` file in the bundled templates: apply layer-aware filtering and overwrite the project file if applicable - `inst-sync-ai-targets`
3. [x] - `p2` - **FOR EACH** IDE config directory (`.claude/`, `.cursor/`, `.windsurf/`): overwrite IDE config files from templates - `inst-sync-ide-configs`
4. [x] - `p2` - Skip generation-only `src/app/App.no-*` and `src/app/main.no-uikit.tsx` template variants when syncing into existing projects, and remove stale copies if they exist - `inst-skip-variant-app-files`
5. [x] - `p2` - After syncing, detect the project package manager and rewrite npm-centric text snippets in synced files to the active manager using `cpt-hai3-algo-cli-tooling-package-manager-policy` - `inst-transform-synced-files`
6. [x] - `p2` - **RETURN** list of directories that were updated - `inst-return-synced-dirs`

### Generate AI Configuration for Tool

- [x] `p1` - **ID**: `cpt-hai3-algo-cli-tooling-generate-ai-config`

Generates the IDE/AI-tool-specific configuration file and command adapter files for a single target tool.

1. [x] - `p1` - For `claude`: write `CLAUDE.md` with a reference to `.ai/GUIDELINES.md`; append user rules section if `.ai/rules/app.md` exists; generate command adapter files in `.claude/commands/` using `cpt-hai3-algo-cli-tooling-generate-command-adapters` - `inst-generate-claude`
2. [x] - `p1` - For `copilot`: write `.github/copilot-instructions.md` with architecture quick-reference and available commands section; append user rules if present; generate command adapters in `.github/copilot-commands/` - `inst-generate-copilot`
3. [x] - `p1` - For `cursor`: write `.cursor/rules/hai3.mdc` with frontmatter `alwaysApply: true`; append user rules if present; generate command adapters in `.cursor/commands/` - `inst-generate-cursor`
4. [x] - `p1` - For `windsurf`: write `.windsurf/rules/hai3.md` with frontmatter `trigger: always_on`; append user rules if present; generate workflow adapters in `.windsurf/workflows/` - `inst-generate-windsurf`
5. [x] - `p1` - **RETURN** `{ file: string, changed: boolean }` for the primary configuration file - `inst-return-ai-config`

### Generate Command Adapters

- [x] `p1` - **ID**: `cpt-hai3-algo-cli-tooling-generate-command-adapters`

Writes adapter stub files for each discovered command into the target IDE commands directory. Implements a four-tier precedence hierarchy so project-level overrides take priority over framework defaults.

1. [x] - `p1` - Scan command files from four sources: `hai3` level (`.ai/commands/`), `company` level (`.ai/company/commands/`), `project` level (`.ai/project/commands/`), and package level (from installed `@gears-frontx/*` packages); skip filenames with `hai3dev-` prefix - `inst-scan-four-tiers`
2. [x] - `p1` - Collect the union of all unique command base names across all tiers - `inst-collect-command-names`
3. [x] - `p1` - **FOR EACH** command base name: resolve the source file by checking tiers in order `project → company → hai3 → package`; use the first match found - `inst-resolve-precedence`
4. [x] - `p1` - Extract the command description from the resolved source file by matching the pattern `# hai3:<name> - <description>`; fall back to a name-derived description if the pattern is absent - `inst-extract-description`
5. [x] - `p1` - Write an adapter file to the target directory with the description as frontmatter and a single line referencing the canonical `.ai/` path - `inst-write-adapter`
6. [x] - `p1` - **RETURN** the count of adapter files written - `inst-return-adapter-count`

### Scan Component Violations

- [x] `p1` - **ID**: `cpt-hai3-algo-cli-tooling-scan-component-violations`

Inspects TypeScript and TSX source files for four categories of architectural violations.

1. [x] - `p1` - **FOR EACH** `.ts` or `.tsx` file in the scan directory (excluding `node_modules/` and `dist/`): read file contents and determine file type (`Screen`, `UI component`, or general) - `inst-iterate-source-files`
2. [x] - `p1` - **IF** file is a Screen file (ends with `Screen.tsx`): scan for `const <Name>: FC` declarations that are not the file's default export; **FOR EACH** match emit a violation of rule `inline-component` at the matched line - `inst-detect-inline-components`
3. [x] - `p1` - **IF** file is a Screen file: scan for inline data arrays (variable declarations initialized to array literals containing 3 or more nested object literals); skip variables named `columns`, `options`, `items`, `routes`, `menu`, `tabs`, `steps`, `fields`; **FOR EACH** match emit a violation of rule `inline-data` - `inst-detect-inline-data`
4. [x] - `p1` - **IF** file is a UI component file (path contains `/components/ui/`): scan for non-type imports from `@gears-frontx/react` or `@gears-frontx/framework`; **IF** found emit a violation of rule `ui-component-impurity` - `inst-detect-ui-component-impurity`
5. [x] - `p1` - **IF** file is NOT inside `components/ui/`: scan for `style={{` occurrences and emit a violation of rule `inline-style` for each; scan for hex color literals and emit a violation of rule `inline-style` for each - `inst-detect-inline-styles`
6. [x] - `p1` - **RETURN** all collected `ComponentViolation` objects with file path, line number, rule name, message, severity, and suggestion - `inst-return-violations`

### Resolve Pending Migrations

- [x] `p2` - **ID**: `cpt-hai3-algo-cli-tooling-resolve-pending-migrations`

Determines which registered migrations have not yet been applied to the project.

1. [x] - `p2` - Load `.hai3/migrations.json` from the target path; **IF** file does not exist treat applied list as empty - `inst-load-tracker`
2. [x] - `p2` - Collect all migration IDs in the loaded tracker's `applied` list - `inst-collect-applied-ids`
3. [x] - `p2` - **FOR EACH** migration in the global `getMigrations()` registry: **IF** its ID is not in applied IDs, add it to the pending list - `inst-filter-pending`
4. [x] - `p2` - **IF** `targetVersion` is specified, exclude pending migrations whose `version` is greater than `targetVersion` - `inst-filter-by-target-version`
5. [x] - `p2` - Sort remaining pending migrations by `version` ascending using lexicographic comparison - `inst-sort-by-version`
6. [x] - `p2` - **RETURN** sorted list of pending `Migration` objects - `inst-return-pending`

### Apply Migration

- [x] `p2` - **ID**: `cpt-hai3-algo-cli-tooling-apply-migration`

Applies a single versioned migration to the target project using ts-morph AST transformations.

1. [x] - `p2` - **IF** migration ID is already in the tracker's applied list **RETURN** a failed result with warning `already applied` - `inst-check-already-applied`
2. [x] - `p2` - Initialise a ts-morph `Project` with `allowJs: true` and `noEmit: true`; add source files matching the include glob patterns relative to target path; exclude files matching the exclude patterns - `inst-init-ts-morph`
3. [x] - `p2` - **FOR EACH** source file: **FOR EACH** transform in migration.transforms: **IF** `transform.canApply(sourceFile)` is true **THEN** call `transform.apply(sourceFile)` and accumulate changes, warnings, and errors - `inst-apply-transforms`
4. [x] - `p2` - Call `project.save()` to flush all modified source files to disk - `inst-save-project`
5. [x] - `p2` - Update `.hai3/migrations.json` tracker by appending a new `AppliedMigration` record with migration ID, timestamp, files modified count, and per-transform statistics - `inst-update-tracker`
6. [x] - `p2` - **RETURN** `MigrationResult` with success flag, counts, per-file details, warnings, and errors - `inst-return-migration-result`

### Build CLI Templates at Build Time

- [x] `p1` - **ID**: `cpt-hai3-algo-cli-tooling-build-templates`

The `copy-templates.ts` script assembles the complete templates directory inside `packages/cli/templates/` during the CLI package build (`npm run build` in `packages/cli`).

1. [x] - `p1` - Copy source project template files (root configs, src structure, scripts, layout templates, eslint-plugin-local) into `templates/` - `inst-copy-project-sources`
2. [x] - `p1` - Generate `templates/manifest.json` listing all root files and directories that the project generator should copy - `inst-generate-manifest`
3. [x] - `p1` - Copy AI target documentation files from `.ai/targets/` into `templates/.ai/targets/` - `inst-copy-ai-targets-build`
4. [x] - `p1` - Copy GUIDELINES variants (`.sdk.md`, `.framework.md`, `.md`) into `templates/.ai/` - `inst-copy-guidelines-variants`
5. [x] - `p1` - Bundle command files from `.ai/commands/` into `templates/commands-bundle/` with layer suffixes preserved (`.sdk.md`, `.framework.md`, `.react.md`, `.md`) - `inst-bundle-commands`
6. [x] - `p1` - Copy IDE adapter directories (`.claude/`, `.cursor/`, `.windsurf/`) into templates - `inst-copy-ide-adapters`
7. [x] - `p1` - Generate IDE rules files for supported tools (`CLAUDE.md`, `.cursor/rules/hai3.mdc`, `.windsurf/rules/hai3.md`, `.github/copilot-instructions.md`)
8. [x] - `p1` - Log generated adapter and bundled-command counts for traceability during template assembly

### Execute E2E Harness Step

- [x] `p1` - **ID**: `cpt-hai3-algo-cli-tooling-e2e-harness-step`

Shared e2e harness (`packages/cli/scripts/e2e-lib.mjs`) that provides isolated step execution with logging, assertions, and structured summaries for both PR and nightly scenarios.

**Input**: Suite name (string), optional artifact directory override via `CLI_E2E_ARTIFACT_DIR`

**Output**: Harness object with step runner, assertion helpers, and completion handler

1. [x] - `p1` - Create a temporary directory under `os.tmpdir()` as the workspace root - `inst-e2e-harness-create-tmpdir`
2. [x] - `p1` - Resolve artifact output directory: use `CLI_E2E_ARTIFACT_DIR` if set, otherwise default to `.artifacts/cli-e2e/{suiteName}` - `inst-e2e-harness-resolve-artifact-dir`
3. [x] - `p1` - **FOR EACH** step invoked via `runStep({ name, cwd, command, args, expectExit })`: spawn the command synchronously, capture stdout/stderr, measure duration, write a per-step `.log` file to the artifact directory, and append an entry to the in-memory summary - `inst-e2e-harness-run-step`
4. [x] - `p1` - **IF** the step exit code does not match `expectExit` **THEN** write `summary.json` with status `failed` and throw an error referencing the log path - `inst-e2e-harness-check-exit`
5. [x] - `p1` - Provide assertion helpers: `assert(condition, message)`, `assertPathExists(path)`, `readJson(path)`, `writeFile(path, content)` - `inst-e2e-harness-assertions`
6. [x] - `p1` - On `complete(status)`: write `summary.json` to the artifact directory with suite name, status, timestamp, tmp root, and per-step details (name, command, exit code, duration, log path) - `inst-e2e-harness-write-summary`

---

## 4. States (CDSL)

### Command Execution Lifecycle

- [x] `p1` - **ID**: `cpt-hai3-state-cli-tooling-command-lifecycle`

Represents the runtime state of any CLI command from invocation through completion, governing the behavior of `executeCommand()`.

1. [x] - `p1` - **FROM** IDLE **TO** CONTEXT_BUILT **WHEN** `buildContext(mode)` resolves with `cwd`, `projectRoot`, `config`, `logger`, and `prompt` - `inst-to-context-built`
2. [x] - `p1` - **FROM** CONTEXT_BUILT **TO** VALIDATED **WHEN** `command.validate(args, ctx)` returns `{ ok: true }` - `inst-to-validated`
3. [x] - `p1` - **FROM** CONTEXT_BUILT **TO** FAILED **WHEN** `command.validate(args, ctx)` returns `{ ok: false, errors }` — log each error and return `{ success: false, errors }` - `inst-to-validated-failed`
4. [x] - `p1` - **FROM** VALIDATED **TO** EXECUTING **WHEN** `command.execute(args, ctx)` is called - `inst-to-executing`
5. [x] - `p1` - **FROM** EXECUTING **TO** SUCCEEDED **WHEN** `command.execute()` resolves — return `{ success: true, data: result }` - `inst-to-succeeded`
6. [x] - `p1` - **FROM** EXECUTING **TO** FAILED **WHEN** `command.execute()` throws — log the error message and return `{ success: false, errors: [{ code: 'EXECUTION_ERROR', message }] }` - `inst-to-failed`

### Migration Tracker State

- [x] `p2` - **ID**: `cpt-hai3-state-cli-tooling-migration-tracker`

Tracks which migrations have been applied to a project, persisted in `.hai3/migrations.json`.

1. [x] - `p2` - **FROM** ABSENT **TO** EMPTY **WHEN** `.hai3/migrations.json` is read but does not exist — in-memory tracker initialised with `{ version: '1.0.0', applied: [] }` - `inst-tracker-init`
2. [x] - `p2` - **FROM** EMPTY **TO** HAS_APPLIED **WHEN** a migration result is saved with at least one modified file — tracker `applied` list gains one entry - `inst-tracker-first-entry`
3. [x] - `p2` - **FROM** HAS_APPLIED **TO** HAS_APPLIED **WHEN** another migration is applied — new entry appended to `applied` list - `inst-tracker-append-entry`
4. [x] - `p2` - **FROM** any state **TO** same state with NO_OP **WHEN** a migration already present in `applied` is re-submitted — runner logs a warning and returns a failed result without modifying the tracker - `inst-tracker-idempotent`

---

## 5. Definitions of Done

### CLI Package and Binary

- [x] `p1` - **ID**: `cpt-hai3-dod-cli-tooling-package`

`@gears-frontx/cli` is published as a workspace package with a `hai3` binary entry point. The package supports ESM environments (Node.js 18+) and exposes a dual programmatic API via `api.ts` for use by AI agents without interactive prompts.

**Implementation details**:
- Package: `packages/cli/package.json` — `name: @gears-frontx/cli`, `type: module`, `bin: { hai3: ./dist/index.js }`, `engines: { node: ">=18" }`
- Entry: `src/index.ts` — Commander.js program with all commands registered
- Programmatic API: `src/api.ts` — exports `executeCommand`, `buildCommandContext`, `registry`, core types, `createCommand`, `updateCommand`, generator functions, and utility functions
- Build: `tsup.config.ts` — ESM primary output; dual CJS/ESM exports for `api.ts`

**Implements**:
- `cpt-hai3-flow-cli-tooling-create-project`
- `cpt-hai3-flow-cli-tooling-update-project`
- `cpt-hai3-flow-cli-tooling-ai-sync`
- `cpt-hai3-flow-cli-tooling-validate-components`
- `cpt-hai3-flow-cli-tooling-scaffold-layout`
- `cpt-hai3-flow-cli-tooling-migrate`

**Covers (PRD)**:
- `cpt-hai3-fr-cli-package`
- `cpt-hai3-fr-cli-commands`

**Covers (DESIGN)**:
- `cpt-hai3-component-cli`
- `cpt-hai3-constraint-esm-first-module-format`

### Command Registry and Executor

- [x] `p1` - **ID**: `cpt-hai3-dod-cli-tooling-command-infra`

`CommandRegistry` manages command registration and lookup by name. `executeCommand()` builds context, runs validation, executes the command, and returns a type-safe `CommandResult<T>`. Dual-mode execution is controlled through `ExecutionMode`: interactive mode uses `@inquirer/prompts`; programmatic mode uses pre-filled answers supplied as `Record<string, unknown>`.

**Implementation details**:
- Registry: `src/core/registry.ts` — `CommandRegistry` class with `Map<string, CommandDefinition>`; singleton `registry` export
- Executor: `src/core/executor.ts` — `executeCommand<TArgs, TResult>()`, `buildCommandContext()`
- Contract: `src/core/command.ts` — `CommandDefinition<TArgs, TResult>` interface with `validate()` and `execute()` methods; `CommandContext` with `cwd`, `projectRoot`, `config`, `logger`, `prompt`
- Types: `src/core/types.ts` — `CommandResult`, `ExecutionMode`, `ValidationResult`, `GeneratedFile`, `Hai3Config`, `LayerType`

**Implements**:
- `cpt-hai3-state-cli-tooling-command-lifecycle`

**Covers (PRD)**:
- `cpt-hai3-fr-cli-package`

**Covers (DESIGN)**:
- `cpt-hai3-component-cli`

### Template-Based Project Generation

- [x] `p1` - **ID**: `cpt-hai3-dod-cli-tooling-templates`

The `copy-templates.ts` build script assembles the full template set into `packages/cli/templates/` at build time. The project generator reads from this bundled directory at runtime — no network access required. Templates cover project scaffolding, AI target docs, IDE configs, command adapters, and generated IDE rule files for all four supported AI tools.

**Implementation details**:
- Build script: `packages/cli/scripts/copy-templates.ts` — copies sources, generates `manifest.json`, bundles commands with layer suffixes, and generates IDE rules
- Generator: `src/generators/project.ts` — `generateProject(input: ProjectGeneratorInput): Promise<GeneratedFile[]>`; reads manifest, applies uikit/studio/layer conditionals, returns file list
- Layer package generator: `src/generators/layerPackage.ts` — `generateLayerPackage({ packageName, layer })`
- Package manager policy: `src/core/packageManager.ts` — centralized exact/default PM versions, minimum engine ranges, command builders, workspace-file helpers, and npm-snippet transformation
- Templates dir: `src/core/templates.ts` — `getTemplatesDir()` resolves to `packages/cli/templates/` from the installed package location
- IDE rule outputs: `CLAUDE.md`, `.cursor/rules/hai3.mdc`, `.windsurf/rules/hai3.md`, and `.github/copilot-instructions.md`

**Implements**:
- `cpt-hai3-algo-cli-tooling-generate-project`
- `cpt-hai3-algo-cli-tooling-package-manager-policy`
- `cpt-hai3-algo-cli-tooling-build-templates`

**Covers (PRD)**:
- `cpt-hai3-fr-cli-templates`
- `cpt-hai3-fr-cli-skills`

**Covers (DESIGN)**:
- `cpt-hai3-component-cli`
- `cpt-hai3-adr-cli-template-based-code-generation`

### Layer-Aware Command Variant Selection

- [x] `p1` - **ID**: `cpt-hai3-dod-cli-tooling-layer-variants`

`selectCommandVariant()` and `isTargetApplicableToLayer()` in `src/core/layers.ts` implement the cascade fallback so that sdk-layer projects receive only sdk-applicable commands and target files, while app-layer projects inherit the full hierarchy.

**Implementation details**:
- Module: `src/core/layers.ts` — `TARGET_LAYERS` map, `isTargetApplicableToLayer(filename, layer)`, `selectCommandVariant(baseName, layer, availableFiles)`
- Fallback chains are hard-coded as a `Record<LayerType, string[]>` priority array; `null` return means the command is excluded for the layer
- Test: `src/core/layers.test.ts`

**Implements**:
- `cpt-hai3-algo-cli-tooling-select-command-variant`

**Covers (PRD)**:
- `cpt-hai3-fr-cli-templates`

**Covers (DESIGN)**:
- `cpt-hai3-component-cli`

### AI Configuration Sync

- [x] `p1` - **ID**: `cpt-hai3-dod-cli-tooling-ai-sync`

`aiSyncCommand` generates IDE-specific rule files and command adapter stubs for Claude Code, GitHub Copilot, Cursor, and Windsurf. Supports four-tier command precedence (project > company > hai3 > packages). Preserves user custom rules from `.ai/rules/app.md` across syncs. Supports `--diff` preview mode. Emits package-manager-aware architecture-check command hints in generated tool instructions.

**Implementation details**:
- Command: `src/commands/ai/sync.ts` — `aiSyncCommand: CommandDefinition<AiSyncArgs, AiSyncResult>`
- Tool outputs: `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/hai3.mdc`, `.windsurf/rules/hai3.md`
- Command adapters written to: `.claude/commands/`, `.github/copilot-commands/`, `.cursor/commands/`, `.windsurf/workflows/`
- Package scanning: reads `node_modules/@gears-frontx/*/commands/*.md` when `--detect-packages` is set

**Implements**:
- `cpt-hai3-flow-cli-tooling-ai-sync`
- `cpt-hai3-algo-cli-tooling-generate-ai-config`
- `cpt-hai3-algo-cli-tooling-generate-command-adapters`

**Covers (PRD)**:
- `cpt-hai3-fr-cli-commands`
- `cpt-hai3-fr-cli-skills`

**Covers (DESIGN)**:
- `cpt-hai3-component-cli`

### Component Structure Validation

- [x] `p1` - **ID**: `cpt-hai3-dod-cli-tooling-validate`

`validateComponentsCommand` scans `.ts` / `.tsx` files and enforces four architectural rules: no inline FC components in Screen files, no inline data arrays in Screen files, no `@gears-frontx/react` / `@gears-frontx/framework` imports in `components/ui/` files, no `style={{}}` or hex color literals outside `components/ui/` folders. Violations carry file path, line number, rule name, message, severity, and a suggestion.

**Implementation details**:
- Command: `src/commands/validate/components.ts` — `validateComponentsCommand: CommandDefinition<ValidateComponentsArgs, ValidateComponentsResult>`
- Rules: `inline-component`, `inline-data`, `ui-component-impurity`, `inline-style`
- Default scan path: `src/screensets/` (resolved via `getScreensetsDir()`)
- Exit code: process exits with code 1 when any error-severity violation is found

**Implements**:
- `cpt-hai3-flow-cli-tooling-validate-components`
- `cpt-hai3-algo-cli-tooling-scan-component-violations`

**Covers (PRD)**:
- `cpt-hai3-fr-cli-commands`

**Covers (DESIGN)**:
- `cpt-hai3-component-cli`

### Codemod Migration System

- [x] `p2` - **ID**: `cpt-hai3-dod-cli-tooling-migrations`

`migrateCommand` applies versioned codemods using ts-morph AST transforms. Migrations are idempotent — a migration already recorded in `.hai3/migrations.json` is skipped. Supports dry-run mode, status listing, version-targeted runs, and configurable glob patterns.

**Implementation details**:
- Command: `src/commands/migrate/index.ts` — `migrateCommand: CommandDefinition<MigrateCommandArgs, MigrationResult[]>`
- Runner: `src/migrations/runner.ts` — `runMigrations()`, `applyMigration()`, `previewMigration()`, `getMigrationStatus()`
- Registry: `src/migrations/registry.ts` — `getMigrations()` returns all registered `Migration` objects
- Tracker: `.hai3/migrations.json` — `MigrationTracker` schema with `version: '1.0.0'` and `applied: AppliedMigration[]`
- Bundled migrations: `src/migrations/0.2.0/` — three transforms: uicore-to-react import rewrites, uikit-contracts-to-uikit rewrites, module augmentation updates
- Types: `src/migrations/types.ts` — `Migration`, `Transform`, `MigrationResult`, `MigrationTracker`, `AppliedMigration`

**Implements**:
- `cpt-hai3-flow-cli-tooling-migrate`
- `cpt-hai3-algo-cli-tooling-resolve-pending-migrations`
- `cpt-hai3-algo-cli-tooling-apply-migration`
- `cpt-hai3-state-cli-tooling-migration-tracker`

**Covers (PRD)**:
- `cpt-hai3-fr-cli-commands`

**Covers (DESIGN)**:
- `cpt-hai3-component-cli`

### CLI PR E2E Workflow

- [x] `p1` - **ID**: `cpt-hai3-dod-cli-tooling-e2e-pr`

A required GitHub Actions workflow (`cli-pr-e2e`) verifies the critical CLI scaffold path on every pull request to `main`. The workflow runs on `ubuntu-latest` with Node 24.14.x, builds the CLI, then exercises the scaffold through create, install, build, type-check, validate (positive + negative), scaffold layout, and ai sync across a matrix of `npm`, `pnpm`, and `yarn`. Step-level logs and a JSON summary are uploaded as CI artifacts unconditionally.

**Implementation details**:
- Workflow: `.github/workflows/cli-pr.yml` — job `cli-pr-e2e`, trigger `pull_request` on `main`
- Script: `packages/cli/scripts/e2e-pr-smoke.mjs` — imports harness from `e2e-lib.mjs`
- Package script: `npm run test:e2e:pr` in `packages/cli/package.json`
- Artifact upload: `actions/upload-artifact@v4` with `if: always()`, retention 14 days

**Implements**:
- `cpt-hai3-flow-cli-tooling-e2e-pr`
- `cpt-hai3-algo-cli-tooling-e2e-harness-step`

**Covers (PRD)**:
- `cpt-hai3-fr-cli-e2e-verification`

**Covers (DESIGN)**:
- `cpt-hai3-component-cli`
- `cpt-hai3-adr-two-tier-cli-e2e-verification`

### CLI Nightly E2E Workflow

- [x] `p2` - **ID**: `cpt-hai3-dod-cli-tooling-e2e-nightly`

A non-required nightly/manual GitHub Actions workflow covers broader CLI scenarios beyond the PR gate: alternate package managers (`pnpm`, `yarn`), custom UIKit (`--uikit none`), layer scaffolds (`sdk`, `framework`, `react`), migrate commands (`--list`, `--status`), invalid-name rejection, and ai sync idempotency. Runs on the same harness infrastructure as the PR workflow.

**Implementation details**:
- Workflow: `.github/workflows/cli-nightly.yml` — job `cli-nightly-e2e`, triggers `schedule` (03:00 UTC) and `workflow_dispatch`
- Script: `packages/cli/scripts/e2e-nightly.mjs` — imports harness from `e2e-lib.mjs`
- Package script: `npm run test:e2e:nightly` in `packages/cli/package.json`
- Artifact upload: `actions/upload-artifact@v4` with `if: always()`, retention 14 days

**Implements**:
- `cpt-hai3-flow-cli-tooling-e2e-nightly`
- `cpt-hai3-algo-cli-tooling-e2e-harness-step`

**Covers (PRD)**:
- `cpt-hai3-fr-cli-e2e-verification`

**Covers (DESIGN)**:
- `cpt-hai3-component-cli`
- `cpt-hai3-adr-two-tier-cli-e2e-verification`

---

## 6. Acceptance Criteria

- [x] `hai3 create my-app` scaffolds a complete HAI3 application with correct `package.json`, `frontx.config.json`, `CLAUDE.md`, and all four AI tool configuration files
- [x] `hai3 create my-app --package-manager <npm|pnpm|yarn>` records the selected manager in generated metadata, emits manager-specific next-step commands, and generates required workspace/config files for the selected manager
- [x] `hai3 create my-sdk --layer sdk` generates a minimal SDK-layer package with only sdk-applicable target files and command variants
- [x] `hai3 scaffold layout` writes layout components to `src/app/layout/` inside an existing project; skips existing files unless `--force` is passed
- [x] `hai3 ai sync` regenerates `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/hai3.mdc`, `.windsurf/rules/hai3.md`, and command adapters; preserves `.ai/rules/app.md` content across runs
- [x] `hai3 ai sync --diff` prints a change summary without writing files
- [x] `hai3 validate components` exits with code 0 when no violations are found and code 1 when any `error`-severity violation is present
- [x] `hai3 migrate --dry-run` previews changes without modifying source files and without updating `.hai3/migrations.json`
- [x] `hai3 migrate` is idempotent: running it twice does not re-apply an already applied migration
- [x] `hai3 update --alpha` and `hai3 update --stable` cannot be combined; the command exits with `CONFLICTING_OPTIONS` when both flags are present
- [x] `hai3 update` auto-detects the current release channel from the currently running CLI package version, not from an npm-specific global listing
- [x] Template-derived docs and scripts emitted by `hai3 create` or `hai3 update --templates-only` contain concrete manager-specific commands for npm, pnpm, and yarn
- [x] CLI build generates IDE rules files (`CLAUDE.md`, `.cursor/rules/hai3.mdc`, `.windsurf/rules/hai3.md`, `.github/copilot-instructions.md`) and command adapters in `packages/cli/templates/`
- [x] `executeCommand(createCommand, args, { interactive: false, answers })` returns `{ success: true, data }` without prompts — programmatic API is fully functional
- [x] `selectCommandVariant` returns `null` for any command that has no applicable variant for the given layer, ensuring layer packages do not receive irrelevant commands
- [x] `.github/workflows/cli-pr.yml` defines required job `cli-pr-e2e` on `ubuntu-latest` with Node 24.14.x; runs a matrix across `npm`, `pnpm`, and `yarn`; exercises create, git init, manager-specific install, build, type-check, validate positive + negative, scaffold layout, and ai sync
- [x] `.github/workflows/cli-nightly.yml` runs on schedule and manual dispatch; covers npm/pnpm/yarn scaffolds, `--uikit none`, layer scaffolds (`sdk`, `framework`, `react`), migrate commands, invalid-name rejection, and ai sync idempotency
- [x] Both e2e workflows upload step-level logs and JSON summary as CI artifacts even when the scenario fails
- [x] `npm run test:e2e:pr` and `npm run test:e2e:nightly` in `packages/cli` enable local execution of the same scenarios run in CI
