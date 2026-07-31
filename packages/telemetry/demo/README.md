# Telemetry Web Example

A browser page wired to [`@gears-frontx/telemetry`](..), posting to a local collector.

It consumes the package the way an external user would - the bare specifier `@gears-frontx/telemetry`,
resolved through the package's `exports` to `dist/`, no reaching into `src/`, no path aliases. That is
what makes it a check rather than a demo: if the example compiles and runs, the public API and the
emitted types are usable.

Nothing here is published. `files[]` in the package manifest is a whitelist (`dist`, `README.md`,
`LICENSE`, `NOTICE`), and the tsup entry is `src/index.ts` alone, so `demo/` reaches neither the
tarball nor the bundle.

## Run

From the repo root:

```sh
npm run demo:telemetry
```

Or from the package directory:

```sh
npm run demo
```

Open <http://localhost:5273>. The port is pinned in `vite.config.ts` because the `url` in `main.ts`
is absolute.

`predemo` builds the SDK first, so a fresh clone works in one command. The example consumes the SDK's
`dist/`, not its source, so re-run after changing the SDK.

`optimizeDeps.exclude` lists the SDK. Vite otherwise pre-bundles it into `node_modules/.vite` and
keeps serving that copy after a rebuild - the example would silently run stale SDK code, which is
worse than useless for a page whose job is to validate the SDK.

## Where the events go

`url` is set to `http://localhost:5273/api/events`. A ~20-line Vite middleware in `vite.config.ts`
accepts the POST, pretty-prints the body to the terminal and replies `204`.

That middleware stands in for the ingestion backend. The package is transport-agnostic: it sends
whatever envelope the SDK builds to whatever `url` you configure. Point `url` at a real collector and
nothing else changes.

The page renders each outgoing request by wrapping `fetch`, so what it shows is the exact payload the
collector receives. Separately, an example plugin on the `event` hook counts the records it sees -
that hook fires *before* a record is queued, so the counter runs ahead of the request list.

## What the page demonstrates

| Section | Shows |
| --- | --- |
| Autocapture | Ordinary buttons, links, inputs and a form. Nothing calls the SDK; autocapture listens on `document` for `click`, `change` and `submit`. |
| Redaction | A password field and a card number. Neither value reaches a record - the field names and value shapes trip the redaction rules. |
| Opting out | A subtree carrying a bare `data-telemetry-no-capture`. Only presence matters; the value is never read. |
| Element hook | A button registering a hook under `telemetryElementHookKey`, contributing service attribution and custom `data`. |
| Explicit API | `logEvent`, `identify` and `destroy`. |

The page drives the SDK directly, the way any browser consumer would. Wiring it into a FrontX app
through a framework plugin is a separate concern and lives in template territory, not here.

## Notes

- `sessionDuration` is set to 60s rather than the 30 minute default, so a session boundary is
  observable without waiting.
- `verbose: true`, so the SDK also logs to the browser console.
- The plugin in `main.ts` is written inline. `context` and `record` are typed contextually - writing
  a plugin requires no type imports.
