# FrontX Inbox

A complete helpdesk application: seed it into an empty repository, install, and
`npm run dev` gives you a running product.

- **Inbox** - folders with counts, a conversation list with live search and four
  sort orders, the message thread with its composer and suggested replies, and
  the customer-details panel.
- **Contacts** - five filters, a sortable directory table paged 25 rows at a
  time, and the contact detail page. "View contact" in a thread opens that
  person's page, at an address you can reload or share.

Both sections sit beside the app's own icon rail: the product mark, the two
section buttons, and at the bottom the theme toggle and the profile menu.

## Project-establishing - apply it alone

This template seeds a whole repository. It brings the app entry, the Vite build,
the TypeScript, lint and test configuration, and the dependency set - there is
no shell to apply first and no microfrontend ground to sit in.

```bash
frontx seed @gears-frontx/frontx-template-inbox my-helpdesk
cd my-helpdesk
npm install
npm run dev
```

## What it is built on

| Concern | Package |
|---|---|
| Every visual, and the theme tokens the layout is written in | [`@gears-frontx/ui-kit`](https://www.npmjs.com/package/@gears-frontx/ui-kit) |
| The data layer - service, protocols, endpoint descriptors | [`@gears-frontx/api`](https://www.npmjs.com/package/@gears-frontx/api) |
| Icons | `lucide-react`, imported directly |

Layout is CSS Modules over kit tokens; no raw colour or metric is written down
anywhere in `src/styles/`. There is no CSS framework and no second component
library.

Every conversation, message, contact and identity comes from
`src/api/dataset.ts`, served by `InboxApiService` through the app's own
`RestMockPlugin`. Pointing the app at a real backend is deleting one
`registerPlugin` call.

## No lockfile, deliberately

The template ships no `package-lock.json`: its `package.json` pins every
`@gears-frontx` dependency to an exact version, so a plain `npm install`
resolves the same tree a lockfile would - without carrying this repository's own
registry configuration into every project seeded from it. Commit the lockfile
`npm install` writes; from then on it is the project's, not the template's.

## Working on it in this repository

`template-inbox/` is a standalone npm project, not a workspace of the monorepo
around it. It installs its `@gears-frontx` dependencies from the registry like
any seeded project would, so nothing needs building underneath it first:

```bash
cd template-inbox
npm install
npm run type-check
npm run lint
npm run test:unit
npm run dev
```

Editing `packages/ui-kit` or `packages/api` in this repository does **not**
reach the template - the pins resolve published versions. Bump the pin once the
change is published, and `policy:template-pin-drift` at the repository root will
tell you if you miss a site.

## Adding a screen

Not by applying this template again. The AI bundle it installs
(`.frontx/ai/@gears-frontx/frontx-template-inbox/`) carries the
`add-inbox-screen` skill and its workflow, the scope, chrome and data contracts,
and a map from each pane of the shipped screens to the kit component that
renders it.
