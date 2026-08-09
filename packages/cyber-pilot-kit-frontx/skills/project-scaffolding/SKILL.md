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
  it contributes. **The key is absent when the template declares none**;
- `manifestUnreadable` - present, and only ever `true`, when the entry's stored
  manifest no longer satisfies the manifest contract, so no description could be
  read from it. The listing reports the rest of the inventory rather than failing
  over one bad record, and marks the bad one this way. **Neither entry is
  selectable, but they are not the same problem and must not be reported as the
  same one**: a template that declares none is working as intended and simply
  cannot be chosen from an intent, whereas an unreadable manifest is a broken
  installation the developer can fix by reinstalling that template.

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
also check what the path holds. Use exactly the CLI's own rule, so your plan and
its answer cannot disagree:

- **does not exist**, **exists and is empty**, or **holds only** the closed set
  `.git`, `.DS_Store`, `Thumbs.db` - the plan begins with a seed. A freshly
  initialized repository holds exactly `.git` and is seedable; treating it as
  populated would refuse the most common way to start.
- **exists and is not a directory** - a regular file at the target path. Neither
  seed nor add can use it. Report it and stop; do not offer add.
- **holds any other entry, with no provenance** - this is someone's existing
  work, not a project this flow started. Do not plan a seed against it. Report
  what was found and put the choice to the developer: a fresh directory to seed
  into, or `frontx add` applied to the directory as it stands - saying, when you
  offer add, that it writes only the ground the template declares and refuses,
  naming the paths, if any of that ground already holds content, so the existing
  work is either left alone or reported, never overwritten.
  **Wait for their answer before running anything**; the choice of what happens
  to their existing work is theirs, and a refusal you could have put to them
  first reads as the flow having tried and failed.
  Planning the seed anyway only earns the CLI's refusal one step later, after you
  have already shown a plan that could not run.

## Step 3 - Select what to apply

Work from the intent, the records from step 1, and the identities from step 2.

1. **Nothing installed.** If `templates` is empty, refuse: selection has nothing
   to choose from. Tell the developer to install a template first (`frontx
   install <source-spec>`) and stop. Run no command that writes files.
2. **Partition by declared description.** Only records carrying a `description`
   are candidates. Set the rest aside, keeping the two causes apart - you will
   report them, and they call for different actions:
   - carries neither key: the template declares no description. It offers nothing
     to match an intent against and stays reachable by its exact reference
     through the direct CLI path.
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
6. **The seed.** If step 2 found no applied template, the seed is the single
   candidate whose description matches the project-establishing part of the
   intent - the part that says what kind of project this is.
7. **Nothing establishes the project.** If step 2 found no applied template and
   no candidate's description matches the project-establishing part - even though
   some candidate matches a supplemental part - refuse. Name the supplemental
   candidates that matched, and say that none of them claims to establish a
   project: a plan built from them carries no seed and lays no ground, and a
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
   the project carries in its provenance from then on.
10. **Drop what is already applied.** Remove from the plan every identity Step 2
   (Read what the target directory already holds) recorded, and record it as already applied. Re-applying an identity
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

**Then stop. Do not continue to Step 7.** Realizing units needs two things this
failure denies you: which templates are applied, and their bundles to read. With
the applied set unconfirmed both are guesses, and a unit created into ground that
may not be there is worse than a unit not created. Report what you know, point at
the target directory so the developer can establish its state, and end there.

## Step 7 - Realize the units the intent names

The plan stops short of the intent until this step runs. An intent naming two
screens is not delivered by a project with the ground for screens and no screens
in it.

Each applied template materialized its own AI-extension bundle into the project
under `.frontx/ai/<template-identity>/`. **Read those bundles from disk now** -
they are already there, written by the apply you just ran. Find each template's
bundle by its identity-scoped path and each capability inside it by the role its
bundle declares. The skills they contribute are what add a unit to that
template's ground; they, not this document, know how.

Do not wait for the framework's extension host to activate them. That activation
pass runs on the framework's *next* invocation and makes the same capabilities
available as activated resources from then on - it has not run in this session,
and the flow does not need it to have run. What you need is on disk.

**Realize the units one after another, here.** Finish each unit before starting
the next, and hand none of them to a background agent to work alongside the
others. Two units of the same kind, measured: 7m36s realized one after another,
12m28s realized in parallel background agents. The sequential second unit is not
merely no slower than the first, it is faster - 2m27s against the first unit's
5m09s - because the conventions the first unit settled are still in this session
and the second follows them. A background agent holds none of that and derives it
again from the bundles per unit, which costs more than the concurrency returns.

**A unit is finished only when the checks its covering skill declares have run
green on it**, run here, before the next unit is started. Authoring every unit
first and validating once at the end collects each unit's simple errors into a
single block to debug together: one measured run spent 3m49s clearing type errors
a per-unit check would have named one unit at a time, in seconds.

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
and runs, not one that was merely written. When that verification runs across
every workspace in one command, capture it under Step 8's rule for aggregate
runs: whatever the report will quote has to be visible in the output this run
kept.

