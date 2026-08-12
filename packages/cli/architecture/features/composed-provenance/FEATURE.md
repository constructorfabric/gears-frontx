# Feature: Project State, Registration & Ownership Management

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Register a Template's Origin](#register-a-templates-origin)
  - [Unregister a Template](#unregister-a-template)
  - [Add a Project-Owned Root](#add-a-project-owned-root)
  - [Remove a Project-Owned Root](#remove-a-project-owned-root)
  - [List Project-Owned Roots](#list-project-owned-roots)
  - [Validate the Project State Document](#validate-the-project-state-document)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Atomic Project State Read/Write](#atomic-project-state-readwrite)
  - [Validate the Project State Document Against Reality](#validate-the-project-state-document-against-reality)
  - [Register a Template](#register-a-template)
  - [Unregister a Template](#unregister-a-template-1)
  - [Add a Project-Owned Root](#add-a-project-owned-root-1)
  - [Remove a Project-Owned Root](#remove-a-project-owned-root-1)
- [4. States (CDSL)](#4-states-cdsl)
  - [Template Registration Lifecycle](#template-registration-lifecycle)
  - [Project-Owned Root Lifecycle](#project-owned-root-lifecycle)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Atomic Single-Document Project State](#atomic-single-document-project-state)
  - [Manifest-Keyed Registration with Origin Pinning](#manifest-keyed-registration-with-origin-pinning)
  - [Project-Owned Ownership Exceptions](#project-owned-ownership-exceptions)
  - [Project State Contract Ownership](#project-state-contract-ownership)
  - [Project State Validated Against Reality](#project-state-validated-against-reality)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-composed-provenance`

## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-composed-provenance`

### 1.1 Overview

This feature owns the repository's single CLI-managed state document, `.frontx/project.json` — `formatVersion`, the `templates` map (each registered name's `origin`, `version`, and `targets` array), and `projectOwnedRoots` — and every command that reads or writes it directly: `register`, `unregister`, and `ownership add|remove|list`. It resolves and pins a template's origin to the identity a project depends on, keeps that dependency and the project's own ownership exceptions in one atomically-read-and-written document, and refuses to let a registration or an exception be removed out from under ground it still occupies. All CDSL behavior is `target` (GREENFIELD — grounded in `cpt-frontx-adr-single-project-state-file`, `cpt-frontx-adr-whole-target-ownership`, `cpt-frontx-adr-template-registration-and-origin-pinning`, and DESIGN §3.1/§3.2/§3.6).

This feature's identifier and folder name predate its current scope: earlier revisions owned transitive preset (referenced-template) resolution and a per-applied-template provenance record written to `.frontx/provenance.json`; both are retired. Composition is now driven only by the caller's explicit batch (`cpt-frontx-feature-cli-scaffolding`, `cpt-frontx-adr-explicit-batch-application`), and an applied instance's provenance is now exactly the `targets` array nested inside this feature's own single document — there is no second record, no `identity`/`applied-from version`/`source-spec`/`occupied ownership boundary` tuple, and no whole-repository placeholder to carry forward. The feature keeps its identifier, `cpt-frontx-feature-composed-provenance`, and its folder path; renaming both to match the current scope is a pending follow-up.

### 1.2 Purpose

This feature realizes the single project-state document decided in `cpt-frontx-adr-single-project-state-file`, the manifest-keyed registration and immutable origin pinning decided in `cpt-frontx-adr-template-registration-and-origin-pinning`, and the project-specific half of the whole-target ownership model decided in `cpt-frontx-adr-whole-target-ownership` (the `projectOwnedRoots` exclusion, managed here). It covers: reading and writing `.frontx/project.json` atomically for every command that touches it; registering a template's resolved origin under a project and unregistering it once no target depends on it; and adding, removing, and listing the project's own `projectOwnedRoots` exceptions. It realizes the internal components `cpt-frontx-component-cli-registration` (register/unregister) and `cpt-frontx-component-cli-provenance-recorder`, renamed in DESIGN prose to "CLI Project State Store" (the atomic document read/write every other lifecycle command shares). This feature is the OWNER of `cpt-frontx-contract-project-provenance` ("Project state (provenance) contract" in DESIGN §3.3), including its concrete field-level schema.

Applying a registered template to a target (`apply`), computing and checking ownership geometry, and deleting a target are owned by `cpt-frontx-feature-cli-scaffolding`'s Assembler and Conflict Checker; this feature supplies the document those components read from and write into, and reuses the Conflict Checker's canonicalized geometry check for `ownership add`'s own refusal rule rather than redefining it. Upgrading a registered template's origin is owned by `cpt-frontx-feature-upgrade-changeset`'s Change-Set Engine, which reads this feature's `templates[name]` entry as its baseline and commits the post-upgrade `origin`/`version` back into it; this feature does not itself change a name's origin once that name has at least one applied target. `.frontx` as a whole is the CLI's own reserved namespace: this feature's `.frontx/project.json` is that namespace's provenance record, while a template name's materialized AI-extension bundle at `.frontx/ai/<name>/` is a separate CLI-owned write inside the same namespace whose step this feature does not own — that step belongs to `cpt-frontx-feature-cli-scaffolding` (`cpt-frontx-algo-cli-scaffolding-ai-bundle`).

**Requirements**: `cpt-frontx-fr-cli-template-registration`, `cpt-frontx-fr-cli-project-state`, `cpt-frontx-fr-cli-ownership-management`

**Contracts (owned)**: `cpt-frontx-contract-project-provenance`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Registers and unregisters a template's origin under the project, and manages the project's own `projectOwnedRoots` exceptions |
| `cpt-frontx-actor-github` | Acts as the external source registry a remote origin is resolved and pinned against at registration time |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR**: `cpt-frontx-adr-single-project-state-file`, `cpt-frontx-adr-whole-target-ownership`, `cpt-frontx-adr-template-registration-and-origin-pinning`, `cpt-frontx-adr-nesting-aware-conflict-prevention`, `cpt-frontx-adr-uniform-cli-json-envelope`
- **Dependencies**:
  - `cpt-frontx-feature-template-resolution` (F10 — the shared resolver `register` installs and pins a remote origin through)

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-usecase-register-local-template`, `cpt-frontx-usecase-scaffold-composed-project`, `cpt-frontx-usecase-add-microfrontend-to-project`

### Register a Template's Origin

- [ ] `p1` - **ID**: `cpt-frontx-flow-composed-provenance-register-template`

**Actor**: `cpt-frontx-actor-project-developer`

**Involves**: `cpt-frontx-actor-github` (only when the origin is remote)

**Success Scenarios**:
- Developer registers a new remote origin: the CLI installs it if not already available, pins it to the exact commit or package version the fetch settled on, validates the manifest, and writes `templates[name] = { origin: <pinned>, version, targets: [] }`.
- Developer registers a local `path:` origin: the CLI records the path exactly as given (no pin — there is nothing external to pin against) and the version the manifest at that path declares.
- Developer registers an origin that resolves to the same immutable value (or the same local path) already recorded for that name: the call is a no-op.
- Developer registers a different origin for an already-registered name with `--replace`, and that name's `targets` array is empty: the entry's `origin` and `version` are replaced.

**Error Scenarios**:
- The origin cannot be resolved or installed (unreachable registry, invalid local path): the CLI reports `ORIGIN_UNAVAILABLE` and aborts; `.frontx/project.json` is left unchanged.
- The resolved manifest is missing `name` or `version`, or its `description` is missing or empty: the CLI refuses registration with `INVALID_MANIFEST`, naming the missing or empty field; `.frontx/project.json` is left unchanged.
- A different origin is given for an already-registered name without `--replace`: the CLI refuses with `REGISTRATION_CONFLICT`, naming the currently registered origin and the requested one; the existing entry is preserved.
- `--replace` is given but the name's `targets` array is non-empty: the CLI refuses with `TARGETS_EXIST`, directing the developer to `upgrade` instead — `register --replace` never changes the origin of a name with at least one applied target.

**Steps**:
1. [ ] - `p1` - Developer invokes `register <origin>` - `inst-reg-invoke`
2. [ ] - `p1` - The CLI invokes the register algorithm (`cpt-frontx-algo-composed-provenance-register`) - `inst-reg-run-algorithm`
3. [ ] - `p1` - **IF** the algorithm reports a resolution or manifest-validation failure (`ORIGIN_UNAVAILABLE` or `INVALID_MANIFEST`) - `inst-reg-if-failure`
   1. [ ] - `p1` - **RETURN** the reported failure to the developer; `.frontx/project.json` unchanged - `inst-reg-return-failure`
4. [ ] - `p1` - **IF** the algorithm reports a no-op, a refusal (origin conflict without `--replace`, or `--replace` with non-empty `targets`), or a success (created or replaced) - `inst-reg-if-outcome`
   1. [ ] - `p1` - **RETURN** the corresponding result to the developer - `inst-reg-return-outcome`

### Unregister a Template

- [ ] `p1` - **ID**: `cpt-frontx-flow-composed-provenance-unregister-template`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer unregisters a name whose `targets` array is empty: the entry is removed from `.frontx/project.json`.

**Error Scenarios**:
- The name has no entry in `.frontx/project.json`: the CLI refuses (`TEMPLATE_NOT_REGISTERED`).
- The name's `targets` array is non-empty: the CLI refuses with `TARGETS_EXIST`, listing every target still depending on the name, and directs the developer to `delete` each target first; the entry is preserved.

**Steps**:
1. [ ] - `p1` - Developer invokes `unregister <name>` - `inst-unreg-invoke`
2. [ ] - `p1` - The CLI invokes the unregister algorithm (`cpt-frontx-algo-composed-provenance-unregister`) - `inst-unreg-run-algorithm`
3. [ ] - `p1` - **IF** the algorithm reports the name is not registered - `inst-unreg-if-not-registered`
   1. [ ] - `p1` - **RETURN** `TEMPLATE_NOT_REGISTERED` to the developer - `inst-unreg-return-not-registered`
4. [ ] - `p1` - **IF** the algorithm reports a non-empty `targets` array - `inst-unreg-if-targets`
   1. [ ] - `p1` - **RETURN** `TARGETS_EXIST` naming every dependent target; entry preserved - `inst-unreg-return-targets`
5. [ ] - `p1` - **ELSE** - `inst-unreg-else`
   1. [ ] - `p1` - **RETURN** success; the entry is removed - `inst-unreg-return-success`

### Add a Project-Owned Root

- [ ] `p1` - **ID**: `cpt-frontx-flow-composed-provenance-ownership-add`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer adds an existing path that falls inside an applied template's target, or that touches no applied target at all: the path is appended to `projectOwnedRoots`; no file is created, moved, or deleted.
- Developer adds a path already present in `projectOwnedRoots`: the call is a no-op.

**Error Scenarios**:
- The given path does not exist on disk: the CLI refuses with `INVALID_PATH` — `ownership add` accepts only an existing path.
- The path coincides with or is an ancestor of any applied target: the CLI refuses with `TARGET_CONFLICT`, naming the contesting target, using the same canonicalized geometry check `cpt-frontx-feature-cli-scaffolding`'s Conflict Checker runs for assembly (`cpt-frontx-algo-cli-scaffolding-conflict-check`).

**Steps**:
1. [ ] - `p1` - Developer invokes `ownership add <path>` - `inst-oadd-invoke`
2. [ ] - `p1` - The CLI invokes the ownership-add algorithm (`cpt-frontx-algo-composed-provenance-ownership-add`) - `inst-oadd-run-algorithm`
3. [ ] - `p1` - **IF** the algorithm reports the path does not exist - `inst-oadd-if-missing`
   1. [ ] - `p1` - **RETURN** `INVALID_PATH` naming the path; `projectOwnedRoots` unchanged - `inst-oadd-return-missing`
4. [ ] - `p1` - **IF** the algorithm reports a geometry conflict against an applied target - `inst-oadd-if-conflict`
   1. [ ] - `p1` - **RETURN** `TARGET_CONFLICT` naming the path and the contesting target; `projectOwnedRoots` unchanged - `inst-oadd-return-conflict`
5. [ ] - `p1` - **ELSE** - `inst-oadd-else`
   1. [ ] - `p1` - **RETURN** success; the path is recorded in `projectOwnedRoots` (or was already present) - `inst-oadd-return-success`

### Remove a Project-Owned Root

- [ ] `p1` - **ID**: `cpt-frontx-flow-composed-provenance-ownership-remove`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer removes a path present in `projectOwnedRoots`: the entry is removed from the array; no file on disk is touched.
- Developer removes a path not present in `projectOwnedRoots`: the call is a no-op.

**Error Scenarios**:
- (none — `ownership remove` never touches a file, so there is no destructive outcome to refuse)

**Steps**:
1. [ ] - `p1` - Developer invokes `ownership remove <path>` - `inst-orem-invoke`
2. [ ] - `p1` - The CLI invokes the ownership-remove algorithm (`cpt-frontx-algo-composed-provenance-ownership-remove`) - `inst-orem-run-algorithm`
3. [ ] - `p1` - **RETURN** success; the path is absent from `projectOwnedRoots`, whether or not it was present before - `inst-orem-return-success`

### List Project-Owned Roots

- [ ] `p1` - **ID**: `cpt-frontx-flow-composed-provenance-ownership-list`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer lists the current `projectOwnedRoots`: the CLI reads `.frontx/project.json` and returns the array unchanged; nothing is written.

**Error Scenarios**:
- `.frontx/project.json` exists but cannot be parsed as the expected document shape: the CLI refuses with `PROJECT_INVALID`.

**Steps**:
1. [ ] - `p1` - Developer invokes `ownership list` - `inst-olist-invoke`
2. [ ] - `p1` - The CLI reads the project state document (`cpt-frontx-algo-composed-provenance-project-state-io`, read-only) - `inst-olist-read`
3. [ ] - `p1` - **IF** the document exists and cannot be parsed as the expected shape - `inst-olist-if-invalid`
   1. [ ] - `p1` - **RETURN** `PROJECT_INVALID` - `inst-olist-return-invalid`
4. [ ] - `p1` - **RETURN** the current `projectOwnedRoots` array (empty when the document does not yet exist) - `inst-olist-return-roots`

### Validate the Project State Document

- [ ] `p1` - **ID**: `cpt-frontx-flow-composed-provenance-validate-project`

**Actor**: `cpt-frontx-actor-project-developer`

`validate` on the manifest side (`cpt-frontx-feature-template-manifest`) checks a candidate template before publication, while `validate --project` checks the project state document this feature owns against reality — the registry, the local inventory, and the filesystem — after it has been written by `register`, `apply`, `upgrade`, or a hand-edit.

**Success Scenarios**:
- Developer runs `validate --project`: the CLI structurally validates `.frontx/project.json`, confirms every registered name's installed manifest version still matches the version recorded for it, confirms every registered origin is still resolvable, confirms `targets[]` is normalized and duplicate-free within and across every registered name with no ownership-geometry conflict among them, and confirms every `projectOwnedRoots` entry still exists on disk — reporting PASS when every check clears.

**Error Scenarios**:
- `.frontx/project.json` does not parse as the expected top-level shape, or a `templates[name]` entry is malformed, or `targets[]` carries a duplicate or a non-canonical entry: `PROJECT_INVALID`, naming the offending entry.
- A registered name's currently resolvable manifest declares a `version` different from `templates[name].version`: `VERSION_MISMATCH`, naming the name, the recorded version, and the manifest's version.
- A registered name's origin can no longer be resolved (a remote origin's pin has become unreachable, or a local `path:` origin's folder no longer exists): `ORIGIN_UNAVAILABLE`, naming the name and its origin.
- Two recorded targets — under the same or different registered names — coincide or nest without a declared `excludedSubtrees` exemption, detected by resubmitting the full recorded set through the Conflict Checker's geometry (`cpt-frontx-algo-cli-scaffolding-conflict-check`): `TARGET_CONFLICT`, naming the contesting names and the contested ground.
- A `projectOwnedRoots` entry no longer exists on disk: `INVALID_PATH`, naming the path.

**Steps**:
1. [ ] - `p1` - Developer invokes `validate --project` - `inst-valp-invoke`
2. [ ] - `p1` - The CLI invokes the project-validation algorithm (`cpt-frontx-algo-composed-provenance-validate-project`) - `inst-valp-run-algorithm`
3. [ ] - `p1` - **IF** the algorithm reports a structural failure - `inst-valp-if-invalid`
   1. [ ] - `p1` - **RETURN** `PROJECT_INVALID` naming the offending entry - `inst-valp-return-invalid`
4. [ ] - `p1` - **IF** the algorithm reports a manifest/recorded version mismatch for a name - `inst-valp-if-version-mismatch`
   1. [ ] - `p1` - **RETURN** `VERSION_MISMATCH` naming the name and both versions - `inst-valp-return-version-mismatch`
5. [ ] - `p1` - **IF** the algorithm reports an unresolvable origin for a name - `inst-valp-if-origin-unavailable`
   1. [ ] - `p1` - **RETURN** `ORIGIN_UNAVAILABLE` naming the name and its origin - `inst-valp-return-origin-unavailable`
6. [ ] - `p1` - **IF** the algorithm reports an ownership-geometry conflict among recorded targets - `inst-valp-if-target-conflict`
   1. [ ] - `p1` - **RETURN** `TARGET_CONFLICT` naming the contesting names and the contested ground - `inst-valp-return-target-conflict`
7. [ ] - `p1` - **IF** the algorithm reports a `projectOwnedRoots` entry absent from disk - `inst-valp-if-invalid-path`
   1. [ ] - `p1` - **RETURN** `INVALID_PATH` naming the path - `inst-valp-return-invalid-path`
8. [ ] - `p1` - **RETURN** PASS - `inst-valp-return-pass`

## 3. Processes / Business Logic (CDSL)

### Atomic Project State Read/Write

- [ ] `p1` - **ID**: `cpt-frontx-algo-composed-provenance-project-state-io`

**Input**: Repository root path; either a read-only request, or a described mutation (a `templates[name]` entry to create, replace, or remove; a `projectOwnedRoots` path to add or remove).

**Output**: For a read: the current document, or the initial empty shape (`formatVersion: 1`, empty `templates`, empty `projectOwnedRoots`) when no document exists yet. For a mutation: the document reflecting exactly the described change and nothing else, written back as one document. A `PROJECT_INVALID` error when an existing document cannot be parsed as the expected top-level shape.

**Steps**:
1. [ ] - `p1` - Determine the document's location inside the repository root: `.frontx/project.json` - `inst-psio-locate`
2. [ ] - `p1` - **IF** the document does not exist - `inst-psio-if-absent`
   1. [ ] - `p1` - Treat the current document as the initial empty shape without writing anything until a mutation is described - `inst-psio-absent-default`
3. [ ] - `p1` - **IF** the document exists - `inst-psio-if-present`
   1. [ ] - `p1` - Read and parse it as one document - `inst-psio-read`
   2. [ ] - `p1` - **IF** it cannot be parsed as `{ formatVersion, templates, projectOwnedRoots }` - `inst-psio-if-malformed`
      1. [ ] - `p1` - **RETURN** `PROJECT_INVALID`, naming the document; refuse the requesting operation rather than guessing at a partial shape - `inst-psio-return-invalid`
4. [ ] - `p1` - **IF** the caller requested a read only - `inst-psio-if-read`
   1. [ ] - `p1` - **RETURN** the parsed (or initial empty) document - `inst-psio-return-read`
5. [ ] - `p1` - **IF** the caller requested a mutation - `inst-psio-if-mutate`
   1. [ ] - `p1` - Construct the fully modified copy of the document in memory, reflecting exactly the described change and nothing else - `inst-psio-construct-copy`
   2. [ ] - `p1` - Write the modified copy to a temporary file alongside `.frontx/project.json` and rename it into place as the atomic step: the original document is never truncated, edited in place, or removed before the replacement is fully written and the rename completes, so an interruption at any point before the rename leaves the repository holding the prior valid document, and an interruption after the rename leaves it holding the fully written new document — never a partially-written or partially-merged one, and never neither - `inst-psio-write-atomic`
   3. [ ] - `p1` - **RETURN** the written document - `inst-psio-return-written`

### Validate the Project State Document Against Reality

- [ ] `p1` - **ID**: `cpt-frontx-algo-composed-provenance-validate-project`

**Input**: The project state document, read via `cpt-frontx-algo-composed-provenance-project-state-io` (read-only); every registered name's currently installed manifest and installed content path, read through the shared resolver (`cpt-frontx-feature-template-resolution`); the filesystem state of every `projectOwnedRoots` entry.

**Output**: PASS, or one of `PROJECT_INVALID` (naming the offending structural entry), `VERSION_MISMATCH` (naming a name and its recorded vs. manifest-declared version), `ORIGIN_UNAVAILABLE` (naming a name and its unresolvable origin), `TARGET_CONFLICT` (naming contesting names and contested ground), or `INVALID_PATH` (naming a `projectOwnedRoots` entry absent from disk).

**Steps**:
1. [ ] - `p1` - Read the project state document (read-only) - `inst-valpa-read`
2. [ ] - `p1` - **IF** the document cannot be parsed as `{ formatVersion, templates, projectOwnedRoots }`, or any `templates[name]` entry is malformed, or any `targets[]` array carries a duplicate entry or an entry not normalized to a canonical project-relative path - `inst-valpa-if-malformed`
   1. [ ] - `p1` - **RETURN** `PROJECT_INVALID` naming the offending entry; no further check runs - `inst-valpa-return-invalid`
3. [ ] - `p1` - **IF** the document does not exist - `inst-valpa-if-absent`
   1. [ ] - `p1` - **RETURN** PASS — an absent document has nothing to validate against reality - `inst-valpa-return-pass-absent`
4. [ ] - `p1` - **FOR EACH** `templates[name]` entry - `inst-valpa-foreach-name`
   1. [ ] - `p1` - **IF** the name's registered origin can no longer be resolved through the shared resolver - `inst-valpa-if-origin-unavailable`
      1. [ ] - `p1` - **RETURN** `ORIGIN_UNAVAILABLE` naming the name and its origin; no further name is checked - `inst-valpa-return-origin-unavailable`
   2. [ ] - `p1` - **IF** the resolved manifest's declared `version` differs from `templates[name].version` - `inst-valpa-if-version-mismatch`
      1. [ ] - `p1` - **RETURN** `VERSION_MISMATCH` naming the name, the recorded version, and the manifest's version; no further name is checked - `inst-valpa-return-version-mismatch`
5. [ ] - `p1` - Resubmit every `targets[]` entry recorded across every registered name, tagged with its owning name, through the Conflict Checker's geometry check (`cpt-frontx-algo-cli-scaffolding-conflict-check`), checking the recorded set for internal consistency rather than against a new staged batch - `inst-valpa-conflict-check`
6. [ ] - `p1` - **IF** the check reports an intersecting claim - `inst-valpa-if-target-conflict`
   1. [ ] - `p1` - **RETURN** `TARGET_CONFLICT` naming the contesting names and the contested ground - `inst-valpa-return-target-conflict`
7. [ ] - `p1` - **FOR EACH** entry in `projectOwnedRoots` - `inst-valpa-foreach-root`
   1. [ ] - `p1` - **IF** the entry no longer exists on disk - `inst-valpa-if-root-missing`
      1. [ ] - `p1` - **RETURN** `INVALID_PATH` naming the path - `inst-valpa-return-root-missing`
8. [ ] - `p1` - **RETURN** PASS - `inst-valpa-return-pass`

### Register a Template

- [ ] `p1` - **ID**: `cpt-frontx-algo-composed-provenance-register`

**Input**: An `origin` argument — either a remote source-spec (`host:owner/repo[//subtree]@ref`) or a local `path:<relative-path>`.

**Output**: A created entry, a confirmed no-op, a replaced entry, a refusal (`REGISTRATION_CONFLICT` for an origin conflict without `--replace`, or `TARGETS_EXIST` for `--replace` with non-empty `targets`), or a resolution/manifest-validation failure (`ORIGIN_UNAVAILABLE`, `INVALID_MANIFEST`).

**Steps**:
1. [ ] - `p1` - Accept the `origin` argument - `inst-cpreg-accept`
2. [ ] - `p1` - **IF** the origin's content is not already available in the local inventory - `inst-cpreg-if-not-installed`
   1. [ ] - `p1` - Install it through the shared resolver (`cpt-frontx-feature-template-resolution`), pinning a remote origin to the exact immutable commit or package version the fetch settles on; a local `path:` origin is recorded as given - `inst-cpreg-install`
   2. [ ] - `p1` - **IF** resolution or installation fails - `inst-cpreg-if-install-fail`
      1. [ ] - `p1` - **RETURN** an `ORIGIN_UNAVAILABLE` failure; nothing written - `inst-cpreg-return-unavailable`
3. [ ] - `p1` - Read the resolved manifest's `name`, `version`, and `description` - `inst-cpreg-read-manifest`
4. [ ] - `p1` - **IF** `name` or `version` is absent, or `description` is absent or empty - `inst-cpreg-if-invalid-manifest`
   1. [ ] - `p1` - **RETURN** an `INVALID_MANIFEST` failure naming the missing or empty field; nothing written - `inst-cpreg-return-invalid-manifest`
5. [ ] - `p1` - Read the current project state document (`cpt-frontx-algo-composed-provenance-project-state-io`) - `inst-cpreg-read-state`
6. [ ] - `p1` - **IF** `templates[name]` does not exist - `inst-cpreg-if-new`
   1. [ ] - `p1` - Write `templates[name] = { origin: <pinned-or-given>, version, targets: [] }` - `inst-cpreg-write-new`
   2. [ ] - `p1` - **RETURN** success: entry created - `inst-cpreg-return-created`
7. [ ] - `p1` - **ELSE** (`templates[name]` already exists) - `inst-cpreg-else-exists`
   1. [ ] - `p1` - **IF** the resolved origin is the same immutable value (remote) or the same path (local) as the existing entry's `origin` - `inst-cpreg-if-same-origin`
      1. [ ] - `p1` - **RETURN** a no-op; nothing written - `inst-cpreg-return-noop`
   2. [ ] - `p1` - **IF** `--replace` was not given - `inst-cpreg-if-no-replace`
      1. [ ] - `p1` - **RETURN** `REGISTRATION_CONFLICT` naming the currently registered origin and the requested one; entry preserved - `inst-cpreg-return-origin-conflict`
   3. [ ] - `p1` - **IF** `--replace` was given but the existing entry's `targets` array is non-empty - `inst-cpreg-if-replace-applied`
      1. [ ] - `p1` - **RETURN** `TARGETS_EXIST` directing the developer to `upgrade` instead; entry preserved - `inst-cpreg-return-replace-refused`
   4. [ ] - `p1` - **ELSE** (`--replace` given, `targets` empty) - `inst-cpreg-else-replace-ok`
      1. [ ] - `p1` - Write `templates[name].origin` and `.version` to the newly resolved values, `targets` unchanged (empty) - `inst-cpreg-write-replace`
      2. [ ] - `p1` - **RETURN** success: entry replaced - `inst-cpreg-return-replaced`

### Unregister a Template

- [ ] `p1` - **ID**: `cpt-frontx-algo-composed-provenance-unregister`

**Input**: A template `name`.

**Output**: A removed entry, a `TARGETS_EXIST` refusal naming every dependent target, or `TEMPLATE_NOT_REGISTERED`.

**Steps**:
1. [ ] - `p1` - Accept the `name` argument - `inst-cpunreg-accept`
2. [ ] - `p1` - Read the current project state document - `inst-cpunreg-read-state`
3. [ ] - `p1` - **IF** `templates[name]` does not exist - `inst-cpunreg-if-absent`
   1. [ ] - `p1` - **RETURN** `TEMPLATE_NOT_REGISTERED` - `inst-cpunreg-return-not-registered`
4. [ ] - `p1` - **IF** `templates[name].targets` is non-empty - `inst-cpunreg-if-targets`
   1. [ ] - `p1` - **RETURN** `TARGETS_EXIST` listing every target in `targets`; entry preserved - `inst-cpunreg-return-targets`
5. [ ] - `p1` - **ELSE** - `inst-cpunreg-else`
   1. [ ] - `p1` - Remove `templates[name]` from the document and write it - `inst-cpunreg-write-removed`
   2. [ ] - `p1` - **RETURN** success - `inst-cpunreg-return-success`

### Add a Project-Owned Root

- [ ] `p1` - **ID**: `cpt-frontx-algo-composed-provenance-ownership-add`

**Input**: A repository-relative `path`.

**Output**: The path recorded in `projectOwnedRoots` (or confirmed already present), or a refusal (`INVALID_PATH` when the path does not exist; `TARGET_CONFLICT`).

**Steps**:
1. [ ] - `p1` - Accept the `path` argument - `inst-cpoadd-accept`
2. [ ] - `p1` - **IF** `path` does not exist on disk - `inst-cpoadd-if-missing`
   1. [ ] - `p1` - **RETURN** `INVALID_PATH` naming the path; `ownership add` accepts only an existing path - `inst-cpoadd-return-missing`
3. [ ] - `p1` - Canonicalize `path` to a project-relative form, fail-closed against a symlink or a `..` segment resolving outside the project root, per the same discipline `cpt-frontx-feature-cli-scaffolding`'s Conflict Checker applies to every target - `inst-cpoadd-canonicalize`
4. [ ] - `p1` - Read the current project state document to obtain every applied target across every registered template's `targets` array - `inst-cpoadd-read-targets`
5. [ ] - `p1` - Submit the canonicalized path against every applied target through the Conflict Checker's geometry check (`cpt-frontx-algo-cli-scaffolding-conflict-check`) - `inst-cpoadd-check-geometry`
6. [ ] - `p1` - **IF** the path coincides with or is an ancestor of any applied target - `inst-cpoadd-if-conflict`
   1. [ ] - `p1` - **RETURN** `TARGET_CONFLICT` naming the path and the contesting target; `projectOwnedRoots` unchanged - `inst-cpoadd-return-conflict`
7. [ ] - `p1` - **ELSE** - `inst-cpoadd-else`
   1. [ ] - `p1` - **IF** the path is already present in `projectOwnedRoots` - `inst-cpoadd-if-present`
      1. [ ] - `p1` - **RETURN** a no-op - `inst-cpoadd-return-noop`
   2. [ ] - `p1` - **ELSE** - `inst-cpoadd-else-append`
      1. [ ] - `p1` - Append the path to `projectOwnedRoots` and write the document; no file on disk is created, moved, or deleted - `inst-cpoadd-write`
      2. [ ] - `p1` - **RETURN** success - `inst-cpoadd-return-success`

### Remove a Project-Owned Root

- [ ] `p1` - **ID**: `cpt-frontx-algo-composed-provenance-ownership-remove`

**Input**: A repository-relative `path`.

**Output**: The path absent from `projectOwnedRoots`.

**Steps**:
1. [ ] - `p1` - Accept the `path` argument - `inst-cporem-accept`
2. [ ] - `p1` - Read the current project state document - `inst-cporem-read-state`
3. [ ] - `p1` - Remove `path` from `projectOwnedRoots` if present, leaving the array unchanged if it was not - `inst-cporem-remove`
4. [ ] - `p1` - Write the document; no file on disk is created, moved, or deleted - `inst-cporem-write`
5. [ ] - `p1` - **RETURN** success - `inst-cporem-return-success`

## 4. States (CDSL)

### Template Registration Lifecycle

- [ ] `p2` - **ID**: `cpt-frontx-state-composed-provenance-registration-lifecycle`

**States**: UNREGISTERED, REGISTERED_EMPTY, REGISTERED_APPLIED

**Initial State**: UNREGISTERED

**Transitions**:
1. [ ] - `p1` - **FROM** UNREGISTERED **TO** REGISTERED_EMPTY **WHEN** `register` creates a new `templates[name]` entry with an empty `targets` array - `inst-rl-unreg-to-empty`
2. [ ] - `p1` - **FROM** REGISTERED_EMPTY **TO** REGISTERED_EMPTY **WHEN** `register` is called again with the same resolved origin (no-op), or with `--replace` and a different origin while `targets` stays empty - `inst-rl-empty-to-empty`
3. [ ] - `p1` - **FROM** REGISTERED_EMPTY **TO** UNREGISTERED **WHEN** `unregister` succeeds because `targets` is empty - `inst-rl-empty-to-unreg`
4. [ ] - `p1` - **FROM** REGISTERED_EMPTY **TO** REGISTERED_APPLIED **WHEN** `apply` (owned by `cpt-frontx-feature-cli-scaffolding`) records this name's first target - `inst-rl-empty-to-applied`
5. [ ] - `p1` - **FROM** REGISTERED_APPLIED **TO** REGISTERED_APPLIED **WHEN** `apply` records another target for this name, or `upgrade` (owned by `cpt-frontx-feature-upgrade-changeset`) commits a new `origin`/`version` for this name while `targets` remains non-empty - `inst-rl-applied-to-applied`
6. [ ] - `p1` - **FROM** REGISTERED_APPLIED **TO** REGISTERED_EMPTY **WHEN** `delete` (owned by `cpt-frontx-feature-cli-scaffolding`) removes this name's last remaining target - `inst-rl-applied-to-empty`
7. [ ] - `p1` - **FROM** REGISTERED_APPLIED **TO** REGISTERED_APPLIED **WHEN** `unregister` is attempted while `targets` is non-empty — the attempt is refused and the state does not change - `inst-rl-applied-unregister-refused`

### Project-Owned Root Lifecycle

- [ ] `p2` - **ID**: `cpt-frontx-state-composed-provenance-ownership-root-lifecycle`

**States**: UNMARKED, MARKED

**Initial State**: UNMARKED

**Transitions**:
1. [ ] - `p1` - **FROM** UNMARKED **TO** MARKED **WHEN** `ownership add` succeeds — the path exists and does not coincide with or contain an applied target - `inst-orl-unmarked-to-marked`
2. [ ] - `p1` - **FROM** MARKED **TO** UNMARKED **WHEN** `ownership remove` is called for the path — no file on disk is touched - `inst-orl-marked-to-unmarked`

## 5. Definitions of Done

### Atomic Single-Document Project State

- [ ] `p1` - **ID**: `cpt-frontx-dod-composed-provenance-atomic-project-state`

The system **MUST** implement atomic read and write of exactly one repository-local document, `.frontx/project.json`, holding `formatVersion`, a `templates` map keyed by manifest name (`origin`, `version`, `targets[]` per entry), and `projectOwnedRoots` — with no second registry, provenance, or ownership file anywhere in the repository. The write **MUST** go through a temporary file plus rename so an interrupted write always leaves the repository holding the prior valid document, never a partially-written or partially-merged one, and never no document where one previously existed (`target`).

**Implements**:
- `cpt-frontx-algo-composed-provenance-project-state-io`

**Constraints**: `cpt-frontx-constraint-cli-per-template-provenance`

**Touches**:
- Component: `cpt-frontx-component-cli-provenance-recorder`
- Entities: `ProjectProvenance`

### Manifest-Keyed Registration with Origin Pinning

- [ ] `p1` - **ID**: `cpt-frontx-dod-composed-provenance-registration`

The system **MUST** implement `register <origin>` — resolving and installing the origin through the shared resolver when needed, pinning a remote origin to the exact immutable commit or package version the fetch settled on (a local `path:` origin recorded as given), validating the manifest's `name`, `version`, and required non-empty `description`, and writing or confirming `templates[name]` — idempotent on a repeated identical origin, refused on a different origin without `--replace`, and refusing `--replace` itself unless `targets` is empty. The system **MUST** implement `unregister <name>`, refusing while `targets` is non-empty and listing every dependent target (`target`).

**Implements**:
- `cpt-frontx-flow-composed-provenance-register-template`
- `cpt-frontx-flow-composed-provenance-unregister-template`
- `cpt-frontx-algo-composed-provenance-register`
- `cpt-frontx-algo-composed-provenance-unregister`

**Constraints**: `cpt-frontx-constraint-cli-registration-origin-pinning`

**Touches**:
- Component: `cpt-frontx-component-cli-registration`, `cpt-frontx-component-cli-provenance-recorder`
- Entities: `Template`, `ProjectProvenance`

### Project-Owned Ownership Exceptions

- [ ] `p1` - **ID**: `cpt-frontx-dod-composed-provenance-ownership-management`

The system **MUST** implement `ownership add`, `remove`, and `list` against `projectOwnedRoots`, creating, moving, or deleting no file: `add` **MUST** accept only an existing path, refusing a nonexistent one with `INVALID_PATH`, and **MUST** be refused with `TARGET_CONFLICT` when that path coincides with or is an ancestor of any applied target, checked through the same canonicalized geometry the Conflict Checker runs for assembly; `remove` **MUST** un-mark a path without touching files; `list` **MUST** read `projectOwnedRoots` without writing, refusing with `PROJECT_INVALID` when the document cannot be parsed (`target`).

**Implements**:
- `cpt-frontx-flow-composed-provenance-ownership-add`
- `cpt-frontx-flow-composed-provenance-ownership-remove`
- `cpt-frontx-flow-composed-provenance-ownership-list`
- `cpt-frontx-algo-composed-provenance-ownership-add`
- `cpt-frontx-algo-composed-provenance-ownership-remove`

**Constraints**: `cpt-frontx-constraint-cli-boundary-declaration`

**Touches**:
- Component: `cpt-frontx-component-cli`, `cpt-frontx-component-cli-provenance-recorder`
- Entities: `OwnershipBoundary`, `ProjectProvenance`

### Project State Contract Ownership

- [ ] `p1` - **ID**: `cpt-frontx-dod-composed-provenance-contract-ownership`

The system **MUST** treat this feature as the owner of the project state (provenance) contract's concrete field-level schema — `formatVersion`, `templates[name] = { origin, version, targets[] }`, `projectOwnedRoots` — so every other feature that reads or writes the document (`cpt-frontx-feature-cli-scaffolding`'s Assembler and Conflict Checker, `cpt-frontx-feature-upgrade-changeset`'s Change-Set Engine) cites this feature's schema rather than declaring its own (`target`).

**Implements**:
- `cpt-frontx-algo-composed-provenance-project-state-io`

**Contracts**: `cpt-frontx-contract-project-provenance` (OWNER)

**Touches**:
- Entities: `ProjectProvenance`

### Project State Validated Against Reality

- [ ] `p1` - **ID**: `cpt-frontx-dod-composed-provenance-validate-project`

The system **MUST** implement `validate --project`, checking the project state document this feature owns against reality rather than only against its own structural shape: the document **MUST** parse as `{ formatVersion, templates, projectOwnedRoots }` with every `targets[]` entry normalized and duplicate-free (`PROJECT_INVALID` otherwise), every registered name's currently resolvable manifest version **MUST** match its recorded `templates[name].version` (`VERSION_MISMATCH` otherwise), every registered origin **MUST** still resolve (`ORIGIN_UNAVAILABLE` otherwise), the full recorded `targets[]` set **MUST** carry no ownership-geometry conflict when resubmitted through the Conflict Checker's geometry (`TARGET_CONFLICT` otherwise, reusing `cpt-frontx-algo-cli-scaffolding-conflict-check` rather than redefining conflict geometry), and every `projectOwnedRoots` entry **MUST** still exist on disk (`INVALID_PATH` otherwise) (`target`).

**Implements**:
- `cpt-frontx-flow-composed-provenance-validate-project`
- `cpt-frontx-algo-composed-provenance-validate-project`

**Constraints**: `cpt-frontx-constraint-cli-boundary-declaration`

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`, `cpt-frontx-component-cli-provenance-recorder`
- Entities: `ProjectProvenance`, `Template`, `OwnershipBoundary`

## 6. Acceptance Criteria

- [ ] A repository carries exactly one CLI-managed state document, `.frontx/project.json`, with `formatVersion`, a `templates` map, and `projectOwnedRoots`; no second registry, provenance, or ownership file is ever written.
- [ ] Registering a remote origin whose reference names a branch records a commit SHA (or exact package version) in `templates[name].origin`, never the branch name, and re-resolving it later returns byte-identical content.
- [ ] Registering a local `path:` origin records the literal path, unpinned, with the version the manifest at that path declares at registration time.
- [ ] Registering the same resolved origin twice performs no write on the second call.
- [ ] Registering a different origin for an already-registered name without `--replace` is refused with `REGISTRATION_CONFLICT`; the same call with `--replace` succeeds only when `targets` is empty and is refused with `TARGETS_EXIST` when it is not.
- [ ] A resolved manifest missing `name`, `version`, or a non-empty `description` fails registration with `INVALID_MANIFEST`, naming the missing or empty field, with no entry written.
- [ ] `unregister` on a name with a non-empty `targets` array is refused with `TARGETS_EXIST` and lists every target named; the same call on a name with an empty array removes the entry.
- [ ] `unregister` on a name with no entry returns `TEMPLATE_NOT_REGISTERED`.
- [ ] `ownership add` on a path that does not exist is refused with `INVALID_PATH`; on a path coincident with or an ancestor of an applied target it is refused with `TARGET_CONFLICT`; otherwise the path is appended to `projectOwnedRoots` with no file created, moved, or deleted, and a repeated `add` of the same path is a no-op.
- [ ] `ownership remove` removes a path from `projectOwnedRoots` (or no-ops if absent) without touching any file.
- [ ] `ownership list` reads `projectOwnedRoots` without writing anything, refusing with `PROJECT_INVALID` when the document cannot be parsed.
- [ ] `validate --project` PASSes on a structurally sound document whose every registered name's manifest version matches its recorded version, whose every origin still resolves, whose recorded targets carry no ownership-geometry conflict, and whose every `projectOwnedRoots` entry still exists on disk.
- [ ] `validate --project` returns `PROJECT_INVALID` for a malformed document or a malformed/duplicated `targets[]` entry, `VERSION_MISMATCH` for a name whose resolvable manifest version differs from its recorded version, `ORIGIN_UNAVAILABLE` for a name whose origin no longer resolves, `TARGET_CONFLICT` for an ownership-geometry conflict among recorded targets (reusing the Conflict Checker's geometry, not a redefinition of it), and `INVALID_PATH` for a `projectOwnedRoots` entry no longer present on disk.
- [ ] Every `RETURN`-level refusal in this feature's flows and algorithms names a code from the shared error-code vocabulary (`cpt-frontx-adr-uniform-cli-json-envelope`).
- [ ] A simulated interrupted write to `.frontx/project.json` (via the temp-file-plus-rename mechanism) leaves the repository holding the prior valid document, never a partially-merged one and never no document where one previously existed.
- [ ] `cfs --json validate --artifact packages/cli/architecture/features/composed-provenance/FEATURE.md --skip-code` returns PASS.
- [ ] `cfs --json validate-toc packages/cli/architecture/features/composed-provenance/FEATURE.md` returns PASS.
