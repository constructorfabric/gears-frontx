# Microfrontends — `frontx-template-mfe` territory

> **TARGET AUDIENCE:** Project developers adding or maintaining an MFE package
> **PURPOSE:** What lives under this directory and how to add a new package to it

Everything under `src-app/mfe_packages/` belongs to the `frontx-template-mfe`
template — the shell scans this directory but never names a package inside it
(see the shell's `mfe-package-contract` AI guideline for the exact contract a
package here must satisfy).

## Precondition: requires an applied `template-shell`

This directory is **add-only**. It ships with `frontx-template-mfe`, which has
no root `package.json`, no build/test/lint tooling, and no host application —
those are owned by `frontx-template-shell`. A package here declares exact
published versions of its `@gears-frontx/*` dependencies (`react`,
`framework`, `frontx-template-shell` itself, …) and installs them from the
registry like any other dependency — there are no `file:` paths to dangle.
What an applied shell actually supplies is the **runtime host**: the
`src-app/app/` shell that mounts these MFEs, and — at build/dev time — the
`frontxMfGts` plugin loaded from `@gears-frontx/frontx-template-shell/build/mf-gts`.
Without an applied shell there is no host to mount into and no plugin to load,
even though `npm install` alone would succeed.

```bash
frontx seed frontx-template-shell ./my-app
frontx add frontx-template-mfe ./my-app
cd my-app && npm install   # required after every `add` — the workspace glob
                            # picks up the new packages, so the lock must be
                            # regenerated
```

**Upgrade is not supported yet in a multi-template repository.** `frontx
upgrade` reads a single provenance record; once both `frontx-template-shell`
and `frontx-template-mfe` are applied to the same repo, upgrading either one
is not yet safe — treat the repo as pinned to its current versions until this
lands.

## Add your own MFE

Copy the blank scaffold and adjust it — there is no registry file to edit;
`generate:mfe-manifests` / `dev:all` (shell scripts) discover packages by
scanning this directory:

```bash
cp -r src-app/mfe_packages/_blank-mfe src-app/mfe_packages/my-mfe
```

Then, inside `my-mfe/`:

1. **`package.json`** — rename it (`name`, and the `dev`/`preview` scripts'
   `vite preview --port <N>` to a port no other package here already uses).
2. **`mfe.json`** — declare your entries and extensions (screen, sidebar,
   popup, or overlay) with GTS IDs following this template's ID conventions
   guideline.
3. **`vite.config.ts`** — keep the `frontxMfGts` build plugin wired, and add
   your lifecycle modules to the Module Federation `exposes` map so the shell
   can load them at runtime.

Existing packages here for reference: `demo-mfe` (`:3001`, a full worked
example — Hello World, Profile, Theme, UIKit, Widgets Host), `_blank-mfe`
(`:3099`, the copy-from scaffold), and `widgets-fixture-a` / `widgets-fixture-b`
(`:3201` / `:3202`, widgets mounting into `demo-mfe`'s widgets domain).