**When a declared check is performed in a browser, conduct it this way.** Which
checks exist stays the covering skill's to say, and nothing below adds one or
stands in for one. What follows is how the browser is driven and what the run
has to report - which no template declares and every browser run needs.

**Narrow no declared scope without stating the reason in the visible output
text.** The scope this verification declares - every registered theme, every
screen under verification, every state the declared checks call for - is covered
in full. When something forces a narrowing anyway, write into the text the
developer reads, not only into the coverage file, which part of the scope is
being narrowed, what is left out of it, and why. The coverage file records what
was covered and cannot carry the reason, so a narrowing recorded only there
reaches the developer as a bare gap they have no way to judge. An unexplained
narrowing is a verification failure and is reported as one, not a scope decision
this flow was free to make.

Carry the run out in this order:

1. **Probe before launching.** Ask `http://localhost:9222/json/version` once.
   When it answers, attach to the browser already listening there with
   `npx --yes agent-browser connect 9222`. When it does not, launch one with
   `npx --yes agent-browser`. The probe is a single request, and it is worth
   making every time: a self-launched browser has hung mid-run where an attached
   one returned every capture asked of it.
2. **Read the interface's active theme before verifying anything, and switch to
   the host's default theme before the first capture.** An attached browser
   brings its profile's persisted selection with it, so the interface can open in
   a theme nobody in this run chose, and every capture after that silently
   belongs to that theme. Read the active theme from the interface: a
   screenshot's file name records what the run assumed, not what was on screen.
3. **Dispatch native pointer events when a click changes nothing.** A synthetic
   `.click()` arrives at the element carrying none of the pointer sequence around
   it, so a control listening for `pointerdown` sees nothing at all and the screen
   stays as it was. Do not retry the synthetic click, and do not record the
   control as broken. Re-issue that one click as the full native sequence through
   `npx --yes agent-browser eval`:

   ```js
   (() => {
     const el = document.querySelector('<selector>');
     if (!el) return 'not found';
     const box = el.getBoundingClientRect();
     const init = {
       bubbles: true, cancelable: true, composed: true,
       clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
       pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
     };
     const up = { ...init, buttons: 0 };
     el.dispatchEvent(new PointerEvent('pointerdown', init));
     el.dispatchEvent(new MouseEvent('mousedown', init));
     el.dispatchEvent(new PointerEvent('pointerup', up));
     el.dispatchEvent(new MouseEvent('mouseup', up));
     el.dispatchEvent(new MouseEvent('click', up));
     return 'dispatched';
   })()
   ```

   Put the control's own selector in `<selector>`. When the control lives inside
   a shadow root, resolve it through that host's `shadowRoot` rather than
   `document`, which does not see in. Then confirm the outcome the way every
   other click is confirmed here, by re-reading the accessibility snapshot.
4. **Enumerate every theme the host registers, and walk them.** The host's theme
   registry is the source of truth for the set - not the theme the browser opened
   in, and not the entries a switcher happens to show. **The walk covers every
   theme the registry reports, and that set is not negotiable**: no sample, no
   representative subset, and no theme set aside as out of scope for this run.
   The count of registered themes and the count of walked themes are the same
   number. A run that walks fewer has narrowed a declared scope, so it states the
   reason in its output text under the rule above and reports itself as not
   verified for every theme it left out. Take each registered theme in turn, and
   in this order:
   1. **Reload the page and wait for it to come back.** This is the theme
      boundary reset. It discards every field filled, item added and dialog
      opened while checking the previous theme, so the captures below start from
      a state this run knows rather than from wherever the last theme's
      interactions left the app. Reload for the first theme too: the browser
      arrived carrying a profile, not a fresh application.
   2. **Switch into the theme, then confirm the switch landed** by re-reading the
      switcher in a fresh snapshot: its label has to name the theme just
      selected. A label still naming the previous theme means the theme did not
      open, so record it as not-opened with that as the reason, capture nothing
      in it as verified, and take the next theme.
   3. **Capture each screen under verification in its fresh state first** - the
      state the reload left it in, before anything is filled, submitted or added
      in this theme. The interactions the declared checks call for follow, each
      with its own capture.
   4. **Byte-compare this theme's captures against the previous theme's.** For
      each screen and state, run the comparison as a command over the two capture
      files and read the verdict off what it returned:

      ```bash
      cmp -s <previous-theme-capture> <this-theme-capture>; echo "cmp exit $?"
      # or, when hashes are preferred:
      shasum -a 256 <previous-theme-capture> <this-theme-capture>
      ```

      `cmp -s` exits 0 for identical files and 1 for differing ones; two hashes
      are identical or they are not. **The coverage cell cites that result - the
      exit code, or the two hashes - and is filled from nothing else.** Opening
      the two captures and judging them different by eye is not a comparison, and
      a cell filled that way reports a fact the run never established, however
      honestly the eye judged it. A capture pair the command was never run over
      gets no verdict: record it as not-compared and say so in the report.
      Identical captures are a recorded fact, not a failure: two registered themes
      can differ only in tokens the screens under verification never consume, and
      a report that passed them as visibly distinct claimed something the run did
      not see. The first theme has no predecessor to compare against.
