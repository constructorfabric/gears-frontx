# @gears-frontx/telemetry

Browser telemetry SDK, standalone. Usage, config table, API, autocapture, element hooks, PII and
known gaps: `README.md`.

## Rules

- REQUIRED: keep `src/**` free of `@gears-frontx` imports, React, and template-territory imports -
  `eslint.config.js` and `.dependency-cruiser.cjs` enforce it. App wiring is template-side; this
  package has no framework-plugin entry.
- REQUIRED: keep the test script named `test:unit` - `scripts/test-runner/discovery.mjs` skips any
  workspace without it, so the monorepo runner would drop this package silently.
- REQUIRED: keep `vitest` pinned to an exact version - `scripts/check-test-dependency-versions.mjs`
  rejects a range, including a semver-equivalent one.
- REQUIRED: keep `LICENSE` and `NOTICE` in `files[]` - deliberate difference from sibling packages,
  Apache-2.0 section 4(d).
- REQUIRED: register plugins before `start()` - `setup()` runs inside it, later ones are stored and
  never set up.
- FORBIDDEN: naming a custom plugin `session`, `device`, `navigation`, `appInfo` or `autocapture` -
  `start()` registers the built-ins after the caller's and silently replaces them.
- FORBIDDEN: changing what an existing element-hook field, the suppression rule or the merge rule
  MEANS under `Symbol.for('@gears-frontx/telemetry/element-hook')`. Reader and writers run at mixed
  versions on one page, so evolve additively; a semantic change needs a NEW registry string.
- FORBIDDEN: `$`-prefixed keys in an element hook's `data` - reserved for autocapture.
- FORBIDDEN: assuming `enabled: false` stops collection - only the POST is skipped.
- FORBIDDEN: treating redaction as a compliance guarantee - pattern matching only, so suppress
  sensitive subtrees explicitly.

## Commands

```sh
npm run test:unit --workspace=@gears-frontx/telemetry   # vitest, happy-dom, TZ=UTC pinned
npm run build     --workspace=@gears-frontx/telemetry   # tsup: cjs + esm + dts
npm run demo:telemetry                                  # packages/telemetry-example-web, private
```
