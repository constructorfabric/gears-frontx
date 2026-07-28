# Feature: Template Manifest Contract & Pre-Publish Validation


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Validate Template for Publication](#validate-template-for-publication)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Validate Template Structure Against the Manifest Contract](#validate-template-structure-against-the-manifest-contract)
- [4. States (CDSL)](#4-states-cdsl)
  - [TemplateManifest Validation State Machine](#templatemanifest-validation-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Manifest Contract Validation Command](#manifest-contract-validation-command)
  - [Manifest as Single Authoritative Description](#manifest-as-single-authoritative-description)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-template-manifest`
## 1. Feature Context

- [x] `p2` - `cpt-frontx-feature-template-manifest`

### 1.1 Overview

The template manifest contract defines the single versioned descriptor every publishable template exposes, validated at pre-publish time and consumed at install, apply, and assembly time — giving the CLI one authoritative description to check and read generically. This feature owns the manifest's concrete schema: exactly four declared categories — (1) identity, (2) version, (3) ownership boundaries, and (4) referenced templates — where a template declares what it produces and the ground it owns.

### 1.2 Purpose

This feature defines and enforces the conformance contract (`cpt-frontx-contract-template-manifest`) that every template must satisfy to be publishable, and owns its concrete field-level schema per `cpt-frontx-adr-contract-schema-ownership`. The manifest is a single file named `frontx-template.json` located at the root of the template directory. The CLI validates a candidate template's manifest against the four lean categories before publication, and the same manifest is read at install, apply, and assembly time so one authoritative description serves all commands. The four categories are: **identity** (the template's name); **version** (a versioned shape); **ownership boundaries** (the exclusive subtrees the template alone writes and, per shared file, the regions it owns under a declared merge strategy drawn from a closed set — `cpt-frontx-adr-template-ownership-boundary-declaration`); and **referenced templates** (the templates a preset applies together, each declared by a well-formed template reference; a referenced template's own manifest declares where its content lands through that template's own ownership boundaries, so the reference carries no separate target location — `cpt-frontx-adr-composed-template-resolution`).

The **merge strategy** on a shared-file ownership-boundary entry is drawn from a closed set of exactly two values. **`exclusive`** — the template owns the shared file in whole and writes its entire body; at most one template across an assembly may claim a given path as `exclusive`. **`region-union`** — the template owns one or more named, marker-delimited regions within the shared file, and at assembly the disjoint regions contributed by every co-owning template are composed into one repository file. Every co-owning template of a `region-union` path must declare `region-union`; mixing `exclusive` with `region-union` on one path, or two `exclusive` claims on one path, is a conflict for the pre-flight conflict check (`cpt-frontx-feature-cli-scaffolding`). A shared-file entry declaring any merge value outside this closed set is a validation violation.

**Region addressing** (owned by this feature per `cpt-frontx-adr-contract-schema-ownership`): a `region-union` shared-file entry declares the file path and the set of region keys the template owns. On disk each owned region is delimited by a matched begin/end sentinel-marker pair that embeds the owning template's identity and the region key — a language-comment-style marker line pair of the shape `frontx:region <template-identity>:<region-key>` … `frontx:endregion <template-identity>:<region-key>` — so a region can be located and extracted from a template's installed content, composed into one repository file at assembly, and re-located for boundary-scoped upgrade. Region keys must be unique within the declaring template. Two templates declaring the same region key on one path is a declared-level conflict the CLI's pre-flight conflict check refuses (`cpt-frontx-feature-cli-scaffolding`, from manifests alone). Two differently-keyed owned regions whose actual on-disk marker spans overlap is a content-level conflict that the pre-flight check — which compares only declared region keys — cannot observe; it is detected and refused when the shared file is composed at materialization.

**AI-extension bundle subtree.** A template that carries an AI-extension bundle declares its identity-scoped bundle root `.frontx/ai/<template-identity>/` (schema owned by `cpt-frontx-feature-template-ai-extensions`, where `<template-identity>` is this manifest's identity) as an ordinary **exclusive subtree** in its ownership boundaries. Because each template's bundle subtree is scoped to its own identity, co-applied templates' bundles are disjoint and the pre-flight conflict check accepts them.

**Reserved CLI-owned `.frontx/` namespace.** The `.frontx/` directory also holds CLI-owned metadata that is not template content: specifically `.frontx/provenance.json` (the provenance record set, `cpt-frontx-feature-composed-provenance`) and any other CLI metadata under `.frontx/` that is not a template's own `.frontx/ai/<template-identity>/` bundle subtree. This reserved namespace is **not template-declarable**: a manifest declaring an exclusive subtree (or shared-file path) that falls in the reserved CLI namespace is a validation violation. The precise line: `.frontx/ai/<template-identity>/` is template-declarable; `.frontx/provenance.json` and all other `.frontx/` CLI metadata are reserved.

**Requirements**: `cpt-frontx-fr-cli-template-validate-prepublish`

**Contracts (owned)**: `cpt-frontx-contract-template-manifest`

**Principles**: none owned by this feature

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-template-developer` | Authors a template's manifest to conform to the contract, runs pre-publish validation to confirm the template is publishable, and resolves any reported violations before publication. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR**: `cpt-frontx-adr-template-manifest-contract`
- **Dependencies**: `cpt-frontx-feature-template-resolution` (F10)

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor (human or external system) and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-publish-composed-project-template`

### Validate Template for Publication

- [x] `p1` - **ID**: `cpt-frontx-flow-template-manifest-validate-for-publication`

**Actor**: `cpt-frontx-actor-template-developer`

**Success Scenarios**:
- Template manifest conforms to the contract; the developer receives a PASS and proceeds to publish.

**Error Scenarios**:
- Template manifest is missing, structurally malformed, or fails contract checks; the developer receives a FAIL with a list of violations and must correct the manifest before retrying.

**Steps**:
1. [x] - `p1` - Template developer invokes the CLI pre-publish validate command on the candidate template directory - `inst-invoke-validate`
2. [x] - `p1` - CLI locates the manifest file (`frontx-template.json` at the root of the candidate template directory) - `inst-locate-manifest`
3. [x] - `p1` - **IF** the manifest file is absent - `inst-if-manifest-absent`
   1. [x] - `p1` - **RETURN** FAIL with violation: manifest file not found - `inst-return-manifest-absent`
4. [x] - `p1` - CLI delegates to the manifest validation algorithm (`cpt-frontx-algo-template-manifest-validate-contract`) - `inst-delegate-to-algo`
5. [x] - `p1` - **IF** the validation result is REJECTED - `inst-if-rejected`
   1. [x] - `p1` - CLI reports all violations to the developer with their locations - `inst-report-violations`
   2. [x] - `p1` - **RETURN** FAIL exit code - `inst-return-fail`
6. [x] - `p1` - **ELSE** (validation result is VALIDATED) - `inst-else-pass`
   1. [x] - `p1` - CLI reports PASS to the developer - `inst-report-pass`
   2. [x] - `p1` - **RETURN** success exit code - `inst-return-pass`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. Examples: validation routines, library functions. These are reusable building blocks called by Actor Flows or other processes.

### Validate Template Structure Against the Manifest Contract

- [x] `p1` - **ID**: `cpt-frontx-algo-template-manifest-validate-contract`

**Input**: candidate template directory path, manifest contract shape (the single authoritative description read at install, apply, and assembly time — `cpt-frontx-contract-template-manifest`) whose concrete schema declares exactly four categories: identity, version, ownership boundaries, and referenced templates

**Output**: validation result (VALIDATED with no violations, or REJECTED with a list of violations)

**Steps**:
1. [x] - `p1` - Read the manifest file from the candidate template directory - `inst-read-manifest`
2. [x] - `p1` - Parse the manifest into an in-memory structure - `inst-parse-manifest`
3. [x] - `p1` - **IF** the manifest cannot be parsed (malformed format) - `inst-if-parse-error`
   1. [x] - `p1` - Add violation: manifest is unparseable - `inst-add-parse-violation`
   2. [x] - `p1` - **RETURN** REJECTED with violations - `inst-return-parse-rejected`
4. [x] - `p1` - Verify that the manifest declares an identity field (name) - `inst-check-identity`
5. [x] - `p1` - **IF** identity field is absent or empty, or is not usable as a repository-relative path — the identity addresses the template's installed content path and its own `.frontx/ai/<template-identity>/` bundle subtree, so pre-publish validation refuses a value install would refuse - `inst-if-identity-missing`
   1. [x] - `p1` - Add violation: identity field is required and must be usable as a repository-relative path - `inst-add-identity-violation`
6. [x] - `p1` - Verify that the manifest declares a version field conforming to the versioned shape - `inst-check-version`
7. [x] - `p1` - **IF** version field is absent or malformed - `inst-if-version-missing`
   1. [x] - `p1` - Add violation: version field is required and must conform to the versioned shape - `inst-add-version-violation`
8. [x] - `p1` - Verify that the manifest declares the ownership-boundaries category: the exclusive subtrees the template alone writes and, per shared file, the regions it owns with a declared merge - `inst-check-boundaries`
9. [x] - `p1` - **FOR EACH** declared exclusive subtree - `inst-for-each-subtree`
   1. [x] - `p1` - **IF** the subtree is not a well-formed repository-relative path - `inst-if-subtree-invalid`
      1. [x] - `p1` - Add violation: exclusive subtree must be a well-formed repository-relative path - `inst-add-subtree-violation`
   2. [x] - `p1` - **IF** the subtree falls in the reserved CLI-owned `.frontx/` namespace — `.frontx/provenance.json`, or any `.frontx/` path that is not this manifest's own `.frontx/ai/<template-identity>/` bundle subtree - `inst-if-subtree-reserved`
      1. [x] - `p1` - Add violation: the reserved CLI-owned `.frontx/` metadata namespace is not template-declarable (only `.frontx/ai/<template-identity>/` may be claimed) - `inst-add-subtree-reserved-violation`
10. [x] - `p1` - **FOR EACH** declared shared-file entry - `inst-for-each-shared-file`
    1. [x] - `p1` - **IF** the entry omits its file path or its declared merge strategy - `inst-if-shared-file-invalid`
       1. [x] - `p1` - Add violation: a shared-file entry must declare a path and a merge strategy - `inst-add-shared-file-violation`
    2. [x] - `p1` - **IF** the declared merge strategy is not one of the closed set (`exclusive`, `region-union`) - `inst-if-merge-strategy-invalid`
       1. [x] - `p1` - Add violation: merge strategy must be one of the closed set `exclusive` or `region-union` - `inst-add-merge-strategy-violation`
    3. [x] - `p1` - **IF** the merge strategy is `region-union` and the entry declares no owned region keys - `inst-if-region-keys-missing`
       1. [x] - `p1` - Add violation: a `region-union` shared-file entry must declare at least one owned region key - `inst-add-region-keys-violation`
    4. [x] - `p1` - **IF** the entry's file path falls in the reserved CLI-owned `.frontx/` namespace (`.frontx/provenance.json` or any `.frontx/` path outside this manifest's own `.frontx/ai/<template-identity>/` bundle subtree) - `inst-if-shared-file-reserved`
       1. [x] - `p1` - Add violation: the reserved CLI-owned `.frontx/` metadata namespace is not template-declarable - `inst-add-shared-file-reserved-violation`
11. [x] - `p1` - Verify the referenced-templates category (the templates a preset applies together) - `inst-check-referenced`
12. [x] - `p1` - **FOR EACH** referenced-template entry - `inst-for-each-referenced`
    1. [x] - `p1` - Verify the entry carries a well-formed template reference - `inst-check-referenced-entry`
    2. [x] - `p1` - **IF** the reference is malformed - `inst-if-referenced-invalid`
       1. [x] - `p1` - Add violation: a referenced-template entry must declare a well-formed template reference - `inst-add-referenced-violation`
13. [x] - `p1` - **IF** any violations were accumulated - `inst-if-violations`
    1. [x] - `p1` - **RETURN** REJECTED with the accumulated violations list - `inst-return-rejected`
14. [x] - `p1` - **RETURN** VALIDATED with no violations - `inst-return-validated`

## 4. States (CDSL)

Include when entities have explicit lifecycle states.

### TemplateManifest Validation State Machine

- [x] `p1` - **ID**: `cpt-frontx-state-template-manifest-validation-lifecycle`

**States**: DRAFT, VALIDATED, PUBLISHED, REJECTED

**Initial State**: DRAFT

**Transitions**:
1. [x] - `p1` - **FROM** DRAFT **TO** VALIDATED **WHEN** the CLI pre-publish validate command completes with no violations - `inst-draft-to-validated`
2. [x] - `p1` - **FROM** DRAFT **TO** REJECTED **WHEN** the CLI pre-publish validate command reports one or more violations - `inst-draft-to-rejected`
3. [x] - `p1` - **FROM** REJECTED **TO** DRAFT **WHEN** the template developer corrects the manifest and prepares a new candidate - `inst-rejected-to-draft`
4. [x] - `p1` - **FROM** VALIDATED **TO** PUBLISHED **WHEN** the template developer publishes the template to its distribution channel - `inst-validated-to-published`

## 5. Definitions of Done

Specific implementation tasks derived from flows/algorithms above.

### Manifest Contract Validation Command

- [x] `p1` - **ID**: `cpt-frontx-dod-template-manifest-validate-command`

The system **MUST** implement the CLI pre-publish validate command (`target`) that locates the manifest file in a candidate template directory, executes the manifest validation algorithm, reports a PASS on success or a FAIL with a full violations list on failure, and returns appropriate exit codes so CI pipelines can gate publication automatically.

**Implements**:
- `cpt-frontx-flow-template-manifest-validate-for-publication`
- `cpt-frontx-algo-template-manifest-validate-contract`

**Constraints**: none directly owned; `cpt-frontx-adr-template-manifest-contract` governs contract evolution

**Touches**:
- CLI: pre-publish validate command (`target`)
- Entities: `TemplateManifest`
- Component: `cpt-frontx-component-cli`

### Manifest as Single Authoritative Description

- [x] `p1` - **ID**: `cpt-frontx-dod-template-manifest-single-description`

The system **MUST** ensure the same manifest shape (`cpt-frontx-contract-template-manifest`) — the four lean categories identity, version, ownership boundaries, and referenced templates — that the pre-publish validate command checks is the shape consumed at install, apply, and assembly time; there is exactly one description per template, no per-command divergence, and no command reads a different or partial descriptor (`target`).

**Implements**:
- `cpt-frontx-algo-template-manifest-validate-contract`

**Constraints**: none directly owned

**Touches**:
- CLI: install command, apply command (`target`)
- Entities: `TemplateManifest`, `OwnershipBoundary`
- Component: `cpt-frontx-component-cli`

## 6. Acceptance Criteria

- [x] The CLI pre-publish validate command locates the manifest in a candidate template directory and reports PASS or FAIL with violations.
- [x] A missing manifest file causes an immediate FAIL with a clear "manifest not found" violation.
- [x] A manifest lacking any of the required categories (identity, version, ownership boundaries) causes a FAIL listing each missing category as a violation.
- [x] A structurally malformed manifest (unparseable) causes a FAIL with a parse-error violation.
- [x] A manifest whose ownership-boundaries category declares an ill-formed exclusive subtree, a shared-file entry missing its path or declared merge strategy, a merge strategy outside the closed set (`exclusive`, `region-union`), or a `region-union` entry declaring no owned region keys, causes a FAIL naming each offending entry.
- [x] A manifest whose referenced-templates category lists an entry with a malformed template reference causes a FAIL naming each offending entry.
- [x] A manifest declaring an exclusive subtree or shared-file path in the reserved CLI-owned `.frontx/` metadata namespace (`.frontx/provenance.json`, or any `.frontx/` path other than the manifest's own `.frontx/ai/<template-identity>/` bundle subtree) causes a FAIL; a template may declare only its own `.frontx/ai/<template-identity>/` bundle subtree under `.frontx/`.
- [x] A conforming manifest declaring exactly the four categories causes a PASS result and a zero exit code.
- [x] The same manifest shape checked at pre-publish validation is consumed at install, apply, and assembly — no command reads a different or partial descriptor.
- [x] The manifest shape is versioned so that previously published manifests remain readable when the contract evolves.
