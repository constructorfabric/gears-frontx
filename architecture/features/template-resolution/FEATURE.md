# Feature: Template Externalization & Source-Spec Resolution


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Install Template by Versioned Source-Spec](#install-template-by-versioned-source-spec)
  - [List Local Template Inventory](#list-local-template-inventory)
  - [Update Installed Template in Local Inventory](#update-installed-template-in-local-inventory)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Source-Spec Parse and Validate](#source-spec-parse-and-validate)
  - [Resolve Source-Spec to Tracked Local Inventory](#resolve-source-spec-to-tracked-local-inventory)
  - [Bounded Local Inventory Update](#bounded-local-inventory-update)
- [4. States (CDSL)](#4-states-cdsl)
  - [Inventory Template State Machine](#inventory-template-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [CLI Installs Template by Versioned Source-Spec](#cli-installs-template-by-versioned-source-spec)
  - [CLI Lists Local Template Inventory](#cli-lists-local-template-inventory)
  - [CLI Updates Local Inventory Entry Without Touching Scaffolded Projects](#cli-updates-local-inventory-entry-without-touching-scaffolded-projects)
  - [Source-Spec Parser Rejects Invalid References](#source-spec-parser-rejects-invalid-references)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-template-resolution`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-template-resolution`

### 1.1 Overview

The CLI (`@gears-frontx/cli`) bundles no template and resolves each template from an external source by versioned source-spec (`host:owner/repo@ref`) at runtime into a tracked local inventory, providing install, list, and bounded local update operations that never disturb already-scaffolded projects.

### 1.2 Purpose

This feature ensures the CLI command surface is fully decoupled from the content it scaffolds: templates are acquired by versioned reference at runtime, stored in a tracked local inventory, and updatable locally without affecting any scaffolded project. This realizes the CLI-1 design constraint and the template-agnostic-tooling principle.

**Requirements**: `cpt-frontx-fr-cli-template-install`, `cpt-frontx-fr-cli-template-list`, `cpt-frontx-fr-cli-template-update-local`

**Principles**: `cpt-frontx-principle-template-agnostic-tooling`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Installs, lists, and locally updates templates to maintain a reproducible local inventory for scaffolding |
| `cpt-frontx-actor-github` | Hosts versioned template repositories fetched by the CLI at install and update time via source-spec |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**: None

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor (human or external system) and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-scaffold-composed-project`

### Install Template by Versioned Source-Spec

- [ ] `p1` - **ID**: `cpt-frontx-flow-template-resolution-install`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer installs a template and it is added to the local inventory at the pinned version

**Error Scenarios**:
- Source registry is unreachable; install fails with an error before any inventory write
- Source-spec is missing the `host:` prefix or the `@ref` selector; rejected before any fetch

**Steps**:
1. [ ] - `p1` - Developer invokes the CLI install command with a versioned source-spec (`host:owner/repo@ref`) - `inst-install-invoke`
2. [ ] - `p1` - CLI forwards the source-spec string to the source-spec parser - `inst-install-parse`
3. [ ] - `p1` - **IF** the parser returns a parse error (missing `host:` prefix or missing `@ref` selector): - `inst-install-parse-check`
   1. [ ] - `p1` - **RETURN** parse error to developer; abort install with no inventory write - `inst-install-parse-reject`
4. [ ] - `p1` - CLI forwards the parsed structured reference to the shared resolver - `inst-install-resolve`
5. [ ] - `p1` - Shared resolver attempts to fetch template content from the source registry (`cpt-frontx-actor-github`) at the resolved ref - `inst-install-fetch`
6. [ ] - `p1` - **IF** the source registry is unreachable or returns an error: - `inst-install-reach-check`
   1. [ ] - `p1` - **RETURN** connectivity error to developer; abort install with no inventory write - `inst-install-reach-fail`
7. [ ] - `p1` - CLI materializes the fetched content into the tracked local inventory under the derived name and pinned version - `inst-install-materialize`
8. [ ] - `p1` - **RETURN** install success with the installed name and pinned version to developer - `inst-install-success`

### List Local Template Inventory

- [ ] `p1` - **ID**: `cpt-frontx-flow-template-resolution-list`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer sees all templates installed in the local inventory with their pinned versions

**Error Scenarios**:
- Local inventory is empty; CLI reports an empty inventory with no error

**Steps**:
1. [ ] - `p1` - Developer invokes the CLI list command - `inst-list-invoke`
2. [ ] - `p1` - CLI reads the tracked local inventory index - `inst-list-read`
3. [ ] - `p1` - **IF** the inventory index contains no entries: - `inst-list-empty-check`
   1. [ ] - `p1` - **RETURN** empty inventory message to developer - `inst-list-empty-return`
4. [ ] - `p1` - CLI formats each inventory entry as name and pinned version - `inst-list-format`
5. [ ] - `p1` - **RETURN** formatted inventory listing to developer - `inst-list-return`

### Update Installed Template in Local Inventory

- [ ] `p1` - **ID**: `cpt-frontx-flow-template-resolution-update-local`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer updates a specific inventory entry to a newer version; no scaffolded project path is modified

**Error Scenarios**:
- Named template is not found in local inventory; CLI reports the error and makes no changes
- Source registry is unreachable; CLI reports the error and leaves the existing inventory entry unchanged

**Steps**:
1. [ ] - `p1` - Developer invokes the CLI update-local command with the template name and a new versioned source-spec - `inst-update-invoke`
2. [ ] - `p1` - CLI looks up the named entry in the tracked local inventory index - `inst-update-lookup`
3. [ ] - `p1` - **IF** the named entry is absent from the local inventory: - `inst-update-notfound-check`
   1. [ ] - `p1` - **RETURN** not-found error to developer; abort update with no inventory write - `inst-update-notfound`
4. [ ] - `p1` - CLI forwards the new source-spec to the source-spec parser - `inst-update-parse`
5. [ ] - `p1` - **IF** the parser returns a parse error: - `inst-update-parse-check`
   1. [ ] - `p1` - **RETURN** parse error to developer; abort update with no inventory write - `inst-update-parse-reject`
6. [ ] - `p1` - CLI forwards the parsed reference to the shared resolver and fetches the updated content from the source registry - `inst-update-fetch`
7. [ ] - `p1` - **IF** the source registry is unreachable or returns an error: - `inst-update-reach-check`
   1. [ ] - `p1` - **RETURN** connectivity error to developer; leave the existing inventory entry unchanged - `inst-update-reach-fail`
8. [ ] - `p1` - CLI replaces the inventory store entry for the named template with the fetched content at the new pinned version - `inst-update-write`
9. [ ] - `p1` - **RETURN** update success with the template name and new pinned version to developer - `inst-update-success`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. These are reusable building blocks called by Actor Flows or other processes.

### Source-Spec Parse and Validate

- [ ] `p2` - **ID**: `cpt-frontx-algo-template-resolution-parse-spec`

**Input**: A raw source-spec string supplied by the developer

**Output**: A structured reference (host, owner, repo, ref) or a parse error

**Steps**:
1. [ ] - `p1` - Check that the input string contains a `:` separator - `inst-parse-prefix-check`
2. [ ] - `p1` - **IF** no `:` separator is present: - `inst-parse-no-prefix`
   1. [ ] - `p1` - **RETURN** parse error: missing `host:` prefix; acquisition cannot proceed without an explicit host - `inst-parse-no-prefix-fail`
3. [ ] - `p1` - Extract the host token as the substring before the first `:` - `inst-parse-extract-host`
4. [ ] - `p1` - Check that the remainder after `:` contains an `@` separator - `inst-parse-at-check`
5. [ ] - `p1` - **IF** no `@` separator is present: - `inst-parse-no-at`
   1. [ ] - `p1` - **RETURN** parse error: missing `@ref` version selector; acquisition cannot proceed without an explicit version pin - `inst-parse-no-at-fail`
6. [ ] - `p1` - Extract the `owner/repo` path as the substring between `:` and `@` - `inst-parse-extract-repo`
7. [ ] - `p1` - Extract the ref selector as the substring after `@` - `inst-parse-extract-ref`
8. [ ] - `p1` - **RETURN** structured reference containing host, owner, repo, and ref - `inst-parse-return`

### Resolve Source-Spec to Tracked Local Inventory

- [ ] `p2` - **ID**: `cpt-frontx-algo-template-resolution-resolve-to-inventory`

**Input**: A validated structured reference (host, owner, repo, ref)

**Output**: A materialized inventory entry (name, resolved content path, pinned version) or a resolution error

**Steps**:
1. [ ] - `p1` - Derive the template name from the owner/repo path - `inst-resolve-name`
2. [ ] - `p1` - Construct the fetch address for the source registry (`cpt-frontx-actor-github`) from the structured reference - `inst-resolve-addr`
3. [ ] - `p1` - Fetch the template content from the source registry at the given ref - `inst-resolve-fetch`
4. [ ] - `p1` - **IF** the fetch fails: - `inst-resolve-fetch-fail-check`
   1. [ ] - `p1` - **RETURN** resolution error; do not write to local inventory - `inst-resolve-fetch-fail`
5. [ ] - `p1` - Write the fetched content into the local inventory store under the derived name - `inst-resolve-write`
6. [ ] - `p1` - Record the installed name and pinned ref in the inventory index - `inst-resolve-index`
7. [ ] - `p1` - **RETURN** inventory entry containing name, content path, and pinned version - `inst-resolve-return`

### Bounded Local Inventory Update

- [ ] `p2` - **ID**: `cpt-frontx-algo-template-resolution-bounded-update`

**Input**: Template name and a validated structured reference for the new version

**Output**: An updated inventory entry (name, new pinned version) or an update error; scaffolded projects are not touched

**Steps**:
1. [ ] - `p1` - Look up the named entry in the inventory index - `inst-bupd-lookup`
2. [ ] - `p1` - **IF** the named entry is absent: - `inst-bupd-absent-check`
   1. [ ] - `p1` - **RETURN** not-found error; abort with no inventory write - `inst-bupd-absent-fail`
3. [ ] - `p1` - Fetch the new template content from the source registry at the new ref using the shared resolver - `inst-bupd-fetch`
4. [ ] - `p1` - **IF** the fetch fails: - `inst-bupd-fetch-fail-check`
   1. [ ] - `p1` - **RETURN** fetch error; leave the existing inventory entry unchanged - `inst-bupd-fetch-fail`
5. [ ] - `p1` - Replace the inventory store entry for the named template with the newly fetched content - `inst-bupd-replace`
6. [ ] - `p1` - Update the inventory index to record the new pinned ref for the named entry - `inst-bupd-index-update`
7. [ ] - `p1` - Confirm that no paths outside the local inventory store were written during this operation - `inst-bupd-boundary-confirm`
8. [ ] - `p1` - **RETURN** updated inventory entry containing name and new pinned version - `inst-bupd-return`

## 4. States (CDSL)

Include when entities have explicit lifecycle states.

### Inventory Template State Machine

- [ ] `p2` - **ID**: `cpt-frontx-state-template-resolution-inventory-lifecycle`

**States**: UNRESOLVED, RESOLVED, INSTALLED, UPDATED

**Initial State**: UNRESOLVED

**Transitions**:
1. [ ] - `p1` - **FROM** UNRESOLVED **TO** RESOLVED **WHEN** the source-spec is successfully parsed and the source registry returns the template content for the given ref - `inst-state-to-resolved`
2. [ ] - `p1` - **FROM** RESOLVED **TO** INSTALLED **WHEN** the fetched content is materialized into the local inventory store and the inventory index is updated with the pinned version - `inst-state-to-installed`
3. [ ] - `p1` - **FROM** INSTALLED **TO** UPDATED **WHEN** a bounded local update fetches new content for the named inventory entry, replaces it in the inventory store, and updates the index without touching any scaffolded project - `inst-state-to-updated`
4. [ ] - `p1` - **FROM** UNRESOLVED **TO** UNRESOLVED **WHEN** source-spec parse validation fails (missing `host:` prefix or `@ref` selector) and the inventory is not written - `inst-state-parse-fail-loop`
5. [ ] - `p1` - **FROM** RESOLVED **TO** UNRESOLVED **WHEN** the source registry fetch fails after a successful parse and the inventory is not written - `inst-state-fetch-fail-loop`

## 5. Definitions of Done

Specific implementation tasks derived from flows/algorithms above.

### CLI Installs Template by Versioned Source-Spec

- [ ] `p1` - **ID**: `cpt-frontx-dod-template-resolution-install-by-spec`

The system **MUST** install a template into the local inventory by resolving a developer-supplied `host:owner/repo@ref` source-spec through the shared resolver, materialize the fetched content into the tracked inventory store, and record the pinned version — with zero template content bundled in the CLI distribution.

**Implements**:
- `cpt-frontx-flow-template-resolution-install`
- `cpt-frontx-algo-template-resolution-parse-spec`
- `cpt-frontx-algo-template-resolution-resolve-to-inventory`

**Constraints**: `cpt-frontx-constraint-cli-template-independence`

**Touches**:
- Entities: `Template`

### CLI Lists Local Template Inventory

- [ ] `p1` - **ID**: `cpt-frontx-dod-template-resolution-list-inventory`

The system **MUST** enumerate all entries in the tracked local inventory and report each installed template name with its pinned version when the developer invokes the list command.

**Implements**:
- `cpt-frontx-flow-template-resolution-list`

**Constraints**: `cpt-frontx-constraint-cli-template-independence`

**Touches**:
- Entities: `Template`

### CLI Updates Local Inventory Entry Without Touching Scaffolded Projects

- [ ] `p1` - **ID**: `cpt-frontx-dod-template-resolution-bounded-local-update`

The system **MUST** replace a named inventory entry with the newly fetched content at the new pinned version, writing exclusively within the local inventory store and leaving every scaffolded project path unchanged.

**Implements**:
- `cpt-frontx-flow-template-resolution-update-local`
- `cpt-frontx-algo-template-resolution-bounded-update`

**Constraints**: `cpt-frontx-constraint-cli-template-independence`

**Touches**:
- Entities: `Template`

### Source-Spec Parser Rejects Invalid References

- [ ] `p1` - **ID**: `cpt-frontx-dod-template-resolution-spec-parser-rejection`

The system **MUST** reject any source-spec that omits the `host:` prefix or the `@ref` version selector before any fetch or inventory write is attempted, and MUST round-trip a valid `host:owner/repo@ref` reference into its four constituent parts (host, owner, repo, ref).

**Implements**:
- `cpt-frontx-algo-template-resolution-parse-spec`

**Constraints**: `cpt-frontx-constraint-cli-template-independence`

**Touches**:
- Entities: `Template`

## 6. Acceptance Criteria

- [ ] CLI install command resolves a valid `host:owner/repo@ref` source-spec, fetches from the source registry, and writes the result to the local inventory at the pinned version
- [ ] CLI install command with a source-spec missing the `host:` prefix or the `@ref` selector fails with a parse error before any fetch or inventory write
- [ ] CLI list command returns all installed templates and their pinned versions from the local inventory
- [ ] CLI list command reports an empty inventory when no templates are installed
- [ ] CLI update-local command replaces the named inventory entry with newly fetched content at the new pinned version, leaving every scaffolded project path unmodified
- [ ] CLI update-local command reports a not-found error when the named template is absent from the local inventory
- [ ] No template content is bundled in the CLI distribution (zero template assets or dependencies in the CLI package)
- [ ] Inventory template state machine cycles UNRESOLVED → RESOLVED → INSTALLED → UPDATED under successful install and update flows
