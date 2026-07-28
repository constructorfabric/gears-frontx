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
  - [Template Identity Comes From the Manifest and Collisions Are Rejected](#template-identity-comes-from-the-manifest-and-collisions-are-rejected)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-template-resolution`
## 1. Feature Context

- [x] `p2` - `cpt-frontx-feature-template-resolution`

### 1.1 Overview

The CLI (`@gears-frontx/cli`) bundles no template and resolves each template from an external source by versioned source-spec (`host:owner/repo[//subtree]@ref`) at runtime, materializing the template's actual files on disk in a tracked local inventory at an addressable installed content path — not a single manifest blob — so downstream apply and assembly read that content directly, and providing install, list, and bounded local update operations that never disturb already-scaffolded projects. The optional `//subtree` segment addresses a template occupying a subtree of a repository, so one repository can serve several templates; the acquired content is narrowed to that subtree and re-rooted, leaving a template unaware of where in a repository it lives. A template is tracked under the identity its own manifest declares, not under the name of the repository it came from, and an install whose declared identity is already occupied by a different source is rejected before any inventory write rather than merged into the occupant's content path.

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

- [x] `p1` - **ID**: `cpt-frontx-flow-template-resolution-install`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer installs a template and it is added to the local inventory at the pinned version

**Error Scenarios**:
- Source registry is unreachable; install fails with an error before any inventory write
- Source-spec is missing the `host:` prefix or the `@ref` selector, or carries a malformed subtree segment; rejected before any fetch
- The referenced subtree holds no content at the referenced version; install fails with an error before any inventory write
- The fetched template declares an identity the local inventory already tracks for a different template address; install is rejected before any inventory write. A reference differing only in its version selector names the same template and is not a collision

**Steps**:
1. [x] - `p1` - Developer invokes the CLI install command with a versioned source-spec (`host:owner/repo[//subtree]@ref`) - `inst-install-invoke`
2. [x] - `p1` - CLI forwards the source-spec string to the source-spec parser - `inst-install-parse`
3. [x] - `p1` - **IF** the parser returns a parse error (missing `host:` prefix, missing `@ref` selector, or a malformed repository path or subtree segment): - `inst-install-parse-check`
   1. [x] - `p1` - **RETURN** parse error to developer; abort install with no inventory write - `inst-install-parse-reject`
4. [x] - `p1` - CLI forwards the parsed structured reference to the shared resolver - `inst-install-resolve`
5. [x] - `p1` - Shared resolver attempts to fetch template content from the source registry (`cpt-frontx-actor-github`) at the resolved ref - `inst-install-fetch`
6. [x] - `p1` - **IF** the source registry is unreachable or returns an error: - `inst-install-reach-check`
   1. [x] - `p1` - **RETURN** connectivity error to developer; abort install with no inventory write - `inst-install-reach-fail`
7. [x] - `p1` - CLI materializes the fetched content into the tracked local inventory under the identity the fetched template's manifest declares and the pinned version - `inst-install-materialize`
8. [x] - `p1` - **RETURN** install success with the installed identity and pinned version to developer - `inst-install-success`

### List Local Template Inventory

- [x] `p1` - **ID**: `cpt-frontx-flow-template-resolution-list`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer sees all templates installed in the local inventory with their pinned versions

**Error Scenarios**:
- Local inventory is empty; CLI reports an empty inventory with no error

**Steps**:
1. [x] - `p1` - Developer invokes the CLI list command - `inst-list-invoke`
2. [x] - `p1` - CLI reads the tracked local inventory index - `inst-list-read`
3. [x] - `p1` - **IF** the inventory index contains no entries: - `inst-list-empty-check`
   1. [x] - `p1` - **RETURN** empty inventory message to developer - `inst-list-empty-return`
4. [x] - `p1` - CLI formats each inventory entry as name and pinned version - `inst-list-format`
5. [x] - `p1` - **RETURN** formatted inventory listing to developer - `inst-list-return`

### Update Installed Template in Local Inventory

- [x] `p1` - **ID**: `cpt-frontx-flow-template-resolution-update-local`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer updates a specific inventory entry to a newer version; no scaffolded project path is modified

**Error Scenarios**:
- Named template is not found in local inventory; CLI reports the error and makes no changes
- Source registry is unreachable; CLI reports the error and leaves the existing inventory entry unchanged
- The new source-spec resolves to a template declaring a different identity; CLI reports the error and leaves the existing inventory entry unchanged rather than substituting one template for another

**Steps**:
1. [x] - `p1` - Developer invokes the CLI update-local command with the template name and a new versioned source-spec - `inst-update-invoke`
2. [x] - `p1` - CLI looks up the named entry in the tracked local inventory index - `inst-update-lookup`
3. [x] - `p1` - **IF** the named entry is absent from the local inventory: - `inst-update-notfound-check`
   1. [x] - `p1` - **RETURN** not-found error to developer; abort update with no inventory write - `inst-update-notfound`
4. [x] - `p1` - CLI forwards the new source-spec to the source-spec parser - `inst-update-parse`
5. [x] - `p1` - **IF** the parser returns a parse error: - `inst-update-parse-check`
   1. [x] - `p1` - **RETURN** parse error to developer; abort update with no inventory write - `inst-update-parse-reject`
6. [x] - `p1` - CLI forwards the parsed reference to the shared resolver and fetches the updated content from the source registry - `inst-update-fetch`
7. [x] - `p1` - **IF** the source registry is unreachable or returns an error: - `inst-update-reach-check`
   1. [x] - `p1` - **RETURN** connectivity error to developer; leave the existing inventory entry unchanged - `inst-update-reach-fail`
8. [x] - `p1` - CLI replaces the inventory store entry for the named template with the fetched content at the new pinned version - `inst-update-write`
9. [x] - `p1` - **RETURN** update success with the template name and new pinned version to developer - `inst-update-success`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. These are reusable building blocks called by Actor Flows or other processes.

### Source-Spec Parse and Validate

- [x] `p2` - **ID**: `cpt-frontx-algo-template-resolution-parse-spec`

**Input**: A raw source-spec string supplied by the developer

**Output**: A structured reference (host, owner, repo, optional subtree, ref) or a parse error

**Steps**:
1. [x] - `p1` - Check that the input string contains a `:` separator - `inst-parse-prefix-check`
2. [x] - `p1` - **IF** no `:` separator is present: - `inst-parse-no-prefix`
   1. [x] - `p1` - **RETURN** parse error: missing `host:` prefix; acquisition cannot proceed without an explicit host - `inst-parse-no-prefix-fail`
3. [x] - `p1` - Extract the host token as the substring before the first `:` - `inst-parse-extract-host`
4. [x] - `p1` - Check that the remainder after `:` contains an `@` separator - `inst-parse-at-check`
5. [x] - `p1` - **IF** no `@` separator is present: - `inst-parse-no-at`
   1. [x] - `p1` - **RETURN** parse error: missing `@ref` version selector; acquisition cannot proceed without an explicit version pin - `inst-parse-no-at-fail`
6. [x] - `p1` - Extract the repository path as the substring between `:` and `@` - `inst-parse-extract-repo`
7. [x] - `p1` - Split the repository path on its first `//` separator into an `owner/repo` part and an optional subtree part - `inst-parse-extract-subtree`
8. [x] - `p1` - **IF** the `owner/repo` part is not exactly one owner segment followed by one repository segment, or a subtree separator is present with a subtree part that is empty, absolute, or carries an empty, `.`, or `..` segment: - `inst-parse-invalid-path`
   1. [x] - `p1` - **RETURN** parse error: malformed repository path or subtree segment; acquisition cannot proceed without an unambiguous repository and subtree - `inst-parse-invalid-path-fail`
9. [x] - `p1` - Extract the ref selector as the substring after `@` - `inst-parse-extract-ref`
10. [x] - `p1` - **RETURN** structured reference containing host, owner, repo, the subtree when present, and ref - `inst-parse-return`

### Resolve Source-Spec to Tracked Local Inventory

- [x] `p2` - **ID**: `cpt-frontx-algo-template-resolution-resolve-to-inventory`

**Input**: A validated structured reference (host, owner, repo, optional subtree, ref)

**Output**: A materialized inventory entry (identity, installed content path addressing the template's actual on-disk files, pinned version) or a resolution error

**Steps**:
1. [x] - `p1` - Construct the fetch address for the source registry (`cpt-frontx-actor-github`) from the structured reference, and the re-resolvable source-spec string that reproduces it — including its subtree when the reference carries one, so a later re-resolution addresses the same template rather than the repository root - `inst-resolve-addr`
2. [x] - `p1` - Fetch the template content from the source registry at the given ref - `inst-resolve-fetch`
3. [x] - `p1` - **IF** the fetch fails: - `inst-resolve-fetch-fail-check`
   1. [x] - `p1` - **RETURN** resolution error; do not write to local inventory - `inst-resolve-fetch-fail`
4. [x] - `p1` - **IF** the reference carries a subtree, narrow the acquired content to that subtree and re-root every retained path so it is relative to the subtree rather than to the repository - `inst-resolve-subtree`
5. [x] - `p1` - **IF** the acquired content is not a multi-file bundle, the referenced subtree holds no content at the referenced version, or narrowing would re-root a retained path outside the subtree: - `inst-resolve-subtree-empty`
   1. [x] - `p1` - **RETURN** resolution error naming the subtree and, where a path is at fault, that path; do not write to local inventory - `inst-resolve-subtree-empty-fail`
6. [x] - `p1` - Read the template's manifest from the acquired content and take the identity it declares as the template's identity - `inst-resolve-name`
7. [x] - `p1` - **IF** the manifest is absent, unreadable, or declares an identity that is empty or not usable as an installed content path — an identity must be relative and free of empty, `.` and `..` segments, while a scoped identity carrying a `/` remains admissible - `inst-resolve-identity-missing`
   1. [x] - `p1` - **RETURN** resolution error; do not write to local inventory - `inst-resolve-identity-missing-fail`
8. [x] - `p1` - **IF** the local inventory already tracks that identity for a different template address — the reference with its version selector removed, so that a reference differing only in version names the same template rather than a colliding one: - `inst-resolve-collision-check`
   1. [x] - `p1` - **RETURN** resolution error naming both the occupying source and the requested one; do not write to local inventory and do not merge into the occupant's content path - `inst-resolve-collision-fail`
9. [x] - `p1` - Materialize the acquired template content — the template's actual files together with its manifest — on disk in the local inventory store under the declared identity, addressable at an installed content path - `inst-resolve-write`
10. [x] - `p1` - Record the installed identity and pinned ref in the inventory index - `inst-resolve-index`
11. [x] - `p1` - **RETURN** inventory entry containing identity, installed content path, and pinned version - `inst-resolve-return`

### Bounded Local Inventory Update

- [x] `p2` - **ID**: `cpt-frontx-algo-template-resolution-bounded-update`

**Input**: Template name and a validated structured reference for the new version

**Output**: An updated inventory entry (name, new pinned version) or an update error; scaffolded projects are not touched

**Steps**:
1. [x] - `p1` - Look up the named entry in the inventory index - `inst-bupd-lookup`
2. [x] - `p1` - **IF** the named entry is absent: - `inst-bupd-absent-check`
   1. [x] - `p1` - **RETURN** not-found error; abort with no inventory write - `inst-bupd-absent-fail`
3. [x] - `p1` - Fetch the new template content from the source registry at the new ref using the shared resolver - `inst-bupd-fetch`
4. [x] - `p1` - **IF** the fetch fails: - `inst-bupd-fetch-fail-check`
   1. [x] - `p1` - **RETURN** fetch error; leave the existing inventory entry unchanged - `inst-bupd-fetch-fail`
5. [x] - `p1` - **IF** the newly fetched content declares an identity other than the entry being updated: - `inst-bupd-identity-mismatch`
   1. [x] - `p1` - **RETURN** update error naming both the entry's identity and the declared one; leave the existing inventory entry unchanged, since replacing it would substitute one template for another under the entry's identity - `inst-bupd-identity-mismatch-fail`
6. [x] - `p1` - Replace the named template's materialized files in the inventory store with the newly fetched content at its installed content path - `inst-bupd-replace`
7. [x] - `p1` - Update the inventory index to record the new pinned ref for the named entry - `inst-bupd-index-update`
8. [x] - `p1` - Confirm that no paths outside the local inventory store were written during this operation - `inst-bupd-boundary-confirm`
9. [x] - `p1` - **RETURN** updated inventory entry containing name and new pinned version - `inst-bupd-return`

## 4. States (CDSL)

Include when entities have explicit lifecycle states.

### Inventory Template State Machine

- [x] `p2` - **ID**: `cpt-frontx-state-template-resolution-inventory-lifecycle`

**States**: UNRESOLVED, RESOLVED, INSTALLED, UPDATED

**Initial State**: UNRESOLVED

**Transitions**:
1. [x] - `p1` - **FROM** UNRESOLVED **TO** RESOLVED **WHEN** the source-spec is successfully parsed and the source registry returns the template content for the given ref - `inst-state-to-resolved`
2. [x] - `p1` - **FROM** RESOLVED **TO** INSTALLED **WHEN** the fetched content is materialized into the local inventory store and the inventory index is updated with the pinned version - `inst-state-to-installed`
3. [x] - `p1` - **FROM** INSTALLED **TO** UPDATED **WHEN** a bounded local update fetches new content for the named inventory entry, replaces it in the inventory store, and updates the index without touching any scaffolded project - `inst-state-to-updated`
4. [x] - `p1` - **FROM** UNRESOLVED **TO** UNRESOLVED **WHEN** source-spec parse validation fails (missing `host:` prefix, missing `@ref` selector, or a malformed repository path or subtree segment) and the inventory is not written - `inst-state-parse-fail-loop`
5. [x] - `p1` - **FROM** RESOLVED **TO** UNRESOLVED **WHEN** the source registry fetch fails after a successful parse and the inventory is not written - `inst-state-fetch-fail-loop`
6. [x] - `p1` - **FROM** RESOLVED **TO** UNRESOLVED **WHEN** the referenced subtree holds no content, the acquired content declares no usable identity, or the declared identity is already tracked for a different source-spec, and the inventory is not written - `inst-state-reject-loop`

## 5. Definitions of Done

Specific implementation tasks derived from flows/algorithms above.

### CLI Installs Template by Versioned Source-Spec

- [x] `p1` - **ID**: `cpt-frontx-dod-template-resolution-install-by-spec`

The system **MUST** install a template into the local inventory by resolving a developer-supplied `host:owner/repo[//subtree]@ref` source-spec through the shared resolver, materialize the fetched content as the template's actual on-disk files in the tracked inventory store addressable at an installed content path (not a single manifest blob), and record the pinned version — with zero template content bundled in the CLI distribution. When the source-spec carries a subtree segment, the system **MUST** materialize only that subtree, re-rooted so every materialized path is relative to the subtree rather than to the repository, and **MUST** retain the subtree in the re-resolvable source-spec it records.

**Implements**:
- `cpt-frontx-flow-template-resolution-install`
- `cpt-frontx-algo-template-resolution-parse-spec`
- `cpt-frontx-algo-template-resolution-resolve-to-inventory`

**Constraints**: `cpt-frontx-constraint-cli-template-independence`

**Touches**:
- Entities: `Template`

### CLI Lists Local Template Inventory

- [x] `p1` - **ID**: `cpt-frontx-dod-template-resolution-list-inventory`

The system **MUST** enumerate all entries in the tracked local inventory and report each installed template name with its pinned version when the developer invokes the list command.

**Implements**:
- `cpt-frontx-flow-template-resolution-list`

**Constraints**: `cpt-frontx-constraint-cli-template-independence`

**Touches**:
- Entities: `Template`

### CLI Updates Local Inventory Entry Without Touching Scaffolded Projects

- [x] `p1` - **ID**: `cpt-frontx-dod-template-resolution-bounded-local-update`

The system **MUST** replace a named inventory entry with the newly fetched content at the new pinned version, writing exclusively within the local inventory store and leaving every scaffolded project path unchanged.

**Implements**:
- `cpt-frontx-flow-template-resolution-update-local`
- `cpt-frontx-algo-template-resolution-bounded-update`

**Constraints**: `cpt-frontx-constraint-cli-template-independence`

**Touches**:
- Entities: `Template`

### Source-Spec Parser Rejects Invalid References

- [x] `p1` - **ID**: `cpt-frontx-dod-template-resolution-spec-parser-rejection`

The system **MUST** reject any source-spec that omits the `host:` prefix or the `@ref` version selector before any fetch or inventory write is attempted, **MUST** reject rather than reinterpret a repository path whose segment count is not two, an empty or trailing-slash subtree segment, and a subtree segment carrying an empty, `.`, or `..` segment, **MUST** round-trip a valid `host:owner/repo//subtree@ref` reference into its five constituent parts (host, owner, repo, subtree, ref), and **MUST** parse a reference without the subtree segment into the same four parts as before, carrying no subtree.

**Implements**:
- `cpt-frontx-algo-template-resolution-parse-spec`

**Constraints**: `cpt-frontx-constraint-cli-template-independence`

**Touches**:
- Entities: `Template`

### Template Identity Comes From the Manifest and Collisions Are Rejected

- [x] `p1` - **ID**: `cpt-frontx-dod-template-resolution-manifest-identity`

The system **MUST** take a template's identity from the identity its own manifest declares rather than from the repository the reference names, and **MUST** use that identity as the inventory index key, as the installed content path, and as the identity recorded for the template. The system **MUST** reject a reference whose acquired content carries no readable manifest or declares an identity that is empty or not usable as an installed content path — relative, free of empty, `.` and `..` segments, with a scoped identity carrying a `/` remaining admissible — and **MUST** reject an install whose declared identity is already tracked for a different template address — naming both the occupying source and the requested one — rather than writing into the occupant's content path, while admitting a reference that differs only in its version selector, which names the same template at another version.

**Implements**:
- `cpt-frontx-flow-template-resolution-install`
- `cpt-frontx-algo-template-resolution-resolve-to-inventory`

**Constraints**: `cpt-frontx-constraint-cli-template-independence`

**Touches**:
- Entities: `Template`

## 6. Acceptance Criteria

- [ ] CLI install command resolves a valid `host:owner/repo@ref` source-spec, fetches from the source registry, and writes the result to the local inventory at the pinned version
- [ ] CLI install command with a source-spec missing the `host:` prefix or the `@ref` selector fails with a parse error before any fetch or inventory write
- [ ] CLI install command resolves a valid `host:owner/repo//subtree@ref` source-spec and materializes only that subtree, with every materialized path relative to the subtree rather than to the repository
- [ ] A source-spec whose repository path does not consist of exactly one owner segment and one repository segment, or whose subtree segment is empty, trailing-slash, or carries an empty, `.`, or `..` segment, fails with a parse error before any fetch or inventory write
- [ ] A source-spec naming a subtree that holds no content at the referenced version fails with an error identifying the subtree, and nothing is written to the local inventory
- [ ] A subtree whose acquired content carries a path that escapes the subtree once re-rooted is refused outright, and nothing is written to the local inventory
- [ ] The identity a template is tracked under is the identity its manifest declares, and it is the inventory index key, the installed content path segment, and the identity recorded in the re-resolvable source-spec's provenance
- [ ] Two source-specs differing only in their subtree segment, whose manifests declare different identities, install as two distinct templates from one repository at one version, each at its own installed content path; if the two declare one identity the second install is refused as a collision
- [ ] Installing a template whose declared identity is already tracked for a different source-spec fails with an error naming both sources, and the occupying template's content path is left unmodified
- [ ] CLI list command returns all installed templates and their pinned versions from the local inventory
- [ ] CLI list command reports an empty inventory when no templates are installed
- [ ] CLI update-local command replaces the named inventory entry with newly fetched content at the new pinned version, leaving every scaffolded project path unmodified
- [ ] CLI update-local command reports a not-found error when the named template is absent from the local inventory
- [ ] No template content is bundled in the CLI distribution (zero template assets or dependencies in the CLI package)
- [ ] Inventory template state machine cycles UNRESOLVED → RESOLVED → INSTALLED → UPDATED under successful install and update flows
