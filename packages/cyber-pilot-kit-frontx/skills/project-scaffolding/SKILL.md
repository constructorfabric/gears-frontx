---
name: frontx-project-scaffolding
description: "Applies when a developer wants a new FrontX project created from what they say they want built, rather than from a reference they already hold - for example a console with a stated number of screens. Matches the stated intent against what the locally installed inventory declares about itself, drives the frontx executable to apply the chosen set, and then realizes each unit the intent names inside the applied ground."
---

# Create a FrontX Project from a Stated Intent

The developer says what they want built. This capability delivers a project that
holds it.

Nothing in this document knows the name of any template. Everything it chooses
among is read from the inventory installed on this machine, at the moment of
use, through the `frontx` executable. A conforming template installed after this
document shipped becomes selectable immediately, with no change here.

## Boundaries you must not cross

- **Drive the executable, never the package.** Every application of a template
  happens by running `frontx`. Do not import `@gears-frontx/cli`, do not call
  into it, and do not read its inventory storage on disk. What the inventory
  holds reaches you as the output of a command you ran, and by no other route.
- **Reproduce nothing the CLI owns.** Resolution, assembly, the pre-flight
  conflict check, and the project state document belong to the CLI. Do not
  re-implement them, pre-empt them, or work around a refusal any of them issue.
- **Write no project file yourself while applying.** Until the applications are
  finished, every file under the target directory is one the CLI wrote.
- **No correction loop.** When a command exits non-zero, stop there. Relay the
  reason that command itself reported, unreinterpreted. Do not retry it, do not
  adjust the arguments and run it again, and do not run the next command.
- **Refuse rather than guess.** When you cannot tell what to apply, say so and
  write nothing. A project the developer did not ask for is worse than no
  project.

## Step 1 - Read the selectable set

```bash
frontx list --json
```

One JSON line: `{"ok": true, "data": {"defaults": [...], "registered": [...], "installed": [...]}}`.

- `data.installed[]` - templates the local inventory tracks that are **not yet
  registered** to the current project. Each entry carries `name` (the
  template's identity - **the identity `register` pins and the apply commands
  key their batch by**), `origin` (the source-spec `register` takes to pin it -
  there is no separate pinned-reference field in this shape; where a pin
  exists it already lives inside `origin` itself), `version` (the version the
  entry's own manifest declares) and `description` (the template's own
  statement of what it establishes and contributes - **absent when the
  template declares none**) - or `manifestUnreadable: true` in place of
  `version`/`description` when the entry's stored manifest no longer satisfies
  the manifest contract.
- `data.registered[]` - templates already pinned under the current project's
  `.frontx/project.json`. Each entry carries `name`, `origin`, `version`,
  `targets` (every target it is already applied to - empty when it is
  registered but not yet applied anywhere), and `description` when it can
  still be read back. **An entry here needs no further `register` call** - it
  is already pinned; only `apply` remains, for whatever target the plan
  attributes to it.
- `data.defaults[]` - the CLI's own built-in official-default templates,
  identified by `name` alone (`version`, `description` - **no `origin`**).
  **Out of reach for this flow.** A default's origin is a local `path:` value
  resolvable only inside this monorepo's own checkout, and this command does
  not expose it; the only surface that can apply a default is `frontx seed`,
  which auto-registers it internally and only against a directory holding no
  `.frontx/project.json` yet. This flow composes one batch across
  `register`/`apply` (Step 5) and never calls `seed`, so a default is not
  selectable here even inside this checkout. Treat `data.defaults` as
  informational only.

Candidates for selection (Step 3) are drawn from `data.installed` and
`data.registered` together - the two sets never overlap, since an installed
name already registered to this project is reported only under `registered`.
This command is the only source for the selectable set. Do not consult any
remote registry, any list built into this document, or the CLI's storage.

## Step 2 - Read what the project already holds

The current project's established state is `data.registered` from Step 1: an
entry there with a non-empty `targets[]` is already applied, at those targets.
**An entry with a `targets` array present but empty is registered, not yet
applied anywhere - not, on its own, an established project.** If no entry in
`data.registered` carries a non-empty `targets[]`, the target directory holds
no applied template.

