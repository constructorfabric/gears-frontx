# Changelog — `@gears-frontx/cli`

> **TARGET AUDIENCE:** Humans
> **PURPOSE:** Notable changes to the `frontx` command surface

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Only changes a caller can observe are recorded here — the accepted argument
shape, the `--json` envelope, error codes and exit codes. Internal
refactoring is not.

## [Unreleased]

### Changed

- When rollback after a caught upgrade or restore write failure cannot restore
  every destination or remove every attempt-owned temporary file, the engine
  returns `INTERNAL` with `details.originalFailure` and
  `details.unrecovered: [{ target, path }]`; each entry identifies the
  operation path associated with the failed destination restore or temp-file
  removal. For a started CLI transition, an
  uncommitted result with no changed project-footprint paths is returned as
  `INTERNAL` directly; otherwise it is wrapped as `RECOVERY_REQUIRED`,
  preserving the engine details and adding `cause`, `transitionCommitted`, and
  the receipt (plus `changedPaths` when uncommitted). An `unrecovered` entry
  may reflect temporary-file residue even when `changedPaths` is empty;
  destination files may remain changed.
- **Breaking:** `upgrade … --json --yes` (forward, `--restore`, `--recover`)
  applies only with `--plan-digest=<details.planDigest>`; without it nothing is
  applied and the call answers `CONFIRMATION_REQUIRED` with the current review.
  The review now lists the AI-extension bundle changes (`plan.ai`, local edits
  included) and the digest binds them; the bundle is written only from the
  reviewed bytes. `delete`'s review lists the AI bundle files a last-target
  deletion removes. When a name's first target would replace an AI bundle
  already in the project, `apply` reviews the replacement (local edits included)
  before any effect and applies it only with `--json --yes --plan-digest` (or the
  interactive prompt). `seed` does the same before registering anything (its
  `--json` gains `--yes --plan-digest`). An uninstalled remote candidate is
  acquired in memory for the review and the later install reuses those bytes;
  the digest also binds the batch, flags and the WHOLE candidate (every payload
  and AI byte), so a candidate changed outside its AI tree needs a new review.
  For `apply` and `seed` alike, anything other than a plain directory at or
  above `.frontx/ai/<name>` (file, FIFO, link — previously reclaimed by apply) is
  refused with `CONTENT_CONFLICT` before any write and left untouched.
- `apply`/`seed` no longer install a batch's missing remote templates before
  checking the whole batch: candidates are resolved in memory, every check runs,
  and only then are they installed (the same fetched bytes, read back) — a
  refusal anywhere leaves the local inventory untouched.
- An upgrade/restore records its unfinished post-commit work in the entry
  (`templates[name].pendingPostCommit`, document `formatVersion` 3, never lowered
  again); `upgrade`, `validate --project` and every other writer of that entry
  answer `RECOVERY_REQUIRED` until `--recover` finishes it.
- Writing commands share one mutation boundary: a concurrent writer gets
  `RESOURCE_BUSY`, and an interrupted upgrade/restore makes every writer answer
  `RECOVERY_REQUIRED` until `frontx upgrade <name> --recover` finishes or
  cancels it after a fresh review. Both codes exit 1.
- **Breaking (library):** the package entry point no longer exports writing
  operations or filesystem write adapters (install, update-local, register,
  unregister, apply/seed/assemble, ownership add/remove, delete, upgrade engine,
  `TemplateInventory`); writes go through the `frontx` executable only.

- A remote `github:` origin is now recorded with the full 40-hex commit the
  fetched archive states (its global PAX header), never a 7-character prefix or
  the typed `@ref`, whatever the selector (branch, tag, short or uppercase SHA).
  The archive is parsed strictly; one without a stated commit, with a bad header
  checksum, malformed size or PAX record, missing end-of-archive marker, mixed
  root, duplicate entry, unsupported entry type (hardlink, device, GNU long
  name) or a symlink inside the installed scope is refused with
  `ORIGIN_UNAVAILABLE` (exit 1) and nothing is written. The same refusal
  applies to a response body over 64 MiB or an archive that expands past
  256 MiB; both caps are enforced while reading and inflating, so an oversized
  or gzip-bomb response is abandoned without being buffered. Origins written by
  earlier builds with a short pin are not migrated; re-registering may report a
  different origin and need `--replace`.

