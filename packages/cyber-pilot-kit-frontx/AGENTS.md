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
- An unscoped search is not thorough, it is a scan of everything the machine holds: it costs a full filesystem walk and surfaces nothing the project tree does not already carry
- A path that is not where it should be is absent. Widen the search inside the tree, or report the absence; widening past the tree answers a different question than the one asked

## When adding code to ecosystem packages

- Check DESIGN.md for the relevant component boundary constraint (MFES-*, API-*, CLI-*, KIT-*)
- Run `npm run build` and `npm run test` inside the package before reporting done
- All resource ids in kit manifests MUST begin with `frontx_` (KIT-1)

## When working with the CLI

- CLI resolves templates by source-spec at runtime; it bundles no template content
- Source-spec format: `host:owner/repo[//subtree]@ref` — the optional `//subtree` addresses a template occupying a subdirectory of a repository
- Supported commands are `install`, `list`, `update-local`, `validate`, `assemble`, `seed`, `apply`, `upgrade`, `register`, `unregister`, `ownership`, `delete`, and `help`
- `register <origin> [--replace]` pins an origin under the current project's single state document, `.frontx/project.json` (`templates[name]`, keyed by the identity the origin's own manifest declares); `apply --input <batch-json>` and `assemble --input <batch-json>` (a stateless preview; `apply` never trusts a prior `assemble`) both take the identical `{"templates": {"<name>": ["<target>", ...]}}` batch shape and act only on names already registered; `seed <dir> --input <batch-json>` does the same into a new or empty repository. A project is established when some `templates[name]` entry carries a non-empty `targets[]` in `.frontx/project.json`
- `upgrade <templateName> <new-origin> [--yes] [--json]` moves a registered template to a new origin; `upgrade <templateName> --restore [--yes] [--json]` moves it back to its immediately preceding origin. `unregister <name>` refuses a name that still carries an applied target. `ownership add|remove|list` marks or lists paths the project owns outside any applied template's own ground. `delete <target> [--json] [--yes] [--dry-run]` removes an applied template target
- In `--json` mode a destructive command (`delete`, `upgrade`) never prompts and never reads stdin: without `--yes` it returns `CONFIRMATION_REQUIRED` carrying the computed plan instead of acting, and must be re-issued with `--yes` to proceed. Every command emits exactly one JSON envelope in `--json` mode
- `list --json` is the machine-readable form: `{"ok":true,"data":{"defaults":[...],"registered":[...],"installed":[...]}}` — `defaults` and `installed` entries carry `name`, `version`, `description` (`installed` entries may carry `manifestUnreadable: true` instead, when the stored manifest can no longer be read); `registered` entries carry `name`, `origin`, `version`, `targets`, and `description` when it can still be read back
- `seed` only works inside this monorepo's own checkout: the CLI's official defaults are local `path:` origins resolvable only against this repository. Do not point a project elsewhere at `seed` as the way to start it - `register` + `apply` is the path that works outside this checkout

## When a request is to create or extend a project

- Route it first — the routing section of this kit's `SKILL.md` maps each kind of request (create, apply a held reference, add a unit, upgrade, validate) to the capability or command that serves it. Read the routing table there; it is the only copy, and restating it here is how the two fall out of step
- **This kit describes no procedure for adding a unit inside ground an applied template owns** — no MFE package, no screen. That template owns its scaffold, its naming and its registration steps, and states them in the skills it activated under `.frontx/ai/<template-identity>/`. Writing such a procedure here would put solution knowledge in the solution-agnostic base and go stale the moment the template changed

## When working with MFEs

- MFEs register through the abstract `MfeRegistry` from `@gears-frontx/mfes`, obtained via `createMfeRegistryFactory().build({ typeSystem })`
- Extension domains control which MFEs may mount (`cpt-frontx-component-extension-domain-governance`)
- Isolation is via blob-URL sandboxing (`cpt-frontx-component-mfe-isolation`)
