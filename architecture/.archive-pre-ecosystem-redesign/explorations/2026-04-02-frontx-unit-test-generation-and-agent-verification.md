# Exploration: FrontX Unit Test Generation and Agent Verification

Date: 2026-04-02

## Research question

How should FrontX support unit-test generation in created projects and generated screensets so that:

- new projects and generated screensets standardize on **Vitest only** (no create-time runner prompt; avoids template multiplication and keeps agent instructions deterministic),
- AI agents use the generated tests to verify code during development,
- the `_blank` screenset template includes unit tests,
- projects can tailor testing beyond the scaffold through editable guidance (for example `.ai/project/targets/UNIT_TESTING.md`) when the default workflow is not sufficient?

**Document status:** The findings through [Sources](#sources) describe the repository as of **2026-04-02**. The **[Addendum (2026-04-16)](#addendum-2026-04-16-implementation-decisions-and-current-state)** records post-exploration implementation decisions; where the narrative and addendum disagree, the addendum is authoritative.

Secondary questions:
- What is the current state of test generation in `frontx create` and `frontx screenset create`?
- Where should testing configuration live so both the CLI and AI instructions can consume it?
- What rollout shape provides the best trade-off between simplicity and flexibility?

## Scope

**In scope**: `packages/cli` project generation, screenset generation, generated AI configuration, command templates, `frontx.config.json`, and the `_blank-mfe` template.

**Out of scope**: Full implementation details for each test framework, e2e/browser testing strategy, and changes to runtime packages outside what generated apps consume.

## Findings

### 1. Generated app projects do not currently scaffold unit testing

File: `packages/cli/src/generators/project.ts`, lines 761-885.

The generated app `package.json` currently includes scripts for:
- `dev`
- `dev:all`
- `build`
- `preview`
- `lint`
- `type-check`
- `arch:check`
- `arch:deps`
- `ai:sync`

It does **not** include:
- `test`
- `test:unit`
- `test:watch`
- any Vitest/Jest runner dependency
- any generated test config file

This means a newly created FrontX app has no unit-test runner contract for either humans or agents.

**Confidence:** Corroborated -- verified by reading the generator that builds the scaffolded `package.json`.

### 2. The `create` flow already has a clean extension point for another scaffold choice

**Historical (2026-04-02):** This finding argued for an optional test-runner prompt. **Superseded:** Implementation chose fixed Vitest with no prompt; see [addendum](#addendum-2026-04-16-implementation-decisions-and-current-state).

File: `packages/cli/src/commands/create/index.ts`, lines 255-305.

The interactive `frontx create` flow already prompts for:
- UI kit
- package manager
- studio enablement

This means adding a test-runner prompt fits the existing shape of the command. A new prompt such as `testing tool` or `unit test runner` would be structurally consistent with the current command design.

**Confidence:** Corroborated -- verified by reading the prompt-building logic.

### 3. Generated AI instructions currently require architecture validation, not unit tests

Files:
- `packages/cli/src/commands/ai/sync.ts`, lines 202-247
- `packages/cli/templates/commands-bundle/frontx-validate.md`, lines 15-45
- `packages/cli/templates/commands-bundle/frontx-new-screenset.md`, lines 22-36

The generated AI instructions currently emphasize:
- reading `.ai/GUIDELINES.md`,
- following target-file routing,
- running `arch:check`,
- running `type-check` and `lint` in some command workflows,
- browser/MCP validation for runtime behavior.

They do **not** currently tell agents to:
- discover the configured unit-test runner,
- run unit tests for touched code during development,
- update or add unit tests when implementing new behavior,
- fail validation when unit tests are missing for covered areas.

As a result, even if unit tests were manually added later by a user, the generated agent workflow would not consistently enforce them.

**Confidence:** Corroborated -- verified by reading the AI sync generator and bundled command templates.

### 4. `_blank-mfe` currently has no unit-test baseline

Files:
- `src/mfe_packages/_blank-mfe/package.json`, lines 1-36
- `packages/cli/templates/mfe-template/README.md`, lines 212-229

The `_blank-mfe` template currently contains:
- `dev`, `build`, and `preview` scripts,
- runtime and build dependencies,
- no `test` or `type-check` script in its own package.json,
- no Vitest config,
- no test files.

The template README describes CI validation via temporary copy, `tsc --noEmit`, and ESLint, but not unit tests.

This is a direct gap relative to the requirement that generated screensets should inherit a testable baseline.

**Confidence:** Corroborated -- verified by reading the `_blank-mfe` package manifest and template README.

### 5. The screenset generator already anticipates test-file renaming

Files:
- `packages/cli/src/generators/screenset.ts`, lines 101-110
- `packages/cli/src/generators/screenset.test.ts`, lines 98-112

The screenset generator's file-renaming logic explicitly supports `_BlankApiService.test.ts` -> `_<Name>ApiService.test.ts`.

That indicates the current design is already compatible with test files living inside the template. The support is partial today: rename logic exists, but no actual test files are present in `_blank-mfe`.

**Confidence:** Corroborated -- verified by reading the rename helper and its test coverage.

### 6. `frontx.config.json` is the most natural machine-readable home for testing settings

Files:
- `packages/cli/src/core/types.ts`, lines 28-44
- `packages/cli/src/utils/project.ts`, lines 55-108

`frontx.config.json` already stores scaffold decisions such as:
- `layer`
- `uikit`
- `packageManager`
- `linkerMode`

The CLI already loads and validates this file and uses it to drive generation and AI-sync behavior. Today it has no testing fields, but it is the obvious place to add them if both CLI logic and AI instructions need to discover the configured testing policy.

This is stronger than relying only on prose in generated docs because it gives agents and commands a stable, machine-readable contract.

**Confidence:** Substantiated -- based on the current role of `frontx.config.json` in generation and sync flows.

### 7. There is already a preserved location for project-specific testing policy

File: `packages/cli/template-sources/ai-overrides/project/GUIDELINES.md`, lines 7-23.

The generated project-specific guidelines explicitly mention:
- "Testing strategies specific to this project"

and those files are preserved across `frontx update`.

This is useful for custom strategy overrides, but it is not sufficient as the only source of truth because:
- the CLI cannot reliably execute prose,
- agents may interpret natural-language rules differently,
- command templates cannot easily derive a concrete test command from narrative guidance alone.

The preserved project-guidelines layer is therefore a good complement to machine-readable config, not a complete replacement for it.

**Confidence:** Corroborated -- verified by reading the generated project-guidelines template.

## Options

### Option A: Vitest-first only

Add Vitest as the default and only first-class unit-test runner for generated app projects and generated screensets.

Shape:
- scaffold `vitest`, `@vitest/coverage-v8`, and related config,
- add `test`, `test:unit`, and `test:unit:watch` scripts,
- add baseline tests to `_blank-mfe`,
- update AI instructions to run `npm run test:unit` during development and before final validation,
- optionally allow `none` as an opt-out.

Pros:
- Smallest change set
- Fastest path to value
- Best consistency for docs, generators, and agents
- Lowest support burden for FrontX maintainers

Cons:
- Limited user choice
- Weak fit for teams standardized on Jest or another runner
- "Custom testing strategy" becomes documentation-only unless more config is added later

### Option B: Configurable first-class runner choice

Add a scaffold choice in `frontx create`, with `vitest` as default and additional supported values such as `jest` or `none`.

Shape:
- prompt user for unit-test runner during `frontx create`,
- store selection in `frontx.config.json`,
- scaffold runner-specific files and scripts,
- generate AI instructions that resolve the configured test command.

Pros:
- Gives users explicit choice at project creation time
- Keeps the contract machine-readable
- Fits the current interactive prompt model
- Keeps agent behavior aligned with scaffold choice

Cons:
- Every supported runner multiplies template and maintenance cost
- Runner-specific docs and examples drift unless carefully maintained
- Screenset template support becomes harder if per-runner test files differ substantially

### Option C: Machine-readable testing config plus custom command support

Extend `frontx.config.json` with a testing block, for example:

```json
{
  "testing": {
    "unit": {
      "runner": "vitest",
      "command": "npm run test:unit"
    },
    "strategy": {
      "mode": "default"
    }
  }
}
```

Shape:
- `runner` supports concrete tool choices such as `vitest`, `jest`, or `none`,
- `command` tells agents exactly what to execute,
- `strategy.mode` is explicitly limited to:
  - `default` -> use FrontX-standard testing behavior,
  - `custom` -> use project-defined testing rules in addition to the configured command.

Semantics:
- `default` means FrontX owns the expected workflow:
  - scaffold the selected runner,
  - generate standard scripts such as `test` and `test:unit`,
  - require agents to run the configured unit-test command for touched code,
  - require `type-check` and `arch:check` before finalizing.
- `custom` means the project is intentionally overriding the standard policy:
  - `testing.unit.command` remains the machine-readable command agents should run,
  - `.ai/project/GUIDELINES.md` or `.ai/project/targets/TESTING.md` can refine when tests are required, what coverage matters, or what additional validations apply,
  - FrontX should not invent further assumptions beyond the configured command and explicit project rules.

Pros:
- Strongest long-term contract
- CLI and agents can share the same source of truth
- Supports future migration commands and `frontx ai sync`
- Allows custom strategies without making every strategy a first-class generator feature

Cons:
- Broader design change than a simple Vitest rollout
- Requires validation and backward-compatibility work
- Still needs a decision about what FrontX officially supports versus what it merely allows

### Option D: Keep generation simple, use project guidelines for customization

Scaffold Vitest by default, but push all non-default strategy behavior into `.ai/project/GUIDELINES.md` or `.ai/project/targets/TESTING.md`.

Pros:
- Very fast rollout
- Preserved file already exists
- Minimal CLI/config changes

Cons:
- Weak machine-readability
- Inconsistent enforcement across agents and commands
- Hard to guarantee agent compliance during development
- Poor fit if the CLI itself later needs to validate test behavior

### Option E: Separate testing setup command

Introduce a later command such as `frontx testing setup` or `frontx setup testing` instead of putting the full feature into `frontx create`.

Pros:
- Works for existing projects
- Decouples test setup from initial scaffolding
- Makes switching strategies more explicit

Cons:
- Worse out-of-box developer experience
- New projects cannot assume tests exist
- Does not solve `_blank-mfe` inheritance unless combined with template work

## Comparison

| Option | User choice | Agent reliability | Implementation cost | Long-term flexibility |
|--------|-------------|-------------------|---------------------|-----------------------|
| A. Vitest-first only | Low | High | Low | Medium |
| B. First-class runner choice | Medium | High | Medium | Medium |
| C. Config + custom command | High | High | Medium-High | High |
| D. Docs-only customization | Medium | Low-Medium | Low | Low |
| E. Separate setup command | High | Medium | Medium | High |

## Recommendation

The best path is a phased hybrid of **Option B** and **Option C**.

### Phase 1

Implement:
- `frontx create` prompt for unit-test runner,
- default value `vitest`,
- `frontx.config.json.testing.unit.runner`,
- `frontx.config.json.testing.unit.command`,
- generated app-level Vitest config and scripts,
- generated AI instructions that require agents to run the configured unit-test command for touched code,
- `_blank-mfe` baseline unit tests and local test config.

This gives:
- immediate value,
- explicit user choice,
- a machine-readable contract,
- test enforcement during development,
- a real test baseline for generated screensets.

### Phase 2

Add:
- `strategy.mode: "custom"` support backed by project testing guidelines,
- optional project-level testing target such as `.ai/project/targets/TESTING.md`,
- stronger `frontx validate` integration so it runs the configured unit-test command alongside `arch:check`.

This keeps the initial rollout bounded while still leaving a path for teams with non-Vitest standards.

## Suggested design shape

### CLI/project config

Add fields to `frontx.config.json`:

```json
{
  "testing": {
    "unit": {
      "runner": "vitest",
      "command": "npm run test:unit"
    },
    "strategy": {
      "mode": "default"
    }
  }
}
```

Where:
- `testing.unit.runner` selects the concrete test tool FrontX scaffolded.
- `testing.unit.command` is the command agents and validation flows should execute.
- `testing.strategy.mode` has only two intended values:
  - `default` -> FrontX-standard testing workflow
  - `custom` -> project-defined testing workflow layered on top of the configured command

### Generated project scripts

For Vitest-backed projects, scaffold:
- `test` -> `npm run test:unit`
- `test:unit`
- `test:unit:watch`

This gives one canonical default command for both users and agents, while preserving room for more specific aliases.

### Agent behavior

Generated AI instructions should require agents to:
- read `frontx.config.json`,
- discover the configured test command,
- add or update unit tests for changed behavior when appropriate,
- run the configured unit-test command during development for touched code,
- run `type-check` and `arch:check` before finalizing.

This is stricter than the current model, which mostly requires architecture checks and runtime browser validation.

### `_blank-mfe` baseline tests

The `_blank-mfe` template should include baseline unit tests for the parts most likely to survive transformation, for example:
- API service behavior,
- mock data contract,
- simple screen render smoke test,
- helper or slice behavior where stable enough.

The goal is not exhaustive coverage of the blank template. The goal is to ensure every generated screenset starts with:
- a working test runner,
- at least one passing unit test,
- a clear pattern for adding more tests.

## Key takeaways

- FrontX currently does not scaffold app-level unit testing in created projects, and generated agent instructions do not enforce unit tests during development. (Corroborated)

- `_blank-mfe` has no unit-test baseline today, even though the screenset generator already anticipates test-file renaming. (Corroborated)

- `frontx.config.json` is the strongest place to store testing configuration because both the CLI and generated AI instructions already depend on it for other scaffold choices. (Substantiated)

- The preserved project-guidelines layer is useful for custom testing strategy, but it should complement machine-readable config rather than replace it. (Substantiated)

- The recommended rollout is: Vitest default, explicit runner choice at project creation, machine-readable test command in config, AI enforcement of the configured test command, and baseline `_blank` screenset tests. (Substantiated)

## Open questions

1. **Which runners should be first-class in Phase 1?** `vitest` only, `vitest + none`, or `vitest + jest + none`?

2. **Should `frontx validate` run unit tests automatically?** This would improve enforcement but may increase command latency.

3. **How strict should agent enforcement be?** Should agents always run unit tests after any code change, or only when touching units with existing tests or adding logic-heavy code?

4. **What belongs in `_blank-mfe` tests?** The baseline should be stable enough to survive templating, but not so specific that it becomes brittle or noisy.

5. **How should existing projects adopt the feature?** A follow-up `frontx testing setup` or `frontx update` migration path may still be needed.

## Sources

1. `packages/cli/src/generators/project.ts` -- generated app dependencies and scripts
2. `packages/cli/src/commands/create/index.ts` -- interactive project-creation prompts
3. `packages/cli/src/commands/ai/sync.ts` -- generated AI instructions
4. `packages/cli/templates/commands-bundle/frontx-validate.md` -- current validation workflow for agents
5. `packages/cli/templates/commands-bundle/frontx-new-screenset.md` -- current screenset workflow for agents
6. `src/mfe_packages/_blank-mfe/package.json` -- current blank screenset template manifest
7. `packages/cli/templates/mfe-template/README.md` -- current blank screenset validation guidance
8. `packages/cli/src/generators/screenset.ts` -- template file renaming behavior
9. `packages/cli/src/generators/screenset.test.ts` -- rename support for `.test.ts` files
10. `packages/cli/src/core/types.ts` -- `frontx.config.json` shape
11. `packages/cli/src/utils/project.ts` -- config loading and validation
12. `packages/cli/template-sources/ai-overrides/project/GUIDELINES.md` -- preserved project-specific testing-guidelines layer

---

## Addendum (2026-04-16): Implementation decisions and current state

The following records decisions made after the exploration and the resulting implementation state. The original body above reflects the codebase as it was on 2026-04-02.

### Direction change: fixed Vitest scaffold, no configurable runner

The implemented design chose a simpler path than the exploration's recommended Option B+C hybrid. Instead of a configurable runner choice stored in `frontx.config.json`, Vitest is scaffolded unconditionally with no create-time prompt. The `frontx.config.json` testing block was not pursued.

Rationale: a single fixed runner avoids template multiplication and keeps agent instructions deterministic. Project-level customization uses editable guidance in `.ai/project/targets/UNIT_TESTING.md` rather than machine-readable config.

### Findings now addressed

- **Finding 1 (project scaffold):** `project.ts` now adds `vitest`, `jsdom`, `@testing-library/react`, scripts `test` / `test:unit` / `test:unit:watch`, copies `vitest.config.ts` from template sources, and ships a starter test at `src/app/lib/utils.test.ts`.
- **Finding 3 (AI instructions):** `ai/sync.ts` injects the `test:unit` command, Vitest conventions, and pointers to project testing targets. Bundled commands (`frontx-validate.md`, `frontx-new-screenset.md`) include unit-test steps.
- **Finding 4 (`_blank-mfe`):** The template now has `test` / `test:unit` / `test:unit:watch` scripts, Vitest devDependencies, `vitest.config.ts`, and baseline tests (`_BlankApiService.test.ts`, `mocks.test.ts`, `HomeScreen.test.tsx`).
- **Finding 5 (rename logic):** Now exercised against real `_blank-mfe` test files.

### Additional finding: Supabase Vitest skill as reference material

The [Supabase Vitest skill](https://github.com/supabase/supabase/tree/master/.agents/skills/vitest) was evaluated as source material. FrontX adapts only a compact subset (config/CLI usage, test-structure primitives, mocking conventions, environment selection, targeted filtering). Broad API reference and lower-priority topics (snapshots, coverage config, advanced fixtures, concurrency, type-testing, multi-project setup) are excluded unless agent workflows later show a concrete need.

### Resolved open questions

1. **Runners:** Vitest only -- no runner prompt, no `none` opt-out.
2. **`frontx validate` and unit tests:** Default validate (`validate components`) does not run tests. Tests use `test:unit` via the package manager. Optional future composition (`validate tests`, `--with-tests`) may chain both.
3. **Agent enforcement:** Tiered, not after every edit. Agents must run tests when: colocated tests or test infrastructure are touched, logic-heavy code paths change, or the task is being completed/handed off. Comment-only or mechanical changes may skip per project guidance.
4. **`_blank-mfe` test scope:** Intentionally narrow -- mock/API contract test, `HomeScreen` smoke render, at most one extra stable behavioral test. Avoids brittle assertions on placeholder names or template scaffolding details.
5. **Existing project adoption:** Deferred to a future `frontx update` migration path.

### Updated design shape

- **Scripts:** `test` aliases the package-manager invocation of `test:unit`; `test:unit:watch` runs Vitest in watch mode.
- **Generation commands write tests:** Screenset generation emits transformed `_blank-mfe` test files alongside generated code.
- **Project testing guidance:** Generated at `.ai/project/targets/UNIT_TESTING.md` -- explains the Vitest workflow, documents aliases, stays editable.
- **Agent behavior:** Agents infer the test command from scaffold convention (`test:unit`), read project testing guidance, and follow tiered triggers.

### Updated sources

Additional sources consulted during implementation:

- `packages/cli/template-sources/project/configs/vitest.config.ts` -- generated Vitest config
- `packages/cli/template-sources/project/src/app/lib/utils.test.ts` -- starter app test
- `packages/framework/commands/frontx-validate.md` -- updated validation workflow (unit-test step)
- `packages/react/commands/frontx-new-screenset.md` -- updated screenset workflow (validation and testing)
- [Supabase Vitest skill](https://github.com/supabase/supabase/tree/master/.agents/skills/vitest) -- reference for reusable Vitest guidance topics