- `delete` binds its confirmation to the reviewed plan. `delete <target> --json`
  returns `CONFIRMATION_REQUIRED` with the whole plan (`toDelete`, `toPreserve`,
  `exclusionsDrift`/`relinquishedGround` when present, `aiBundle`, `templateName`)
  and a `planDigest`; the confirming call is `--json --yes --plan-digest=<planDigest>`.
  A plan that differs when recomputed — also empty to non-empty and the reverse —
  returns `CONFIRMATION_REQUIRED` with the updated plan and
  `planChangedSinceReview: true` and writes nothing; `--yes` without a digest
  deletes nothing; `--dry-run` issues no digest. Interactively, an updated plan is
  shown in full and asked about again. The digest covers path strings and flags,
  not file bytes, the AI bundle directory's contents or symlink identity, and the
  comparison is not atomic with the removals after it. `delete` is absent from the
  published packages that were checked (0.3.0, 0.3.1, 0.3.0-alpha.7; a string search of their
  `dist/`), not from every version ever published.

- `register`, `apply`, `delete`, `upgrade` (and `--restore`), `validate --project`:
  two registered template names whose AI-bundle directories
  (`.frontx/ai/<name>/`) coincide or nest — `@x/a` and `@x/a/b`, or names that
  differ only in case on a case-insensitive volume — no longer coexist. The bundle
  step acts on that directory by name and recursively, so the rule is decided by
  the names alone and holds even for templates with no AI bundle. `register`
  refuses a new name, and a `--replace` of a different origin onto an
  existing name with empty `targets`, with `REGISTRATION_CONFLICT`
  (`details.overlapping`) and writes nothing; for an already-registered name
  the same resolved origin (no-op or `excludedSubtrees` backfill), a
  different origin without `--replace`, and `--replace` with applied
  `targets` (`TARGETS_EXIST`) are decided before the overlap check. `apply` judges every name of its
  batch, registered or not (before the registration lookup, so an unregistered
  name that nests with such a partner gets `REGISTRATION_CONFLICT`, not
  `TEMPLATE_NOT_REGISTERED`), together with the already-applied names, so two nested names in one
  batch are refused before any write whatever order they are listed in. For a
  project state that already holds such a pair (two registrations merged in
  version control, a hand edit), `delete` of a last target, `apply`, and
  `upgrade`/`--restore` refuse with `REGISTRATION_CONFLICT` before changing
  anything when the overlapping name has applied targets (for `apply` also when
  it is in the same batch), in both directions: a parent bundle may itself ship
  files inside the nested name's directory, which the nested name's own refresh
  or removal would destroy. The guard is partial: applying one name of a
  registered pair while the other has no target and is outside the batch is not
  refused, and deleting a non-last target is not covered. Each check is made
  per call with no lock; concurrent invocations are not supported.
  `validate --project` reports `PROJECT_INVALID` naming both names and the
  available remedy: a name with no applied target can be unregistered; once
  both have applied targets the CLI has no command that repairs the pair, and
  it must be reconciled outside it (undoing the change that registered one of
  the names in version control is a suggestion, not a verified repair). Previously a delete, upgrade or same-batch apply
  silently removed the other template's bundle bytes.
- A template payload file named exactly `__proto__` at the top level of the
  template was dropped from the acquired bundle, so `upgrade` reported
  `success` while leaving that file at its old content. It is now carried like any
  other file (`constructor` and `toString` already were).
