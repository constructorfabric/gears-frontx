# FrontX Quick Start Guide

> **TARGET AUDIENCE:** Humans
> **PURPOSE:** Quick start guide for developers using the FrontX ecosystem

FrontX is an **ecosystem for AI-driven creation of frontend projects**. It does
not prescribe what your app looks like — that comes from **templates**. Instead
it provides three capability sets that let AI agents and their human
collaborators scaffold, extend, and evolve a project against stable, contracted
capabilities.

## What FrontX Provides

- **Core Framework.** Makes an application runtime-extensible by
  composable microfrontends over a substrate for typed entities.
  Packages: `@gears-frontx/mfes`, `@gears-frontx/gts-plugin`, `@gears-frontx/api`.
- **CLI.** Owns the full lifecycle of assembling and evolving a
  repository from templates. Package: `@gears-frontx/cli` (the `frontx` binary).
- **AI Tooling Framework.** Equips AI agents with ecosystem
  capabilities and lets templates contribute their own.
  Package: `@gears-frontx/cyber-pilot-kit-frontx`.

Everything below is how you drive those capabilities. What each project
*becomes* is owned by the template you apply, not by the ecosystem.

## Install the CLI

```bash
npm install -g @gears-frontx/cli
```

Requirements: Node.js 24+, npm 10+. Verify with `frontx help`.

## Using the CLI

The CLI resolves templates from a source you name, into a local inventory, then
applies them to repositories. It bundles no templates of its own.

### 1. Install a template

Templates are addressed by a source-spec, `host:owner/repo[//subtree]@ref`. The optional
`//subtree` segment addresses a template that occupies a subtree of a repository, so
one repository can publish several templates:

```bash
frontx install github:acme/my-template@v1.0.0        # template at the repository root
frontx install github:acme/templates//shell@v1.0.0   # template in the shell/ subtree
frontx list          # show built-in defaults, this project's registered templates, and the local inventory
frontx list --json   # {"ok":true,"data":{"defaults":[...],"registered":[...],"installed":[...]}}
```

