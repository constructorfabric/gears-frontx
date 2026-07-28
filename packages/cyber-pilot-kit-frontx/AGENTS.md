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
- Source-spec format: `protocol://host/path#ref`
- The CLI has no scaffolding commands; supported commands are `install`, `list`, `update-local`, `validate`, `seed`, `add`, `upgrade`, and `help`
- To add an MFE package, copy the `_blank-mfe` reference scaffold in `mfe_packages/` (see its `README.md`)

## When working with MFEs

- MFEs register through `@gears-frontx/mfes` DefaultMfeRegistry
- Extension domains control which MFEs may mount (`cpt-frontx-component-extension-domain-governance`)
- Isolation is via blob-URL sandboxing (`cpt-frontx-component-mfe-isolation`)
