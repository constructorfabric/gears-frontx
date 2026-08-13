---
status: accepted
date: 2026-08-12
---

# Manifest-Keyed Template Registration with Immutable Origin Pinning

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [No registration step; installation is the record](#no-registration-step-installation-is-the-record)
  - [A registry keyed by a developer-chosen path, with mutable references](#a-registry-keyed-by-a-developer-chosen-path-with-mutable-references)
  - [Registration keyed by manifest identity with immutable origin pinning](#registration-keyed-by-manifest-identity-with-immutable-origin-pinning)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-template-registration-and-origin-pinning`

## Context and Problem Statement

The project-state redesign gives a repository exactly one document, `.frontx/project.json`, whose `templates` map is keyed by each registered template's manifest name and holds that name's `origin`, the `version` expected of it, and the `targets` it has been applied to (`cpt-frontx-adr-single-project-state-file`). Nothing yet fixes how an entry gets into that map, what value its `origin` field actually holds, or how a template carried inside the project itself (rather than fetched from a source registry) fits the same shape. The source-spec syntax decision (`cpt-frontx-adr-source-spec-syntax`, ADR 0017) fixed the token a developer types to name a versioned reference — `host:owner/repo[//subtree]@ref` — and assumed that token, including a `@ref` position that may name a moving branch or tag, is what a project stores and later re-resolves. Under the redesigned model an applied template's upgrade reads its baseline directly from that one `origin`/`version` pair (`cpt-frontx-adr-atomic-all-targets-upgrade`) and `apply` auto-installs a registered name's origin on demand (`cpt-frontx-adr-explicit-batch-application`); both depend on that pair naming something that resolves to the same content every time. A moving branch or tag, stored and re-read as typed, cannot serve as that baseline. What should "registering" a template mean, what should key a `templates` entry, what value should a remote versus a project-local origin actually record, and how should `install`, `register`, and `apply` divide the work of resolving, adopting, and consuming a template, so that every registered name has exactly one origin every later command can trust as fixed?

## Decision Drivers

* **One identity, no second name** — a template's identity is what its own manifest declares as `name` (`cpt-frontx-contract-template-manifest`, narrowed by `cpt-frontx-adr-thin-template-manifest`); a registration step that let a caller choose an independent registry path or alias would give one template two names with nothing forcing them to agree.
* **Reproducible acquisition without a second artifact** — version-pinned, reproducible acquisition is already required (`cpt-frontx-fr-cli-template-install`), and an atomic all-targets upgrade reads its baseline straight from a name's registered `origin`/`version` (`cpt-frontx-adr-atomic-all-targets-upgrade`); that pair can only be a stable baseline if the value itself is immutable, and reproducibility must be a property of the stored value, not of a lock file, hash, or revision record kept beside it.
* **A local template is not a moving remote reference** — a template carried inside the project's own tree has no external publication to pin against; forcing it through the same pin-to-immutable-form rule as a remote origin would either fabricate a pin that means nothing or make an in-place, actively-edited template impossible to register.
* **Register, install, and apply are three different questions** — "is this content available on this machine," "does this project depend on it by name," and "is it occupying a target" are independent facts; a caller must be able to ask the first without touching project state, and `apply` must be able to resolve a registered name to content on its own, without requiring the caller to have installed it by hand first.
* **No dangling or duplicated registration** — a name, once registered, must not silently acquire a second, conflicting origin, and its entry must not be removable while any target still depends on it, or `.frontx/project.json` could point at content no target traces to, or vanish out from under a target that does.
* **One discoverable catalog for a human or an AI** — the AI-composes/CLI-executes model reads `frontx list --json` to choose what to put in an explicit batch (`cpt-frontx-adr-explicit-batch-application`); that surface must show what could be registered and what already is, each carrying the `description` that carries its selection semantics (`cpt-frontx-adr-thin-template-manifest`), not only whatever happens to sit in a local cache.

## Considered Options

* **No registration step; installation is the record** — `install` materializes a template into the local inventory and that inventory doubles as the project's catalog; there is no separate registered set and no name-to-origin mapping written into project state.
* **A registry keyed by a developer-chosen path, with mutable references** — `register` accepts an arbitrary, hierarchical registry path (for example `frontend/mfe`) chosen by the caller as the entry's key, independent of the manifest's own `name`, and records the origin reference exactly as supplied, including an unpinned branch or tag.
* **Registration keyed by manifest identity with immutable origin pinning** — `register <origin>` resolves the origin (installing it first if not already available), reads `name`, `version`, and `description` from its manifest, and writes `templates[name] = { origin, version, targets: [] }` into `.frontx/project.json`, creating the entry or confirming it unchanged; a remote origin is recorded in its fully resolved, immutable form, while a local (`path:`) origin is recorded as given, because it has no separate publication to pin against.

## Decision Outcome

Chosen option: **Registration keyed by manifest identity with immutable origin pinning**, because it is the only option that gives every registered name exactly one origin, sourced from exactly one place, and lets that origin serve as an upgrade baseline without a second artifact to keep in step with it.

**`register <origin>`.** The `origin` argument is either a remote source-spec in the token shape `host:owner/repo[//subtree]@ref` (unchanged from `cpt-frontx-adr-template-acquisition-and-location` and `cpt-frontx-adr-source-spec-syntax`) or a local origin `path:<relative-path>` naming a folder inside the project. `register` resolves the origin — installing it into the local inventory first, through the one shared resolver `cpt-frontx-adr-template-acquisition-and-location` established, if its content is not already available there — then validates the fetched manifest against the current contract: a present `name`, a present `version`, and a required, non-empty `description` (`cpt-frontx-adr-thin-template-manifest`). A missing or empty description, or a missing `name` or `version`, fails registration closed rather than admitting a partially-described template. The `templates` entry's key is the manifest's own `name`, never a path or alias supplied at the `register` call site; its `version` comes from the manifest; its `origin` comes from the resolution below. A first registration initializes `targets` to an empty array, per the presence/emptiness semantics `cpt-frontx-adr-single-project-state-file` already assigns that field.

**Immutable pinning of a remote origin.** The `@ref` position a developer types may still name a tag, a branch, or a commit — the input token shape is unchanged. What `register` writes into `templates[name].origin`, however, is never that typed ref: it is the exact immutable value the resolver's fetch actually settled on — a commit SHA for a git-hosted source, an exact package version for a package-registry-hosted one. This is the one point where `cpt-frontx-adr-source-spec-syntax`'s working assumption — that a stored reference is later re-resolved by re-reading the same ref position, movable branch or tag included — no longer holds: after this decision, `templates[name].origin` is pinned once, at register time, and re-resolving it at any later point (a `validate` drift check, an `apply`-time auto-install, an `upgrade`'s baseline read) is guaranteed to fetch the same content, because the stored value no longer names anything that can move. No lock file, no separate revision record, and no content hash travels beside it: reproducibility is a property of the value stored, not of a second mechanism kept in sync with it.

**Local origin (`path:<relative-path>`).** A local origin names a folder living inside the project's own tree rather than on an external registry. It has no separate versioned publication to resolve to an immutable form, so it is **not pinned**: `register` records the path exactly as given, and the `version` recorded is whatever the manifest at that path declares at the moment of registration. A local origin's folder is excluded from every template's effective ownership and from `delete`, consistent with the "template's own local origin folder" exclusion `cpt-frontx-adr-whole-target-ownership` already carves out — this decision is what fixes the `path:` form that exclusion presupposes. Editing that folder's content after registration changes nothing about any target already applied from it: content moves onto an applied target only through the same explicit `upgrade` a remote version bump requires (`cpt-frontx-adr-atomic-all-targets-upgrade`), never automatically.

**Idempotency and `--replace`.** Calling `register` again with an origin that resolves to the same immutable value (remote) or the same path (local) as the name's current entry is a no-op. Calling `register` with a *different* origin for a name that already has an entry is refused unless the caller passes `--replace`, and `--replace` itself is refused unless that name's `targets` array is empty — changing the origin of a name with at least one applied target happens only through `upgrade`, never through `register --replace`, consistent with the boundary `cpt-frontx-adr-atomic-all-targets-upgrade` already assumed when it required `targets` to be empty for `register --replace` to suffice.

**Unregister invariant.** `unregister <name>` removes a `templates` entry only when its `targets` array is empty; otherwise the CLI refuses and lists every target still depending on that name, directing the caller to `delete` each one first. An entry can never be removed out from under ground it still occupies.

**`install`, `register`, and `apply`.** `install <origin>` is a purely local operation: it resolves the origin — pinning a remote one to its immutable form exactly as `register` would — verifies the fetched manifest, and returns the template's `name`, `version`, `description`, and canonical (pinned, for a remote origin) origin. It writes nothing into `.frontx/project.json` and registers nothing. `register` performs an install internally whenever the resolved origin's content is not already available locally, so a caller never has to install by hand first. Symmetrically, `apply` auto-installs a registered name's origin when applying it to a target and that content is not currently available locally, so a registered-but-not-yet-installed name is still directly appliable. The local inventory `install` populates and `register`/`apply` consult is an internal implementation detail of the CLI's template resolver (`cpt-frontx-component-cli-template-resolver`); its storage form is not a contract this decision fixes — only the pinned `origin` string and the manifest-declared `name`, `version`, and `description` are.

**Catalog visibility.** `frontx list --json` reports three sets side by side, each carrying its `description`: the platform's default templates, the project's registered templates (from `.frontx/project.json`), and the locally installed templates not yet registered to this project. This is the surface an AI or a developer reads before composing the explicit batch `apply` consumes (`cpt-frontx-adr-explicit-batch-application`), so a selection is always made against full visibility of what could be registered, not only what already is. The platform's default set is sourced from a list of official template origins built into the CLI itself — references naming where official templates live, not a bundled copy of their content — so this default catalog does not conflict with the CLI's no-bundled-template constraint (`cpt-frontx-adr-template-acquisition-and-location`): the CLI ships knowledge of official sources, never their content.

The no-registration option is rejected because a local inventory is a machine-local cache that does not travel with the repository, so a teammate or CI runner cannot see what a project depends on by name, and nothing distinguishes "once installed here" from "this project depends on it" for `unregister`'s protection to attach to. The developer-chosen-path option is rejected because it introduces a second name for the same template with nothing forcing it to agree with the manifest's own `name`, and because recording a reference exactly as typed leaves a registered entry's origin free to move, defeating the reproducible baseline an upgrade and a drift check both require.

### Consequences

* Good, because a template's identity is read from exactly one place — its own manifest — so no registration step can give one template two names to reconcile.
* Good, because reproducibility is a property of the stored `origin` value itself, so no lock file, hash store, or revision record has to be introduced or kept in step with it.
* Good, because a local template stays editable in place — a developer can iterate on `path:templates/foo` freely — without that edit silently reaching into a project that already applied it; propagation is always the explicit `upgrade` path.
* Good, because idempotent `register`, a `--replace` bounded to empty targets, and an `unregister` that refuses while targets are non-empty make the lifecycle safe to script or drive from an AI loop without a careless retry corrupting project state.
* Good, because separating `install` from `register` from `apply` lets a caller (or CI) resolve and inspect a template without committing any project state, and lets `apply` consume a registered name it has never locally installed.
* Bad, because pinning happens at `register` time, so a `register` call for a remote origin must reach that source at least once even when a caller only wants to record intent to depend on a version, not fetch content immediately.
* Bad, because a project that wants a name to always track "whatever a branch currently points to" cannot express that: the stored origin is immutable the moment it is pinned, and picking up new content requires an explicit `register --replace` (unapplied) or `upgrade` (applied) — a deliberate trade against the reproducibility driver, not an oversight.
* Bad, because a local (`path:`) origin has no pin at all: a project that moves or deletes that folder invalidates the origin with no immutable fallback to recover from, unlike a remote origin's commit SHA or exact package version.

### Confirmation

Compliance is confirmed by design and code review plus continuous-integration fixtures on the CLI: registering a remote origin whose `@ref` names a branch asserts the recorded `templates[name].origin` is a commit SHA (or exact package version), never the branch name, and that a later re-resolution of the stored origin — even after new commits land on that branch — returns byte-identical content. Registering the same origin twice performs no write on the second call. Registering a different origin for an already-registered name without `--replace` is refused; the same call with `--replace` succeeds only when `targets` is empty and is refused when it is not. `unregister` on a name with a non-empty `targets` array is refused and lists every target named; the same call on a name with an empty array removes the entry. `install <origin>` leaves `.frontx/project.json` byte-identical before and after. Registering an origin not yet locally available asserts an install occurs as a side effect before the entry is written; applying a registered-but-not-installed name asserts the same auto-install occurs before materialization. Registering a `path:` origin asserts the recorded origin is the literal path, not a resolved or pinned form, and that editing the folder's content afterward does not change the files of any target already applied from that name.

## Pros and Cons of the Options

### No registration step; installation is the record

`install` materializes a template into the local inventory; that inventory is read directly as the project's catalog, with no separate registered set and no origin recorded in project state.

* Good, because it removes one command and one concept — a developer or AI need only install to have a usable, listable template.
* Bad, because the local inventory is a machine-local cache that does not travel with the repository, so a teammate or a CI runner cannot see what templates a project depends on by name.
* Bad, because an AI reading `list` sees only what happens to be installed on this machine, not a project-scoped catalog of what it could register.
* Bad, because nothing distinguishes "I once evaluated this template" from "this project depends on it," so there is no state for an `unregister`-style guard to protect.

### A registry keyed by a developer-chosen path, with mutable references

`register` accepts an arbitrary registry path chosen by the caller as its key, independent of the manifest's `name`, and stores the origin reference exactly as typed, branch or tag included.

* Good, because a project can organize its dependencies under a namespace of its own choosing, independent of what a template author called it.
* Neutral, because this is closer to how some package managers let a manifest alias a dependency under a local name.
* Bad, because it gives one template two names — the chosen registry path and the manifest's own `name` — with nothing forcing them to agree.
* Bad, because storing a reference exactly as typed leaves a registered origin free to move, so two resolutions of the same entry can silently return different content, defeating the reproducible-baseline driver.

### Registration keyed by manifest identity with immutable origin pinning

`register` resolves the origin, reads identity and version from the manifest, and writes one entry keyed by that identity; a remote origin is pinned to its resolved immutable form, a local origin is recorded as given.

* Good, because identity comes from exactly one place — the manifest — eliminating a second name to reconcile.
* Good, because a remote origin's reproducibility is a property of the immutable value stored, needing no lock file or hash alongside it.
* Good, because a local origin's lack of a pin is an honest reflection of having nothing external to pin against, rather than a fabricated guarantee.
* Neutral, because the exact field layout of a `templates` entry and of `install`'s/`list --json`'s return shapes remain owned by whichever FEATURE is later assigned them.
* Bad, because pinning at register time requires reaching a remote source at least once per registration, and forecloses a "track whatever this branch currently points to" registration style.

## More Information

This decision **narrows** its supersession of `cpt-frontx-adr-source-spec-syntax` (ADR 0017) to the one working assumption ADR 0017's remaining mechanics depended on: that a stored reference is later re-resolved by re-reading the same ref position it was given with, movable branch or tag included. This decision replaces only that assumption, with the pinning rule fixed above, under which a `templates[name].origin` value is resolved once, at register time, to an immutable commit SHA or exact package version, and travels as that pinned value from then on. Every other holding ADR 0017 fixed carries forward unchanged and is not reopened here:

* the token shape itself — `host:owner/repo[//subtree]@ref`, with the host ending at the first `:`, the ref selector beginning at the first `@`, the repository path splitting at its first `//`, and every other malformed shape rejected rather than reinterpreted — remains the **input** syntax `register` and `install` accept for a remote origin;
* the subtree's re-rooting semantics — a matched subtree is materialized with its own paths relative to itself, and narrowing refuses outright when re-rooting would lift a retained path out of the subtree it was addressed from — are unchanged;
* the requirement that a manifest's declared identity carry its own uniqueness guarantee (because `owner/repo` alone no longer guarantees uniqueness once several templates share a repository) and the accompanying prohibition on `:`, `\`, and control characters in that identity remain in force; both were consequences ADR 0017 recorded against the subtree shape, and they now live as a rule of the manifest contract rather than as a superseded ADR's consequence — see `cpt-frontx-adr-thin-template-manifest` (ADR 0035), the one place these identity rules are stated so they are not duplicated here;
* the update-local substitution risk ADR 0017 named but explicitly placed outside its own scope — that pointing a registered name's reference at a different subtree of the same repository can substitute one template for another with no acquisition-level failure — remains a live guard obligation on this decision's commands: only the identity the substituted template declares can distinguish the two, so `register --replace` and `upgrade` must compare the newly resolved manifest's identity against the name being replaced or upgraded and refuse a mismatch.

The externalization decision this token shape serves — the CLI bundles no template, resolves every one from an external source by versioned reference through one shared resolver, and materializes it into a tracked local inventory (`cpt-frontx-adr-template-acquisition-and-location`, ADR 0016) — is unaffected and remains in force; `register` and `install` both still resolve exclusively through that one shared resolver.

This decision populates, but does not redefine, the `templates` map `cpt-frontx-adr-single-project-state-file` (ADR 0036) fixed: that decision owns the document's existence, its top-level shape, and the presence/emptiness semantics distinguishing "registered" from "applied"; this decision fixes what value `register` writes into an entry's `origin` and `version`, and the command behavior (`register`, `install`, `unregister`, and `apply`'s auto-install) that produces and consumes those values. It relies on, without redeciding, the manifest fields it reads (`name`, `version`, `description`, fixed by `cpt-frontx-adr-thin-template-manifest`, ADR 0035), the local-origin-folder ownership exclusion it gives concrete form to (`cpt-frontx-adr-whole-target-ownership`, ADR 0037), the batch-application model that consumes a registered name at `apply` time (`cpt-frontx-adr-explicit-batch-application`, ADR 0038), and the atomic-all-targets upgrade that is the only path permitted to change an applied name's origin (`cpt-frontx-adr-atomic-all-targets-upgrade`, ADR 0041). The exact field-by-field JSON shape of a `templates` entry, and of the objects `install` and `list --json` return, remain owned by whichever FEATURE is assigned them, per `cpt-frontx-adr-contract-schema-ownership` (ADR 0027) — this decision fixes only the categories above and the pinning rule, not field names or types. These are non-binding pointers and do not form part of this decision's durable identity.

Integration analysis (**INT**): the source-spec remains a client-supplied contract (`cpt-frontx-contract-source-spec`) whose producer is any developer or tool naming a template and whose consumer is the CLI's shared resolver; this decision does not change that direction, only what the resolver's consumer-facing output (the pinned origin) looks like once registration completes. The source registry (`cpt-frontx-actor-github`) and the package registry (`cpt-frontx-actor-package-registry`) remain the external parties whose content a remote origin is pinned against; no other external party consumes a pinned origin, which is read only by the CLI's own later commands (`validate`, `apply`, `upgrade`). Version-compatibility intent is forward-looking: a pinned origin, once written, is read by every later CLI version the same way, and the input token shape it is derived from remains the one ADR 0017 fixed.

**SEC** — addressed: a local `path:` origin is the one developer-supplied filesystem path this decision introduces at the registration surface; it must resolve inside the project root under the same fail-closed canonicalization already required of every other path the CLI checks (`cpt-frontx-adr-nesting-aware-conflict-prevention`), and a path that cannot be proven to stay inside the root is refused. Neither a remote nor a local origin carries secret material.

Applicability of the remaining checklist categories:

* **PERF** — Not applicable, because resolving and validating one manifest at register time carries no throughput or latency budget at decision altitude.
* **REL** — Not applicable, because there is no service-availability target for a local command; the fail-closed refusal of an unresolvable origin or an invalid manifest is this decision's failure-mode treatment, covered under Confirmation.
* **DATA** — Not applicable as a complete schema, because the field-level shape of a `templates` entry and of `install`/`list --json` output remains owned by their eventual FEATURE per `cpt-frontx-adr-contract-schema-ownership`; this decision fixes only what each value must be, not how it is laid out.
* **OPS** — Not applicable, because no operational procedure attaches to a local registration command.
* **COMPL** — Not applicable, because no regulatory obligation bears on template registration.
* **MAINT** — addressed: pinning at register time removes any need for a lock file, hash store, or revision record as a second mechanism to maintain alongside `.frontx/project.json`.
* **UX** — addressed: `frontx list --json` gives a developer or an AI one catalog of defaults, registered, and installed templates with their descriptions, and registration failures (a missing description, a name/origin conflict without `--replace`, an unregister blocked by live targets) are reported through the CLI's stable JSON envelope naming the exact reason.
* **BIZ** — Not applicable, because product requirements live in the PRD and are cited here by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-contract-source-spec` — This decision fixes what happens to a versioned reference once it is used to register a template: the reference's own token shape is unchanged, but the value a project retains is the reference resolved to an immutable commit SHA or exact package version, not the reference as typed.
* `cpt-frontx-fr-cli-template-install` — This decision separates `install` (a purely local resolve-and-verify operation touching no project state) from `register` (which performs an install internally when needed), while keeping installation itself deterministic and version-pinned exactly as this requirement demands.
* `cpt-frontx-fr-cli-template-list` — `frontx list --json` is extended to report default, registered, and installed templates side by side with their descriptions, giving a developer or an AI one catalog to select from before composing a batch.
* `cpt-frontx-fr-cli-project-upgrade-changeset` — The immutable `origin`/`version` pair this decision writes at registration is exactly the baseline `cpt-frontx-adr-atomic-all-targets-upgrade` reads to compute an upgrade, and `upgrade` remains the only path permitted to change that pair once a name's `targets` are non-empty.
* `cpt-frontx-adr-source-spec-syntax` — Superseded by this decision: its token shape is carried forward as the input syntax for a remote origin, but its assumption that a stored reference is re-resolved as typed, movable branch or tag included, is replaced by the pin-at-register rule fixed here.
* `cpt-frontx-adr-single-project-state-file` — This decision fixes the register/install/apply/unregister command behavior that produces and consumes the `origin` and `version` values inside a `templates` entry that decision's document shape already reserves space for.
* `cpt-frontx-adr-template-acquisition-and-location` — Its core holding — no bundled template, resolution only through one shared resolver, a tracked local inventory — is unaffected and is the mechanism `register` and `install` both resolve through.