- `upgrade --json`: the `CONFIRMATION_REQUIRED` review now carries
  `details.planDigest`, a SHA-256 of the whole computed plan including every
  file's bytes (never the bytes themselves). The confirming call accepts
  `--yes --plan-digest=<planDigest>` and commits only if the plan it computes
  is that plan; otherwise it writes nothing and returns a new
  `CONFIRMATION_REQUIRED` for the changed plan, whose message says so. This
  closes the gap between two separate processes (review, then confirm) in which
  the project or the candidate could change after approval. `--yes` without a
  digest keeps its direct-use meaning; `--plan-digest` without `--yes`, or not
  64 hex digits, is `INVALID_INPUT`. The AI upgrade orchestration always sends
  the digest and refuses to confirm a review that lacks one.
  A digest-bound call that finds the project already at the candidate (the
  reviewed plan no longer exists) fails closed with `CONFIRMATION_REQUIRED`
  (`details.reviewSuperseded`) before the no-op branch can write anything, so
  the exclusions backfill never runs under a stale approval; the orchestrator
  reports `apply-failed`, not `declined`. The AI bundle's bytes are still
  outside the digest (open policy question).
- A failed write of `.frontx/project.json` now attempts to remove the store's own
  temporary file (`.project.json.<uuid>.tmp`) and reports the original error. If
  that removal fails, or a process is killed mid-write (SIGKILL), the file can
  stay behind, partial or complete; it is never read as state and can be deleted
  by hand.
- `.frontx/project.json` is stamped `formatVersion` 2 exactly when an entry
  carries `exclusionsBackfilled`, `relinquishedGround` or
  `provenExcludedSubtrees`, and stays 1 otherwise (derived on every write).
  This build reads 1 and 2, refuses any other value, and refuses
  (`PROJECT_INVALID`, naming the entry and field, writing nothing) a document
  stamped 1 that carries one of those fields, since it never writes one. No
  released CLI has written this file, so only a document written by this build
  is supported: a state left by an intermediate build of this unreleased
  branch is not migrated or repaired. The stamp is hardening against running
  another build on the same project, not a guarantee. One locally built binary
  of unestablished provenance, whose reader accepts only version 1, returned
  `PROJECT_INVALID` (`its formatVersion is not 1`) for a version 2 document
  when run one command at a time on an isolated project for `delete`, `apply`,
  `upgrade`, `register`, `unregister`, `ownership add`, `ownership remove` and
  `list`, with project and inventory files unchanged afterwards; other
  commands (including inventory and `seed`), other builds and effects outside
  the project were not checked, and the accompanying test uses the current
  source with the accepted-version guard changed, not an earlier release. The
  CLI takes no lock: operate a project with one frontx process at a time, since
  concurrent processes can lose each other's update and a process already
  running keeps what it read. A failed or interrupted run can leave project
  files changed with the document unchanged, and the state file is replaced by
  rename without a durability guarantee for power loss.
- A marked template entry (one that handed over ground in an upgrade) now keeps
  durable evidence, `provenExcludedSubtrees` in `.frontx/project.json`
  (optional; a document carrying it is stamped `formatVersion` 2; also shown by `list --json`), of the
  regions every write of its files excluded. A guest template nested in such a
  region is no longer frozen (`RETAINED_GROUND`) by the host's second and later
  upgrades with unchanged exclusions, and `delete` of that guest removes its
  files instead of preserving them and dropping the target. Ground the host
  handed over or took back, and entries with no evidence, stay retained;
  evidence is only ever narrowed and never taken from the origin's current
  manifest. A version-2 document is only as protected against another build as
  the entry above says. `plan.retainedGround` now lists every entry that
  records the ground holding a skipped path, and the notes say removing a
  holder does not by itself allow removing the held files.

- The built-in set of official default templates is now empty, because
  template territory no longer lives in this repository — templates are
  published from a repository of their own and acquired by source-spec. `list`
  reports `defaults: []`, and `seed`, which accepts official defaults and
  nothing else, refuses every name with `TEMPLATE_NOT_REGISTERED` until a
  default origin exists to generate from. Start a project with `register`
  plus `apply` instead.

