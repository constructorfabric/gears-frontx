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
  - [Validate Content Self-Containment](#validate-content-self-containment)
- [4. States (CDSL)](#4-states-cdsl)
  - [TemplateManifest Validation State Machine](#templatemanifest-validation-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Manifest Contract Validation Command](#manifest-contract-validation-command)
  - [Manifest as Single Authoritative Description](#manifest-as-single-authoritative-description)
  - [Content Self-Containment Is Checked at Pre-Publish Validation](#content-self-containment-is-checked-at-pre-publish-validation)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-template-manifest`
## 1. Feature Context

- [x] `p2` - `cpt-frontx-feature-template-manifest`

### 1.1 Overview

The template manifest contract defines the single versioned descriptor every publishable template exposes, validated at pre-publish time and consumed at install, apply, and assembly time - giving the CLI one authoritative description to check and read generically. This feature owns the manifest's concrete schema: exactly five declared categories - (1) identity, (2) version, (3) ownership boundaries, (4) referenced templates, and (5) description - where a template declares what it produces, the ground it owns, and, in its own prose, what it establishes and contributes so that a caller holding no reference can choose it.

### 1.2 Purpose

This feature defines and enforces the conformance contract (`cpt-frontx-contract-template-manifest`) that every template must satisfy to be publishable, and owns its concrete field-level schema per `cpt-frontx-adr-contract-schema-ownership`. The manifest is a single file named `frontx-template.json` located at the root of the template directory. The CLI validates a candidate template's manifest against the five lean categories before publication, and the same manifest is read at install, apply, and assembly time so one authoritative description serves all commands. The five categories are: **identity** (the template's name); **version** (a versioned shape); **ownership boundaries** (the exclusive subtrees the template alone writes and, per shared file, the regions it owns under a declared merge strategy drawn from a closed set - `cpt-frontx-adr-template-ownership-boundary-declaration`); **referenced templates** (the templates a preset applies together, each declared by a well-formed template reference; a referenced template's own manifest declares where its content lands through that template's own ownership boundaries, so the reference carries no separate target location - `cpt-frontx-adr-composed-template-resolution`); and **description** (the template's own prose statement of what it establishes and what it contributes - `cpt-frontx-adr-template-manifest-contract`).

The **description** is a single optional string field. It is **optional** so that manifests published before it was declared stay conforming and installable, and when present it must be a non-empty string: a field declared empty says nothing and is a violation rather than a silent absence. It carries prose only and is drawn from no closed set, so declaring it reintroduces none of the template classification `cpt-frontx-adr-uniform-template-mechanism` removed. Its consumer is template selection (`cpt-frontx-feature-ai-project-scaffolding`), which matches a stated intent against it; the consequence a template author accepts by omitting it is that the template is not selectable from an intent and is reachable only by its exact reference. Pre-publish validation checks the field's presence-and-shape only - that a declared description is a non-empty string - and never judges whether the prose accurately describes the template, which no structural check can establish.

The **merge strategy** on a shared-file ownership-boundary entry is drawn from a closed set of exactly two values. **`exclusive`** — the template owns the shared file in whole and writes its entire body; at most one template across an assembly may claim a given path as `exclusive`. **`region-union`** — the template owns one or more named, marker-delimited regions within the shared file, and at assembly the disjoint regions contributed by every co-owning template are composed into one repository file. Every co-owning template of a `region-union` path must declare `region-union`; mixing `exclusive` with `region-union` on one path, or two `exclusive` claims on one path, is a conflict for the pre-flight conflict check (`cpt-frontx-feature-cli-scaffolding`). A shared-file entry declaring any merge value outside this closed set is a validation violation.

**Region addressing** (owned by this feature per `cpt-frontx-adr-contract-schema-ownership`): a `region-union` shared-file entry declares the file path and the set of region keys the template owns. On disk each owned region is delimited by a matched begin/end sentinel-marker pair that embeds the owning template's identity and the region key — a language-comment-style marker line pair of the shape `frontx:region <template-identity>:<region-key>` … `frontx:endregion <template-identity>:<region-key>` — so a region can be located and extracted from a template's installed content, composed into one repository file at assembly, and re-located for boundary-scoped upgrade. Region keys must be unique within the declaring template. Two templates declaring the same region key on one path is a declared-level conflict the CLI's pre-flight conflict check refuses (`cpt-frontx-feature-cli-scaffolding`, from manifests alone). Two differently-keyed owned regions whose actual on-disk marker spans overlap is a content-level conflict that the pre-flight check — which compares only declared region keys — cannot observe; it is detected and refused when the shared file is composed at materialization.

**AI-extension bundle subtree.** A template that carries an AI-extension bundle declares its identity-scoped bundle root `.frontx/ai/<template-identity>/` (schema owned by `cpt-frontx-feature-template-ai-extensions`, where `<template-identity>` is this manifest's identity) as an ordinary **exclusive subtree** in its ownership boundaries. Because each template's bundle subtree is scoped to its own identity, co-applied templates' bundles are disjoint and the pre-flight conflict check accepts them.

**Reserved CLI-owned `.frontx/` namespace.** The `.frontx/` directory also holds CLI-owned metadata that is not template content: specifically `.frontx/provenance.json` (the provenance record set, `cpt-frontx-feature-composed-provenance`) and any other CLI metadata under `.frontx/` that is not a template's own `.frontx/ai/<template-identity>/` bundle subtree. This reserved namespace is **not template-declarable**: a manifest declaring an exclusive subtree (or shared-file path) that falls in the reserved CLI namespace is a validation violation. The precise line: `.frontx/ai/<template-identity>/` is template-declarable; `.frontx/provenance.json` and all other `.frontx/` CLI metadata are reserved.

**Reserved environment-owned names.** A second closed set is likewise not template-declarable: `.git`, `.DS_Store`, and `Thumbs.db`, at the repository root or nested at any depth. These belong to the developer's version control and to the operating system, never to a template. They are reserved here because the seed flow treats their presence in a target directory as carrying no content (`cpt-frontx-feature-cli-scaffolding`) - so a template permitted to declare one could claim ground the seed guard had already waved through as empty, and materialization would write into the developer's own `.git`. The exemption and the prohibition are two halves of one rule and must name the same set.

**Requirements**: `cpt-frontx-fr-cli-template-validate-prepublish`

**Contracts (owned)**: `cpt-frontx-contract-template-manifest`

**Principles**: none owned by this feature

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-template-developer` | Authors a template's manifest to conform to the contract, runs pre-publish validation to confirm the template is publishable, and resolves any reported violations before publication. |

### 1.4 References

- **PRD**: [PRD.md](../../../../../architecture/PRD.md)
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
- A file inside a declared exclusive subtree or shared-file path references a filesystem path - per the known-carrier registry (currently: a `package.json` `file:` specifier; a tsconfig file's `compilerOptions.paths` mapping, `extends` target, `references[].path` entry, `files`/`include`/`exclude` entry, or one of its path-valued `compilerOptions` (`baseUrl`, `rootDir`, `rootDirs`, `outDir`, `declarationDir`, `outFile`, `tsBuildInfoFile`, `typeRoots`); or a lockfile workspace-member key/`resolved` entry) - that resolves outside the candidate template directory; the developer receives a FAIL naming the offending file and path and must correct the reference before retrying.
- The candidate's content cannot be inspected at all - the filesystem refuses to enumerate a declared content-owning path (a permission-denied directory, a path that vanished mid-walk), or a declared content-owning path cannot be honestly enumerated because it is absent, is a broken symlink, or resolves outside the candidate template directory; the developer receives a FAIL naming the path that could not be read, never a PASS and never a raw runtime error. A check that cannot look must not report the outcome of having looked, and a declared boundary that does not hold is refused rather than treated as empty content.

**Steps**:
1. [x] - `p1` - Template developer invokes the CLI pre-publish validate command on the candidate template directory - `inst-invoke-validate`
2. [x] - `p1` - CLI locates the manifest file (`frontx-template.json` at the root of the candidate template directory) - `inst-locate-manifest`
3. [x] - `p1` - **IF** the manifest file is absent - `inst-if-manifest-absent`
   1. [x] - `p1` - **RETURN** FAIL with violation: manifest file not found - `inst-return-manifest-absent`
4. [x] - `p1` - CLI delegates to the manifest validation algorithm (`cpt-frontx-algo-template-manifest-validate-contract`) - `inst-delegate-to-algo`
5. [x] - `p1` - **IF** the validation result is REJECTED - `inst-if-rejected`
   1. [x] - `p1` - CLI reports all violations to the developer with their locations - `inst-report-violations`
   2. [x] - `p1` - **RETURN** FAIL exit code - `inst-return-fail`
6. [x] - `p2` - **ELSE** (manifest contract is VALIDATED), CLI additionally delegates to the content self-containment algorithm (`cpt-frontx-algo-template-manifest-validate-content-self-containment`), which inspects every file inside the manifest's declared content-owning paths - every exclusive subtree, plus every shared-file path; a refusal raised while enumerating those paths - a filesystem refusal, or a declared boundary that is absent, a broken symlink, or resolves outside the candidate template directory - is converted here into a FAIL naming what could not be read, since the command is the one boundary that owns the exit code - `inst-delegate-to-content-algo`
7. [x] - `p2` - **IF** the content self-containment result carries violations - `inst-if-content-violations`
   1. [x] - `p2` - CLI reports all content violations to the developer, naming the offending file and the escaping path - `inst-report-content-violations`
   2. [x] - `p2` - **RETURN** FAIL exit code - `inst-return-content-fail`
8. [x] - `p1` - **ELSE** (manifest contract VALIDATED and content self-containment carries no violations) - `inst-else-pass`
   1. [x] - `p1` - CLI reports PASS to the developer - `inst-report-pass`
   2. [x] - `p1` - **RETURN** success exit code - `inst-return-pass`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. Examples: validation routines, library functions. These are reusable building blocks called by Actor Flows or other processes.

### Validate Template Structure Against the Manifest Contract

- [x] `p1` - **ID**: `cpt-frontx-algo-template-manifest-validate-contract`

**Input**: candidate template directory path, manifest contract shape (the single authoritative description read at install, apply, and assembly time - `cpt-frontx-contract-template-manifest`) whose concrete schema declares exactly five categories: identity, version, ownership boundaries, referenced templates, and description

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
   2. [x] - `p1` - **IF** the subtree falls in a reserved namespace — the CLI-owned `.frontx/` namespace (`.frontx/provenance.json`, or any `.frontx/` path that is not this manifest's own `.frontx/ai/<template-identity>/` bundle subtree), or an environment-owned name (`.git`, `.DS_Store`, `Thumbs.db`) at any depth - `inst-if-subtree-reserved`
      1. [x] - `p1` - Add violation: the reserved namespace is not template-declarable (only `.frontx/ai/<template-identity>/` may be claimed under `.frontx/`, and no environment-owned name may be claimed at all) - `inst-add-subtree-reserved-violation`
10. [x] - `p1` - **FOR EACH** declared shared-file entry - `inst-for-each-shared-file`
    1. [x] - `p1` - **IF** the entry omits its file path or its declared merge strategy - `inst-if-shared-file-invalid`
       1. [x] - `p1` - Add violation: a shared-file entry must declare a path and a merge strategy - `inst-add-shared-file-violation`
    2. [x] - `p1` - **IF** the declared merge strategy is not one of the closed set (`exclusive`, `region-union`) - `inst-if-merge-strategy-invalid`
       1. [x] - `p1` - Add violation: merge strategy must be one of the closed set `exclusive` or `region-union` - `inst-add-merge-strategy-violation`
    3. [x] - `p1` - **IF** the merge strategy is `region-union` and the entry declares no owned region keys - `inst-if-region-keys-missing`
       1. [x] - `p1` - Add violation: a `region-union` shared-file entry must declare at least one owned region key - `inst-add-region-keys-violation`
    4. [x] - `p1` - **IF** the entry's file path falls in a reserved namespace — the CLI-owned `.frontx/` namespace (`.frontx/provenance.json`, or any `.frontx/` path outside this manifest's own `.frontx/ai/<template-identity>/` bundle subtree), or an environment-owned name (`.git`, `.DS_Store`, `Thumbs.db`) at any depth - `inst-if-shared-file-reserved`
       1. [x] - `p1` - Add violation: the reserved namespace is not template-declarable - `inst-add-shared-file-reserved-violation`
11. [x] - `p1` - Verify the referenced-templates category (the templates a preset applies together) - `inst-check-referenced`
12. [x] - `p1` - **FOR EACH** referenced-template entry - `inst-for-each-referenced`
    1. [x] - `p1` - Verify the entry carries a well-formed template reference - `inst-check-referenced-entry`
    2. [x] - `p1` - **IF** the reference is malformed - `inst-if-referenced-invalid`
       1. [x] - `p1` - Add violation: a referenced-template entry must declare a well-formed template reference - `inst-add-referenced-violation`
13. [x] - `p1` - Verify the description category: the template's own prose statement of what it establishes and contributes, which selection matches a stated intent against - `inst-check-description`
14. [x] - `p1` - **IF** the manifest declares a description that is not a non-empty string - `inst-if-description-invalid`
    1. [x] - `p1` - Add violation: a declared description must be a non-empty string - a description declared empty states nothing, whereas omitting it is permitted and only costs the template its selectability from an intent - `inst-add-description-violation`
15. [x] - `p1` - **IF** any violations were accumulated - `inst-if-violations`
    1. [x] - `p1` - **RETURN** REJECTED with the accumulated violations list - `inst-return-rejected`
16. [x] - `p1` - **RETURN** VALIDATED with no violations - `inst-return-validated`

### Validate Content Self-Containment

- [x] `p2` - **ID**: `cpt-frontx-algo-template-manifest-validate-content-self-containment`

Closes the gap the manifest-contract check alone leaves open: the contract validates the manifest's *declared* ownership boundaries, but nothing about that check inspects the *content* those boundaries own. A file inside a declared exclusive subtree or shared-file path can carry a filesystem-path reference - per the known-carrier registry (currently: a `package.json` `file:` dependency specifier; a tsconfig file's `compilerOptions.paths` mapping, `extends` target, `references[].path` entry, `files`/`include`/`exclude` entry, or one of its path-valued `compilerOptions` (`baseUrl`, `rootDir`, `rootDirs`, `outDir`, `declarationDir`, `outFile`, `tsBuildInfoFile`, `typeRoots`); or a lockfile workspace-member key / `resolved` entry) - that resolves outside the candidate template directory, and the contract check has no way to observe it. The registry is extensible: a carrier is anything this algorithm can parse structurally, and adding one is a code change here, not a spec rewrite. Deliberately out of scope: a `package.json` `workspaces` glob (a discovery pattern, not a literal path reference) and any file that is not a JSON carrier by name (e.g. a Vite config alias) - this algorithm parses every carrier structurally and never scans raw text, so a form it cannot parse is not in the carrier set at all. That is not the same as tolerating an unparseable carrier: a file the registry DOES claim, whose content cannot be read or parsed, is a violation rather than a skip.

This algorithm inspects the actual on-disk content of every declared content-owning path - every exclusive subtree, plus every shared-file path, since either boundary kind can own a carrier file (`cpt-frontx-adr-template-ownership-boundary-declaration`) - generically: it reads the manifest's own declarations and knows no template name, so it applies unchanged to every template.

**Input**: candidate template directory path, the content-owning paths declared in the manifest's ownership boundaries (every exclusive subtree, plus every shared-file path)

**Output**: validation result (VALIDATED with no violations, or REJECTED with a list of violations naming the offending file and the escaping path)

**Steps**:
1. [x] - `p2` - **FOR EACH** declared content-owning path (every exclusive subtree, plus every shared-file path) - `inst-csc-for-each-subtree`
   1. [x] - `p2` - Enumerate every regular file reachable under the path (the path itself, when it addresses a single file), including a dot-prefixed directory or dot-file (legitimate template content, e.g. `.gitignore` or a `.frontx/ai/<identity>` bundle), never descending into a `node_modules` directory (install-time output, never committed template content) - `inst-csc-enumerate-files`
2. [x] - `p2` - **FOR EACH** enumerated file whose name identifies it as a carrier of filesystem-path specifiers (`package.json`, a `tsconfig*.json` file, or an npm lockfile) - `inst-csc-for-each-carrier`
   1. [x] - `p2` - Read and parse the carrier file's content structurally - never by pattern-matching the raw text; a `tsconfig*.json` carrier is parsed JSONC-tolerantly (comments, trailing commas, and a leading byte-order mark allowed, matching what `tsc`'s own config reader accepts), while a `package.json` or lockfile carrier is parsed as strict JSON; a carrier that cannot be read, or whose content cannot be parsed under its own tolerance, is itself a violation naming the file and the carrier kind, since a carrier the algorithm did not inspect must not be indistinguishable from one it inspected and found clean - `inst-csc-parse-carrier`
   2. [x] - `p2` - Extract every path-like specifier the carrier's shape declares, per the known-carrier registry (currently: a `file:` dependency specifier in `package.json`; a `compilerOptions.paths` mapping entry (resolved against `baseUrl`), an `extends` target, a `references[].path` entry, a `files`/`include`/`exclude` entry, or a path-valued `compilerOptions` entry (`baseUrl`, `rootDir`, `rootDirs`, `outDir`, `declarationDir`, `outFile`, `tsBuildInfoFile`, `typeRoots`) in a tsconfig file; or a workspace-member key or a non-registry `resolved` entry in a lockfile) - `inst-csc-extract-specifiers`
   3. [x] - `p2` - **FOR EACH** extracted specifier - `inst-csc-for-each-specifier`
      1. [x] - `p2` - Resolve the specifier to a path relative to the candidate template directory, taken relative to the carrier file's own directory (and, for a tsconfig `paths` entry, relative to its `baseUrl`) rather than by pattern-matching `..` segments; a glob pattern resolves by the directory prefix it is anchored at, since that prefix is the whole of what containment can be decided from; an absolute, drive-prefixed, or home-relative (`~`) specifier is outside the root by definition, since every specifier in this resolution is contractually root-relative - `inst-csc-resolve-specifier`
      2. [x] - `p2` - **IF** the resolved path lies outside the candidate template directory - `inst-csc-if-outside-root`
         1. [x] - `p2` - Add violation naming the carrier file, the specifier, and the resolved path - `inst-csc-add-violation`
3. [x] - `p2` - **IF** any violations were accumulated - `inst-csc-if-violations`
   1. [x] - `p2` - **RETURN** REJECTED with the accumulated violations list - `inst-csc-return-rejected`
4. [x] - `p2` - **RETURN** VALIDATED with no violations - `inst-csc-return-validated`

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

The system **MUST** ensure the same manifest shape (`cpt-frontx-contract-template-manifest`) - the five lean categories identity, version, ownership boundaries, referenced templates, and description - that the pre-publish validate command checks is the shape consumed at install, apply, assembly, and selection time; there is exactly one descriptor per template, no per-command divergence, and no command reads a different or partial descriptor. The description category is optional, so a manifest omitting it conforms and installs, and a manifest declaring it as anything other than a non-empty string is rejected (`target`).

**Implements**:
- `cpt-frontx-algo-template-manifest-validate-contract`

**Constraints**: none directly owned

**Touches**:
- CLI: install command, apply command (`target`)
- Entities: `TemplateManifest`, `OwnershipBoundary`
- Component: `cpt-frontx-component-cli`

### Content Self-Containment Is Checked at Pre-Publish Validation

- [x] `p2` - **ID**: `cpt-frontx-dod-template-manifest-content-self-containment`

The system **MUST** ensure the CLI pre-publish validate command additionally rejects a candidate template whose declared content-owning paths (every exclusive subtree, plus every shared-file path) contain a file referencing a filesystem path - per the known-carrier registry (currently: a `package.json` `file:` specifier; a tsconfig file's `compilerOptions.paths` mapping, `extends` target, `references[].path` entry, `files`/`include`/`exclude` entry, or one of its path-valued `compilerOptions` (`baseUrl`, `rootDir`, `rootDirs`, `outDir`, `declarationDir`, `outFile`, `tsBuildInfoFile`, `typeRoots`); or a lockfile workspace-member key/`resolved` entry) - that resolves outside the candidate template directory, reporting the offending file and path. A reference that resolves to a location still inside the template directory (a legitimate relative reference to the template's own subpackages) is not a violation; an absolute, drive-prefixed, or home-relative (`~`) reference is always a violation, since every reference this check resolves is contractually root-relative. The check resolves paths structurally and never flags a reference by pattern-matching `..` segments. Deliberately out of scope: a `package.json` `workspaces` glob and any carrier that is not JSON (e.g. a Vite config alias) - the registry only covers carriers this algorithm can parse structurally.

**Implements**:
- `cpt-frontx-flow-template-manifest-validate-for-publication`
- `cpt-frontx-algo-template-manifest-validate-content-self-containment`

**Constraints**: `cpt-frontx-constraint-cli-template-independence` - the check inspects the candidate's declared subtrees generically; it declares no template name and bundles no template content.

**Touches**:
- CLI: pre-publish validate command (`target`)
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
- [x] A manifest declaring an exclusive subtree or shared-file path named `.git`, `.DS_Store` or `Thumbs.db`, at the root or nested at any depth, causes a FAIL — the same closed set the seed flow treats as carrying no content, so no template may claim ground that guard waves through.
- [x] A file inside a declared exclusive subtree or shared-file path that references a filesystem path resolving outside the candidate template directory - per the known-carrier registry (currently: a `package.json` `file:` specifier; a tsconfig file's `compilerOptions.paths` mapping, `extends` target, `references[].path` entry, `files`/`include`/`exclude` entry, or one of its path-valued `compilerOptions` (`baseUrl`, `rootDir`, `rootDirs`, `outDir`, `declarationDir`, `outFile`, `tsBuildInfoFile`, `typeRoots`); or a lockfile workspace-member key/`resolved` entry) - causes a FAIL naming the offending file and path; a reference that resolves to a location still inside the template directory is not flagged, and an absolute, drive-prefixed, or home-relative (`~`) reference always is.
- [x] A declared content-owning path that is absent, is a broken symlink, or resolves outside the candidate template directory causes a FAIL naming the path, never a silent PASS from enumerating no content.
- [x] A manifest declaring a description that is not a non-empty string causes a FAIL naming the description category; a manifest omitting the description entirely causes a PASS, because the category is optional and its absence costs the template only its selectability from a stated intent.
- [x] A conforming manifest declaring exactly the five categories causes a PASS result and a zero exit code.
- [x] The same manifest shape checked at pre-publish validation is consumed at install, apply, and assembly — no command reads a different or partial descriptor.
- [x] The manifest shape is versioned so that previously published manifests remain readable when the contract evolves.
