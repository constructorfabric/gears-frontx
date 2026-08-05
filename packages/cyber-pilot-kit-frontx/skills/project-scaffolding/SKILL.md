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
  conflict check and provenance writing belong to the CLI. Do not re-implement
  them, pre-empt them, or work around a refusal any of them issue.
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

One JSON line: `{ "ok": true, "templates": [ ... ] }`. Each record carries

- `name` - the template's identity, and **the argument the apply commands take**;
- `ref` - the reference the entry is pinned at, taken from the source-spec's
  `@ref` segment. Report it in the plan so the developer sees which pinned
  reference will be applied. It is **not** the manifest's `version` field: the
  two need not agree in form or value, so do not present it as the version and
  do not derive one from the other;
- `source` - the address it was resolved from;
- `description` - the template's own statement of what it establishes and what
  it contributes. **The key is absent when the template declares none, and also
  when the entry's stored manifest no longer satisfies the manifest contract at
  all** - for any reason, not only unreadable text, since the listing reports the
  rest of the inventory rather than failing over one bad record. The two cases
  are indistinguishable from here and need not be distinguished: either way you
  have no declared description to match against, and the entry is handled as one
  that declares none.

This command is the only source for the selectable set. Do not consult any
remote registry, any list built into this document, or the CLI's storage.

## Step 2 - Read what the target directory already holds

Read `<targetDir>/.frontx/provenance.json`. It is a JSON array, one record per
already-applied template, each carrying `templateIdentity`,
`scaffoldedFromVersion`, `sourceSpec` and `occupiedOwnershipBoundary`.

Absent or unreadable file means the directory holds no applied template. A
directory that already holds records gets no seed - only further templates added.

**Absent provenance is not by itself a licence to seed.** Seeding writes a whole
repository and the CLI refuses it against a target that already holds content, so
also check whether the directory exists and is empty:

- **does not exist, or exists and is empty** - the plan begins with a seed;
- **exists and holds content, with no provenance** - this is someone's existing
  work, not a project this flow started. Do not plan a seed against it: say so,
  and offer either a fresh directory to seed into or `frontx add` to apply into
  the directory as it stands. Planning the seed anyway only earns the CLI's
  refusal one step later, after you have already shown the developer a plan that
  could not run.

## Step 3 - Select what to apply

Work from the intent, the records from step 1, and the identities from step 2.

1. **Nothing installed.** If `templates` is empty, refuse: selection has nothing
   to choose from. Tell the developer to install a template first (`frontx
   install <source-spec>`) and stop. Run no command that writes files.
2. **Partition by declared description.** Only records carrying a `description`
   are candidates. Set the rest aside, and keep them - you will report them as
   not considered. A template that describes nothing offers nothing to match an
   intent against; it stays reachable by its exact reference through the direct
   CLI path.
3. **No candidates.** If no record declares a description, refuse: nothing
   matched. List every installed template and say each was skipped for declaring
   no description. Write nothing.
4. **Match.** Compare the intent against each candidate's `description`, reading
   it as the template's own statement of what it establishes and contributes.
   Special-case no identity, no namespace, no naming pattern - the description is
   the whole basis, and a name that looks promising is not evidence.
5. **No match.** If no candidate's description answers any part of the intent,
   refuse: nothing matched. Name the candidates you considered and those skipped
   for declaring no description. Choose no nearest match, and write nothing.
6. **The seed.** If step 2 found no applied template, the seed is the single
   candidate whose description matches the project-establishing part of the
   intent - the part that says what kind of project this is.
7. **A tie is a question, not a coin flip.** If two or more candidates match the
   project-establishing part indistinguishably, refuse: a choice is required.
   Name each tied candidate with its declared description and ask the developer
   to choose. Guessing here writes a project they did not ask for.
8. **Further templates.** For each remaining part of the intent, select at most
   one candidate whose description matches it, skipping any candidate already in
   the plan. **A template contributes to a project once.** A part of the intent
   that repeats a unit inside ground the plan already covers adds no second
   application - see step 7 below.
