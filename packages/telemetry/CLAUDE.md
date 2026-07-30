# @gears-frontx/telemetry

Browser telemetry SDK. Batches app events and POSTs them to an endpoint the consumer controls -
session tracking, device and navigation context, DOM autocapture, plugin system.

## Ecosystem Package

This package is standalone: zero `@gears-frontx` dependencies, no React, one runtime dependency
(`bowser`). It has exactly one entry point, `.`.

`bowser` is used solely in `src/plugins/device.ts` for OS name/version, browser name/version and
platform type. Everything else in that file is native DOM.

Enforced in root config, not by convention:

- `eslint.config.js`, the `packages/telemetry/**/*.ts` block - no intra-ecosystem
  `@gears-frontx/*` imports, no React, no deep `@gears-frontx/*/src/**` imports. A narrow follow-up
  block turns `ban-ts-comment` off for `src/managers/events.ts` and `src/managers/hooks.ts`, where
  the wire-format rewrite and the variadic hook dispatch need it.
- `.dependency-cruiser.cjs` - `frontx-telemetry-1-no-template-content` and
  `frontx-single-intra-ecosystem-edge-telemetry-standalone`.

Wiring this SDK into a FrontX app is a template-side concern and is NOT part of this package. The
framework lives in template territory at `template-standard/packages/framework` (its plugin type is
`FrontXPlugin`), and `packages/cyber-pilot-kit-frontx/guidelines/ecosystem-boundaries.md:28-31`
forbids any ecosystem package from importing template territory at the source level. There is no
framework-plugin entry here, and no API for one to document.

## Core Concepts

### createTelemetry

```typescript
import { createTelemetry, telemetryLocalePlugin } from '@gears-frontx/telemetry';
import i18next from 'i18next';

const telemetry = createTelemetry({
  appName: 'cloud',
  appVersion: '1.4.2',
  url: 'https://telemetry.example.com/api/events',
})
  .plugin(telemetryLocalePlugin(i18next))
  .start();

telemetry.identify(user.id);
telemetry.logEvent('settings_saved', { theme: 'dark' });
```

`plugin`, `start` and `identify` return the service; `logEvent` and `destroy` return `void`.
`plugin()` drops falsy entries, so `flag && myPlugin()` is safe.

Flow: `logEvent` -> `event` hooks mutate the record -> queue -> flush -> POST

The flush timer is a 5s trailing debounce, re-armed by every event, so a steady event stream keeps
postponing the send. `visibilitychange` to `hidden` forces a flush.

`start()`, `plugin()` and `destroy()` no-op when `window` is undefined. `logEvent()` does not.

`apiVersion` defaults to `1`. Version 2 strips `context_user_id` / `context_tenant_id` from the
records, and in a batch of two or more hoists the fields whose value is identical across it into a
shared `meta` object.

### Telemetry plugins

A plugin is `{ name, setup }`. `setup` receives the normalized config, `logEvent`, session
accessors, a logger, and `addHook`:

```typescript
telemetry.plugin({
  name: 'tenant',
  setup: (context) => {
    context.addHook('event', (record) => {
      record.context_tenant_id = tenantId;
    });
  },
});
```

Hook keys: `event` (every record, before it is queued), `start`, `destroy`. `sessionStart` is
declared in the hooks map but nothing calls it.

`setup()` runs once, inside `start()`. A plugin registered after `start()` is stored and never set
up. Plugins are keyed by `name`, and `start()` registers the built-ins (`session`, `device`,
`navigation`, `appInfo`, `autocapture`) after the caller's, so a custom plugin under one of those
names is silently replaced.

Hooks fire in registration order, which puts custom `event` hooks ahead of the built-ins: `device`
and `appInfo` overwrite the fields they own no matter what ran earlier. `context_language` is the
one field `device` fills only when unset - that is what makes `telemetryLocalePlugin` work.

### Element hooks

Any DOM element can register a hook that governs how autocapture treats events from its subtree:

```typescript
import { telemetryElementHookKey } from '@gears-frontx/telemetry';

el[telemetryElementHookKey] = () => ({
  context: { context_service_name: 'settings-panel', context_call_chain: ['settings-panel'] },
  data: { section: 'appearance' },
});
```

The key is `Symbol.for('@gears-frontx/telemetry/element-hook')`, and the property augments the
global `Element` interface. A registry symbol rather than a module-level `Symbol()`: several copies
of the SDK can be loaded on one page, and a per-module identity would break the handshake between
autocapture and the registered hook.

Autocapture walks the clicked element's ancestors, closest first, invoking every hook it finds:

- `capture: false` from ANY hook on the path drops the whole event, and takes precedence over
  anything else in the same return. Same effect as the `data-telemetry-no-capture` attribute; the
  two coexist.
- Contributions are atomic per element: the closest hook returning something usable wins its whole
  `context` + `data` set. A `context` from one hook is never mixed with `data` from another, so a
  partial return means "this hook contributed nothing", not fields for a farther-out hook to fill.