- **Breaking:** `--yes` is refused on `delete` and `upgrade` when `--json` is
  absent, exiting with the user-error code and naming `--json --yes`. Both
  confirmation gates define `--yes` as the second call of the `--json`
  protocol, so interactive mode asked for confirmation regardless — and with
  no terminal attached, the prompt read end-of-input, took its declared `No`
  default and exited successfully having done nothing. A script running
  `frontx delete <target> --yes` got a silent no-op reported as success;
  it now gets a refusal that names the form that works.
  `delete <target> --dry-run --yes` is still accepted: a dry run reaches no
  confirmation gate for `--yes` to suppress.

- **Breaking:** a `.frontx/project.json` a previous version accepted can now
  be `PROJECT_INVALID`. `templates[name].excludedSubtrees` is validated the
  way a manifest's own declaration is, and a malformed value — not an array,
  a non-string element, an empty string, one escaping the target — makes the
  whole document invalid for every command that reads it, `validate --project`
  included. Previously such a document was accepted: a number crashed `delete`
  with a raw error and exit 2, and `[""]` made it delete the payload and the
  developer's protected file under `ok:true`.

- **Breaking:** two spellings of one directory are one ground on a
  case-insensitive volume (APFS, NTFS). A batch naming `app` and `App` is
  refused with `TARGET_CONFLICT` instead of applying two templates onto one
  directory, `ownership` answers the same way for either spelling, and a path
  spelled in another case is no longer refused as `INVALID_PATH`. On a
  case-sensitive volume the two remain independent targets, as they genuinely
  are. Which rule applies is decided by probing the volume, never by the
  operating system name.

- **Breaking:** a target whose first segment is a literal `~` is refused. It
  reaches the CLI only when the shell did not expand it, and resolving it
  literally created a directory named `~` inside the project and reported
  success.

- `delete` resolves the owning template's declared exclusions as the UNION of
  the declaration recorded in `.frontx/project.json` and the one its current
  manifest declares, and reports `exclusionsDrift` when the two disagree.
  Narrowing a vendored manifest after applying no longer moves a
  previously protected file into `toDelete`; a vanished origin still cannot
  widen the plan. `apply`, `assemble` and `ownership` continue to use the
  current declaration alone — they materialise what the manifest says today,
  which is a different question.

- `register`/`register --replace` and `upgrade` landing on the origin already
  recorded now report `recorded` (register) or a `recordedExclusions` field
  (upgrade) when they write a declaration the entry was missing, instead of
  reporting a plain no-op after a write.

### Added

- `.frontx/project.json` entries carry the template's declared
  `excludedSubtrees`, and `list --json` reports the recorded value. A deletion
  plan no longer depends on a `path:` origin folder still being on disk —
  vendoring one into the project and removing it again is the ordinary
  lifecycle.

- `unregister` drops an entry whose origin can no longer be resolved and which
  carries no recorded declaration, even when its `targets[]` is non-empty,
  reporting `orphan-dropped` with the targets it orphaned and leaving every
  file on disk. Such an entry could not yield a deletion plan and could not be
  re-registered, so nothing could remove it. `TARGETS_EXIST` is unchanged for
  every other case, including an origin that is merely unreadable.

- `frontx help` documents `FRONTX_INVENTORY_ROOT` and `GITHUB_TOKEN`.

### Fixed

- Environment-owned entries (`.git`, `.DS_Store`, `Thumbs.db`) are now protected
  **at any depth within a target**, in **any ASCII case** (`.GIT`, `.ds_store`,
  `THUMBS.DB`) on every volume — also on a case-sensitive one, where a distinct
  `.GIT` is deliberately over-protected. Before, a nested one (for example
  `app/.git/config`) counted as the template's own ground: `apply` demanded
  `--adopt-existing`, and a digest-confirmed `delete` could remove it. Now
  `apply`, `upgrade`, `restore` and `delete` never write, replace or remove them
  (`upgrade`/`restore` report them `SKIPPED`), `delete` lists them in
  `toPreserve` and does not read inside a directly named one, a symlink alias
  that resolves into one is preserved, and a batch entry or `ownership add` path
  at or inside one is refused with `TARGET_CONFLICT`. Not covered: Unicode
  folding or normalisation (a Unicode-equivalent spelling is not matched),
  physical volume identity and mixed volumes, and a tree that changes between the
  confirming recomputation and the removals. `apply`'s existing-content scan and
  `upgrade`'s disk listing still traverse these directories (they only read).