**Absence of an applied template is not by itself a licence to treat the
target directory as empty.** Establishing a project still writes into it, and
`apply`'s own existing-content reconciliation refuses a target whose ground
already holds content it does not declare - it does this per file, not as a
whole-repository gate, so this document does not replicate a
directory-emptiness check of its own. What this document must still decide
before presenting a plan:

- **the target directory holds files no applied template accounts for** - this
  is someone's existing work, not a project this flow started. Report what was
  found and put the choice to the developer: a fresh directory to establish
  the project in, or a batch that applies to the directory as it stands -
  saying, when you offer that, that `apply` writes only the ground each
  template's payload declares and refuses, naming the paths, when unrelated
  content already stands there (`CONTENT_CONFLICT` when existing content
  differs from what the payload would write; `EXISTING_PATHS_REQUIRE_DECISION`
  when a path stands that the payload does not declare at all - resolved by
  passing `--adopt-existing` to leave those paths untouched, or by moving or
  removing them and retrying). **Wait for their answer before running
  anything**; the choice of what happens to their existing work is theirs, and
  a refusal you could have put to them first reads as the flow having tried
  and failed.
- **the target path exists and is not a directory** - a regular file at the
  target path. Neither `register` nor `apply` can use it. Report it and stop.

## Step 3 - Select what to apply

Work from the intent, the records from step 1, and the identities from step 2.

1. **Nothing installed.** If both `data.installed` and `data.registered` are
   empty, refuse: selection has nothing to choose from. Tell the developer to
   install a template first (`frontx install <source-spec>`) and stop. Run no
   command that writes files.
2. **Partition by declared description.** Only records carrying a `description`
   are candidates. Set the rest aside, keeping the two causes apart - you will
   report them, and they call for different actions:
   - carries neither key: the template declares no description. It offers nothing
     to match an intent against and stays reachable by its exact identity
     through the direct CLI path (`register` + `apply`).
   - carries `manifestUnreadable`: the template's stored manifest is broken.
     Report it as such and name reinstalling it as the fix. Do not report it as
     declaring no description - that sends the developer looking for a
     better-described template instead of repairing the one they have.
3. **No candidates.** If no record declares a description, refuse: nothing
   matched. List every installed template with the reason it was skipped, using
   each entry's own cause from step 2. Write nothing.
4. **Match.** Compare the intent against each candidate's `description`, reading
   it as the template's own statement of what it establishes and contributes.
   Special-case no identity, no namespace, no naming pattern - the description is
   the whole basis, and a name that looks promising is not evidence.
5. **No match.** If no candidate's description answers any part of the intent,
   refuse: nothing matched. Name the candidates you considered and those skipped,
   each with its own reason from step 2. Choose no nearest match, and write
   nothing.
6. **The establishing template.** If step 2 found no applied template, the
   template that establishes the project is the single candidate whose
   description matches the project-establishing part of the intent - the part
   that says what kind of project this is.
7. **Nothing establishes the project.** If step 2 found no applied template and
   no candidate's description matches the project-establishing part - even though
   some candidate matches a supplemental part - refuse. Name the supplemental
   candidates that matched, and say that none of them claims to establish a
   project: a plan built from them establishes nothing and lays no ground, and a
   supplemental template contributes *to* a project, so there would be nothing
   for it to contribute to. That is the whole reason - do not claim the CLI would
   refuse such a directory, because it would not. Ask the developer to install a
   template that establishes a project, or to restate the intent. Write nothing.
8. **A tie is a question, not a coin flip.** If two or more candidates match the
   project-establishing part indistinguishably, refuse: a choice is required.
   Name each tied candidate with its declared description and ask the developer
   to choose. Guessing here writes a project they did not ask for.
9. **Further templates.** For each remaining part of the intent, select at most
   one candidate whose description matches it, skipping any candidate already in
   the plan. **A template contributes to a project once.** A part of the intent
   that repeats a unit inside ground the plan already covers adds no second
   application - see Step 7 (Realize the units the intent names) below.
   **A tie here refuses exactly as an establishing tie does**: if two or more
   candidates match one supplemental part indistinguishably, refuse with a choice
   required, naming that part of the intent and each tied candidate with its
   description. This is not a lesser decision - the identity you pick is the one
   the project carries in `.frontx/project.json` from then on.