- `data` merges *under* autocapture's own keys; `$`-prefixed keys in a hook's `data` are stripped.
- Only `context_service_name`, `context_service_version` and `context_call_chain` are read from a
  hook's `context`; an allowlist drops every other key before the merge. Widening it buys nothing
  for a field `device` or `appInfo` overwrites unconditionally.
- `context_call_chain` must be the registering element's COMPLETE chain - chains are never stitched
  across hooks.
- A throwing hook degrades that element to no contribution; the first thrown value is re-thrown
  after the event is emitted, so it still reaches `window.onerror` with a real stack.

**Evolution rule.** Reader (autocapture) and writers (whatever sets a hook) ship separately and run
at mixed versions on the same page. Evolve additively only. Changing what an existing field, the
suppression rule, or the merge rule MEANS requires a NEW registry-symbol string - never a new
meaning under `@gears-frontx/telemetry/element-hook`.

### PII redaction is a safety net

A `password` or `hidden` input, or an element whose `name` or `id` matches a sensitive-name regex
(`cvv`, `ssn`, `cardnum`, `pwd`, `routing`, ...), anywhere on the walked path drops the whole
event - not just that element's fields. On input-like elements - `select`, `textarea`,
`contenteditable="true"`, and an `input` whose type is not `button` / `checkbox` / `submit` /
`reset` - only `name` / `id` / `aria-label` are read. Values matching credit-card or US-SSN patterns
are dropped.

That is pattern matching, not a compliance guarantee. Anything the patterns do not recognize -
tokens, emails, free text inside a `label`, custom attributes on a non-input element - is captured.
Audit the markup, and suppress explicitly on any subtree that renders personal data.

Explicit opt-out: `data-telemetry-no-capture="false"`. The value is compared literally, so a bare
attribute or `="true"` does nothing.

## Key Rules

1. **Register plugins before `start()`** - `setup()` runs only inside `start()`
2. **No intra-ecosystem edge** - no `@gears-frontx/*` import, no React, no template territory
3. **Hook contributions are per-element and atomic** - never split one element's attribution
4. **Element hook contract is additive only** - semantic change means a new registry symbol
5. **Redaction is best-effort** - opt sensitive subtrees out explicitly

## Critical Rules

- REQUIRED: keep `src/**` free of `@gears-frontx` imports, React, and template-territory imports.
- REQUIRED: keep the test script named `test:unit` - `scripts/test-runner/discovery.mjs:172` skips
  any workspace without it, so the monorepo runner would drop this package silently.
- REQUIRED: keep `vitest` pinned to exactly `4.1.4` - `scripts/check-test-dependency-versions.mjs`
  rejects a range, including a semver-equivalent `^4.1.4`.
- REQUIRED: set `url` explicitly - it defaults to the same-origin path `/api/events` on
  `apiVersion: 1`, `/api/telemetry/v{n}/events` otherwise.
- REQUIRED: set `context_call_chain` whenever an element hook sets `context_service_name`;
  `appInfo` warns when the resulting chain does not contain the service name.
- REQUIRED: keep `LICENSE` and `NOTICE` in `files[]` - a deliberate difference from sibling
  packages, because upstream shipped them and Apache-2.0 section 4(d) expects the NOTICE to travel.
- FORBIDDEN: `$`-prefixed keys in an element hook's `data` - reserved for autocapture.
- FORBIDDEN: redefining an existing element-hook field under the current symbol.
- FORBIDDEN: naming a custom plugin `session`, `device`, `navigation`, `appInfo` or `autocapture`.
- FORBIDDEN: assuming `enabled: false` stops collection - hooks still run and the queue is still
  drained; only the POST is skipped.

## Development

npm workspaces. Node >=24.14.0.

```sh
npm run build           --workspace=@gears-frontx/telemetry   # tsup: cjs + esm + dts
npm run type-check      --workspace=@gears-frontx/telemetry
npm run type-check:test --workspace=@gears-frontx/telemetry
npm run test:unit       --workspace=@gears-frontx/telemetry
node scripts/run-monorepo-unit-tests.mjs --run --project=telemetry
```

31 tests in `src/__tests__/` - `telemetry.test.ts` (13), `autocapture.test.ts` (18). vitest with
`environment: 'happy-dom'` (not jsdom: the autocapture suite drives shadow roots, `matchMedia` and
`getComputedStyle`), and `globalSetup: './vitest.global-setup.ts'`, which pins `TZ=UTC`.

The browser example is `packages/telemetry-example-web` (private, never published). Run it from the
repo root with `npm run demo:telemetry`; it serves on port 5273.

## Exports

Single entry, `@gears-frontx/telemetry`:

- `createTelemetry` - build the service: `plugin` / `start` / `logEvent` / `identify` / `destroy`
- `telemetryElementHookKey` - registry symbol an element registers its hook under
- `telemetryLocalePlugin` - fills `context_language` from a `LocaleSource`, normalized to BCP 47

Types: `TelemetryService`, `TelemetryLogEvent`, `TelemetryElementHook`,
`TelemetryElementHookAttribution`, `TelemetryElementHookResult`, `LocaleSource`,
`TelemetryEventRecord`, `TelemetryLogEventParams`, `TelemetryData`, `TelemetryConfig`