`acme` above is a placeholder: any repository can publish templates. This
repository contains none, and no published template source is declared
compatible with the current CLI here. The FrontX templates repository
([`constructorfabric/gears-frontx-templates`](https://github.com/constructorfabric/gears-frontx-templates))
has been where they were published from, but when this was checked
(2026-11-09) its manifests still used the legacy `schemaVersion` /
`ownershipBoundaries` form, which `install` and `register` refuse with
`INVALID_MANIFEST` (`update-local` reaches the same refusal only when the named
template is already installed and the fetch and earlier checks succeed), and its README describes older command forms
(`frontx seed … --source`, `frontx add … --source`) that this CLI does not
accept. Do not follow that README for this CLI's commands, and do not assume
its templates work until they are republished in the current manifest form;
nothing here promises a release or compatibility between the two. To try the
register-and-apply flow now, use a local template as described in
[A minimal local template (current contract)](#a-minimal-local-template-current-contract).

A template is tracked under the identity its own `frontx-template.json` declares, not under
the repository name. Installing a template whose identity is already taken by a different
source fails rather than overwriting the installed one.

### 2. Register a template's origin

Before a project can apply a template, register its origin — this creates
`.frontx/project.json` on first use:

```bash
# A remote origin is meant to be pinned to the exact commit the fetch settled on
# (see the note below the block)
frontx register github:acme/my-template@v1.0.0

# A path: origin naming a folder inside the project is recorded as given,
# unpinned — there is nothing external to pin against
frontx register path:vendor/my-local-template
```

**Pin guarantee, current status (known defect).** The intended contract is that a
remote origin is recorded as the exact immutable commit or version the fetch
resolved, never a moving ref. The current implementation does not guarantee
this. It takes the pin from a hexadecimal suffix on the downloaded archive's
root folder, and when that suffix is present it replaces the ref you typed with
it — even a full commit SHA, which has been observed to be recorded as a
7-character value; that suffix is an archive-root identifier, not necessarily a
commit abbreviation, and an abbreviation can be ambiguous. When no such suffix
is present, the ref you typed is kept as given and may move. So exact
reproducibility of a remote origin is **not currently guaranteed**, whatever
ref you type; reading `templates[name].origin` in `.frontx/project.json` after
registering shows what was recorded but does not prove it is an exact immutable
commit. If you need a guarantee, wait for a verified pinning fix, or control
the source and its versioning yourself outside this CLI; this guide makes no
promise about either. A `path:` origin is never pinned (below).

Registering the identical origin again is a no-op. Registering a *different*
origin for an already-registered name fails unless `--replace` is given, and
`--replace` itself refuses once the name has any applied target — `upgrade`
(below) is how an applied template's origin changes.

### 3. Apply the template to a target

`apply` and `assemble` both take an explicit, target-keyed batch —
`{"templates": {"<name>": ["<target>", ...]}}` — naming, for each already-registered
template, the target or targets to apply it to:

```bash
# Preview the batch first — resolves every named template and checks ownership
# geometry against everything already applied; writes nothing
frontx assemble --input '{"templates":{"@acme/my-template":["."]}}'

# Apply the identical batch for real
frontx apply --input '{"templates":{"@acme/my-template":["."]}}'
```

A repository can be assembled from **multiple independently-registered
templates**; conflicting assembly is detected and prevented before any file is
written. `apply` writes only the ground each template declares, and refuses —
naming the paths — where that ground already holds content the batch does not
account for, unless `--adopt-existing` is given to adopt it as-is. The exact
rule and the reasoning behind it live in
[`packages/cli/architecture/features/cli-scaffolding/FEATURE.md`](packages/cli/architecture/features/cli-scaffolding/FEATURE.md).

If a template in the batch is getting its first target and the project already
holds a `.frontx/ai/<name>/` bundle for it, `apply --json` writes nothing and
answers `CONFIRMATION_REQUIRED`. Its `details.aiReplacements` lists every
change, with these kinds:

- `replace` overwrites the file, local edits included;
- `local-only` is a file the candidate lacks, and confirming deletes it;
- `local-only-directory` is a directory, and confirming removes it.

If the existing bundle entry itself is a symlink, the review identifies the
link path and its recorded target. Confirmation removes that link entry and
materializes the reviewed bundle at that path; it leaves the target (including
a dangling target) untouched. A changed link target invalidates the reviewed
plan before removal.

This review is issued before `apply` checks that every name is registered,
that targets do not conflict, and that existing content is accounted for. So
run `assemble` on the batch first. The confirming call
`--yes --plan-digest=<details.planDigest>` can still be refused, writing
nothing. One example is `EXISTING_PATHS_REQUIRE_DECISION`, which `assemble`
does not check. The digest binds the batch and the flags, so adding
`--adopt-existing` afterwards produces a new review.

### 4. Or seed a new project from the built-in defaults

`seed` creates `.frontx/project.json`, auto-registers each named template, and
applies the batch in one call — but it accepts **only the CLI's own built-in
default templates**, because nothing else is registered yet for a virgin
directory to resolve a batch against. This repository holds no template, so
which names are accepted is whatever the `defaults` set reports in your
installed CLI:

```bash
frontx list --json   # read the "defaults" set in the output
frontx seed ./my-app --input '{"templates":{"<default-name>":["."]}}'
```

If `defaults` is empty, `seed` has nothing it will accept. Acquire a template
by source-spec instead — `register` its origin (above) and `apply` it — which
is the path that works for any template, from any repository that publishes one.

`seed` refuses a directory that already carries a `.frontx/project.json` — a
project once seeded is extended through `apply`, never re-seeded.

### A minimal local template (current contract)

A template is a folder with a `frontx-template.json` of exactly four fields —
`name`, `version`, `description` and `excludedSubtrees` (an array, possibly
empty, of target-relative directories the template does not own) — plus its
payload. A `path:` origin must name a folder inside the project. This sequence
was run against the current binary:

```bash
mkdir -p my-project/vendor/my-template/src && cd my-project
cat > vendor/my-template/frontx-template.json <<'JSON'
{
  "name": "@acme/my-template",
  "version": "1.0.0",
  "description": "A minimal local template",
  "excludedSubtrees": []
}
JSON
echo "export const hello = 'world';" > vendor/my-template/src/index.ts

frontx validate vendor/my-template     # PASS: manifest conforms to the template contract
frontx register path:vendor/my-template
frontx assemble --input '{"templates":{"@acme/my-template":["app"]}}'   # preview, writes nothing
frontx apply    --input '{"templates":{"@acme/my-template":["app"]}}'   # writes app/src/index.ts
frontx validate --project              # PASS
```

A manifest that still carries the legacy `schemaVersion` or `ownershipBoundaries`
fields is refused by `register` with `INVALID_MANIFEST`; `frontx validate <dir>`
reports what the contract requires. This walkthrough is a local exercise, not a
statement that any published template source works with this CLI.

### 5. Upgrade a registered template

```bash
# Interactive: review the change set, then approve
frontx upgrade @acme/my-template github:acme/my-template@v1.1.0

# Non-interactive (CI/agent): two calls. The first returns CONFIRMATION_REQUIRED
# with the plan (and its planDigest) and writes nothing; the second, identical
# plus --yes and the reviewed plan's digest, acts only on that plan.
# PLAN_DIGEST is details.planDigest copied from the first call's output,
# for the plan you reviewed and approved
frontx upgrade @acme/my-template github:acme/my-template@v1.1.0 --json
frontx upgrade @acme/my-template github:acme/my-template@v1.1.0 --json --yes --plan-digest="$PLAN_DIGEST"

# Reverse the most recent upgrade, back to the origin it just left
frontx upgrade @acme/my-template --restore
```

`--yes` is accepted only together with `--json`; `upgrade … --yes` on its own is
refused (exit code 1) rather than treated as approval.

For `upgrade`, `--plan-digest` is required on the confirming call and binds approval
to the plan that was reviewed — including the AI-extension bundle changes it
lists: a plan that differs when the confirming
call recomputes it (the project or the candidate changed, or nothing is left to
change because the project already reached the candidate) is not applied and
nothing is written. A changed plan comes back as a fresh `CONFIRMATION_REQUIRED`
with its own plan and digest to review; if the project already reached the
candidate, the `CONFIRMATION_REQUIRED` carries `details.reviewSuperseded` and
`details.at` but no plan or digest, because there is nothing left to approve. Without it,
`--json --yes` applies nothing and answers with the current review and its digest.
`--plan-digest` belongs to the confirming call (`--json --yes`) only. If an
upgrade is interrupted after it started writing, every writing command refuses
with `RECOVERY_REQUIRED` until `frontx upgrade <name> --recover` (same review →
`--yes --plan-digest` protocol) finishes or cancels it.

If `RECOVERY_REQUIRED` reports a `pendingPostCommit` intent with no matching
receipt, the CLI refuses before planning or dispatching any writer. This orphaned
state has no automatic `--recover` path: manual recovery is required before
writing commands can continue. The CLI does not infer or apply a repair.

A `path:` origin names a folder inside the project, so upgrading a template
registered that way means pointing it at a second folder holding the new
version, for example `frontx upgrade @acme/my-template path:vendor/my-template-v2`.
A `path:` origin whose folder has since moved on from the recorded generation is
not reversible through `--restore`.

Each registered template upgrades **independently**: the CLI diffs every one
of its applied targets against the new origin's payload, presents the
resulting whole-file operation plan (`ADD`/`REPLACE`/`REMOVE`/`KEEP_LOCAL`/
`UNCHANGED` — never a textual diff) for review, and applies it once approved.
The record of the new generation in `.frontx/project.json` is written as a
single state-document write (temporary file plus rename), but the file writes
across targets are not one transaction: the CLI attempts to roll back a write
failure it catches, and a failed state write leaves the files that already
landed with the record still naming the old generation. If the process dies or
the state write fails before that record is written, re-running the identical
upgrade is the intended remedy and is designed to converge, provided the same
origin and baseline still resolve and nothing else, such as another frontx
process or an outside edit, touched the project in between. The tests behind
this (an in-memory simulated crash, and a killed child process at selected
points before the record is written, with inventory promotion and the AI bundle
refresh stubbed) do not cover every crash point, the built CLI, or a crash after
the record is written: there the project already names the new generation, an
identical re-run reports nothing to do, and an interrupted inventory promotion or
AI bundle refresh is not completed by it. Concurrent runs (there is no lock) and
power loss are not covered either; the repository's own version control is the
fallback for anything outside those conditions. `.frontx/project.json` records the origin
a name is upgrading (or restoring) away from, so exactly one generation is
reversible with `--restore`; running `--restore` a second time in a row records
the origin it just left, so it goes back to where the first one came from (a
redo), and only the generation before that is out of reach.

`--restore` refuses with `TEMPLATE_NOT_REGISTERED` when the name is not
registered, and with `TARGET_NOT_APPLIED` when its registration has no applied
targets. It returns `NOTHING_TO_RESTORE` when no preceding origin is recorded —
the name was never upgraded or restored, or a later `register --replace` started
a new lineage — and `ORIGIN_UNAVAILABLE` or `VERSION_MISMATCH` when the recorded
preceding origin no longer resolves, or no longer reports its recorded version.

A plan can also carry a `skipped` list, separate from the operations above: paths
the upgrade or restore deliberately leaves exactly as they are, each with a
reason — `OUTSIDE_BOUNDARY` (outside what the template owns),
`RESERVED_TEMP_NAME` (collides with the CLI's own temporary-file convention) or
`RETAINED_GROUND` (ground a template gave up on an earlier upgrade, whose old
files are kept). Skipped paths do not stop the operation: the recorded version
still advances to the new one, so a later upgrade may report a left-behind file
as a conflict if it differs from both the recorded version and the next one.

### 6. Delete an applied target

```bash
frontx delete ./existing-repo/packages/mfe-a
```

`delete` computes what it would remove and what it would preserve, prompts for
confirmation (defaulting to No), and only then removes the target's ground
from disk and its entry from `.frontx/project.json`. `--dry-run` reports the
same plan without deleting anything or requiring confirmation; it is evaluated
before the confirmation gate, so it succeeds without `--yes`.

The confirmation is bound to the plan you reviewed. Interactively, the plan is
recomputed after your "y"; if it differs (a file appeared, the preserved set or
the AI-bundle removal changed) nothing is deleted, the updated plan is shown in
full and you are asked again. Every prompt, the updated ones included, names the
owning template, and states whether the owner's
`.frontx/ai/<name>/` bundle will be removed with everything in it.

What it preserves is not only the template's declared `excludedSubtrees`: the
protected ground covers any nested target, the project's own `projectOwnedRoots`,
ground the same template recorded as given up on an earlier upgrade, the local
origin folder of a `path:` template that lies under the target (its own or
another's), the environment entries (`.git`, `.DS_Store`, `Thumbs.db`), and
entries that cannot be enumerated (a FIFO, a socket, a dangling symlink; these
are listed only where an owned path covers them). The `toPreserve` list is
deduplicated, so a covering preserved root can stand in for the individual
paths beneath it rather than naming each one. The `.frontx` folder is the CLI's
own and is not listed.

In `--json` mode the confirmation is the two-call protocol: without `--yes`,
`delete` returns `CONFIRMATION_REQUIRED` with `toDelete` and `toPreserve` and
removes nothing; its `details` also carry `templateName`, `aiBundle`
(`removed`, `path`), `relinquishedGround` when present, and a `planDigest`.
After the plan is reviewed and approved, `delete <target> --json --yes
--plan-digest=<planDigest>` recomputes the plan and acts only when its digest
equals the stated one. If it differs, nothing is deleted and the answer is
`CONFIRMATION_REQUIRED` again with the updated plan, its new `planDigest` and
`planChangedSinceReview: true` — review that whole plan and confirm with its
digest only if it is approved. `--yes` without `--plan-digest` deletes nothing
and returns the current plan. The digest binds the listed paths, the preserved
set, recorded-ground changes and whether the AI bundle directory is removed; it
does not bind file bytes, the bundle's contents (removed recursively) or what a
symlink points at, and the check is not atomic with the removals after it.
`--dry-run` is the exception: it returns the plan as a successful result
before the confirmation gate, so it needs no `--yes`, and that result is a
report, not a completed deletion. `--yes` without `--json` is refused (exit
code 1) unless `--dry-run` is given, where it is accepted and has no effect. A
successful `--json` delete reports `toDelete`,
`toPreserve`, `templateName` and `wasLastTarget`, plus `exclusionsDrift`
(`current` and `recorded`) when the manifest's declaration and the recorded one
differ — both are honoured. Deleting a name's last target also removes its
`.frontx/ai/<name>/` extension bundle; if that cleanup fails the deletion still
succeeds and the result carries `aiBundleResidue` (`path`, `message`) naming
what is left.

Once every target under a name has been deleted, `frontx unregister <name>`
removes the now-targetless registration; unregistering a name that still has
applied targets is refused with `TARGETS_EXIST`, naming them. The one exception
is an entry whose origin is confirmed absent (the read finds nothing; a read or
permission error does not qualify and keeps `TARGETS_EXIST`) and that never
recorded `excludedSubtrees` (a state only an unsupported intermediate build could have written;
a hand-edited file is outside the supported contract): no deletion plan can be computed for it, so `unregister` drops the
registration and leaves every target's files on disk untouched. This branch is defensive: it exists for an unsupported intermediate state and is not a supported migration path. Human mode
prints a text confirmation; with `--json` the envelope data is
`{"name":...,"outcome":"orphan-dropped","orphanedTargets":[...]}`.

### 7. Manage the project's own reserved paths

A project can carve out paths no template may claim:

```bash
frontx ownership add ./docs
frontx ownership list
frontx ownership remove ./docs
```

These `projectOwnedRoots` are checked by the same conflict check that guards
`assemble`/`apply`/`seed`, so a batch entry that would land on one is refused
before anything is written.

### 8. Validate a template, or the project itself

Validate a template's structure — including that its ownership boundaries are
well-formed — against the publication contract before publishing:

```bash
frontx validate ./path/to/template
```

Validate the current project's `.frontx/project.json` against reality — every
registered origin still resolvable, every recorded version still matching its
manifest, and no ownership-geometry conflict among recorded targets:

```bash
frontx validate --project
```

### CLI command reference

| Command | Purpose |
|---------|---------|
| `frontx install <spec> [--json]` | Install a template from `host:owner/repo[//subtree]@ref` into the inventory |
| `frontx list [--json]` | List built-in defaults, this project's registered templates, and the local inventory; `--json` emits `{"ok":true,"data":{"defaults":[...],"registered":[...],"installed":[...]}}` |
| `frontx register <origin> [--replace] [--json]` | Register a template's origin under the current project |
| `frontx unregister <name> [--json]` | Unregister a template that has no applied targets (or drop an orphan entry whose origin is confirmed absent, see §6) |
| `frontx assemble --input <batch-json> [--json]` | Preview an explicit batch against every registered template's declared ownership; writes nothing |
| `frontx apply --input <batch-json> [--adopt-existing] [--json [--yes --plan-digest=<digest>]]` | Apply an explicit batch into the current project; replacing an existing `.frontx/ai/<name>` bundle is reviewed first and needs `--yes --plan-digest` |
| `frontx seed <dir> --input <batch-json> [--adopt-existing] [--json [--yes --plan-digest=<digest>]]` | Bootstrap a **new** project directory from the CLI's built-in default templates only; an existing `.frontx/ai/<name>` bundle is reviewed before anything is written |
| `frontx upgrade <name> <origin> [--json [--yes --plan-digest=<digest>]]` | Upgrade a registered template to a new origin (reviewable change set) |
| `frontx upgrade <name> --restore [--json [--yes --plan-digest=<digest>]]` | Reverse a template's most recent upgrade |
| `frontx upgrade <name> --recover [--json [--yes --plan-digest=<digest>]]` | Finish or cancel an interrupted upgrade/restore after a fresh review |
| `frontx delete <target> [--dry-run] [--json [--yes --plan-digest=<digest>]]` | Delete an applied template target; confirmation-gated and bound to the reviewed plan. `--yes` needs `--json` and `--plan-digest`, except together with `--dry-run` (`delete <target> --dry-run --yes` is accepted without `--json`) |
| `frontx ownership add\|remove\|list <path> [--json]` | Manage the project's own reserved paths (`projectOwnedRoots`) |
| `frontx validate <templateDir> [--json]` | Validate a template for publication |
| `frontx validate --project [--json]` | Validate `.frontx/project.json` against the registry, the local inventory, and the filesystem |
| `frontx update-local <identity> <spec> [--json]` | Refresh a locally installed template from its source |
| `frontx help` | Show the usage summary |

Exit codes: `0` success, `1` user error, `2` internal error.

A destructive command's (`delete`, `upgrade`) `--json` mode never prompts:
without `--yes` it returns `CONFIRMATION_REQUIRED` with the computed plan (the
one exception is `delete --dry-run --json`, which returns the plan as a
successful result before the confirmation gate), and
re-issuing the command with `--yes` recomputes that plan from scratch
before acting on it — it never trusts the first call's result. For `delete` the
confirming call must also state `--plan-digest=<details.planDigest>` of the
reviewed plan, and a plan that differs is returned for a new review instead of
deleted. The same holds for `upgrade` (and `apply`/`seed` when they would replace an
existing AI bundle): without the digest nothing is applied (see the upgrade
section); a dry-run result is
not the preview a confirming call binds to. `--yes` is
accepted only together with `--json`, except that `delete --dry-run` accepts it
without `--json` and needs no confirmation at all. Every command's
`--json` mode emits exactly one JSON value on stdout — either
`{"ok":true,"data":...}` or `{"ok":false,"error":{"code","message","details"}}`
— with a non-zero exit on failure.

## The Core Framework

An application built on FrontX becomes **runtime-extensible by microfrontends**.
The Core Framework provides the substrate; a template wires it into a concrete
app. Its guarantees:

- **Registration & loading** — microfrontends register with the application and
  load on demand (`@gears-frontx/mfes`).
- **Extension domains** — named slots a microfrontend can occupy; a domain may
  allow one or multiple occupants.
- **Typed entities** — microfrontends and their extensions are validated against
  type definitions at registration; applications register their own type
  definitions at build time or at runtime (`@gears-frontx/gts-plugin`).
- **Host communication** — microfrontends communicate with the host and react to
  host state changes over a bridge.
- **API layer** — typed API protocols and a service registry (`@gears-frontx/api`).
- **UI-framework-agnostic** — the framework never constrains your UI choice; UI
  libraries, styling, layout, and state management are the template's concern.

You consume these packages from within a template/application; the ecosystem
ships no application, host, or UI of its own.

## AI Tooling

The AI Tooling Framework is delivered as a **Constructor Studio kit**
(`cyber-pilot-kit-frontx`) — the kit *is* the framework's public surface. It is
published to npm as `@gears-frontx/cyber-pilot-kit-frontx` and installed and
updated through the **Constructor Studio CLI** (`cfs`), not npm. On install, its `frontx_`-prefixed resources register in
the project's `.cf-studio/config/core.toml` and become available to agents at
session start — no training step.

### Install the kit

```bash
# Install the FrontX AI Tooling kit into a project (via Constructor Studio, not the frontx CLI).
# The kit lives inside this monorepo, so install it from the repository subdirectory:
cfs kit install git/https://github.com/constructorfabric/gears-frontx//packages/cyber-pilot-kit-frontx

# ...or from a local checkout of this repository:
cfs kit install path/packages/cyber-pilot-kit-frontx

# Update it later to a newer version
cfs kit update cyber-pilot-kit-frontx
```

Every resource the kit installs carries the `frontx_` prefix (KIT-1), so it
cannot collide with other kits (e.g. the SDLC kit) installed in the same
project. As shipped today the kit provides four concrete capabilities.

### Ecosystem fluency and request routing

The kit hands agents ecosystem knowledge at session start: a top-level skill
(`SKILL.md`) covering the package surface, architecture principles, and key
concepts; navigation rules (`AGENTS.md`); and boundary guidelines
(`guidelines/`). This is what lets an agent reason correctly about MFEs,
extension domains, source-specs, and the ecosystem/template boundary without
being taught.

`SKILL.md` also carries a **routing** section: for each kind of FrontX request it
states which capability serves it — creating a project, applying a reference the
developer already holds, adding a unit inside ground an applied template owns,
upgrading, or validating a template. A request matching none of them is reported
as unmatched rather than routed to the nearest capability.

### Intent-driven project scaffolding

The developer states what they want built — "a console with two screens, one
showing X and one showing Y" — instead of naming a template they would have to
know already. The skill selects what to apply by matching that intent against
the **descriptions** installed templates declare in their manifests, applies the
chosen set by running the `frontx` commands, and then realizes each unit the
intent named through the applied templates' own activated skills. It refuses
rather than guessing when nothing is installed, nothing matches, or two
candidates tie — writing no files in any of those cases — and it learns what is
installed only by invoking the CLI, never by reading the CLI's own storage.

It is one of two paths to the same result, never a replacement for the other —
see the note below.

The procedure itself lives in
[`packages/cyber-pilot-kit-frontx/skills/project-scaffolding/SKILL.md`](packages/cyber-pilot-kit-frontx/skills/project-scaffolding/SKILL.md),
which is what the agent follows — read it there rather than here, so there is
one copy to keep true.

### Template-extension discovery & activation

A template can ship its own AI capabilities — skills, workflows, guidelines, and
reference artifacts. When you `frontx install` such a template, the kit
**discovers and activates** those extensions in the consuming project
(`src/extensions/`), with no manual wiring: installed-template capabilities
simply become available to agents.

### AI-driven upgrade orchestration

Beyond the direct `frontx upgrade` path, the kit **orchestrates** upgrades over
the CLI's machine-readable command surface (`src/upgrade-orchestration/`):

```bash
frontx upgrade @acme/my-template github:acme/my-template@v1.1.0 --json
```

There is no stdin exchange: the surface is a two-call protocol. The first
`--json` invocation above writes nothing and returns `CONFIRMATION_REQUIRED`
with the computed plan in `details.plan`; approval is expressed by re-issuing
the identical command with `--yes` and `--plan-digest=<details.planDigest>`
appended; the kit always forwards the digest (it refuses to confirm when the
preview carries none), so the CLI recomputes the plan and acts only if it is
the plan that was reviewed. A direct `frontx upgrade … --json --yes` without the
digest applies nothing and returns the review. That two-call shape is what lets the kit layer review gates,
migration analysis, and downstream impact assessment onto the change set
between the two calls, before anything is applied.

> **Two paths, one engine.** Scaffolding is reachable both ways. State an intent
> and the kit's scaffolding skill chooses and applies for you; hold a template
> reference already and `frontx register` + `frontx apply` apply it directly,
> the same CLI path the skill itself drives. The kit adds the selection, the
> plan and the per-unit realization — never a second way to write a project,
> since both paths end in the same CLI commands. Validating a template
> (`frontx validate`) remains a direct CLI operation with no kit capability
> over it.

### Roadmap

The PRD also scopes standalone ecosystem skills — creating a microfrontend,
generating type definitions, and other ecosystem-scoped operations — to be
surfaced under the `project` and `mfe` command namespaces. These are declared
capabilities, not yet shipped as discrete skills; today those operations follow
the conventions documented in the ecosystem guidelines.

The framework is **template-agnostic** and ships zero template-specific content;
all template-specific capabilities arrive through template bundles.

## Developing the Ecosystem

To work on the ecosystem packages themselves, clone this repository:

```bash
git clone https://github.com/constructorfabric/gears-frontx.git
cd gears-frontx
npm ci
npm run build:packages   # build every ecosystem package
```

### Common commands

```bash
# Build
npm run build:packages        # build all ecosystem packages
npm run build --workspace=@gears-frontx/cli   # build a single package

# Validation (run before commits)
npm run lint                  # ESLint across the repo
npm run type-check            # type-check all ecosystem packages
npm run arch:check            # architecture tests (must pass)
npm run arch:deps             # dependency-boundary rules
npm run arch:unused           # unused-code report (knip); config hints fail the run

# Tests
npm run test:unit             # all package unit tests (packages/*)
npm run test:unit:watch       # watch mode
```

### Boundaries to respect

The ecosystem enforces package boundaries via ESLint + dependency-cruiser +
`scripts/test-architecture.ts`. In short: the Core Framework packages must not
carry solution-specific content (type-format literals, shared-property ids, or
layout-domain values) — those belong to templates and consuming applications.
Run `npm run arch:check` and `npm run arch:deps` before committing.

## Development Best Practices

1. **Keep the ecosystem template-agnostic** — no app, UI, layout, theme, or
   business-domain content in `packages/*`.
2. **Type everything** — no `any`, explicit return types, proper generics.
3. **Respect versioning** — the ecosystem commits to semantic-versioning
   discipline so breaking changes stay isolated from consumers.
4. **Prefer the contracts** — target the stable, contracted capabilities rather
   than internal implementation details.
5. **Let templates own the app** — screens, styling, and state are template
   concerns; the ecosystem provides only the substrate and tooling.

## Next Steps

- Read [PRD.md](./architecture/PRD.md) for the product vision and the full
  capability inventory
- Review [DESIGN.md](./architecture/DESIGN.md) for the ecosystem layers and
  package boundaries; each package's own design lives in
  `packages/<pkg>/architecture/`
- Explore the packages under `packages/`

## Getting Help

- Check the architecture docs under `architecture/`
- Run `frontx help` for the CLI command surface
- Refer to each package's types for its public API
