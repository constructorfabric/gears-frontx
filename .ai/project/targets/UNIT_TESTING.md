<!-- @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1 -->
<!-- @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-ai-enforcement:p1 -->
# Unit Testing (CyberFabric Monorepo)

This file is the monorepo-local project target. It restates the generic `test:unit` contract that ships via the FrontX CLI to every generated project, then adds monorepo-only rules that cover the root runner and host-app aliases which only exist here.

The shared content—all sections above `## MONOREPO-ONLY RULES`—should stay aligned with `packages/cli/template-sources/ai-overrides/project/targets/UNIT_TESTING.md` (the file shipped to generated projects). When you change that shared material, update both files. That alignment is section-scoped, not a whole-file copy: do not duplicate this monorepo file into `ai-overrides`, and never propagate the `MONOREPO-ONLY RULES` block into the shipped file. When editing monorepo-only rules, edit only the `MONOREPO-ONLY RULES` section below.

## CRITICAL RULES
- REQUIRED: Treat `test:unit` as the standard unit-test script for this project.
- REQUIRED: Run the project package-manager command for `test:unit` when unit-test triggers apply.
- REQUIRED: Read this file before deciding to skip unit tests for generated project code.
- FORBIDDEN: Treating `frontx validate components` as a unit-test runner.

## TRIGGERS
- REQUIRED: Run unit tests when a colocated `*.test.*` or `*.spec.*` file changes.
- REQUIRED: Run unit tests when test setup or test infrastructure changes.
- REQUIRED: Run unit tests when logic-heavy files change, including hooks, utilities, API services, state, parsers, and generated MFE behavior.
- REQUIRED: Run unit tests before task handoff or review when generated code changed.

## EXECUTION RULES
- REQUIRED: Prefer the smallest useful Vitest run while iterating, then run the full `test:unit` command before handoff.
- REQUIRED: `test:unit` is the non-interactive CI and handoff path and must resolve to `vitest --run --passWithNoTests=false`.
- REQUIRED: Invoke `test:unit` via the active package manager (`npm run test:unit`, `pnpm run test:unit`, `yarn test:unit`) for automation and handoff evidence.
- REQUIRED: `test:unit:watch` is the interactive local loop and must resolve to Vitest watch mode, not the CI one-shot mode.
- REQUIRED: After the applicable `test:unit` run for handoff, run the project package-manager commands for `type-check` and `arch:check` as separate verification steps.
- REQUIRED: Use focused test runs for a single file or changed area when that is enough to validate the current edit quickly.
- REQUIRED: Keep `test:unit` green as the project-wide contract even when using focused runs during development.
- REQUIRED: CI and review reports refer to `test:unit`; do not substitute `test:unit:watch` for automation or handoff evidence.

## COVERAGE RULES
- REQUIRED: Add or update unit tests when changed behavior has a stable test surface.
- REQUIRED: New screens add or update a screen test that covers stable render or behavior.
- REQUIRED: New shared composite components under `src/components/` add or update a unit test for the stable component contract.
- REQUIRED: Keep starter template tests focused on durable behavior, not placeholder text or brittle snapshots.
- REQUIRED: Placeholder-safe starter baselines assert durable patterns and neutral fixture values, not generated names, exact route strings, localized copy, or template metadata.
- REQUIRED: For generated screensets, preserve the baseline API-contract and `HomeScreen` smoke tests unless the feature intentionally replaces them.
- REQUIRED: Generated API-contract starter tests keep route-agnostic matching or endpoint-descriptor assertions after template replacement; do not rewrite them to literal post-generation route strings.
- REQUIRED: Generated `HomeScreen` smoke tests keep translation mocks and neutral bridge/API fixture values; assert stable keys, roles, IDs, or fixture data instead of placeholder-derived copy.
- OPTIONAL: When you change critical paths (for example auth, security-sensitive logic, bootstrap/MFE wiring, or shared library APIs), run Vitest with `--coverage` locally before handoff—for example `npm run test:unit -- --coverage` so this project’s coverage settings apply.

## MOCKING RULES
- REQUIRED: Mock only the boundary you need to isolate, such as API services, MFE bridge methods, time, or browser-only globals.
- REQUIRED: Prefer partial mocks or narrow fakes over replacing an entire module when most real behavior should remain intact.
- FORBIDDEN: Mocking away the behavior the test is supposed to prove.

