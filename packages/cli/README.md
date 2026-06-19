# @gears-frontx/cli

Command-line interface for scaffolding and managing HAI3 framework projects.

## Overview

`@gears-frontx/cli` provides a comprehensive set of commands for creating new HAI3 applications, generating screensets, managing project structure, and maintaining framework dependencies. The CLI streamlines project setup and ongoing development by automating common tasks and enforcing framework conventions.

## Purpose

This package eliminates manual project configuration and boilerplate creation. It generates properly structured HAI3 projects with all necessary dependencies, build configurations, and development tools pre-configured. The CLI ensures projects follow framework best practices from the start and provides utilities for maintaining that structure as projects evolve.

## Core Commands

### Project Creation

Initialize new HAI3 applications with complete project structure, dependency management, and build tooling. The creation process offers interactive prompts for customizing the initial setup, including UI kit choice (shadcn/ui, none, or a third-party package) and Studio overlay inclusion.

### Screenset Generation

Create new MFE screenset packages from the framework template. Each screenset is a self-contained MFE with its own dev server port, configuration, and structure under `src/mfe_packages/`.

### Dependency Updates

Update the CLI itself and all HAI3 framework packages to their latest versions. The command detects whether it's running inside a project or standalone and adjusts its behavior accordingly.

## Installation

### Global Installation (Recommended)

```bash
npm install -g @gears-frontx/cli
```

Global installation makes the `hai3` command available system-wide for creating new projects anywhere on your system.

### Project-Level Installation

```bash
npm install --save-dev @gears-frontx/cli
```

Install as a dev dependency when using CLI commands within project scripts or when global installation isn't preferred.

## Command Reference

**Global option:** `-q, --quiet` — Suppress non-essential output (any command).

### `hai3 create <project-name>`

Creates a new HAI3 project or SDK layer package with the specified name.

**Options:**
- `-l, --layer <type>` - Create a package for a specific SDK layer (`sdk`, `framework`, `react`, or `app`)
- `--uikit <type>` - UI components: `shadcn` for shadcn/ui, `none` for no UI library, or an npm package name (e.g. `@mui/material`, `antd`)
- `--studio` / `--no-studio` - Include or exclude Studio package
- `--local` - Use local @gears-frontx packages from monorepo (file:) instead of npm; requires CLI run from linked monorepo or `GEARS_FRONTX_MONOREPO_ROOT`
- `--package-manager` - Package manager to use (`npm`, `pnpm`, `yarn`)

**Interactive (when `--layer` not specified):**
- UI kit selection (shadcn, none, or custom package name)
- Studio overlay inclusion
- Package manager selection (`npm` default, `pnpm`, `yarn`)

**Output (App project — default):**
- Vite + React + TypeScript project with `frontx.config.json` (uikit, etc.)
- HAI3 framework packages installed and configured
- Build and dev scripts; layout/components scaffolded per UI kit choice

**Output (Layer package):**
- Layer-appropriate package structure and peer dependencies
- TypeScript and ESLint configs enforcing layer boundaries
- AI assistant config (CLAUDE.md, Copilot, Cursor, Windsurf)

### `hai3 screenset create <name>`

Creates a new MFE screenset package under `src/mfe_packages/<name>-mfe/` from the framework template.

**Options:**
- `-p, --port <number>` - MFE dev server port (auto-assigned if omitted)

**Requirements:**
- Run from project root; name must be camelCase (e.g. `contacts`, `myDashboard`).

**Generated structure:** MFE package with config, screens, i18n, events, and build setup.

### `hai3 update` / `hai3 update packages`

Updates CLI and framework packages to latest versions (default subcommand is `packages`).

**Options:**
- `-a, --alpha` - Update to latest alpha/prerelease version
- `-s, --stable` - Update to latest stable version
- `--templates-only` - Only sync templates (skip CLI and package updates)
- `--skip-ai-sync` - Skip running AI sync after update

**Channel:** Auto-detects from the installed CLI version (alpha vs stable).

**Behavior:** Inside a project: updates CLI globally, framework packages, templates, and AI configs. Outside a project: updates only CLI globally.

### `hai3 update layout`

Updates layout components from the latest templates. Run from project root.

**Options:**
- `-f, --force` - Force update without prompting

### `hai3 scaffold layout`

Generates layout components in your project from templates. Run from project root.

**Options:**
- `-f, --force` - Overwrite existing layout files

**Generated:** Layout orchestrator, Header, Footer, Menu, Sidebar, Screen, Popup, Overlay, and barrel exports under `src/layout/`.

### `hai3 validate components [path]`

Validates component structure and placement (e.g. layer boundaries, conventions). Path defaults to current directory.

### `hai3 migrate [targetVersion]`

Applies codemod migrations to update HAI3 projects to a target version.

**Options:**
- `-d, --dry-run` - Preview changes without applying
- `-l, --list` - List available migrations
- `-s, --status` - Show migration status
- `-p, --path <path>` - Target directory to migrate
- `--include <patterns>` - Include glob patterns (comma-separated)
- `--exclude <patterns>` - Exclude glob patterns (comma-separated)

### `hai3 ai sync`

Syncs AI assistant configuration files from `.ai/GUIDELINES.md` and `.ai/commands/` into IDE-specific configs.

**Options:**
- `-t, --tool <tool>` - Tool to sync: `claude`, `copilot`, `cursor`, `windsurf`, or `all` (default: `all`)
- `-d, --detect-packages` - Detect installed @gears-frontx packages and merge their configs
- `--diff` - Show diff of changes without writing files

