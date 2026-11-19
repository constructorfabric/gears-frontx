# PRD validation and review evidence

Date: 2026-11-13. Scope: the root, CLI and MFEs PRD changes in this proposal.
This is document validation and a bounded author-side semantic review. It does
not certify product behavior or substitute for an independent reviewer.

## Reviewed document scope

- [Root PRD](../../architecture/PRD.md): one cross-layer published-build contract.
- [CLI PRD](../../packages/cli/architecture/PRD.md): independent host/MFE builds,
  published manifests, host compositions, resource packaging and repeatability.
- [MFEs PRD](../../packages/mfes/architecture/PRD.md): BFF-selected builds and
  no-reload backend-context transitions with explicit failure outcomes.
- [Research](RESEARCH.md) and [source ledger](source-ledger.json): source-backed
  findings, proposal boundaries and 166 source-file/two dependency identities.

All 55 previous ID definitions are retained; 29 new definitions use existing
namespaces. New requirements are unchecked. All three PRDs carry version 1.1.0
and revision notes. No package, runtime or template implementation is changed.

Normative dependencies reviewed: root DESIGN ownership → member PRDs; root
compatibility policy → producer/runtime surfaces; the producer's complete
published-build contract → runtime admission/resources. Root owns the cross-layer
contract; members own detailed requirements. Research is evidence, not a second
normative source. Exact API/schema/lifecycle decisions remain technical design.

The semantic pass covers changed requirements and directly affected existing
context. It excludes a semantic re-audit of unchanged member documents and source
code/tests. Full deterministic validation still scans the configured inventory.

## CF resources and commands

Applied the installed SDLC PRD `template.md`, `rules.md`, `checklist.md` and
`examples/example.md`, the project artifact registry, and the core documentation
consistency checklist. PRDs use the configured English language. Existing member
ownership is retained; no new registry entry is needed.

The installed cached core is v1.8.0 and the SDLC kit is v1.2.1 at
`431812695894580d6933b088484fe14b663ad163`. The CLI package reports
`1.5.10.dev63`. The legacy preset names an unavailable `WriteDocsBootstrap`
continuation; canonical installed documenting workflows were used with the real
SDLC resources. The legacy continuation itself was not rewritten. Local kit
repair history and intermediate execution logs are outside this PR's scope.

[CF-VALIDATION.json](CF-VALIDATION.json) records exact argument arrays, exit codes,
results, validation-base identity and document fingerprints. Absolute workspace
prefixes in CLI output are normalized to repository-relative paths; no findings
are removed by that normalization.

| Command | Scope | Result |
|---|---|---|
| `cfs --json validate --artifact PATH` | Each edited PRD | PASS; 0 errors, 0 warnings |
| `cfs --json validate-toc PATH` | Each edited PRD | PASS; 0 errors, 0 warnings |
| `cfs --json check-language PATH` | Each edited PRD | PASS; English, 0 violations |
| `cfs --json validate --local-only` | Local artifact/code inventory | PASS; 89 artifacts, 334 code files; 0 errors, 7 baseline warnings; coverage 258/258 |
| `cfs --json validate-kits --verbose` | Two registered kits; authoring prerequisite check | PASS; 0 errors, 4 installed-example warnings |
| `git diff --check` | Tracked document changes | Exit 0 |

The repaired baseline had 10 heading-depth warnings. Three in the edited PRDs
were fixed. The remaining seven are in unchanged PRDs: `api`,
`cyber-pilot-kit-frontx`, `gts-plugin`, `routing`, `routing-tanstack`, `telemetry`
and `ui-kit`. The four kit warnings concern missing description blocks in the
installed DECOMPOSITION, DESIGN, FEATURE and PRD examples; none is introduced
by this proposal. These unrelated artifacts are left unchanged.

Checks ran in the child checkout at base
`cfc9e3758fbceab374fac9ae25d1f1db53f298ca`. Upstream `main` was rechecked at
`51cac14845d318de18c450f1ad8065aa5b14cdbe` during publication preparation. The
three PRD base files, root DESIGN and CONTRIBUTING were re-read at that SHA,
Git-blob verified and compared byte-for-byte with the checkout base. Candidate
patch applicability is checked against those upstream PRD bytes. This does not
claim a full-code validation run on a fresh upstream checkout or remote PR CI.

## Semantic methodology and remaining review gap

A separate author-side pass walked all 46 MUST HAVE items across BIZ, ARCH,
SEC, SAFE, PERF, REL, UX, MAINT, COMPL, DATA, INT, OPS, TEST and DOC, plus all
10 MUST NOT HAVE items, for the declared change scope. Every major category
is addressed or has explicit applicability boundaries, chiefly PRD §6.2.
Content depth was compared with the installed PRD example. No concrete future
API signatures, endpoint specification, data schema, infrastructure design or
implementation tasks were introduced. Acceptance criteria state observable
first-release outcomes rather than implementation test scripts.

