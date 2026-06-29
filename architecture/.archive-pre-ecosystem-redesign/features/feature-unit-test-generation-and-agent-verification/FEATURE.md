# Feature: Unit Test Generation and Agent Verification — `cpt-frontx-feature-unit-test-generation-and-agent-verification`

- [x] `p1` - **ID**: `cpt-frontx-featstatus-unit-test-generation-and-agent-verification`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Create Project with Unit Test Setup](#create-project-with-unit-test-setup)
  - [AI Agent Verifies Changes with Configured Unit Tests](#ai-agent-verifies-changes-with-configured-unit-tests)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Resolve Standard Unit Test Convention](#resolve-standard-unit-test-convention)
  - [Scaffold Unit Test Files and Scripts](#scaffold-unit-test-files-and-scripts)
  - [Generate AI Instructions for Test Verification](#generate-ai-instructions-for-test-verification)
- [4. States (CDSL)](#4-states-cdsl)
  - [Unit Test Guidance State](#unit-test-guidance-state)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Project Scaffolding Includes Unit Test Runner](#project-scaffolding-includes-unit-test-runner)
  - [Unit Test Convention Is Standardized](#unit-test-convention-is-standardized)
  - [AI Instructions Enforce Configured Test Command](#ai-instructions-enforce-configured-test-command)
  - [_blank-mfe Provides Baseline Unit Tests](#blank-mfe-provides-baseline-unit-tests)
- [6. Acceptance Criteria](#6-acceptance-criteria)
- [Additional Context](#additional-context)
  - [Known Limitations](#known-limitations)

<!-- /toc -->

---

## 1. Feature Context

### 1.1 Overview

The Unit Test Generation and Agent Verification feature extends FrontX CLI scaffolding so newly created projects ship with a configured Vitest workflow, and generated AI instructions tell agents to use that workflow under tiered triggers. The project uses the standard FrontX Vitest command convention, generated project AI files include an editable default unit-test guidance layer, and generated screensets inherit a runnable baseline from `_blank-mfe`.

**Background:** Earlier FrontX scaffolding covered application structure, AI guidance, and architecture validation, but not a default app-level unit-test runner, a standardized `test:unit` contract for new projects, tiered agent triggers aligned with that command, or a runnable unit-test baseline that new screensets could inherit from `_blank-mfe`. The overview above is the target contract this feature implements; related PRD items such as `cpt-frontx-fr-ai-agent-integration` include the agent workflow expectations that instruction sync and validation commands must uphold.

Primary value: `frontx create` and FrontX generation commands produce code together with a working Vitest command, starter unit tests, AI instructions that reference the standard command convention, an editable default project testing guideline, and screenset templates that already demonstrate how unit tests should be structured.

Key assumptions: Vitest is the only required first-class implementation in the initial rollout. The CLI does not ask users to choose a unit-test library or testing strategy. Project-specific customization happens by editing the generated testing guidance after scaffold, while the `test:unit` script alias, invoked through the project's configured package manager, remains the standard execution contract.

### 1.2 Purpose

Enable `cpt-frontx-actor-developer`, `cpt-frontx-actor-ai-agent`, and `cpt-frontx-actor-cli` to treat unit tests as part of the default FrontX development workflow instead of an optional afterthought. Project creation should establish the Vitest tool and canonical command. FrontX generation commands should write starter tests alongside generated code. AI sync should propagate that contract into generated tool instructions and generate an editable project testing guideline. Screenset generation should inherit a baseline test pattern from `_blank-mfe`.

Success criteria: A developer runs `frontx create`, receives the standard Vitest scaffold with no extra testing-choice prompt, installs dependencies, runs the package-manager invocation of `test:unit` (for example `npm run test:unit`, `pnpm run test:unit`, or `yarn test:unit`), and gets passing baseline tests. A developer uses a FrontX generation command that creates code, receives matching starter test files with that generated output, and can extend them instead of starting from zero. An AI agent modifying generated project code uses the standard unit-test command when tiered triggers apply and follows the generated project testing guidance, which adopters may edit later if they need stricter or different conventions.

### 1.3 Actors

- `cpt-frontx-actor-developer`
- `cpt-frontx-actor-ai-agent`
- `cpt-frontx-actor-cli`
- `cpt-frontx-actor-build-system`

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Related feature**: [FEATURE.md](/home/viktor/Gears FrontX/architecture/features/feature-cli-tooling/FEATURE.md) — `cpt-frontx-feature-cli-tooling`
- **PRD requirements**: `cpt-frontx-fr-cli-commands`, `cpt-frontx-fr-cli-templates`, `cpt-frontx-fr-cli-skills`, `cpt-frontx-fr-cli-e2e-verification`, `cpt-frontx-fr-ai-agent-integration`
- **PRD NFRs**: `cpt-frontx-nfr-maint-arch-enforcement`
- **Design components**: `cpt-frontx-component-cli`
- **Design feature references**: `cpt-frontx-fr-cli-commands`, `cpt-frontx-fr-cli-templates`, `cpt-frontx-fr-cli-skills`, `cpt-frontx-fr-cli-e2e-verification`
- **Design constraints**: `cpt-frontx-constraint-typescript-strict-mode`

---

## 2. Actor Flows (CDSL)

### Create Project with Unit Test Setup

- [x] `p1` - **ID**: `cpt-frontx-flow-unit-test-generation-and-agent-verification-create-project`

**Actor**: `cpt-frontx-actor-developer`

**Success Scenarios**:
- Project scaffold includes Vitest scripts, config, starter tests, and default testing guidance
- Project scaffold exposes the standard `test:unit` script alias, invoked through the configured package manager, without extra testing config

**Error Scenarios**:
- Required Vitest template files are missing from the CLI build output
- Generated testing guidance cannot be written into the project AI overrides

**Steps**:
1. [x] - `p1` - Developer invokes `frontx create <project-name>` and the CLI applies the standard FrontX Vitest scaffold without asking for a testing-library or testing-strategy selection - `inst-create-project-invoke`
2. [x] - `p1` - Algorithm: scaffold unit-test files and scripts using `cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests` - `inst-create-project-run-scaffold`
3. [x] - `p1` - CLI writes generated project files, including Vitest config, starter test files, and editable project testing guidance, to disk - `inst-create-project-write-files`
4. [x] - `p1` - CLI triggers AI sync so generated tool instructions include the standard unit-test verification rule and reference the generated testing guidance - `inst-create-project-run-ai-sync`
5. [x] - `p1` - **RETURN** project scaffold with a passing baseline unit-test command - `inst-create-project-return`

### AI Agent Verifies Changes with Configured Unit Tests

- [x] `p1` - **ID**: `cpt-frontx-flow-unit-test-generation-and-agent-verification-agent-verify`

**Actor**: `cpt-frontx-actor-ai-agent`

**Success Scenarios**:
- Agent runs the standard unit-test command when tiered triggers apply (colocated tests or test files touched, logic-heavy paths changed, or task/review completion), scoped to touched code or the repo’s fast equivalent when available
- Agent follows the generated project testing guidance and any adopter edits to that guidance

**Error Scenarios**:
- Standard test command is absent from generated scripts
- Standard Vitest setup fails to execute in the scaffolded project

**Steps**:
1. [x] - `p1` - AI agent reads `.ai/GUIDELINES.md` and the routed target files before modifying code - `inst-agent-read-guidelines`
2. [x] - `p1` - Algorithm: resolve the standard unit-test convention using `cpt-frontx-algo-unit-test-generation-and-agent-verification-resolve-test-convention` - `inst-agent-resolve-config`
3. [x] - `p1` - Agent reads project testing guidance from `.ai/project/GUIDELINES.md` or `.ai/project/targets/UNIT_TESTING.md` before assuming unit-test policy for the changed code - `inst-agent-load-testing-guidance`
4. [x] - `p1` - Agent implements the requested code change and updates or adds unit tests when the changed behavior requires test coverage - `inst-agent-implement-and-test`
5. [x] - `p1` - Algorithm: generate AI instructions for test verification using `cpt-frontx-algo-unit-test-generation-and-agent-verification-generate-ai-rules` - `inst-agent-follow-generated-rules`
6. [x] - `p1` - Agent runs the standard unit-test command when triggers apply (colocated `*.test.*` / `*.spec.*` or test setup edited, logic-heavy modules changed, or end of task/review), using a scoped or package-level run when the workspace supports it - `inst-agent-run-unit-tests`
7. [x] - `p1` - Agent runs `type-check` and `arch:check` after applicable unit tests pass (or when no test run was required per guidance) - `inst-agent-run-final-checks`
8. [x] - `p1` - **RETURN** implementation verified against the standard testing convention and project guidance - `inst-agent-return`

---

## 3. Processes / Business Logic (CDSL)

### Resolve Standard Unit Test Convention

- [x] `p1` - **ID**: `cpt-frontx-algo-unit-test-generation-and-agent-verification-resolve-test-convention`

**Input**: Project root directory path and generated project files

**Output**: Standard testing convention object with canonical unit-test `command`

**Steps**:
1. [x] - `p1` - Read the scaffolded `package.json` scripts and generated testing guidance from the project root - `inst-read-frontx-config`
2. [x] - `p1` - Resolve the standard unit-test command as the project package-manager invocation of the `test:unit` script alias for FrontX-generated projects using the Vitest scaffold - `inst-fallback-default`
3. [x] - `p1` - Validate that the generated scripts expose `test:unit` as a non-empty executable command alias - `inst-extract-command`
4. [x] - `p1` - **IF** validation fails for required scaffolded test files or scripts **RETURN** configuration error with a remediation message naming the missing asset - `inst-return-config-error`
5. [x] - `p1` - **RETURN** normalized testing convention object - `inst-return-normalized-config`

### Scaffold Unit Test Files and Scripts

- [x] `p1` - **ID**: `cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests`

**Input**: Project type, project root, and template manifest

**Output**: Generated file set containing test scripts, config, and starter tests

**Steps**:
1. [x] - `p1` - Receive project scaffold request from `frontx create` and assume Vitest as the fixed unit-test runner for the initial rollout - `inst-receive-runner`
2. [x] - `p1` - **IF** required Vitest templates or package entries are unavailable **RETURN** scaffold error identifying the missing asset - `inst-validate-runner`
3. [x] - `p1` - Add Vitest dependencies and scripts to generated `package.json`, including `test`, `test:unit`, and `test:unit:watch` aliases - `inst-add-package-json-entries`
4. [x] - `p1` - Generate Vitest config files in the project root or conventional location used by the scaffold - `inst-generate-runner-config`
5. [x] - `p1` - Generate starter app-level unit tests that exercise at least one scaffolded utility or configuration path - `inst-generate-starter-tests`
6. [x] - `p1` - Generate `_blank-mfe`-derived starter tests so new screensets inherit a working unit-test pattern - `inst-generate-blank-mfe-tests`
7. [x] - `p1` - Require FrontX generation commands that emit new code files to emit corresponding starter unit tests when a stable test pattern exists for that generated output - `inst-generate-command-tests`
8. [x] - `p1` - Generate editable default project testing guidance aligned with the Vitest scaffold and FrontX conventions - `inst-write-testing-guidance`
9. [x] - `p1` - **RETURN** complete generated testing file set and metadata for later AI sync consumption - `inst-return-scaffolded-tests`

### Generate AI Instructions for Test Verification

- [x] `p1` - **ID**: `cpt-frontx-algo-unit-test-generation-and-agent-verification-generate-ai-rules`

**Input**: Standard testing convention, package manager, generated AI tool targets, and project testing guidance target

**Output**: Updated AI assistant instructions aligned with the standard testing convention and default guidance

**Steps**:
1. [x] - `p1` - Read normalized testing convention from `cpt-frontx-algo-unit-test-generation-and-agent-verification-resolve-test-convention` - `inst-read-normalized-testing-config`
2. [x] - `p1` - Generate a canonical validation instruction that tells agents to run the standard unit-test command under tiered triggers (colocated tests or test infra touched, logic-heavy paths changed, task/review completion) and that `frontx validate components` does not replace that step - `inst-generate-unit-test-rule`
3. [x] - `p1` - Generate or update default project testing guidance that documents the FrontX Vitest strategy and can be edited by adopters later - `inst-generate-testing-guidance`
4. [x] - `p1` - Curate only the Vitest topics FrontX agents need constantly in generated projects: scaffold command usage, focused test-structure primitives, mocking, environment selection, and targeted filtering; exclude broad reference topics such as snapshots, coverage configuration, advanced fixtures/context, concurrency, type-testing, and multi-project setup - `inst-curate-vitest-guidance`
5. [x] - `p1` - Insert the test-verification rule into generated AI assistant files alongside existing `type-check`, `lint`, and `arch:check` guidance and reference the generated testing guidance where appropriate - `inst-insert-ai-rule`
6. [x] - `p1` - Update generated command templates such as validation and screenset flows so they reference the standard unit-test command where appropriate - `inst-update-command-templates`
7. [x] - `p1` - **RETURN** generated AI instruction content synchronized with the standard testing convention and guidance - `inst-return-generated-ai-rules`

---

## 4. States (CDSL)

### Unit Test Guidance State

- [x] `p2` - **ID**: `cpt-frontx-state-unit-test-generation-and-agent-verification-guidance-state`

**States**: `DEFAULT`, `CUSTOMIZED`

**Initial State**: `DEFAULT`

**Transitions**:
1. [x] - `p1` - **FROM** `DEFAULT` **TO** `CUSTOMIZED` **WHEN** a project edits the generated testing guidance to reflect local conventions or stricter rules - `inst-transition-to-customized`
2. [x] - `p1` - **FROM** `CUSTOMIZED` **TO** `DEFAULT` **WHEN** the project explicitly restores the CLI-provided testing guidance baseline - `inst-transition-to-default`

---

## 5. Definitions of Done

Status note: Re-score DoD and §6 acceptance checkboxes when the unit-test contract or evidence moves (templates, generators, `ai sync`, CI). CI claims should stay aligned with the workflow jobs that actually run.

### Project Scaffolding Includes Unit Test Runner

- [x] `p1` - **ID**: `cpt-frontx-dod-unit-test-generation-and-agent-verification-project-scaffold`

The system **MUST** scaffold a unit-test runner into newly created FrontX projects, expose a canonical unit-test command, and ensure generation commands write starter tests alongside generated code when applicable.

**Implements**:
- `cpt-frontx-flow-unit-test-generation-and-agent-verification-create-project`
- `cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests`

**Touches**:
- CLI: `frontx create`
- Generated files: runner config, starter tests, generated code companion tests, `package.json`

### Unit Test Convention Is Standardized

- [x] `p1` - **ID**: `cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention`

The system **MUST** standardize the unit-test contract through the generated Vitest scaffold and the `test:unit` script alias, invoked through the project's configured package manager.

**Implements**:
- `cpt-frontx-algo-unit-test-generation-and-agent-verification-resolve-test-convention`
- `cpt-frontx-state-unit-test-generation-and-agent-verification-guidance-state`

**Touches**:
- Generated files: `package.json`, Vitest config, project testing guidance
- Validation: scaffold convention parsing and normalization

### AI Instructions Enforce Configured Test Command

- [x] `p1` - **ID**: `cpt-frontx-dod-unit-test-generation-and-agent-verification-ai-enforcement`

The system **MUST** generate AI assistant instructions that require agents to run the standard unit-test command when tiered triggers apply (colocated tests or test setup touched, logic-heavy code paths changed, or task/review handoff), and **MUST NOT** imply that `frontx validate components` runs or substitutes for unit tests by default. Instructions **MUST** direct agents to generated project testing guidance that keeps Vitest-specific expectations compact and FrontX-specific.

**Implements**:
- `cpt-frontx-flow-unit-test-generation-and-agent-verification-agent-verify`
- `cpt-frontx-algo-unit-test-generation-and-agent-verification-generate-ai-rules`

**Touches**:
- AI configs: `CLAUDE.md`, Cursor, Windsurf, Copilot
- Project AI guidance: `.ai/project/GUIDELINES.md` or `.ai/project/targets/UNIT_TESTING.md`
- Command templates: validation and generation flows

### _blank-mfe Provides Baseline Unit Tests

- [x] `p1` - **ID**: `cpt-frontx-dod-unit-test-generation-and-agent-verification-blank-mfe-tests`

The system **MUST** provide baseline unit tests in `_blank-mfe` so generated screensets inherit a working unit-test pattern and at least one runnable test path.

That baseline **MUST** stay focused on durable behaviors that should survive templating:
- a mock or API-contract test for the generated status example,
- a simple `HomeScreen` render smoke test that exercises stable bridge- and data-driven rendering,
- optionally one additional stable behavior test when it is clearly user-visible and not template-fragile.

The baseline **MUST NOT** depend on placeholder names, exact package metadata, federation configuration details, or large snapshot assertions of the blank template structure.

Durability contract for generated output: after screenset generation runs `applyMfeReplacements` on baseline test files, **code identifiers** (variable names, class names, import paths) are expected to be replaced — that is normal template transformation. However, the **behavioral assertions** inside those tests must remain pattern-based and durable; they must not become literal post-replacement route strings or other placeholder-derived values. Concretely: if the baseline test uses `key.endsWith('/status')` to locate the mock handler, the generated output must preserve that same pattern — the generator must not introduce a literal `GET /api/<name>/status` assertion. CLI generator tests that validate baseline-derived test files must assert that the durable pattern survives transformation, not check for literal post-replacement route strings. The `applyMfeReplacements` unit tests already cover the replacement pipeline in isolation.

**Implements**:
- `cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests`

**Touches**:
- `_blank-mfe` template files
- Screenset generation outputs

---

## 6. Acceptance Criteria

- [x] `frontx create` scaffolds Vitest by default without a unit-test runner or testing-strategy prompt
- [x] Generated project `package.json` exposes a canonical unit-test command and watch variant
- [x] Generated project `package.json` exposes `test:unit` as the standard unit-test script alias, intended to be run through the configured package manager
- [x] AI sync outputs tell agents to run the standard unit-test command under tiered triggers and that default `frontx validate` is structural, not the unit-test runner
- [x] Generated project AI files include editable default testing guidance for unit tests and Vitest usage
- [x] Generated project testing guidance adapts only the curated Vitest subset needed by FrontX agents instead of copying a full upstream reference
- [x] FrontX generation commands that create new code files also create matching starter unit tests when a stable template exists
- [x] `_blank-mfe` contains baseline unit tests that survive template transformation into generated screensets
- [x] `_blank-mfe` baseline coverage is limited to durable inherited behaviors such as the example mock/API contract and `HomeScreen` smoke rendering, not template-specific scaffolding details
- [x] Generated baseline tests pass on a newly scaffolded default app after dependency installation

## Additional Context

### Known Limitations

- The initial rollout standardizes on Vitest and intentionally omits CLI-level test-library or strategy selection.
- This FEATURE traces to upstream `DECOMPOSITION.md` entry `2.13 Unit Test Generation & Agent Verification` (`cpt-frontx-feature-unit-test-generation-and-agent-verification`).
- The `test:unit` script alias, invoked through the configured package manager, is the canonical automation contract even when adopters customize the generated testing guidance.
- The Vitest standard and `test:unit` contract apply uniformly to runnable monorepo packages that ship unit tests — including `packages/cli`, `packages/state`, and `packages/studio` — to avoid special-case handling in repo-level test scripts and to prevent AI-agent confusion when the generated testing guidance assumes Vitest everywhere. Uniformity refers to the runner choice (Vitest), the script alias (`test:unit`), and base CI flags (`--run --passWithNoTests=false`); individual package configs tailor include globs and environment to their test layout (colocated `src/**/*.test.*` vs. dedicated `__tests__/` directory, `node` vs. `jsdom`) without breaking the shared contract. `packages/docs` is intentionally exempt until the VitePress site ships runnable unit tests.
- Upstream open-source Vitest skills are reference material for generated guidance, not a drop-in source of truth for FrontX-specific agent behavior.
- The curated FrontX Vitest subset is: scaffold command usage, focused test-structure primitives, mocking, environment selection, and targeted filtering.
- Default `frontx validate` (`validate components`) remains a fast structural check; unit tests run via the package-manager invocation of `test:unit` (and CI), with optional future CLI composition behind an explicit subcommand or flag.