5. **Read state from the accessibility snapshot after every click and every
   navigation** - `npx --yes agent-browser snapshot -i`. A text-wait does not see
   into a shadow root, so it times out on text that was on screen the whole time.
   It does not stand in for the snapshot here; when a wait is what is needed, take
   it from sub-step 6.
6. **Wait for text with the shadow-descending poll below, not with `wait
   --text`.** `wait --text` searches light DOM only, and this stack renders inside
   shadow roots, so it spends its whole timeout on text that was already on
   screen: one run lost 75s to three such timeouts. Reach for `wait --text` only
   for content known to live in light DOM. For everything else, poll through
   `npx --yes agent-browser eval`:

   ```js
   (async () => {
     const needle = '<text>';
     const timeoutMs = 10000;
     const pollMs = 250;
     const holds = (root) => {
       const scope = root === document ? document.body : root;
       if (scope && (scope.textContent ?? '').includes(needle)) return true;
       for (const el of root.querySelectorAll('*')) {
         if (el.shadowRoot && holds(el.shadowRoot)) return true;
       }
       return false;
     };
     const deadline = Date.now() + timeoutMs;
     for (;;) {
       if (holds(document)) return 'found';
       if (Date.now() >= deadline) return 'not found';
       await new Promise((resolve) => setTimeout(resolve, pollMs));
     }
   })()
   ```

   Put the text to wait for in `<text>`. `holds` reads the light DOM once and
   then descends into every element's `shadowRoot` recursively, so text at any
   nesting depth is seen. `found` means the text arrived; `not found` means it
   did not arrive inside the timeout, which is a real absence to act on rather
   than a blind spot to wait out again. If the runner hands back the promise
   instead of its value, set `timeoutMs` to 0 and re-issue the helper until it
   returns `found` or the wait budget is spent.
7. **Write the coverage table to a file.** The verification's deliverable is
   `<targetDir>/.frontx/verification-coverage.md`, beside the project's provenance
   record, written **before the final report is composed** and holding one row per
   registered theme, the byte-compare verdict from sub-step 4.4, and one column
   per screen under verification:

   ```markdown
   | Theme | Opened | Visually distinct from previous | <screen> states captured | <screen> states captured |
   |---|---|---|---|---|
   | <registered theme> | verified / not-opened (reason) | yes (cmp exit 1) / no (cmp exit 0, captures identical) / not-compared (reason) / first theme | <states> | <states> |
   ```

   The distinctness cell carries the comparison command's own result, in the
   parentheses shown - the `cmp` exit code, or the differing hashes. A cell
   without one is a cell no command backed.

   Every registered theme gets a row, including each one recorded as not-opened.
   A state is the point a capture was taken at, named for what the screen held
   then: a form in its fresh state after the boundary reload and after it is
   submitted, a list fresh and after it changes. Name a state `fresh` only for a
   capture taken after that reload and before any interaction in this theme -
   calling a later capture fresh reports a screen this run never saw. Step 8
   carries this file's content verbatim. The file is the deliverable, not a
   suggestion - a run that composed a report without writing it did not complete
   the verification, whatever the report concluded.

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
- the coverage table any browser verification in step 7 wrote, **reproduced in
  full inside the report, between code fences**, followed by the path of the file
  it was reproduced from. Copy every row and every column across. A link, a file
  name, a row count or a sentence summarizing what the table says is not
  acceptable in its place: the reader is being told what was verified, and a
  pointer tells them where to go look instead;
- the residual work - only the intent that no applied template's ground contains
  and no activated skill covers.

**Quote every number in this report from the output of the command that produced
it.** Test counts, lint counts, file counts: find the summary line the command
printed, read the figure off that line, and name the command it came from. Do not
recall a figure from earlier in the session, do not add up per-suite numbers
yourself, and do not carry one over from an earlier run. A total the report never
read off a command's own output is a total the report invented, and two runs have
now shipped one that disagreed with what the command printed.

**Capture the aggregate run whole, so that rule has something to read.** The run
whose figures the report quotes - the one covering every workspace at once - is
captured without truncation that can hide a workspace's summary. Do not pipe it
through `tail` or `head`: each cuts from one end, and the workspaces printed at
the other end disappear with their summary lines, which is exactly how a run
reported four of its nine figures off an earlier failed run and never observed a
ninth workspace at all. When the output has to be reduced, filter **for** the
summary lines instead of slicing the stream, and keep the whole log beside it:

```bash
<declared test command> 2>&1 | tee <targetDir>/.frontx/test-run.log \
  | grep -E '<the per-workspace result line pattern>'
```

Then, reading figures off that capture:

- **Take every total from the last fully green run and from no other.** A figure
  read off a run that failed, or off a run that predates the fix, is not this
  project's result, however unchanged that workspace looks. A green run replaces
  the earlier output entirely; it does not top it up.
- **Report no figure whose workspace summary was never observed in captured
  output.** Do not infer it from the workspaces around it and do not drop the
  workspace silently. Name it, say its result was not captured, and re-run to
  capture it.

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