The consistency pass covered INV, DEP, TERM, CLAIM, LINK, STALE and STYLE;
relative document targets/anchors were checked. Existing ID retention, new
unchecked requirement markers, absence of placeholders and absence of example-
consumer names in normative PRDs were separately asserted.

Native independent research/reviewer launches failed because configured models
were unavailable; no independent result was produced. Authoring and semantic
review were separate inline passes under one Orchestrator. This limitation is
retained for PR reviewers rather than presented as an independent verdict.
The bounded author pass has no remaining identified document findings.

## Review Report (Issues Only)

### CF-DOC-01 — Skipped heading levels (closed)

**Checklist Item**: `STYLE-DOC-002` — Accessibility and readability basics

**Severity**: MEDIUM

#### Why Applicable

The three edited PRDs must have a valid navigable hierarchy under CF TOC rules.

#### Issue

Existing use-case sections jumped from H2 to H4; the first document pass retained
those baseline warnings.

#### Evidence

The first validation pass reported `toc-heading-depth-jump` for the edited
PRDs; the repaired baseline had the same three warnings. Final results are
recorded in [CF-VALIDATION.json](CF-VALIDATION.json).

#### Why It Matters

The document section tree is ambiguous to navigation and retrieval.

#### Proposal

Insert descriptive H3 journey groups and regenerate TOCs. Applied in each PRD
§8; final artifact and TOC commands return zero warnings.

### CF-DOC-02 — Conflicting breaking-change policy (closed)

**Checklist Item**: `CLAIM-DOC-001` — No cross-document contradictions

**Severity**: CRITICAL

#### Why Applicable

Producer/runtime contracts must respect the existing independent-version policy.

#### Issue

Baseline API descriptions contradicted the canonical root evolvability policy.

#### Evidence

Root §6.1 permits pre-1.0 breaking changes in a minor release; baseline root
§7.1 says “a major version bump for any incompatible change”. Baseline CLI and
MFEs surface descriptions repeat the latter universal rule.

#### Why It Matters

Readers could select incompatible release/version guarantees for the new exchange.

#### Proposal

Reference canonical root §6.1, including its pre-1.0 distinction, from the three
affected surface descriptions. Applied; no new ecosystem version policy invented.

### CF-DOC-03 — Recovery exclusion too broad (closed)

**Checklist Item**: `REL-PRD-002` — Recovery Requirements

**Severity**: HIGH

#### Why Applicable

The new runtime requirement guarantees retry/another selection without page reload.

#### Issue

An inherited broad reliability/recovery exclusion could be read as excluding
required in-page recovery.

#### Evidence

Baseline MFEs §6.2 classified reliability, including “availability, recovery”, as
not applicable; new §5.2 explicitly requires a usable host for retry.

#### Why It Matters

A future implementation could satisfy the exclusion while dropping the central
no-reload failure requirement.

#### Proposal

Limit non-applicability to hosted-service uptime/durable recovery and point to
existing load recovery plus new context-transition recovery. Applied in MFEs §6.2.

### CF-DOC-04 — New use-case marker format (closed)

**Checklist Item**: `INV-DOC-002` — Document type classification

**Severity**: MEDIUM

#### Why Applicable

The installed PRD template gives use cases unchecked priority/ID markers.

#### Issue

The three newly authored use-case definitions initially used bare ID lines.

#### Evidence

Initial author content had `**ID**` without the template's `- [ ] p2` marker at
CLI §8.1 and MFEs §8.1; deterministic validation did not flag this difference.

#### Why It Matters

A deterministic pass alone did not establish exact template conformance.

#### Proposal

Use the actual template's unchecked p2 format for all three new use cases.
Applied; scoped assertions and final CF gates passed afterward.

## Design decisions and functional evidence still required

- Projects-orchestration and runtime maintainers must settle exact programmatic
  API/distribution, published-build identity representation, supported contract
  versions and migration rules before implementation.
- BFF integration shape and the no-reload lifecycle/shared/CSS mechanics require
  coordinated runtime DESIGN. Switching without reload is a settled product
  requirement, not an open product-scope question.
- No template/consumer build, browser transition, backend call, typecheck, unit
  suite or CI pipeline was run for this document-only change.
- External CI environment values were not audited; inspected `buildVersion`
  fallback behavior does not prove how every publication is configured.
- Declared-contract validation cannot prove backend behavioral compatibility;
  consumers own that integration evidence and publishers own resource retention.