- `register`, `install`, `update-local` and `upgrade` now refuse a remote
  template whose file list cannot be written as it stands, before anything is
  written. A path is refused when it is absolute, climbs out of the template
  with `..`, has an empty or `.` segment, uses a backslash, contains a colon
  (any colon, not only a drive such as `C:`), has leading or trailing
  whitespace, or contains a control character. A list is refused when one path
  is a directory of another (`src` together with `src/index.ts`), or when two
  paths name the same location once Unicode normalisation and, on a volume that
  folds case, letter case are folded (`README.md` together with `readme.md`).
  The first three commands exit 1 with `INVALID_PATH` naming the path and the
  rule it breaks; `upgrade` and `validate --project` exit 1 with
  `ORIGIN_UNAVAILABLE` carrying the same message. Such a template used to be
  written through: a path like `../../index.json` replaced the inventory index,
  leaving every later `list` and `register` failing with `CONTENT_CONFLICT`,
  one like `../../@other/lib/src/lib.ts` overwrote another installed template,
  an upgrade could add or replace a project file beside the upgraded target, or
  inside `.frontx/`, a file next to a directory of the same name crashed with a
  raw filesystem error and left a half-written template in the inventory, and
  two names for one file silently kept only the later one (even for
  `frontx-template.json`, so the stored manifest was not the one the template's
  identity was read from). `validate <templateDir>` now applies the same check
  to the files it lists, so a template that passes it is not one every remote
  install refuses.

- Every command that reads `.frontx/project.json` now refuses, with
  `PROJECT_INVALID` naming the offending entry, a recorded `targets[]` entry or
  `projectOwnedRoots` entry that is not already its own normalised
  project-relative spelling: absolute, climbing out of the project, carrying a
  `.`, `..` or empty segment or a trailing separator, beginning with `~`,
  carrying a control character, or with leading or trailing whitespace. The CLI
  records exactly that form itself (`apply` its canonicalised targets, `ownership add`
  its canonicalised root), and now refuses before writing a document that would
  hold anything else, so only a hand-edited document (or one from an
  unsupported intermediate build of this branch) is affected. The same judgement covers every
  `relinquishedGround` entry (which must also not be `.`). Before this
  change such an entry was compared as written by `apply`, `delete`, `ownership`
  and `upgrade` alike: a `projectOwnedRoots` entry `x/../app/src` was read as
  ground outside `app/src` and an `upgrade` replaced the project-owned file
  inside it. **Migration:** a document that used to work with `./app` or `app/`
  as a target now needs the entry rewritten as `app`; the message names the
  entry. A document in that state can only be repaired by editing it by hand:
  the commands that would otherwise change it (`ownership remove`,
  `unregister`, `register`) read the same document first and refuse it too (only
  the symlink-alias judgement below is skipped by them).
  The `--json` envelope `validate --project` returns for such a target keeps its
  `details: { name, target }`; for an owned root it carries `details: { path }`.
  `apply` and `ownership add` now also refuse, with `INVALID_PATH` and before
  writing anything, a target or path with a control character or surrounding
  whitespace (a NUL used to end in exit 2 `INTERNAL`; the others were recorded
  and then refused by `upgrade` for good), and a raw spelling such as `./~`
  that resolves to a directory called `~`.

