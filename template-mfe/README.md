# FrontX MFE Packages

Microfrontend (MFE) packages for a FrontX application: `demo-mfe` (Hello World,
Profile, Current Theme, UIKit Elements, Widgets Host), `_blank-mfe` (a minimal
scaffold to copy for a new MFE), and two widget fixtures (`widgets-fixture-a`,
`widgets-fixture-b`).

## Add-only — requires `template-shell`

This template is **add-only**. It has no root `package.json`, no build/test/lint
tooling, and no `src-app/app/` host — those are owned by
[`frontx-template-shell`](../template-shell/README.md). Seeding this template into
an empty directory produces a non-functional repository (dangling `file:`
dependencies into a shell that isn't there).

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
