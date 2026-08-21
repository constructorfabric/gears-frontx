# FrontX Inbox Workspace

A helpdesk workspace for a FrontX application: one microfrontend package,
`inbox-mfe`, contributing two screens.

- **Inbox** - folders with counts, a conversation list with live search and four
  sort orders, the message thread with its composer, and the customer-details
  panel.
- **Contacts** - five filters, a sortable directory table paged 25 rows at a
  time, and the contact detail view. "View contact" in a thread opens the
  person's page here.

Both screens are composed from `@gears-frontx/ui-kit` components and its
semantic tokens. Every conversation, message, contact and identity comes from
the package's own mock API service; there are no fixture files.

## Add-only - requires `template-shell` and `template-mfe`

This template is **add-only**. It owns no root `package.json`, no build or test
tooling, and no host app: those belong to
[`frontx-template-shell`](../template-shell/README.md), and the ground its
package sits in belongs to [`frontx-template-mfe`](../template-mfe/README.md).
Seeding it into an empty directory produces a repository with nothing to mount
its screens into.

The package pins its `@gears-frontx/*` dependencies to exact published
versions, so a seeded project installs them from the registry like any other
dependency.

## What is here but not part of the template

`package.json`, `package-lock.json` and this README are a monorepo dev harness,
deliberately absent from `frontx-template.json`'s `ownershipBoundaries` so
`frontx add` never copies them anywhere. Two of the three would collide with
the shell if they were shipped: a seeded project already has a root manifest
and a root README.

Inside this repository the exact pins above would fetch registry tarballs
rather than resolve to local source, so the harness `overrides` redirect each
pinned name to the source beside it. They redirect rather than re-declare, so
the installed versions still satisfy the pins.

Unlike `template-mfe`'s harness, this one also redirects `@gears-frontx/ui-kit`:
every screen here composes against the kit version this repository carries,
which is ahead of what the registry has, and without that entry the install
resolves a kit the screens do not compile against.

## Working on it in this repository

Installing the harness alone is **not** enough. The stack below it must be
built first, because the package's `vite.config.ts` loads `frontxMfGts` from
the shell's own build output and the kit is consumed from its `dist`.

```bash
# 1. the ecosystem packages this repo owns, kit included
npm ci && npm run build:packages

# 2. the shell as a whole - `build` sequences its publishable package before
#    its subpackages, which type-check against the declarations it emits
cd template-shell && npm ci && npm run build && cd ..

# 3. this harness
cd template-inbox && npm ci
```

Then, from `template-inbox/`:

```bash
npm run type-check --workspace=@gears-frontx/inbox-mfe
npm run test:unit  --workspace=@gears-frontx/inbox-mfe
npm run build      --workspace=@gears-frontx/inbox-mfe
```

The screens themselves only run inside a host: the shell template holds no
`src-app/mfe_packages/` of its own, so this package first reaches a running
application when `frontx add` puts it into one.

## Adding a screen

Not by applying this template again. The AI bundle it installs
(`.frontx/ai/@gears-frontx/frontx-template-inbox/`) carries the
`add-inbox-screen` skill and its workflow, the scope, chrome and data
contracts, and a map from each pane of the shipped screens to the kit component
that renders it.
