---
description: "Agent navigation rules for FrontX ecosystem package boundaries, CLI, and MFEs."
---

# FrontX AI Tooling Kit — Agent Navigation Rules

## Package Boundaries (always enforce)

- Ecosystem packages: `mfes`, `gts-plugin`, `api`, `cli`, `cyber-pilot-kit-frontx`
- Template packages: the active template (external, source-spec-resolved) and its sub-packages
- Never add ecosystem→template imports; never add template→ecosystem src-level coupling

## When searching the filesystem

- Scope every search to the tree being worked in: the project directory, the repository, or the single package under change. Never search from `/`, from the home directory, or from any parent of the working tree
- An unscoped search is not thorough, it is a scan of everything the machine holds. One `find /` issued during a scaffolding run cost 93.6 seconds of pure filesystem walk and surfaced nothing the project tree did not already carry
- A path that is not where it should be is absent. Widen the search inside the tree, or report the absence; widening past the tree answers a different question than the one asked

## When adding code to ecosystem packages

- Check DESIGN.md for the relevant component boundary constraint (MFES-*, API-*, CLI-*, KIT-*)
- Run `npm run build` and `npm run test` inside the package before reporting done
- All resource ids in kit manifests MUST begin with `frontx_` (KIT-1)

## When working with the CLI

- CLI resolves templates by source-spec at runtime; it bundles no template content
- Source-spec format: `host:owner/repo[//subtree]@ref` — the optional `//subtree` addresses a template occupying a subdirectory of a repository
- Supported commands are `install`, `list`, `update-local`, `validate`, `seed`, `add`, `upgrade`, and `help`
- `seed` applies a template into a **new** repository, `add` into an **existing** one; both take the identity the template's own manifest declares, which is what `list` reports. `seed` refuses a target that already holds content and names the exact rule in its refusal - read that rather than reproducing the rule here, since a copy of it in this file is a copy that falls out of step
- `list --json` is the machine-readable form: one record per installed template carrying its identity, pinned reference, source address, and declared description

## When a request is to create or extend a project

- Route it first — the routing section of this kit's `SKILL.md` maps each kind of request (create, apply a held reference, add a unit, upgrade, validate) to the capability or command that serves it. Read the routing table there; it is the only copy, and restating it here is how the two fall out of step
- **This kit describes no procedure for adding a unit inside ground an applied template owns** — no MFE package, no screen. That template owns its scaffold, its naming and its registration steps, and states them in the skills it activated under `.frontx/ai/<template-identity>/`. Writing such a procedure here would put solution knowledge in the solution-agnostic base and go stale the moment the template changed

## When working with MFEs

- MFEs register through `@gears-frontx/mfes` DefaultMfeRegistry
- Extension domains control which MFEs may mount (`cpt-frontx-component-extension-domain-governance`)
- Isolation is via blob-URL sandboxing (`cpt-frontx-component-mfe-isolation`)
