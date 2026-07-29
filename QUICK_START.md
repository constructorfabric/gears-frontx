# FrontX Quick Start Guide

> **TARGET AUDIENCE:** Humans
> **PURPOSE:** Quick start guide for developers using the FrontX ecosystem

FrontX is an **ecosystem for AI-driven creation of frontend projects**. It does
not prescribe what your app looks like — that comes from **templates**. Instead
it provides three co-equal pillars that let AI agents and their human
collaborators scaffold, extend, and evolve a project against stable, contracted
capabilities.

## The Three Pillars

- **Pillar 1 — Core Framework.** Makes an application runtime-extensible by
  composable microfrontends over a substrate for typed entities.
  Packages: `@gears-frontx/mfes`, `@gears-frontx/gts-plugin`, `@gears-frontx/api`.
- **Pillar 2 — CLI.** Owns the full lifecycle of assembling and evolving a
  repository from templates. Package: `@gears-frontx/cli` (the `frontx` binary).
- **Pillar 3 — AI Tooling Framework.** Equips AI agents with ecosystem
  capabilities and lets templates contribute their own.
  Package: `@gears-frontx/cyber-pilot-kit-frontx`.

Everything below is how you drive those pillars. What each project *becomes* is
owned by the template you apply, not by the ecosystem.

## Install the CLI

```bash
npm install -g @gears-frontx/cli
```

Requirements: Node.js 24+, npm 10+. Verify with `frontx help`.

## Using the CLI (Pillar 2)

The CLI resolves templates from a source you name, into a local inventory, then
applies them to repositories. It bundles no templates of its own.

### 1. Install a template

Templates are addressed by a source-spec, `host:owner/repo[//subtree]@ref`. The optional
`//subtree` segment addresses a template that occupies a subtree of a repository, so
one repository can publish several templates:

```bash
frontx install github:acme/my-template@v1.0.0        # template at the repository root
frontx install github:acme/templates//shell@v1.0.0   # template in the shell/ subtree
frontx list          # show installed templates and versions
```

A template is tracked under the identity its own `frontx-template.json` declares, not under
the repository name. Installing a template whose identity is already taken by a different
source fails rather than overwriting the installed one.

### 2. Seed a new repository

```bash
# frontx seed <templateRef> <targetDir>
# templateRef is the identity the template's manifest declares, as shown by `frontx list`
frontx seed @acme/my-template ./my-app
```

Seeding resolves the template (plus any templates its preset references), runs a
**pre-flight conflict check** against every template's declared ownership
boundaries, and only then writes files — recording one provenance record per
applied template under `./my-app/.frontx/`.

### 3. Add a template to an existing repository

```bash
frontx add @acme/my-template ./existing-repo
```

A repository can be assembled from **multiple independently-applied templates**.
Conflicting assembly is detected and prevented before any file is written.

### 4. Upgrade an applied template

```bash
# Interactive: review the change set, then approve
frontx upgrade ./my-app 1.1.0

# Non-interactive (CI): accept automatically
frontx upgrade ./my-app 1.1.0 --yes
```

Each applied template upgrades **independently**, delivered as a reviewable
change set. Provenance under `.frontx/` tells the CLI exactly what was
materialized and by which template.

### 5. Author and validate a template

Validate a template's structure — including that its ownership boundaries are
well-formed — against the publication contract before publishing:

```bash
frontx validate ./path/to/template
```

### CLI command reference

| Command | Purpose |
|---------|---------|
| `frontx install <spec>` | Install a template from `host:owner/repo[//subtree]@ref` into the inventory |
| `frontx list` | List installed templates and versions |
| `frontx seed <templateRef> <targetDir>` | Seed a **new** repository from a template |
| `frontx add <templateRef> <targetDir>` | Add a template into an **existing** repository |
| `frontx upgrade <projectRoot> <version> [--yes] [--json]` | Upgrade an applied template |
| `frontx validate <templateDir>` | Validate a template for publication |
| `frontx update-local <identity> <spec>` | Refresh a locally installed template from its source |
| `frontx help` | Show the usage summary |

Exit codes: `0` success, `1` user error, `2` internal error.

## The Core Framework (Pillar 1)

An application built on FrontX becomes **runtime-extensible by microfrontends**.
The Core Framework provides the substrate; a template wires it into a concrete
app. Its guarantees:

- **Registration & loading** — microfrontends register with the application and
  load on demand (`@gears-frontx/mfes`).
- **Extension domains** — named slots a microfrontend can occupy; a domain may
  allow one or multiple occupants.
- **Typed entities** — microfrontends and their extensions are validated against
  type definitions at registration; applications register their own type
  definitions at build time or at runtime (`@gears-frontx/gts-plugin`).
- **Host communication** — microfrontends communicate with the host and react to
  host state changes over a bridge.
- **API layer** — typed API protocols and a service registry (`@gears-frontx/api`).
- **UI-framework-agnostic** — the framework never constrains your UI choice; UI
  libraries, styling, layout, and state management are the template's concern.

