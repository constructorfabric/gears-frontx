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

### Every instance segment spends exactly five dot-separated tokens

The instance segment is the same shape for every ID kind below — manifest,
entry, extension, domain and action alike:

```
vendor.package.namespace.type.vN
```

`frontx.demo.screens.profile.v1` is `frontx` (vendor), `demo` (package),
`screens` (namespace), `profile` (type), `v1`. Count the tokens before writing
an ID: a four-token instance segment fails silently — the manifest still loads
and the extension simply never resolves.

`{app}` in the patterns below therefore stands for **two** tokens, vendor and
package (`frontx.demo`, `frontx.blank`, `frontx.widgets`), not one. Spending a
single token on it costs the manifest and entry families nothing — their
patterns carry a literal `mfe` token that holds the count at five — and
silently shortens every extension ID to four, which is why an extension ID is
the one that breaks while the entry IDs beside it look right.

### The instance segment is the last `~`-separated segment

Its position varies by family: a manifest, a custom action, a widget domain and
a widget-area extension carry one fixed segment before it, while an MF entry
and a screen extension carry two — so a screen extension's instance segment,
the one the five-token rule governs, is its **third**:

```
gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.blank.screens.home.v1
```

- `gts.frontx.mfes.ext.extension.v1` — fixed type-definition segment.
- `frontx.screensets.layout.screen.v1` — the fixed screen domain, copied
  verbatim; its five tokens are the ecosystem's, not the MFE's to author.
- `frontx.blank.screens.home.v1` — the instance segment this MFE authors:
  `frontx` + `blank` + `screens` + `home` + `v1`.

## Observed ID families in template-mfe

| Family | Fixed prefix | template-mfe's instance pattern | Real example |
|---|---|---|---|
| MF manifest | `gts.frontx.mfes.mfe.mf_manifest.v1~` | `{app}.mfe.{package}.manifest.v1` | `frontx.demo.mfe.manifest.v1` |
| MF entry | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~` | `{app}.mfe.{package}.{screen}.v1` | `frontx.demo.mfe.profile.v1` |
| Screen extension | `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~` | `{app}.screens.{screen}.v1` | `frontx.demo.screens.profile.v1` |
| Widget-area extension (non-screen domain) | `gts.frontx.mfes.ext.extension.v1~` | `{app}.{fixture}.{widget}.v1` | `frontx.widgets.fixture_a.widget_alpha.v1` |
| Custom action | `gts.frontx.mfes.comm.action.v1~` | `{app}.action.{name}.v1~` | `frontx.demo.action.refresh_profile.v1~` |
| Widget domain | `gts.frontx.mfes.ext.domain.v1~` | `frontx.widgets.area.{area}.v1` | `frontx.widgets.area.main.v1` |

`{app}` in every entry above is the vendor + package pair template-mfe uses for
its own MFEs — `frontx.demo`, `frontx.blank`, `frontx.widgets` — two tokens of
the five. A Project Developer forking template-mfe for a real solution replaces
both with their solution's own (e.g. `acme.crm`), never keeping `frontx` as the
vendor, and never collapsing the pair to a single token.

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
2. Count the instance segment's tokens before writing it: five, every kind, no
   exceptions — including the screen extension ID, whose instance segment is
   its third `~`-separated segment.
3. Keep the instance segment's leaf name (`{screen}`, `{name}`, `{widget}`)
   snake_case, matching every existing example above.
4. An entry's `manifest` field must reference that same package's own manifest ID
   — never another package's.
5. A screen-domain extension always targets
   `gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1`; only a
   non-screen (e.g. widget-area) extension targets a template-defined domain ID.
