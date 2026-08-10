# Guideline: How an MFE Contributes to Navigation

An MFE package appears in the host's menu by declaring a *screen extension* in
its own `mfe.json` — there is no central menu list to edit, no shell code to
touch, and no registration call to make. This guideline is a code-verified
snapshot of the producer side of that contract; the consumer side (how the
shell discovers, validates, and renders these declarations) is the
`navigation-composition` guideline in the `template-shell` AI bundle. If the
declarations in this template's packages change shape, this file must be
updated to match.

## The whole contract for "appear in the menu"

One entry in the package's `mfe.json` `extensions[]` array, targeting the
shared screen domain — verbatim from `demo-mfe`:

```json
{
  "id": "gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.widgets.host.screen.v1",
  "domain": "gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1",
  "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.demo.mfe.widgets_host.v1",
  "presentation": {
    "label": "Widgets Host",
    "icon": "lucide:layout-grid",
    "route": "/widgets-host",
    "order": 200
  }
}
```

- `id` — this extension's own identity, derived from the screen extension
  type. Author the instance segment per the `gts-id-conventions` guideline in
  this bundle.
- `domain` — always the fixed shared screen domain for menu entries; never a
  domain you invent.
- `entry` — must reference an entry declared in the same package's
  `entries[]`, whose `exposedModule` names the lifecycle module your
  `vite.config.ts` exposes through Module Federation.

## `presentation` semantics

The screen domain pins a derived extension type that **requires**
`presentation` — the host validates every screen-domain extension against it
at registration and rejects mismatches outright (your screen will not appear,
with a thrown registration error, not a silent skip):

| Field | Required | Meaning |
|---|---|---|
| `label` | yes | menu item text. A raw display string — there is no i18n key for menu labels today, so the label renders identically in every language |
| `route` | yes | route path (e.g. `/widgets-host`). Schema-required, but the current shell mounts by action and does not consume it — do not expect deep links; still, keep it unique and stable |
| `icon` | no | Iconify name with prefix (e.g. `lucide:user`); omitted = no icon |
| `order` | no | sort key across the whole menu, lower = earlier; omitted = `999` (last) |

`order` is a flat number per domain — there is no grouping or nesting, so
coordinate values across packages if relative position matters.

## Beyond the menu: extensions that do not target the screen domain

A package may also *own* a domain (declared in its `mfe.json` `domains[]`) and
accept extensions from other packages into it. In this template, `demo-mfe`
owns the widgets domain (`…ext.domain.v1~frontx.widgets.area.main.v1`), and
`widgets-fixture-a` / `widgets-fixture-b` declare extensions targeting it —
without any `presentation`, since they render inside the Widgets Host screen,
not in the menu. The host deliberately skips extensions whose domain it does
not own and delivers them to the owning runtime: composition is recursive, and
"my screen hosts contributions from other packages" needs no shell
involvement.

## Where declarations travel

`mfe.json` is read at build time by the shell's `frontxMfGts()` plugin, merged
into `dist/mfe-manifest.json`, aggregated into
`public/generated-mfe-manifests.json`, and registered by the host at runtime.
Nothing else reads it — a change to `mfe.json` takes effect after the package
is rebuilt and manifests are regenerated (`npm run generate:mfe-manifests`, or
any script that runs it, e.g. `dev:all`).

## Boundaries

- The full directory/build shape a package must satisfy to be discovered at
  all — `package.json` port flag, `vite.config.ts` plugin order, build
  outputs — is the shell's `mfe-package-contract` guideline.
- ID authoring rules for every field above are this bundle's
  `gts-id-conventions` guideline; the `add-mfe-package` skill walks the whole
  flow.
