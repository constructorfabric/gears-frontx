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

- Route it first — the routing section of this kit's `SKILL.md` maps each kind of request (create, apply a held reference, add a unit, upgrade, validate) to the capability or command that serves it. Read the routing table there; it is the only copy, and restating it here is how the two fall out of step
- **This kit describes no procedure for adding a unit inside ground an applied template owns** — no MFE package, no screen. That template owns its scaffold, its naming and its registration steps, and states them in the skills it activated under `.frontx/ai/<template-identity>/`. Writing such a procedure here would put solution knowledge in the solution-agnostic base and go stale the moment the template changed

## When working with MFEs

- MFEs register through `@gears-frontx/mfes` DefaultMfeRegistry
- Extension domains control which MFEs may mount (`cpt-frontx-component-extension-domain-governance`)
- Isolation is via blob-URL sandboxing (`cpt-frontx-component-mfe-isolation`)
