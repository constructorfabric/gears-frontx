# Guideline: How the Shell Composes Navigation

The host shell holds no list of screens. The left menu, and everything behind
it, is derived at runtime from the MFE registry: whatever is registered in the
*screen* extension domain appears in the menu, in declared order, and mounts on
click. This guideline is a code-verified snapshot of that mechanism — the
consumer side of the contract whose producer side is each MFE package's
`mfe.json` (see the `template-mfe` AI bundle's `navigation-contribution`
guideline). If the files named below change, this file must be updated to
match.

Authoritative files:

- `src-app/app/layout/Menu.tsx` — menu rendering and mount dispatch
- `src-app/app/mfe/bootstrap.ts` — domain registration and manifest ingestion
- `src/gts/schemas/extension_screen.v1.json` — the derived screen extension type
- `packages/framework/src/plugins/microfrontends/gts/frontx.screensets/instances/domains/` —
  the four well-known domain instances
- `scripts/generate-mfe-manifests.ts`, `src/build/mf-gts.ts` — the build-time
  pipeline

## The menu is registry-driven

`Menu.tsx` renders exactly what
`mfeRegistry.getExtensionsForDomain(FRONTX_SCREEN_DOMAIN)` returns, sorted by
`presentation.order` (a missing `order` defaults to `999`, i.e. last). The list
is re-read on a 500 ms interval, so extensions registered after first paint
appear without a reload — this is why a fresh boot may briefly show an empty
menu.

A click does **not** navigate. It dispatches a mount action:

```ts
mfeRegistry.executeActionsChain({
  action: {
    type: FRONTX_ACTION_MOUNT_EXT,
    target: FRONTX_SCREEN_DOMAIN,
    payload: { subject: extensionId },
  },
});
```

`presentation.route` is declared and schema-required, but the shell does not
consume it: switching screens is a mount action against a domain, not a route
transition. Deep links, browser history, and bookmarking are therefore not
provided by this shell today.

## From `mfe.json` to the browser

```text
src-app/mfe_packages/<pkg>/mfe.json        # hand-written; source of truth
  → <pkg>/dist/mfe-manifest.json           # build: frontxMfGts() merges mfe.json
                                           #   with Module Federation's mf-manifest.json
  → public/generated-mfe-manifests.json    # npm run generate:mfe-manifests aggregates all MFEs
  → fetch('/generated-mfe-manifests.json') # runtime: bootstrap.ts
  → GTS registration (see order below)
  → Menu.tsx reads the registry
```

No service and no database sit anywhere in this chain — between build and
browser the declarations live in one static JSON file served as a public
asset. A deployment that sources declarations elsewhere (e.g. a type
registry service) replaces exactly that link: `bootstrap.ts` needs a different
URL returning the same shape, and nothing downstream changes. That shape, per
package (`MfeManifestConfig` in `bootstrap.ts`):

```ts
{ manifest, entries, extensions?, domains?, schemas? }
```

`domains` is present only when the package itself owns an extension domain;
`extensions` is optional because a package may declare only loadable entries.

## Registration order and ownership

`bootstrapMFE()` proceeds in a fixed order:

1. Register the four well-known domains — `screen` (with
   `ExclusiveMountStrategy`: one mounted screen at a time), `sidebar`, `popup`,
   `overlay`.
2. Broadcast initial shared properties (`theme`, `language`).
3. Fetch the manifest aggregate.
4. First pass over **all** packages: register every non-action schema (derived
   extension/domain types), so later validation can chain through them
   regardless of package order in the aggregate.
5. Per package: scoped action schemas → `manifest` → `domains` → `entries` →
   `extensions`.

Two outcomes at the `extensions` step are deliberately different:

- **Rejection.** `register()` validates each instance against the extension
  type its target domain pins (`extensionsTypeId`) and throws on mismatch. A
  screen-domain extension without `presentation` is a malformed contribution
  and fails here, at registration — not silently later in the UI.
- **Skip.** An extension whose target domain the host does not own (checked via
  `hostOwnsDomain()`) is skipped without validation and reaches the owning
  runtime instead — e.g. widget extensions targeting a domain a nested MFE
  app declares itself. Rejection means "malformed contribution to my slot";
  skipping means "not my slot". Composition is recursive, not just
  shell → MFE.

## The type contract

Base types (`extension.v1`, `domain.v1`, entries, actions, shared properties,
lifecycle) are owned by `@gears-frontx/gts-plugin` and never redefined here.
The shell owns one derived type, `extension_screen.v1.json`, which is what
makes a screen extension menu-renderable — it requires `presentation`:

| Field | Required | Meaning |
|---|---|---|
| `label` | yes | menu item text (raw display string — no i18n key today) |
| `route` | yes | route path; declared but not consumed by the shell yet |
| `icon` | no | Iconify icon name (e.g. `lucide:user`) |
| `order` | no | sort key, lower = earlier; missing = `999` |

The screen domain instance
(`…/instances/domains/screen.v1.json`) pins that type via `extensionsTypeId`,
declares the shared properties (`theme`, `language`) and actions (`load_ext`,
`mount_ext`) it supports, a 30 s default action timeout, and the lifecycle
stages it drives.

## Mounting and isolation

On mount, `MfeHandlerMF` (`@gears-frontx/mfes`) loads the MFE's federated
module and mounts it **into a Shadow DOM**, so MFE styles cannot leak into the
shell or vice versa. Shared dependencies are isolated per runtime by rewriting
their imports to per-load blob URLs — no shared mutable module state between
host and MFEs.

## Boundaries

- What a directory under `src-app/mfe_packages/` must look like to enter this
  pipeline at all is the `mfe-package-contract` guideline in this bundle.
- The ID taxonomy used in every declaration is the `gts-id-conventions`
  guideline in the `template-mfe` AI bundle.
- Known limitations (no menu i18n, no audience targeting, unused `route`, flat
  `order`) are properties of the current schemas, tracked upstream in the
  platform's navigation-service planning — not bugs in this shell.