- `apply`, `delete`, `upgrade` and `validate --project` now also refuse, with
  `PROJECT_INVALID` naming the entry and the remedy, a recorded
  `projectOwnedRoots` entry that reaches its ground through a symlink (`link/src`
  with `link -> app`): the ownership it declares is compared by the string, so
  it protected nothing under the name `app/src`, and `upgrade` replaced and
  `delete` removed the project's own files there. `ownership remove`,
  `unregister` and `register` still load such a document, so it can be repaired
  with `ownership remove <the entry as the message spells it>` (an entry recorded
  verbatim is removed in preference to the canonical spelling of the path, and
  the result names what was removed) and a fresh `ownership add`. A recorded `targets`
  entry that has since become a symlink stays deletable, but `delete` now
  preserves, and lists in `toPreserve`, any file that resolves into
  project-owned ground, into another template's target, or into another
  template's local `path:` origin folder, however those are spelled;
  `apply` refuses, with `TARGET_CONFLICT`, a batch target at, inside or over the
  resolved location of another template's recorded alias; `upgrade` refuses
  with `TARGET_CONFLICT` when another template's target resolves onto or over
  its own, or when another template's target resolves strictly inside its own
  target at ground its declared `excludedSubtrees` do not carve out (in the
  current manifest, in the candidate manifest, and in what the template recorded
  when it was applied) — that ground is its own payload, and it
  is no longer skipped silently under `success`. `delete` treats another
  template's target that contains the deleted target's resolved location the
  same way: it protects what lies there unless that template declares the
  deleted ground an excluded subtree in both its recorded declaration and its
  readable current manifest (the legitimate host and guest nesting; a
  declaration on one side only, or an unreadable current manifest, protects),
  and another template's local `path:` origin folder protects everything
  beneath it even when it contains the deleted target. A recorded declaration
  that does not show what the template declared when it wrote its files is
  marked `exclusionsBackfilled: true` in `.frontx/project.json` and is not
  counted as that record by either judgement. Two cases earn the mark: a no-op
  `register` or `upgrade` copying the current manifest onto an entry that
  already has applied targets but no recorded declaration (only an intermediate
  build leaves one; a defensive, unsupported-state measure), and an `apply` of a further target under a
  declaration that differs from the recorded one (a `path:` origin's manifest
  can change between `register` and `apply`, and one per-name value cannot
  describe both). An `apply` onto an entry with no applied target records the
  declaration it wrote under, replacing the `register`-time value and clearing
  any mark. A real `upgrade` marks the new value when the candidate's declared `excludedSubtrees` leaves outside its boundary a file the BASELINE payload itself lists inside the baseline boundary (a file the template wrote, which then stays on disk), or declares an excluded subtree the entry did not record at `apply` over a location where something exists on disk (the baseline payload cannot vouch for that: a `path:` origin edited in place no longer lists what it once wrote; the cost is that an empty directory there also marks), and an entry that is already marked stays marked through every later `upgrade` and `restore`, whether or not that upgrade skips anything: an old file left in a subtree its template relinquished is therefore preserved through successive upgrades, through the `delete` of a different template occupying that subtree, and through the `upgrade` of ANY template whose payload reaches it (the host's own reclaim, or a nested guest: a `REMOVE` or `REPLACE` landing inside any registered template's `relinquishedGround`, spelled or resolved, is reported `SKIPPED` with the reason `RETAINED_GROUND` and the file is left as it is; an `ADD`, a kept local edit and a refusal are unchanged, the rule reads `relinquishedGround`, so the document that records it is stamped `formatVersion` 2 (see the version entry above for what was and was not observed about other builds); the cost is that a guest living inside retained ground does not have its own files there rewritten or removed by an upgrade, and the plan names each), until the entry is reconciled (`unregister`, which drops the record; `register --replace` keeps `relinquishedGround`, since that ground is about what lies on disk and not about origin lineage, and is the route `upgrade` itself names once the last target is deleted). The protection also outlives the deletion of the host's own target: `delete` of a target of a marked entry records the exclusion roots it carved out beneath that target as the optional entry field `relinquishedGround` (an optional field; a document carrying it is stamped `formatVersion` 2, a document without it means nothing is retained, and one carrying a non-canonical or absolute path there is refused with `PROJECT_INVALID`), which every other template's `delete` plan keeps preserving, however the nested template is spelled and whether it was applied before or after the host's target was deleted; `apply`, `upgrade` and `restore` of the entry carry it forward, so a fresh `apply` of the host clears the mark but not that ground. The location is recorded when the entry is marked, not only at delete: every `upgrade`, `apply`, `register` or `upgrade` backfill that marks or re-writes a marked entry adds to `relinquishedGround`, under every target, the roots of the declarations that CHANGED: when the entry was not yet marked, its recorded declaration is evidence of what its targets were written under, so a region declared excluded both then and now (a guest legitimately nested there from the first `apply`) is NOT added merely because another region was relinquished, and only a region added or dropped is; when the entry has no recorded value (a legacy entry) nothing is proven and every region in play is added, and when it is already marked every region in play that its `provenExcludedSubtrees` evidence does not cover is added (compared by exact spelling: a differently spelled region counts as changed), and the roots are never narrowed, so an upgrade that narrows the declaration back to `[]` no longer takes the old file's location with it, and `delete` of the host's own target (and a later `delete` of a guest in that ground) preserves it. A state written by an intermediate build of this unreleased branch is outside the supported boundary and is not repaired (see the boundary below). The cost is the same conservatism: a nested template deleted over retained ground keeps its files. A skip for an independent reason (a project-owned root, the template's own excluded subtree, another origin's folder) and a file only the candidate ships under a newly declared exclusion name ground the template never wrote and do not mark. The cost is deliberate conservatism: a marked host that later hosts a nested guest keeps the guest's files on `delete` (its record is dropped, see `toPreserve`). Whether the relinquished file still exists is not checked, so a file the user already removed still marks. A
  document written by an intermediate build of this unreleased branch carries no
  marker for either case; no released CLI writes `.frontx/project.json`, so
  such a document is outside the supported boundary and is neither trusted nor
  migrated by design. These
  judgements, like the alias check, are made at one point in time: the CLI holds
  no lock, so a symlink or `.frontx/project.json` changed by another process
  between a plan and the writes that follow it is not noticed. `delete` removes
  files one at a time before it updates the state document, so a document that
  can no longer be loaded at that point is reported as `PROJECT_INVALID` after the
  files are already gone; nothing is rolled back.