You consume these packages from within a template/application; the ecosystem
ships no application, host, or UI of its own.

## AI Tooling (Pillar 3)

The AI Tooling Framework is delivered as a **Cypilot kit**
(`cyber-pilot-kit-frontx`) — the kit *is* the framework's public surface. It is
distributed as a GitHub tarball and installed and updated through the **Cypilot
CLI** (`cpt`), not npm. On install, its `frontx_`-prefixed resources register in
the project's `.cypilot/config/core.toml` and become available to agents at
session start — no training step.

### Install the kit

```bash
# Install the FrontX AI Tooling kit into a project (via Cypilot, not the frontx CLI)
cpt kit install github:gears-frontx/cyber-pilot-kit-frontx

# Update it later to a newer version
cpt kit update <path-to-installed-kit>
```

Every resource the kit installs carries the `frontx_` prefix (KIT-1), so it
cannot collide with other kits (e.g. the SDLC kit) installed in the same
project. As shipped today the kit provides three concrete capabilities.

### Ecosystem fluency

The kit hands agents ecosystem knowledge at session start: a top-level skill
(`SKILL.md`) covering the package surface, architecture principles, and key
concepts; navigation rules (`AGENTS.md`); and boundary guidelines
(`guidelines/`). This is what lets an agent reason correctly about MFEs,
extension domains, source-specs, and the ecosystem/template boundary without
being taught.

### Template-extension discovery & activation

A template can ship its own AI capabilities — skills, workflows, guidelines, and
reference artifacts. When you `frontx install` such a template, the kit
**discovers and activates** those extensions in the consuming project
(`src/extensions/`), with no manual wiring: installed-template capabilities
simply become available to agents.

### AI-driven upgrade orchestration

Beyond the direct `frontx upgrade` path, the kit **orchestrates** upgrades over
the CLI's machine-readable command surface (`src/upgrade-orchestration/`):

```bash
frontx upgrade ./my-app 1.1.0 --json
```

The `--json` surface emits the raw change set and reads a decision back, so the
kit can layer review gates, migration analysis, and downstream impact assessment
onto the change set before it is applied.

> **Not AI skills.** Scaffolding a project (`frontx seed` / `frontx add`) and
> validating a template (`frontx validate`) are direct **CLI** operations, not
> kit capabilities.

### Roadmap

The PRD also scopes standalone ecosystem skills — creating a microfrontend,
generating type definitions, and other ecosystem-scoped operations — to be
surfaced under the `project` and `mfe` command namespaces. These are declared
capabilities, not yet shipped as discrete skills; today those operations follow
the conventions documented in the ecosystem guidelines.

The framework is **template-agnostic** and ships zero template-specific content;
all template-specific capabilities arrive through template bundles.

## Developing the Ecosystem

To work on the ecosystem packages themselves, clone this repository:

```bash
git clone https://github.com/cyberfabric/FrontX.git
cd FrontX
npm ci
npm run build:packages   # build every ecosystem package
```

### Common commands

```bash
# Build
npm run build:packages        # build all ecosystem packages
npm run build --workspace=@gears-frontx/cli   # build a single package

# Validation (run before commits)
npm run lint                  # ESLint across the repo
npm run type-check            # type-check all ecosystem packages
npm run arch:check            # architecture tests (must pass)
npm run arch:deps             # dependency-boundary rules
npm run arch:unused           # unused-code report (knip)

# Tests
npm run test:unit             # all package unit tests (packages/*)
npm run test:unit:watch       # watch mode
```

### Boundaries to respect

The ecosystem enforces package boundaries via ESLint + dependency-cruiser +
`scripts/test-architecture.ts`. In short: the Core Framework packages must not
carry solution-specific content (type-format literals, shared-property ids, or
layout-domain values) — those belong to templates and consuming applications.
Run `npm run arch:check` and `npm run arch:deps` before committing.

## Development Best Practices

1. **Keep the ecosystem template-agnostic** — no app, UI, layout, theme, or
   business-domain content in `packages/*`.
2. **Type everything** — no `any`, explicit return types, proper generics.
3. **Respect versioning** — the ecosystem commits to semantic-versioning
   discipline so breaking changes stay isolated from consumers.
4. **Prefer the contracts** — target the stable, contracted capabilities rather
   than internal implementation details.
5. **Let templates own the app** — screens, styling, and state are template
   concerns; the ecosystem provides only the substrate and tooling.

## Next Steps

- Read [PRD.md](./architecture/PRD.md) for the product vision and the full
  capability inventory across all three pillars
- Review [DESIGN.md](./architecture/DESIGN.md) for the system design and
  package boundaries
- Read [AI Guidelines](./.ai/GUIDELINES.md) for AI coding rules and patterns
- Explore the pillar packages under `packages/`

## Getting Help

- Check the AI guidelines and architecture docs under `.ai/` and `architecture/`
- Run `frontx help` for the CLI command surface
- Refer to each package's types for its public API
