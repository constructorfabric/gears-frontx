---
name: frontx
description: "FrontX ecosystem AI capabilities: MFE runtime substrate, GTS type system, API protocol surface, CLI scaffolding, and AI tooling kit. Solution-agnostic base only."
---

# FrontX AI Tooling Kit

Provides AI agents with ecosystem-level fluency for FrontX projects.

## Packages

| Package | Scope | Purpose |
|---|---|---|
| `@gears-frontx/mfes` | Ecosystem | MFE runtime substrate — registration, loading, isolation, mediation |
| `@gears-frontx/gts-plugin` | Ecosystem | GTS default type-system plugin |
| `@gears-frontx/api` | Ecosystem | API protocol surface — handler-agnostic fetch, cache sharing |
| `@gears-frontx/cli` | Ecosystem | Template resolution CLI — zero bundled template content (CLI-1) |
| `@gears-frontx/cyber-pilot-kit-frontx` | Ecosystem | This AI tooling kit |

## Architecture Principles

- **CLI-1**: CLI has zero dependency on any template; resolves by source-spec at runtime.
- **KIT-1**: All resource identifiers in this kit carry the `frontx_` prefix.
- **MFES-2 / MFES-3**: MFE packages do not depend on template packages.
- **API-1**: API package is handler-agnostic; mocks are template territory.
- **GTS-PLUGIN-2**: GTS plugin ships no solution schemas; schemas are template territory.

## Key Concepts

- **MFE** (Microfrontend): isolated UI unit registered through the MFE registry.
- **Extension domain**: capability grouping that governs which MFEs may mount in a given area.
- **Source-spec**: `protocol://host/path#ref` URI that the CLI resolves to a template at runtime.
- **Template**: an external project-type deliverable (not bundled into core packages).
- **Constructor Studio kit**: declarative content bundle installable via `cfs kit install`.