- Structured detail for the retained-ground and unusable-state answers (review
  r23). A plan's `RETAINED_GROUND` skips stay `{target, path, reason}`; the
  `--json` plan gains an optional `retainedGround: [{template, ground}]` naming
  the registered templates whose recorded `relinquishedGround` holds the skipped
  paths, and the human note names them too. `list --json` shows, for a
  registered entry, `exclusionsBackfilled: true` and `relinquishedGround` when
  they are recorded. `PROJECT_INVALID` carries the same `details` from every
  command that loads the state (`{name, target}` for a target or retained
  ground, `{path}` for an ownership root, plus `suggested` when the normalised
  spelling is a location inside the project), not only from `validate
  --project`. A refused recorded spelling now says what can be done: every
  command, `unregister` and `ownership` included, refuses a document holding it,
  so the entry is corrected in `.frontx/project.json` by hand; the message does
  not choose the replacement for the person beyond naming the normalised
  spelling (lexical, no symlink resolution). `delete` of a guest nested under a
  host that has been marked keeps preserving and reporting the guest's files,
  because a marked host's recorded declaration is not read as proof of what it
  wrote.

- What an `upgrade` that holds files back looks like (human ruling, 2026-11-06:
  skip and report). A `REMOVE` or `REPLACE` inside ground a template gave up is
  not performed; the file stays byte for byte, the plan lists it as `SKIPPED`
  with the reason `RETAINED_GROUND`, and the upgrade still succeeds. The
  recorded `{origin, version}` moves to the new one in the same run (the old
  pair becomes `previous`), although those files were not brought to it. Run
  again, the same upgrade is a `noop`; it does not retry the held-back files.
  A later upgrade is compared against the recorded version, so a held-back
  file's fate in the next upgrade follows the classification, not a fixed
  result: equal to the next version it is `UNCHANGED`; equal to the recorded
  version while the next differs it is a `REPLACE` (the next payload carries
  different content for the path) or a `REMOVE` (the next payload omits it),
  either held back again as `RETAINED_GROUND` inside relinquished ground;
  differing from both, it is a
  `CONTENT_CONFLICT` (nothing is written) only if the recorded and next
  payload bytes also differ from each other, and `KEEP_LOCAL` (kept, nothing
  skipped) if they are equal.
  `upgrade <name> --restore` is not a state-only rewind: it is an ordinary
  upgrade whose candidate is the previous origin, with the same preview,
  confirmation and classification. It can `REPLACE`, `REMOVE` or `ADD` current
  files, refuse with `CONTENT_CONFLICT`, and skip paths the restored version
  leaves outside its boundary (`OUTSIDE_BOUNDARY`); read its plan, as for any
  upgrade, before confirming. Whether the original skips reappear after a
  restore depends on the files and versions involved; in the simplest case
  they do, in others they become `UNCHANGED` or `OUTSIDE_BOUNDARY`. For
  agents, the `--json` envelope carries all of this unchanged:
  `data.plan.skipped[]` entries of exactly `{target, path, reason}`,
  `data.plan.operations[]` and `data.plan.from`/`to` for the versions. The
  envelope depends on the outcome, so a caller branches on `data.outcome`
  before reading anything else: `success` and `declined` carry `data.plan`
  (`declined` writes nothing); `noop` carries `data.at` (the recorded origin
  and version) and NO `data.plan`, so it cannot tell which paths were held back
  by an earlier run; the confirmation-required refusal carries the same plan in `error.details.plan` and writes nothing,
  and `success` alone does not say whether anything was held back — read
  `plan.skipped`. No field was added. For people, the plan shown BEFORE
  approval is worded as a condition (if approved, those files will be left as
  they are and the recorded version will advance; declining writes nothing),
  and the line printed AFTER the commit is in the past tense, with the
  conflict stated as a possibility. `declined` writes nothing and says so.
  Neither output suggests overwriting or deleting the
  files; reconciling them is a decision for the developer. Pinned end to end by
  `upgrade-retained-ground-cli-lifecycle.test.ts`, which drives the built
  executable.

