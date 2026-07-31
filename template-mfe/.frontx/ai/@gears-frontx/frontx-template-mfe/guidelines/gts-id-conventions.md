# Guideline: GTS ID Conventions (template-mfe)

template-mfe's MFE packages (`src-app/mfe_packages/*/mfe.json`) identify every
manifest, entry, extension, domain, action, and shared property with a GTS
(`@gears-frontx/gts-plugin`) type-system ID. The ecosystem's GTS type substrate is
namespace-agnostic (base-kit fluency); this guideline documents the concrete
namespace and naming pattern **template-mfe** actually uses across its own MFE
packages (`demo-mfe`, `_blank-mfe`, `widgets-fixture-a`, `widgets-fixture-b`), so
new MFEs added to a project built from template-mfe stay consistent with the
existing ones.

## General shape

```
gts.frontx.<subsystem>.<kind>.v1~<namespace-path>.v1[~]
```

- `gts.frontx.<subsystem>.<kind>.v1` — the fixed type-definition segment (owned by
  `@gears-frontx/gts-plugin` / `@gears-frontx/mfes`; never invented per-MFE).
- `~<namespace-path>.v1` — the solution-specific instance segment template-mfe's
  MFE packages append; this is the part a new MFE package must author.
- A trailing `~` on action/shared-property IDs marks an open (parameterizable)
  instance reference, matching the existing entries verbatim — keep it when
  following the pattern for a new action.

## Observed ID families in template-mfe

| Family | Fixed prefix | template-mfe's instance pattern | Real example |
|---|---|---|---|
| MF manifest | `gts.frontx.mfes.mfe.mf_manifest.v1~` | `{app}.mfe.{package}.manifest.v1` | `frontx.demo.mfe.manifest.v1` |
| MF entry | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~` | `{app}.mfe.{package}.{screen}.v1` | `frontx.demo.mfe.profile.v1` |
| Screen extension | `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~` | `{app}.screens.{screen}.v1` | `frontx.demo.screens.profile.v1` |
| Widget-area extension (non-screen domain) | `gts.frontx.mfes.ext.extension.v1~` | `{app}.{fixture}.{widget}.v1` | `frontx.widgets.fixture_a.widget_alpha.v1` |
| Custom action | `gts.frontx.mfes.comm.action.v1~` | `{app}.action.{name}.v1~` | `frontx.demo.action.refresh_profile.v1~` |
| Widget domain | `gts.frontx.mfes.ext.domain.v1~` | `frontx.widgets.area.{area}.v1` | `frontx.widgets.area.main.v1` |

`{app}` in every entry above is template-mfe's own namespace root (`demo`,
`widgets`, `blank`) — a Project Developer forking template-mfe for a real
solution replaces it with their solution's namespace (e.g. `acme.crm`), never with
`frontx`.

## Fixed (do-not-invent) IDs

These come from `@gears-frontx/mfes` and are referenced verbatim, never redefined,
by every MFE package in template-mfe:

- `gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1` — the shared
  screen domain every screen-contributing MFE extension targets.
- `gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~`,
  `...mount_ext.v1~`, `...unmount_ext.v1~` — the ecosystem's built-in extension
  lifecycle actions.
- `gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~` and
  `...language.v1~` — the two shared properties every screen entry's
  `requiredProperties` declares.
- `gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.{init,activated,deactivated,destroyed}.v1`
  — the fixed lifecycle stage set a domain declaration enumerates.

## Rule for new MFE packages in template-mfe

1. Never redefine a fixed-family ID (subsystem/kind segment) — only append a new
   instance segment under the existing namespace root.
2. Keep the instance segment's leaf name (`{screen}`, `{name}`, `{widget}`)
   snake_case, matching every existing example above.
3. An entry's `manifest` field must reference that same package's own manifest ID
   — never another package's.
4. A screen-domain extension always targets
   `gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1`; only a
   non-screen (e.g. widget-area) extension targets a template-defined domain ID.
