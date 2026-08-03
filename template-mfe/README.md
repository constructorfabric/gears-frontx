# FrontX MFE Packages

Microfrontend (MFE) packages for a FrontX application: `demo-mfe` (Hello World,
Profile, Current Theme, UIKit Elements, Widgets Host), `_blank-mfe` (a minimal
scaffold to copy for a new MFE), and two widget fixtures (`widgets-fixture-a`,
`widgets-fixture-b`).

## Add-only — requires `template-shell`

This template is **add-only**. It claims ownership of no root `package.json`, no
build/test/lint tooling, and no `src-app/app/` host — those are owned by
[`frontx-template-shell`](../template-shell/README.md). Seeding this template into
an empty directory produces a repository with no host to mount its MFEs into.

Each MFE pins its `@gears-frontx/*` dependencies to exact published versions, so a
seeded project installs them from the registry like any other dependency.

The `package.json` next to this README is **not part of the template**: it is a
monorepo dev harness, deliberately absent from `frontx-template.json`'s
`ownershipBoundaries`, so `frontx add` never copies it anywhere. Inside this
monorepo the pins above would fetch registry tarballs instead of resolving to
local source, so the harness redirects each pinned name to its local source
via `overrides`. It redirects rather than re-declares, so the installed
versions still satisfy the pins.

This makes local edits to `template-shell/packages/*` (`react`, `auth`,
`framework`, `i18n`, `state`) visible immediately, since the MFE packages
import those names directly and the override resolves straight to that
source. It does the same for direct imports of `packages/api`,
`packages/gts-plugin`, and `packages/mfes`. **It does not** reach edits to
those same three packages through `@gears-frontx/frontx-template-shell`'s own
pre-built `dist-lib/build/mf-gts` — `template-shell/package.json` pins
`gts-plugin`/`mfes`/`api` to their own published versions with no local
override of its own, so whatever `frontxMfGts` bundles at `template-shell`'s
build time reflects those registry versions, not edits made here, until
`template-shell` is rebuilt. The same not-part-of-the-template status applies
to `frontx-template.json` and this README — a template directory holds
shipped payload *and* authoring machinery, and the manifest's boundaries are
what separate the two.

Bootstrap order for working in this monorepo. Installing the harness alone is
**not** sufficient, and neither is building the shell's publishable package
alone: an MFE's `vite.config.ts` loads `frontxMfGts`, which pulls in the shell's
own subpackages, and each of those resolves through its `dist/` — absent until
built. Every layer below has to exist before the one above it can load.

```bash
# 1. ecosystem packages this repo owns (api, mfes, gts-plugin, …)
npm ci && npm run build:packages

# 2. the shell's own subpackages — auth, state, i18n, framework, react, studio.
#    Each publishes through its dist/, which frontxMfGts reaches at build time.
cd template-shell && npm install && npm run build:packages

# 3. the shell's publishable package — produces dist-lib/build/mf-gts itself
npm run build:package

# 4. the MFEs
cd ../template-mfe && npm install
```

Steps 1–3 are exactly what `template-shell`'s own tooling expects; the harness
adds only step 4. Skipping step 2 is the easy mistake: `npm run build:package`
(singular) builds the shell's entry point, `npm run build:packages` (plural)
builds the six subpackages it depends on.

For a seeded project (not this monorepo), the shell is a published, already-built
package, so plain `npm install` is sufficient there:

```bash
frontx seed frontx-template-shell ./my-app
frontx add frontx-template-mfe ./my-app
cd my-app && npm install   # required after every `add` — the shell's lock is
                            # regenerated without MFE workspaces (see the
                            # shell's own README)
```

## What it contributes

- `src-app/mfe_packages/*` — one directory per MFE package, each with its own
  `package.json` (port in `dev`/`preview` via `--port <N>`), `mfe.json` manifest,
  and `vite.config.ts` wired for Module Federation + the shell's `frontxMfGts`
  build plugin. See the shell's `mfe-package-contract` AI guideline for the full
  contract every package here conforms to.
- An AI-extension bundle (`.frontx/ai/@gears-frontx/frontx-template-mfe/`) with
  the `add-mfe-package` skill, its workflow, a GTS ID conventions guideline, and
  a GTS ID patterns reference artifact — for scaffolding additional MFE
  packages that follow the same shape.
- `src-app/mfe_packages/README.md` — lands in the seeded project alongside the
  MFE packages, documenting the add-only precondition and how to add a new
  package from inside that project.

## Not covered here

Host application, build/test/lint tooling, root configs, and the `packages/`
solution libraries (`react`, `framework`, `state`, `i18n`, `studio`, `auth`) all
live in `template-shell`.