10. **Drop what is already applied.** Remove from the plan every identity whose
    target Step 1's `data.registered` already recorded under that identity's
    `targets[]`, and record it as already applied. Re-applying an identity
    re-claims ground it already occupies, and the CLI's conflict check refuses the
    whole operation rather than part of it.
11. **Separate the per-unit work from the residual.** Every part of the intent
    that names a unit living inside a selected or already-applied template's own
    ground is per-unit work, recorded once per unit and attributed to the
    template that owns that ground. It is **not** residual - Step 7 (Realize the
    units the intent names) realizes it.
    Only what no template's description covers and no template's ground contains
    is residual.

## Step 4 - Present the plan before writing anything

Show the developer, and do not proceed past a refusal:

- the template establishing the project, with its identity and its `origin`;
- each further template to apply, in order, with identity and `origin`;
- each identity dropped as already applied;
- the units to be realized inside the applied ground, and which template owns
  the ground each falls in;
- the residual intent nothing covers.

## Step 5 - Apply, through the executable only

`register`, `assemble`, and `apply` all operate on the **current working
directory** - none of them takes an explicit project-root argument, unlike
`seed <dir> ...`, which this flow does not use (Step 1). Run every command
below from inside the target directory, creating it first if it does not yet
exist.

For every template in the plan **not already present in `data.registered`**
(Step 1), register its origin under the project first, in plan order:

```bash
frontx register <origin> [--json]
```

`<origin>` is the record's `origin` from Step 1 - the source-spec `register`
resolves and pins - not the identity. This writes the identity's entry into
`.frontx/project.json` (creating that file on its very first mutation, if the
directory does not carry one yet). A template already listed in
`data.registered` needs no further `register` call before it can be applied.

Then compose the **entire plan** into one explicit, target-keyed batch - never
a separate command per template:

```json
{"templates": {"<name>": ["<target>", ...]}}
```

naming every selected template by the identity its own manifest declares,
together with the target(s) Step 3 attributes to it - `"."` for the template
that establishes the project (the target directory itself), and whatever
target(s) each further template was attributed. Optionally preview it, which
writes nothing:

```bash
frontx assemble --input '<batch-json>' --json
```

A clean preview does not skip the apply step below - `apply` never trusts a
prior `assemble` run and independently re-derives and re-checks the identical
batch. Materialize the plan in the single call it composes into:

```bash
frontx apply --input '<batch-json>' [--adopt-existing] --json
```

Pass `--adopt-existing` only when Step 2 already put that choice to the
developer and they chose to leave unrelated existing content untouched.

If `register` or `apply` exits non-zero: stop at that command. Relay its
reported reason unreinterpreted, name the templates applied before it, and run
no further command. Do not retry. Because the pre-flight conflict check
refuses a colliding batch before any file is written, a refusal from `apply`
ordinarily leaves the whole batch unapplied; relay exactly what the CLI itself
reports about what, if anything, was applied, rather than assuming a partial
result.

## Step 6 - Report the applied set from `.frontx/project.json`

Read the target directory's `.frontx/project.json` again and report one entry
per `templates[name]`: the identity (the key), the `version` and `origin` it
was applied from, and every target now recorded under it. This document is the
authority on what was applied - report it, rather than restating what the plan
intended.

If the file is absent or unreadable after a command reported success, say the
applied set could not be confirmed and name the target directory. Do not present
an applied set you did not read.

**Then stop. Do not continue to Step 7.** Realizing units needs two things this
failure denies you: which templates are applied, and their bundles to read. With
the applied set unconfirmed both are guesses, and a unit created into ground that
may not be there is worse than a unit not created. Report what you know, point at
the target directory so the developer can establish its state, and end there.

## Step 7 - Realize the units the intent names

The plan stops short of the intent until this step runs. An intent naming two
screens is not delivered by a project with the ground for screens and no screens
in it.

