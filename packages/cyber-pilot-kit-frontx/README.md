# FrontX AI Tooling Kit

Constructor Studio kit that gives AI agents ecosystem-level fluency for FrontX
projects — MFE runtime substrate, GTS type system, API protocol surface, and CLI
scaffolding. Solution-agnostic base only; no template-specific content ships here.

Packaged as `@gears-frontx/cyber-pilot-kit-frontx` and delivered as a Constructor
Studio kit (`cpt-frontx-adr-ai-tooling-framework-packaging`).

## Kit shape

| Path | Kind | Purpose |
|---|---|---|
| `.cf-studio-kit.toml` | manifest | Canonical declarative installation manifest |
| `SKILL.md` | skill | Ecosystem skill surface, discoverable at session start |
| `AGENTS.md` | rule | Agent navigation and package-boundary rules |
| `guidelines/` | directory | Ecosystem guidelines (boundaries, constraints) |

Every resource identifier carries the `frontx_` prefix (KIT-1) so the kit's
resources cannot collide with another kit installed in the same project.

## Install

### In a consuming project

Distribution is the versioned npm artifact, but `cfs kit install` does not accept
an npm specifier — it resolves a kit from GitHub, a generic Git URL, or a local
directory. An npm-installed package *is* a local directory, so the two steps
compose:

```sh
npm install @gears-frontx/cyber-pilot-kit-frontx
cfs kit install ./node_modules/@gears-frontx/cyber-pilot-kit-frontx
```

The published tarball ships `.cf-studio-kit.toml` alongside `SKILL.md`,
`AGENTS.md`, `README.md`, and `guidelines/` (see `files` in `package.json`), so
the extracted package directory is a complete, valid kit source.

Installation records the kit at `[kits.cyber-pilot-kit-frontx]` in
`.cf-studio/config/core.toml`. Only declared resources install, each at its
`install_path`.

Alternatively, `cfs kit install` accepts a generic-Git subdirectory reference
against this monorepo, which skips npm entirely — see `cfs kit install --help`.

### In this monorepo

Already registered — do not re-install. The registration uses
`install_mode = "register"` against `../packages/cyber-pilot-kit-frontx`, so
resources resolve in place from source rather than being copied, and edits to
`SKILL.md`/`AGENTS.md`/`guidelines/` take effect without a reinstall.

## Validate

```sh
cfs kit validate packages/cyber-pilot-kit-frontx
```

Omitting the path validates every kit registered in `core.toml`, which is what
CI runs — this kit is covered there because it is registered.

## Notes

The kit was migrated from the legacy Cypilot `manifest.toml` format. Studio still
accepts that format, so the migration is forward-compatibility rather than a
compliance fix.

The authoritative description of what this kit delivers is the architecture of
record — `architecture/DECOMPOSITION.md` (`cpt-frontx-feature-ai-kit-packaging`)
and `architecture/features/ai-kit-packaging/FEATURE.md`. The resource table above
states what the manifest declares today; where the two differ, the artifacts
govern.