9. **Drop what is already applied.** Remove from the plan every identity step 2
   already recorded, and record it as already applied. Re-applying an identity
   re-claims ground it already occupies, and the CLI's conflict check refuses the
   whole operation rather than part of it.
10. **Separate the per-unit work from the residual.** Every part of the intent
    that names a unit living inside a selected or already-applied template's own
    ground is per-unit work, recorded once per unit and attributed to the
    template that owns that ground. It is **not** residual - step 7 realizes it.
    Only what no template's description covers and no template's ground contains
    is residual.

## Step 4 - Present the plan before writing anything

Show the developer, and do not proceed past a refusal:

- the template to seed with, with its identity and its pinned `ref`;
- each further template to add, in order, with identity and `ref`;
- each identity dropped as already applied;
- the units to be realized inside the applied ground, and which template owns
  the ground each falls in;
- the residual intent nothing covers.

## Step 5 - Apply, through the executable only

If the plan carries a seed:

```bash
frontx seed <identity> <targetDir>
```

Then, for each further template in plan order:

```bash
frontx add <identity> <targetDir>
```

`<identity>` is the record's `name` from step 1 - the identity the template's own
manifest declares - not its `ref` and not its `source`.

If any of these exits non-zero: stop at that command. Relay its reported reason
unreinterpreted, name the templates applied before it, and run no further
command. Do not retry.

## Step 6 - Report the applied set from provenance

Read `<targetDir>/.frontx/provenance.json` again and report one entry per record:
the identity, the version it was applied from, and its source address. This
record set is the authority on what was applied - report it, rather than
restating what the plan intended.

If the file is absent or unreadable after a command reported success, say the
applied set could not be confirmed and name the target directory. Do not present
an applied set you did not read.

## Step 7 - Realize the units the intent names

The plan stops short of the intent until this step runs. An intent naming two
screens is not delivered by a project with the ground for screens and no screens
in it.

Each applied template materialized its own AI-extension bundle into the project
under `.frontx/ai/<template-identity>/`. Those bundles are discovered and
activated in this project by the ecosystem's extension host, and the skills they
contribute are what add a unit to that template's ground. They, not this
document, know how.

For each unit from step 3.10, in plan order:

1. **Find the covering skill.** Look in the bundle of the template that owns the
   unit's ground for an activated skill that adds a unit of that kind.
2. **No covering skill?** Record the unit as residual work, naming the ground it
   falls in, write nothing into that ground, and move to the next unit. A
   template that declares no way to add a unit to its ground is not one to
   improvise into.
3. **Follow that skill, once, for this unit.** Do exactly what it instructs, in
   its order. Touch no ground it does not itself claim. It owns the conventions -
   naming, identifiers, registration, generated artifacts - and you follow them
   rather than inventing parallel ones.
4. **Put the stated content in.** The unit the skill created carries its
   scaffold's placeholder content. Replace that with what the developer's intent
   states for *this* unit, following the same skill's conventions. A screen the
   developer described as showing something must show that thing; delivering the
   placeholder means the unit was created and the intent was not realized.
5. **A failure stops the flow.** If realizing a unit fails, relay the failure's
   own reported reason unreinterpreted, name the applied templates and the units
   realized before it, and realize no further unit. No correction retry.

Then run the verification the covering skills declare for what they created -
the regeneration, type-check, lint and run steps they name. Hand back a project
that builds and runs, not one that was merely written.

**If a declared verification fails**, stop there. Report the project as applied
and realized but **not verified**, relay that verification's own output
unreinterpreted, and name the units it covered. Do not report scaffolding
complete, and do not attempt a correction retry - the same rule that governs a
non-zero command exit governs this. A failing type-check or lint is the whole
difference between a project that was written and one that works, so reporting
success over it would hand back the one problem this step exists to catch.

## Step 8 - Report

Report, in this order:

- the applied set, as read from provenance in step 6;
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
- Step 5 seeds with the first and adds the second. Step 7 runs that second
  template's own activated unit-adding skill twice, once per screen, and puts
  each screen's stated content into the unit it created.
- What comes back is a project with both screens in it, built and running.