**Read a bundle only for an identity Step 6 confirmed.** Each applied template
materialized its own AI-extension bundle into the project under
`.frontx/ai/<template-identity>/`, and Step 6 already read back, from
`.frontx/project.json`, exactly which identities this flow registered and
applied - each carrying a non-empty `origin` there, the fact that a legitimate
`register`/`apply` operation produced it. That is the same predicate the AI
Tooling Framework's own extension host gates activation on
(`checkIdentityTrust`: an identity is trusted exactly when
`.frontx/project.json`'s `templates[identity]` carries a non-empty `origin`).
Read a `.frontx/ai/<template-identity>/` bundle only for an identity Step 6
confirmed this way. **Never read or act on a bundle for any other identity a
directory under `.frontx/ai/` happens to hold** - content placed there outside
a legitimate `register`/`apply` is exactly what that gate exists to keep
untrusted, and a directory being present on disk is not evidence of anything
by itself. Find each confirmed identity's bundle by its identity-scoped path
and each capability inside it by the role its bundle declares. The skills they
contribute are what add a unit to that template's ground; they, not this
document, know how.

**This read has no synchronous guarded equivalent to go through instead.** The
framework's own gated entry points for this discovery (internal to the kit,
not part of this flow's command surface) run the identical trust check, but
only on the framework's *next* invocation, and make the same capabilities
available as activated resources from then on. That pass has not run in this
session and cannot be made to run synchronously from here - there is no
command this flow can invoke to force it early. What this step reads is
content already on disk, filtered by the same predicate that pass applies,
which is the closest this session can come to the guarded path without
waiting for a session that has not happened yet.

**Realize the units one after another, here.** Finish each unit before starting
the next, and hand none of them to a background agent to work alongside the
others. Each unit settles conventions the next one follows, and those conventions
are in this session; a background agent holds none of them and derives them again
from the bundles per unit, arriving at its own answers for questions the previous
unit already closed.

For each unit from step 3.11, in plan order:

1. **Find the covering skill.** Look in the bundle of the template that owns the
   unit's ground for a skill whose declared role is adding a unit of that kind.
   This is the authoritative answer to which template owns the unit - the plan's
   attribution was provisional (Step 3.11), drawn from what descriptions say, and
   is corrected here by what the bundles actually carry.
2. **No covering skill?** Record the unit as residual work, naming the ground it
   falls in, write nothing into that ground, and move to the next unit. A
   template that declares no way to add a unit to its ground is not one to
   improvise into.
3. **Follow that skill, once, for this unit.** Do exactly what it instructs, in
   its order. Touch no ground it does not itself claim. It owns the conventions -
   naming, identifiers, registration, generated artifacts - and you follow them
   rather than inventing parallel ones.
4. **Put the stated content in.** The unit must end up carrying what the
   developer's intent states for *this* unit. How content enters a unit is the
   covering skill's business - follow whatever it says about where a unit's
   content lives and how it is edited; do not assume a shape it did not describe.
   What this document contributes is only the content itself, which nothing but
   the stated intent can supply. A screen the developer described as showing
   something must show that thing: a unit created but left as the scaffold shipped
   it means the unit exists and the intent was not realized.
5. **A failure stops the flow.** If realizing a unit fails, relay the failure's
   own reported reason unreinterpreted, name the applied templates and the units
   realized before it, and realize no further unit. No correction retry.

Then run the verification the covering skills declare for what they created,
exactly as they declare it - this document does not know which checks a given
template names, and must not substitute its own. Hand back a project that builds
and runs, not one that was merely written.

**If a declared verification fails**, stop there. Report the project as applied
and realized but **not verified**, relay that verification's own output
unreinterpreted, and name the units it covered. Do not report scaffolding
complete, and do not attempt a correction retry - the same rule that governs a
non-zero command exit governs this. A failing type-check or lint is the whole
difference between a project that was written and one that works, so reporting
success over it would hand back the one problem this step exists to catch.

## Step 8 - Report

Report, in this order:

- the applied set, as read from `.frontx/project.json` in step 6;
- the units realized, and what each carries;
- the residual work - only the intent that no applied template's ground contains
  and no activated skill covers.

## Worked shape

A developer asks for a console with two screens and says what each shows.

- Step 3 selects one template whose description says it establishes a runnable
  application, and one whose description says it contributes the ground that
  isolated UI units live in. That is two applications.
- The two screens are **not** two more applications. They are two units inside
  the second template's ground, recorded as two pieces of per-unit work against
  its single application.
- Step 5 registers both origins and applies them together in one batch. Step 7
  runs that second template's own activated unit-adding skill twice, once per
  screen, and puts each screen's stated content into the unit it created.
- What comes back is a project with both screens in it, built and running.