## TEST UTILITIES RULES
- REQUIRED: `__test-utils__/` is the single shared-helper convention for this project; when layouts conflict, `__test-utils__/` wins.
- REQUIRED: Place any non-test helper consumed by tests (reset functions, factory builders, mock wiring, fixtures) in a sibling `__test-utils__/` folder next to the module or package boundary it supports.
- REQUIRED: Files under `__test-utils__/` MUST NOT use the `.test.` or `.spec.` suffix; they are helpers, not runnable test files.
- REQUIRED: Import test utilities via the `__test-utils__/` path (relative within a package, `@/` alias across app branches), e.g. `import { resetAccountsMockState } from './__test-utils__/mocks'`.
- FORBIDDEN: Alternative conventions for shared test helpers, including `*.test-helpers.*`, `*.test-utils.*`, `test-utils/`, and placing non-`.test.*` helpers inside `__tests__/` alongside runnable tests. Migrate any pre-existing files that use these layouts to `__test-utils__/`.
- REQUIRED: Keep package-level test directories (`packages/*/__tests__/**`) for runnable `*.test.*` files only; shared helpers used across those tests belong in a colocated `__test-utils__/` folder inside the same package tree.
- REQUIRED: Vitest `include` globs target `**/*.test.*` / `**/*.spec.*` patterns only; `__test-utils__/` is therefore excluded from test discovery by construction and MUST also be excluded from coverage to avoid counting helpers as product code.

## ENVIRONMENT RULES
- REQUIRED: Use `*.test.ts` or `*.test.js` for non-React logic, matching the project language.
- REQUIRED: Use `*.test.tsx` or `*.test.jsx` for screens, UI components, or tests that render React trees, matching the project language.
- REQUIRED: Tests for translated UI use mocked translation hooks or assert stable non-localized values such as keys, roles, IDs, or bridge data.
- FORBIDDEN: Hardcoding locale-specific rendered copy in generated starter tests.
- REQUIRED: Pure logic tests must not render React trees or pull in UI setup they do not need, even though the shared Vitest environment is `jsdom`.

## MONOREPO-ONLY RULES
These rules apply only to the CyberFabric monorepo root. They describe the fan-out runner and host-app aliases that do not exist in projects generated by the FrontX CLI; they MUST NOT be propagated into the shipped `ai-overrides` copy of this file.

### Vitest `environment` per project (jsdom vs node)

Each runnable Vitest entrypoint sets `test.environment` in its own `vitest.config.ts`, or—for nested MFEs—in the shared `vitest.mfe.base.ts` re-exported per MFE folder. The choice is intentional: **`node`** keeps non-DOM suites fast and minimal; **`jsdom`** is used where React rendering, browser APIs, or DOM-adjacent behavior is required (see `packages/screensets/vitest.config.ts` for rationale where applicable).

| Scope | Config file | `environment` |
|-------|-------------|---------------|
| Host app (repo root) | `vitest.config.ts` | `jsdom` |
| Nested MFEs under `src/mfe_packages/*` | `src/mfe_packages/vitest.mfe.base.ts` | `jsdom` |
| `@gears-frontx/api` | `packages/api/vitest.config.ts` | `node` |
| `@gears-frontx/cli` | `packages/cli/vitest.config.ts` | `node` |
| `@gears-frontx/framework` | `packages/framework/vitest.config.ts` | `node` |
| `@gears-frontx/i18n` | `packages/i18n/vitest.config.ts` | `node` |
| `@gears-frontx/react` | `packages/react/vitest.config.ts` | `jsdom` |
| `@gears-frontx/screensets` | `packages/screensets/vitest.config.ts` | `jsdom` |
| `@gears-frontx/state` | `packages/state/vitest.config.ts` | `node` |
| `@gears-frontx/studio` | `packages/studio/vitest.config.ts` | `jsdom` |

- REQUIRED: The monorepo root `test:unit` is the deliberate exception to the plain Vitest contract: it runs `scripts/run-monorepo-unit-tests.mjs`, which delegates to each runnable monorepo project that ships `test:unit`; every delegated invocation honors the Vitest contract in the `EXECUTION RULES` section above.
- REQUIRED: `packages/docs` is currently exempt from the monorepo `test:unit` fan-out because the VitePress site does not yet ship runnable unit tests.
- REQUIRED: When the monorepo root `test:unit` needs to fan out across every project in CI, prefer the runner's explicit parallel mode (`npm run test:unit -- --parallel`) instead of the default sequential path.
- OPTIONAL: For a full-repo coverage pass locally, use `npm run test:unit -- --parallel --coverage` so every delegated project runs under coverage.
- REQUIRED: The host app (`src/app`) does not live in its own npm workspace, so the monorepo runner uses private root-level `_test:unit:host` (-> `vitest --run`) and `_test:unit:host:watch` (-> `vitest --watch`) instead of delegating via `-w`. These underscored aliases intentionally omit the `--passWithNoTests=false` CLI flag because the root `vitest.config.ts` already sets `passWithNoTests: false`; the flag lives in a single place (the config) for the host-app entrypoint to avoid drift. These underscored aliases are consumed only by `scripts/run-monorepo-unit-tests.mjs`; agents and CI never invoke them directly.
- REQUIRED: Root `test:unit:watch` defaults to the `host-app` project when no `--project` or path argument narrows the run; explicit project selection and path-based inference still take precedence.
