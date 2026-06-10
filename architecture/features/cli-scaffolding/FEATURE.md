# Feature: Two-Namespace Commands & Project/MFE Scaffolding


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Scaffold Project](#scaffold-project)
  - [Scaffold Microfrontend](#scaffold-microfrontend)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Two-Namespace Command Routing](#two-namespace-command-routing)
  - [Project Scaffolding](#project-scaffolding)
  - [Microfrontend Scaffolding](#microfrontend-scaffolding)
- [4. States (CDSL)](#4-states-cdsl)
  - [Scaffold Operation State Machine](#scaffold-operation-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Two-Namespace Command Surface](#two-namespace-command-surface)
  - [Project Scaffolding from Project Namespace](#project-scaffolding-from-project-namespace)
  - [Microfrontend Scaffolding from Microfrontend Namespace](#microfrontend-scaffolding-from-microfrontend-namespace)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-cli-scaffolding`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-cli-scaffolding`

### 1.1 Overview

Organizes the CLI command surface of `@cyberfabric/cli` into a project-level namespace and a microfrontend-level namespace that share one resolver, and drives project and microfrontend scaffolding from those namespaces. The namespace organization is the CLI's public interface (`cpt-frontx-interface-cli`). All CDSL behavior is target (GREENFIELD — grounded in `cpt-frontx-adr-two-namespace-architecture` and DESIGN §3.3).

### 1.2 Purpose

This feature realizes the two-namespace command surface decided in `cpt-frontx-adr-two-namespace-architecture`. It covers the organization of the command surface into project-level and microfrontend-level namespaces, routing of both namespaces through the one shared resolver decided in `cpt-frontx-adr-template-externalization-resolution`, and the scaffolding operations invoked from each namespace. The command surface shape defines `cpt-frontx-interface-cli` and its stability is governed by `cpt-frontx-adr-matched-version-artifact-distribution`.

**Requirements**: `cpt-frontx-fr-cli-two-namespace-commands`, `cpt-frontx-fr-cli-project-scaffold`, `cpt-frontx-fr-cli-microfrontend-scaffold`

**Principles**: (none owned by this feature)

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Invokes project-level or microfrontend-level namespace commands to scaffold a project or microfrontend from an installed template. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**: `cpt-frontx-feature-template-resolution`

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-scaffold-composed-project`

### Scaffold Project

- [ ] `p1` - **ID**: `cpt-frontx-flow-cli-scaffolding-scaffold-project`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer invokes the project-level namespace scaffold command with a valid template reference and a target directory; the CLI scaffolds the project at the target location.

**Error Scenarios**:
- Template reference cannot be resolved from the local template inventory: scaffold is aborted and the developer is notified.
- Target directory already contains conflicting content: scaffold is aborted and the developer is notified.

**Steps**:
1. [ ] - `p1` - Developer invokes the project-level namespace scaffold command with a template reference and a target directory path. - `inst-invoke-project-cmd`
2. [ ] - `p1` - **IF** the template reference resolves to no entry in the local template inventory - `inst-check-template-resolved`
   1. [ ] - `p1` - **RETURN** scaffold aborted — template reference not found in local inventory. - `inst-abort-not-found`
3. [ ] - `p1` - The CLI dispatches the command to the one shared resolver with the template reference and kind `project`. - `inst-dispatch-to-resolver`
4. [ ] - `p1` - The shared resolver locates the installed template entry for the given reference. - `inst-resolver-locate`
5. [ ] - `p1` - **IF** the target directory already exists and contains conflicting content - `inst-check-target-conflict`
   1. [ ] - `p1` - **RETURN** scaffold aborted — target directory conflict detected. - `inst-abort-conflict`
6. [ ] - `p1` - The CLI applies the project scaffolding process to the resolved template entry and the target directory. - `inst-apply-project-scaffold`
7. [ ] - `p1` - **RETURN** scaffold complete — project written to the target directory. - `inst-return-done`

### Scaffold Microfrontend

- [ ] `p1` - **ID**: `cpt-frontx-flow-cli-scaffolding-scaffold-mfe`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer invokes the microfrontend-level namespace scaffold command with a valid template reference and a target directory; the CLI scaffolds the microfrontend at the target location.

**Error Scenarios**:
- Template reference cannot be resolved from the local template inventory: scaffold is aborted and the developer is notified.
- Target directory already contains conflicting content: scaffold is aborted and the developer is notified.

**Steps**:
1. [ ] - `p1` - Developer invokes the microfrontend-level namespace scaffold command with a template reference and a target directory path. - `inst-invoke-mfe-cmd`
2. [ ] - `p1` - **IF** the template reference resolves to no entry in the local template inventory - `inst-check-template-resolved`
   1. [ ] - `p1` - **RETURN** scaffold aborted — template reference not found in local inventory. - `inst-abort-not-found`
3. [ ] - `p1` - The CLI dispatches the command to the one shared resolver with the template reference and kind `microfrontend`. - `inst-dispatch-to-resolver`
4. [ ] - `p1` - The shared resolver locates the installed template entry for the given reference. - `inst-resolver-locate`
5. [ ] - `p1` - **IF** the target directory already exists and contains conflicting content - `inst-check-target-conflict`
   1. [ ] - `p1` - **RETURN** scaffold aborted — target directory conflict detected. - `inst-abort-conflict`
6. [ ] - `p1` - The CLI applies the microfrontend scaffolding process to the resolved template entry and the target directory. - `inst-apply-mfe-scaffold`
7. [ ] - `p1` - **RETURN** scaffold complete — microfrontend written to the target directory. - `inst-return-done`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures called by actor flows above.

### Two-Namespace Command Routing

- [ ] `p1` - **ID**: `cpt-frontx-algo-cli-scaffolding-namespace-routing`

**Input**: A command invocation carrying a namespace label (`project` or `microfrontend`), a command name, and command arguments.

**Output**: The result produced by the one shared resolver for the identified namespace and command, or a routing failure reason.

**Steps**:
1. [ ] - `p1` - Receive the command invocation and extract its namespace label, command name, and arguments. - `inst-receive-invocation`
2. [ ] - `p1` - **MATCH** namespace label - `inst-match-namespace`
   - [ ] - `p1` - **CASE** `project`: associate the command with the project-level namespace. - `inst-case-project`
   - [ ] - `p1` - **CASE** `microfrontend`: associate the command with the microfrontend-level namespace. - `inst-case-mfe`
   - [ ] - `p1` - **DEFAULT**: **RETURN** command routing failed — unrecognized namespace label. - `inst-default-unknown`
3. [ ] - `p1` - Verify the command name is registered within the resolved namespace. - `inst-verify-command`
4. [ ] - `p1` - **IF** the command name is not registered in the namespace - `inst-check-registered`
   1. [ ] - `p1` - **RETURN** command routing failed — command not found in namespace. - `inst-abort-not-found`
5. [ ] - `p1` - Forward the command arguments to the one shared resolver together with the resolved namespace and command name. - `inst-forward-to-shared-resolver`
6. [ ] - `p1` - **RETURN** the result produced by the shared resolver. - `inst-return-result`

### Project Scaffolding

- [ ] `p1` - **ID**: `cpt-frontx-algo-cli-scaffolding-project-scaffold`

**Input**: A resolved project template entry (identity, version, installed content path) and a target directory path.

**Output**: Scaffold outcome — content items written to the target directory, or aborted with reason.

**Steps**:
1. [ ] - `p1` - Receive the resolved template entry and the target directory path. - `inst-receive-entry`
2. [ ] - `p1` - Read the template manifest from the resolved template entry. - `inst-read-manifest`
3. [ ] - `p1` - Validate that the template manifest declares kind `project`. - `inst-validate-kind`
4. [ ] - `p1` - **IF** the manifest declared kind is not `project` - `inst-check-kind`
   1. [ ] - `p1` - **RETURN** scaffold aborted — template kind mismatch for project scaffolding. - `inst-abort-kind-mismatch`
5. [ ] - `p1` - Enumerate the content items declared in the template manifest. - `inst-enumerate-items`
6. [ ] - `p1` - **FOR EACH** content item in the template - `inst-foreach-item`
   - [ ] - `p1` - Resolve the item's destination path relative to the target directory. - `inst-resolve-dest`
   - [ ] - `p1` - Write the item to its destination path. - `inst-write-item`
7. [ ] - `p1` - **RETURN** scaffold complete — all project content items written to the target directory. - `inst-return-complete`

### Microfrontend Scaffolding

- [ ] `p1` - **ID**: `cpt-frontx-algo-cli-scaffolding-mfe-scaffold`

**Input**: A resolved microfrontend template entry (identity, version, installed content path) and a target directory path.

**Output**: Scaffold outcome — content items written to the target directory, or aborted with reason.

**Steps**:
1. [ ] - `p1` - Receive the resolved template entry and the target directory path. - `inst-receive-entry`
2. [ ] - `p1` - Read the template manifest from the resolved template entry. - `inst-read-manifest`
3. [ ] - `p1` - Validate that the template manifest declares kind `microfrontend`. - `inst-validate-kind`
4. [ ] - `p1` - **IF** the manifest declared kind is not `microfrontend` - `inst-check-kind`
   1. [ ] - `p1` - **RETURN** scaffold aborted — template kind mismatch for microfrontend scaffolding. - `inst-abort-kind-mismatch`
5. [ ] - `p1` - Enumerate the content items declared in the template manifest. - `inst-enumerate-items`
6. [ ] - `p1` - **FOR EACH** content item in the template - `inst-foreach-item`
   - [ ] - `p1` - Resolve the item's destination path relative to the target directory. - `inst-resolve-dest`
   - [ ] - `p1` - Write the item to its destination path. - `inst-write-item`
7. [ ] - `p1` - **RETURN** scaffold complete — all microfrontend content items written to the target directory. - `inst-return-complete`

## 4. States (CDSL)

### Scaffold Operation State Machine

- [ ] `p2` - **ID**: `cpt-frontx-state-cli-scaffolding-scaffold-op`

**States**: REQUESTED, RESOLVED, SCAFFOLDED, ABORTED

**Initial State**: REQUESTED

**Transitions**:
1. [ ] - `p1` - **FROM** REQUESTED **TO** RESOLVED **WHEN** the shared resolver successfully locates the installed template entry for the given reference. - `inst-transition-req-resolved`
2. [ ] - `p1` - **FROM** REQUESTED **TO** ABORTED **WHEN** the template reference cannot be resolved from the local template inventory. - `inst-transition-req-aborted-unresolved`
3. [ ] - `p1` - **FROM** RESOLVED **TO** SCAFFOLDED **WHEN** the scaffolding process writes all template content items to the target directory without conflict. - `inst-transition-resolved-scaffolded`
4. [ ] - `p1` - **FROM** RESOLVED **TO** ABORTED **WHEN** a target directory conflict or a template kind mismatch is detected during scaffolding. - `inst-transition-resolved-aborted`

## 5. Definitions of Done

### Two-Namespace Command Surface

- [ ] `p1` - **ID**: `cpt-frontx-dod-cli-scaffolding-namespace-surface`

The system **MUST** expose a project-level namespace and a microfrontend-level namespace as the two first-class command namespaces of `@cyberfabric/cli`, with both namespaces routing through the one shared resolver and no second resolution path existing.

**Implements**:
- `cpt-frontx-flow-cli-scaffolding-scaffold-project`
- `cpt-frontx-flow-cli-scaffolding-scaffold-mfe`
- `cpt-frontx-algo-cli-scaffolding-namespace-routing`

**Constraints**: (none owned by this feature)

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`
- Entities: `Template`

### Project Scaffolding from Project Namespace

- [ ] `p1` - **ID**: `cpt-frontx-dod-cli-scaffolding-project-scaffold`

The system **MUST** scaffold a project from a resolved project template when the developer invokes the project-level namespace scaffold command with a valid template reference and a non-conflicting target directory.

**Implements**:
- `cpt-frontx-flow-cli-scaffolding-scaffold-project`
- `cpt-frontx-algo-cli-scaffolding-project-scaffold`

**Constraints**: (none owned by this feature)

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`
- Entities: `Template`

### Microfrontend Scaffolding from Microfrontend Namespace

- [ ] `p1` - **ID**: `cpt-frontx-dod-cli-scaffolding-mfe-scaffold`

The system **MUST** scaffold a microfrontend from a resolved microfrontend template when the developer invokes the microfrontend-level namespace scaffold command with a valid template reference and a non-conflicting target directory.

**Implements**:
- `cpt-frontx-flow-cli-scaffolding-scaffold-mfe`
- `cpt-frontx-algo-cli-scaffolding-mfe-scaffold`

**Constraints**: (none owned by this feature)

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`
- Entities: `Template`

## 6. Acceptance Criteria

- [ ] `architecture/features/cli-scaffolding/FEATURE.md` exists with all template sections in order.
- [ ] The CLI command surface exposes a project-level namespace and a microfrontend-level namespace as the two first-class namespaces of `@cyberfabric/cli`. (`target`)
- [ ] Both namespaces route through the one shared resolver; no second resolver path exists. (`target`)
- [ ] A developer can scaffold a project by invoking the project-level namespace scaffold command with a valid template reference and target directory. (`target`)
- [ ] A developer can scaffold a microfrontend by invoking the microfrontend-level namespace scaffold command with a valid template reference and target directory. (`target`)
- [ ] Scaffold is aborted with notification when the template reference cannot be resolved from the local inventory. (`target`)
- [ ] Scaffold is aborted with notification when the target directory contains conflicting content. (`target`)
- [ ] The namespace boundary is part of `cpt-frontx-interface-cli`; an incompatible change to the surface requires a major version bump per `cpt-frontx-adr-matched-version-artifact-distribution`. (`target`)
