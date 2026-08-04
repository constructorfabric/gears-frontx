---
description: "Agent navigation rules for FrontX ecosystem package boundaries, CLI, and MFEs."
---

# FrontX AI Tooling Kit — Agent Navigation Rules

## Package Boundaries (always enforce)

- Ecosystem packages: `mfes`, `gts-plugin`, `api`, `cli`, `cyber-pilot-kit-frontx`
- Template packages: the active template (external, source-spec-resolved) and its sub-packages
- Never add ecosystem→template imports; never add template→ecosystem src-level coupling

## When adding code to ecosystem packages

- Check DESIGN.md for the relevant component boundary constraint (MFES-*, API-*, CLI-*, KIT-*)
- Run `npm run build` and `npm run test` inside the package before reporting done
- All resource ids in kit manifests MUST begin with `frontx_` (KIT-1)

## When working with the CLI

- CLI resolves templates by source-spec at runtime; it bundles no template content
- Source-spec format: `host:owner/repo[//subtree]@ref` — the optional `//subtree` addresses a template occupying a subdirectory of a repository
- Supported commands are `install`, `list`, `update-local`, `validate`, `seed`, `add`, `upgrade`, and `help`
- `seed` applies a template into a **new** repository, `add` into an **existing** one; both take the identity the template's own manifest declares, which is what `list` reports
- `list --json` is the machine-readable form: one record per installed template carrying its identity, pinned reference, source address, and declared description

## When a request is to create or extend a project

- Route it first — the routing section of this kit's `SKILL.md` states which capability serves which kind of request
- A request stating what to build, with no template reference in hand, is served by the scaffolding skill, which selects from what the installed inventory declares and applies it over the CLI command surface
- A request naming a reference already held is served by `frontx seed` / `frontx add` directly
- **To add a unit inside ground an applied template already owns — one more MFE package, one more screen — use the skills that template activated in the project under `.frontx/ai/<template-identity>/`.** That template owns its scaffold, its naming, and its registration steps. This kit ships no unit-adding procedure and must not describe one: doing so would put solution knowledge in the solution-agnostic base and would go stale the moment the template changed

## When working with MFEs

- MFEs register through `@gears-frontx/mfes` DefaultMfeRegistry
- Extension domains control which MFEs may mount (`cpt-frontx-component-extension-domain-governance`)
- Isolation is via blob-URL sandboxing (`cpt-frontx-component-mfe-isolation`)