**Generated:** `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/hai3.mdc`, `.windsurf/rules/hai3.md`, and command adapters.

## Project Generation Details

### Directory Structure

Created projects follow HAI3's standard monorepo-style structure with clear separation between framework packages, application code, screensets, themes, and configuration.

### Build Configuration

Projects ship with Vite configured for optimal development and production builds, TypeScript with strict mode enabled, and Tailwind CSS with framework theme integration.

### Quality Tools

Includes ESLint with custom framework rules, TypeScript strict mode checking, dependency validation through Dependency Cruiser, and architecture test setup.

### Development Workflow

Generated projects include scripts for development server, production builds, type checking, linting, architecture validation, and cleanup operations.

## UI Kit Options

At project creation, you choose how UI components are provided. The choice is stored in `frontx.config.json` and used by the CLI when scaffolding layout and screensets.

### Shadcn (`shadcn`)

Scaffolds the project with local shadcn/ui components in `components/ui/` (button, input, card, dialog, form, toast, etc.). Recommended for new projects.

```bash
hai3 create my-project --uikit=shadcn
```

### No UI library (`none`)

Placeholder layout and components without a UI library. Use when you want to bring your own components or build from scratch.

```bash
hai3 create my-project --uikit=none
```

### Third-party package

Use an npm package name (e.g. `@mui/material`, `antd`) so the CLI scaffolds a bridge and config; you implement components with that library.

```bash
hai3 create my-project --uikit=@mui/material
```

## SDK Layer Development

HAI3 uses a 3-layer SDK architecture. When building custom packages that extend the framework, use the `--layer` option to generate properly configured package scaffolding.

### Layer Architecture

```
┌─────────────────────────────────────────┐
│         React Layer (react)             │
│  React hooks, components, UI bindings   │
│  Depends on: Framework + React          │
├─────────────────────────────────────────┤
│       Framework Layer (framework)       │
│  Redux store, events, registries        │
│  Depends on: SDK packages               │
├─────────────────────────────────────────┤
│          SDK Layer (sdk)                │
│  Pure TypeScript, no dependencies       │
│  Contracts, utilities, types            │
└─────────────────────────────────────────┘
```

### Creating Layer Packages

```bash
# SDK layer - pure TypeScript, no HAI3 dependencies
hai3 create my-contracts --layer=sdk

# Framework layer - depends on @gears-frontx/events, @gears-frontx/store
hai3 create my-store-extension --layer=framework

# React layer - depends on @gears-frontx/framework + React
hai3 create my-hooks --layer=react
```

### Layer Dependencies

Each layer has specific peer dependency requirements enforced by the generated configuration:

| Layer | Allowed Dependencies |
|-------|---------------------|
| SDK | None (pure TypeScript) |
| Framework | `@gears-frontx/events`, `@gears-frontx/store` |
| React | `@gears-frontx/framework`, `react`, `react-dom` |

### Generated Package Structure

Layer packages include:

```
my-package/
├── src/
│   └── index.ts           # Entry point
├── .ai/
│   ├── GUIDELINES.md      # Layer-specific rules
│   └── rules/
│       └── _meta.json     # Layer metadata for AI tools
├── package.json           # With correct peer deps
├── tsconfig.json          # Layer-appropriate config
├── eslint.config.js       # Boundary enforcement
├── tsup.config.ts         # Build configuration
└── README.md              # Layer documentation
```

### AI-Assisted Development

Generated packages include AI assistant configurations that understand layer boundaries:

- **CLAUDE.md** - Instructions preventing cross-layer violations
- **Copilot/Cursor/Windsurf** - Layer-aware code suggestions
- **_meta.json** - Machine-readable layer context

The AI tools will warn you if you attempt to import from a higher layer (e.g., importing React hooks in an SDK package).

## Implementing Custom UI Components

When using `--uikit=none` or a third-party package, you get placeholder layout components to implement with your UI library. Use HAI3's Redux hooks (`useAppSelector`, `useAppDispatch`) from `@gears-frontx/react` for state, and respect the theme via CSS variables or Tailwind tokens (`bg-background`, `text-foreground`, `border-border`, or `var(--background)` etc.).

## Advanced Usage

### Programmatic API

The CLI exposes a programmatic API for build scripts and automation. Use `executeCommand` with the registered command and options; set `interactive: false` for non-interactive runs.

```typescript
import { executeCommand, commands } from '@gears-frontx/cli';

// Create a new project
const result = await executeCommand(
  commands.create,
  { projectName: 'my-app', uikit: 'shadcn', studio: true },
  { interactive: false }
);

// Update packages
await executeCommand(
  commands.update,
  { alpha: false, skipAiSync: false },
  { interactive: false }
);
```

The package also exports `createCommand` and `updateCommand` by name. Other commands (validate, scaffold, ai sync, screenset create, migrate) are available only via the CLI.

### Template Customization

CLI ships with comprehensive template files that new projects copy. These templates stay synchronized with the main HAI3 repository, ensuring new projects always use current best practices.

## Requirements

- Node.js 18.0.0 or higher
- npm 7+ (for workspace support if extending the monorepo structure)

## Version

**Alpha** (`0.4.0-alpha.0`) — Commands and APIs may change before stable release.

## License

Apache-2.0

## Repository

[https://github.com/HAI3org/HAI3](https://github.com/HAI3org/HAI3)

## Related Packages

- [`@gears-frontx/uicore`](../uicore) — Core framework types and selectors
- [`@gears-frontx/studio`](../studio) — Development tools overlay (optional)