- `upgrade` also judges a template's target and every file path of its payload
  on the one location each names, and refuses with `INVALID_PATH`, writing
  nothing and presenting no plan, when either is not already spelled as that
  location (or carries a control character or surrounding whitespace), or when
  a payload path lands on the target itself rather than inside it. A payload carrying one such path is refused as a whole: nothing is
  compared, checked against the ownership boundary or read from disk for its
  other files. This holds for the inputs the remote-template check above never
  sees, such as a `path:` origin's file listing. A `targets` entry edited by
  hand into `.frontx/project.json` used to be compared as written: `app/../.frontx`
  was not recognised as the CLI's own `.frontx` ground and had its files
  replaced, `app/../other` was judged as `app/..`-prefixed ground while landing
  in `other`, and `../outside` had a file outside the project read and reported
  on before the write that finally refused it. The file reader the upgrade
  classification uses now refuses any path outside the project root before its
  first filesystem call. That is a lexical judgement: where a symlink inside
  the project leads is still decided by the ancestor probe, which does `lstat`
  a symlink's own target.
  `createFsReadDiskEntryFn`, exported from the package, now takes the project
  root as a required argument; a programmatic caller must pass it. A refusal
  raised by the reader itself carries `details: { path }`, while the engine's
  `INVALID_PATH` carries `details: { paths: [{ target, path, reason }] }`; the
  command path reaches only the second.

- `apply` no longer writes a payload read from outside the local inventory
  store when the installed content path is a symlink leading out of it.

- `upgrade` no longer aborts with an internal error and a raw `ENOTDIR` when a
  non-directory stands at a scope component of `.frontx/ai/`; it reclaims it
  exactly as `apply` already did, and a containment escape from that step is
  reported as `INVALID_PATH` by both commands rather than as an internal
  failure by one of them.

- The AI-extension bundle is no longer cleared through a symlinked scope
  component that leads out of `.frontx/ai/`, which removed a developer's own
  files under `ok:true`. Such a destination is refused; a link that resolves
  back inside `.frontx/ai/` is still followed.
