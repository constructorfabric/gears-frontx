# Feature: CLI Executable Invocation Surface

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Run a CLI Command](#run-a-cli-command)
  - [Show Usage or Handle an Unrecognized Command](#show-usage-or-handle-an-unrecognized-command)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Parse Invocation and Dispatch](#parse-invocation-and-dispatch)
- [4. States (CDSL)](#4-states-cdsl)
  - [Invocation Run State Machine](#invocation-run-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Executable Entrypoint Dispatches Every Command](#executable-entrypoint-dispatches-every-command)
  - [Usage and Help Output](#usage-and-help-output)
  - [Exit-Code Convention](#exit-code-convention)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-cli-invocation`
## 1. Feature Context

- [x] `p1` - `cpt-frontx-feature-cli-invocation`

### 1.1 Overview

`@gears-frontx/cli` is invoked as an executable command surface: a single `frontx` executable entrypoint parses the process invocation, selects the named command from `frontx <command> [args]`, and dispatches it to the one internal component that owns that lifecycle capability — the same command surface the package-level anchor `cpt-frontx-component-cli` owns and delegates from (`cpt-frontx-adr-cli-internal-decomposition`). This feature owns only the entrypoint behavior — argv parsing, command selection, dispatch to the owning behavior by ID, usage/help output, and the success / user-error / internal-error exit-code convention — and redefines none of the command behaviors it dispatches to; each is owned by its own feature and referenced here by canonical ID. All CDSL behavior is `target` (GREENFIELD — grounded in `cpt-frontx-adr-cli-internal-decomposition`, `cpt-frontx-adr-uniform-template-mechanism`, and DESIGN §3.3).

### 1.2 Purpose

This feature closes the gap between the declared `frontx` executable and the library command behaviors: it specifies the runnable entrypoint that turns a shell invocation into a dispatched command, so a Project Developer (or an AI agent acting for them) can run `frontx <command>` and reach the owning behavior. It realizes the command-surface responsibility the anchor `cpt-frontx-component-cli` holds under `cpt-frontx-adr-cli-internal-decomposition` — owning the surface and dispatching each command to one internal component — and dispatches over the single uniform mechanism decided in `cpt-frontx-adr-uniform-template-mechanism`. The command surface it exposes is `cpt-frontx-interface-cli`; its stability is governed by `cpt-frontx-adr-artifact-versioning-and-distribution`. The behaviors reached by dispatch — template install / list / update (`cpt-frontx-feature-template-resolution`), pre-publish validate (`cpt-frontx-feature-template-manifest`), seed a repository and add a template (`cpt-frontx-feature-cli-scaffolding`), preset resolution and per-applied-template provenance (`cpt-frontx-feature-composed-provenance`), and per-applied-template upgrade (`cpt-frontx-feature-upgrade-changeset`) — are owned by those features and are not redefined here.

**Requirements**: N/A — the CLI functional requirements are owned by the dispatched command features (F10–F14) and are exposed transitively by this invocation surface, not owned or covered here. The command-to-behavior dispatch targets are referenced by canonical ID in §1.2 Purpose and in the flows/algorithm below for dispatch-surface context only.

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Runs the `frontx` executable with a command and arguments to drive a template or repository lifecycle operation, reads usage/help when the invocation is incomplete or unrecognized, and observes the exit code. |

### 1.4 References

- **PRD**: [PRD.md](../../../../../architecture/PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR**: `cpt-frontx-adr-cli-internal-decomposition`, `cpt-frontx-adr-uniform-template-mechanism`, `cpt-frontx-adr-artifact-versioning-and-distribution`
- **Dependencies**: `cpt-frontx-feature-template-resolution`, `cpt-frontx-feature-template-manifest`, `cpt-frontx-feature-cli-scaffolding`, `cpt-frontx-feature-composed-provenance`, `cpt-frontx-feature-upgrade-changeset`

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-scaffold-composed-project`

### Run a CLI Command

- [x] `p1` - **ID**: `cpt-frontx-flow-cli-invocation-run-command`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer runs the `frontx` executable with a recognized command and its arguments; the entrypoint parses the invocation, dispatches to the internal component that owns that command's behavior, and exits with the success code once the behavior completes.

**Error Scenarios**:
- The dispatched behavior reports a user/input error (for example an unresolvable template reference or a refused conflicting assembly): the entrypoint surfaces the behavior's report and exits with the user-error code.
- The dispatched behavior fails unexpectedly: the entrypoint surfaces a failure and exits with the internal-error code.

**Steps**:
1. [x] - `p1` - Developer runs the `frontx` executable with a command token and its arguments. - `inst-run-invoke`
2. [x] - `p1` - The entrypoint parses the invocation and selects the named command (`cpt-frontx-algo-cli-invocation-parse-dispatch`). - `inst-run-parse`
3. [x] - `p1` - **IF** the invocation names no recognized command or requests help - `inst-run-if-no-command`
   1. [x] - `p1` - **RETURN** usage output is produced through `cpt-frontx-flow-cli-invocation-help`; the run-command flow does not dispatch. - `inst-run-defer-help`
4. [x] - `p1` - The entrypoint dispatches the selected command to the internal component that owns its behavior, referenced by ID and not redefined here — install to `cpt-frontx-flow-template-resolution-install`, list to `cpt-frontx-flow-template-resolution-list`, update-local to `cpt-frontx-flow-template-resolution-update-local`, pre-publish validate to `cpt-frontx-flow-template-manifest-validate-for-publication`, seed to `cpt-frontx-flow-cli-scaffolding-seed-repository`, add to `cpt-frontx-flow-cli-scaffolding-add-template`, upgrade to `cpt-frontx-flow-upgrade-changeset-review-approval`, and preset resolution and provenance to `cpt-frontx-feature-composed-provenance` (referenced at feature level because the whole feature realizes the composed-scaffold behavior with no distinct per-command flow). - `inst-run-dispatch`
5. [x] - `p1` - The entrypoint maps the dispatched behavior's outcome to an exit code — success, user error, or internal error. - `inst-run-map-exit`
6. [x] - `p1` - **RETURN** the process exits with the mapped exit code after the dispatched behavior completes or reports its outcome. - `inst-run-return`

### Show Usage or Handle an Unrecognized Command

- [x] `p1` - **ID**: `cpt-frontx-flow-cli-invocation-help`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer runs the executable with no command or an explicit help request; the entrypoint prints the usage summary of the available commands and exits with the success code.

**Error Scenarios**:
- Developer runs the executable with a command token that matches no known command: the entrypoint prints usage and exits with the user-error code.

**Steps**:
1. [x] - `p1` - Developer runs the executable with no command, an explicit help request, or an unrecognized command token. - `inst-help-invoke`
2. [x] - `p1` - The entrypoint produces the usage summary listing the available commands (`cpt-frontx-algo-cli-invocation-parse-dispatch`). - `inst-help-usage`
3. [x] - `p1` - **IF** the invocation was an unrecognized command token - `inst-help-if-unrecognized`
   1. [x] - `p1` - **RETURN** usage is emitted and the process exits with the user-error code. - `inst-help-return-user-error`
4. [x] - `p1` - **RETURN** for no command or an explicit help request, usage is emitted and the process exits with the success code. - `inst-help-return-success`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures called by actor flows above.

### Parse Invocation and Dispatch

- [x] `p1` - **ID**: `cpt-frontx-algo-cli-invocation-parse-dispatch`

**Input**: The process invocation arguments passed to the `frontx` executable.

**Output**: The exit code the process returns, after either dispatching to the owning command behavior or producing usage output.

**Steps**:
1. [x] - `p1` - Receive the process invocation arguments. - `inst-pd-receive`
2. [x] - `p1` - Parse the arguments into a leading command token and the remaining arguments for that command. - `inst-pd-parse`
3. [x] - `p1` - **IF** no command token is present or an explicit help request is present - `inst-pd-if-help`
   1. [x] - `p1` - Produce the usage summary of the available commands and **RETURN** the success exit code. - `inst-pd-return-help`
4. [x] - `p1` - **IF** the command token matches no known command - `inst-pd-if-unknown`
   1. [x] - `p1` - Produce the usage summary and **RETURN** the user-error exit code. - `inst-pd-return-unknown`
5. [x] - `p1` - Select the internal component that owns the named command's behavior and dispatch the remaining arguments to it — the command-to-behavior mapping references each behavior by ID (install `cpt-frontx-flow-template-resolution-install`, list `cpt-frontx-flow-template-resolution-list`, update-local `cpt-frontx-flow-template-resolution-update-local`, pre-publish validate `cpt-frontx-flow-template-manifest-validate-for-publication`, seed `cpt-frontx-flow-cli-scaffolding-seed-repository`, add `cpt-frontx-flow-cli-scaffolding-add-template`, upgrade `cpt-frontx-flow-upgrade-changeset-review-approval`, and preset resolution and provenance `cpt-frontx-feature-composed-provenance` at feature level with no distinct per-command flow) and adds no second dispatch path. - `inst-pd-dispatch`
6. [x] - `p1` - Map the dispatched behavior's outcome to an exit code: success when it completes, user error when it reports a user/input failure, internal error when it fails unexpectedly. - `inst-pd-map-outcome`
7. [x] - `p1` - **RETURN** the mapped exit code. - `inst-pd-return-exit`

## 4. States (CDSL)

### Invocation Run State Machine

- [x] `p2` - **ID**: `cpt-frontx-state-cli-invocation-run`

**States**: REQUESTED, PARSED, DISPATCHED, SUCCEEDED, USER_ERROR, INTERNAL_ERROR

**Initial State**: REQUESTED

**Transitions**:
1. [x] - `p1` - **FROM** REQUESTED **TO** PARSED **WHEN** the invocation arguments parse to a recognized command token and its arguments. - `inst-st-req-parsed`
2. [x] - `p1` - **FROM** REQUESTED **TO** SUCCEEDED **WHEN** no command is present or an explicit help request is present and usage is emitted. - `inst-st-req-help-success`
3. [x] - `p1` - **FROM** REQUESTED **TO** USER_ERROR **WHEN** the command token matches no known command and usage is emitted. - `inst-st-req-unknown`
4. [x] - `p1` - **FROM** PARSED **TO** DISPATCHED **WHEN** the selected command is dispatched to the internal component that owns its behavior. - `inst-st-parsed-dispatched`
5. [x] - `p1` - **FROM** DISPATCHED **TO** SUCCEEDED **WHEN** the dispatched behavior completes and the outcome maps to the success exit code. - `inst-st-dispatched-success`
6. [x] - `p1` - **FROM** DISPATCHED **TO** USER_ERROR **WHEN** the dispatched behavior reports a user/input failure and the outcome maps to the user-error exit code. - `inst-st-dispatched-user-error`
7. [x] - `p1` - **FROM** DISPATCHED **TO** INTERNAL_ERROR **WHEN** the dispatched behavior fails unexpectedly and the outcome maps to the internal-error exit code. - `inst-st-dispatched-internal-error`

## 5. Definitions of Done

### Executable Entrypoint Dispatches Every Command

- [x] `p1` - **ID**: `cpt-frontx-dod-cli-invocation-executable-entrypoint`

The system **MUST** provide a single `frontx` executable entrypoint that parses the process invocation and dispatches `frontx <command> [args]` to the one internal component that owns that command's behavior — referenced by ID and not redefined — across the full command surface (template install / list / update, pre-publish validate, seed, add, preset resolution and provenance, and upgrade), adding no second dispatch path (`target`).

**Implements**:
- `cpt-frontx-flow-cli-invocation-run-command`
- `cpt-frontx-algo-cli-invocation-parse-dispatch`
- `cpt-frontx-state-cli-invocation-run`

**Constraints**: (none owned by this feature)

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`

### Usage and Help Output

- [x] `p1` - **ID**: `cpt-frontx-dod-cli-invocation-usage-help`

The system **MUST** emit a usage summary of the available commands when the executable is run with no command, with an explicit help request, or with an unrecognized command token, dispatching no command in those cases (`target`).

**Implements**:
- `cpt-frontx-flow-cli-invocation-help`
- `cpt-frontx-algo-cli-invocation-parse-dispatch`

**Constraints**: (none owned by this feature)

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`

### Exit-Code Convention

- [x] `p1` - **ID**: `cpt-frontx-dod-cli-invocation-exit-codes`

The system **MUST** return a distinct process exit code for each outcome class — success, user error, and internal error — applied consistently across every dispatched command and across the usage/help paths (`target`).

**Implements**:
- `cpt-frontx-flow-cli-invocation-run-command`
- `cpt-frontx-algo-cli-invocation-parse-dispatch`
- `cpt-frontx-state-cli-invocation-run`

**Constraints**: (none owned by this feature)

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`

## 6. Acceptance Criteria

- [x] `architecture/features/cli-invocation/FEATURE.md` exists with all template sections in order.
- [x] Running the `frontx` executable with a recognized command dispatches to the internal component that owns that command's behavior through a single dispatch path. (`target`)
- [x] Running the executable with no command or an explicit help request emits the usage summary and exits with the success code. (`target`)
- [x] Running the executable with an unrecognized command token emits usage and exits with the user-error code. (`target`)
- [x] A dispatched behavior's user/input failure exits with the user-error code and an unexpected failure exits with the internal-error code. (`target`)
- [x] No command behavior is redefined in this feature; each dispatched behavior is referenced by its canonical ID. (`target`)
- [x] The command surface is part of `cpt-frontx-interface-cli`; an incompatible change to it requires a major version bump per `cpt-frontx-adr-artifact-versioning-and-distribution`. (`target`)
