# Scaffolding Verification Checklist

**Artifact**: the verification a scaffolding run performs in Step 7 and reports in Step 8
**Version**: 1.0
**Purpose**: the accounting layer over Step 7's browser walk and Step 8's report - what must be true for a claim to stand

This checklist states **what must hold**. The skill document beside it states **how**
each check is driven, and stays the authority on mechanics: every item below traces
to a rule already written there. When the two appear to disagree, the skill's own
rule is the wording that governs and this file is what is out of date.

Nothing here adds a check to what a covering skill declares. Which checks exist is
the covering skill's to say; this file governs only how honestly the run reports
whatever it ran.

## Table of Contents

1. [Severity Dictionary](#severity-dictionary)
2. [Prerequisites](#prerequisites)
3. [Applicability](#applicability)
4. [MUST HAVE](#must-have)
   - [VER-SCOPE - Declared Scope](#ver-scope---declared-scope)
   - [VER-STATE - State and Capture Evidence](#ver-state---state-and-capture-evidence)
   - [VER-CMP - Capture Comparison](#ver-cmp---capture-comparison)
   - [VER-ROUTE - Address and Routing](#ver-route---address-and-routing)
   - [VER-NUM - Published Figures](#ver-num---published-figures)
   - [VER-ENV - Run Environment](#ver-env---run-environment)
   - [VER-REPORT - Coverage File and Report](#ver-report---coverage-file-and-report)
5. [MUST NOT HAVE](#must-not-have)
6. [Reporting](#reporting)

---

## Severity Dictionary

- **CRITICAL**: the report would state something the run did not establish. Blocks
  the verification from being reported as passed.
- **HIGH**: process broken in a way that costs the run its evidence, its
  environment or its time. Fix before reporting.
- **MEDIUM**: hygiene. Fix when feasible.

---

## Prerequisites

Before walking this checklist, confirm:

- [ ] I will check every item in MUST HAVE and verify every item in MUST NOT HAVE
- [ ] I will judge each item against what this run captured, not against what it intended
- [ ] I will report a category as FAIL when its evidence is absent, rather than omit it
- [ ] I will use the [Reporting](#reporting) status walk at the end of this document

---

## Applicability

Every category applies to a run that performed a browser verification. A category
that genuinely does not apply is reported `N/A` **with the reason**, and the reason
names what about this run put the category out of reach.

- **VER-ROUTE** is N/A only where the surface under verification mounts no
  addressable screens.
- **VER-CMP** is N/A only where the host registers a single theme, so no capture
  pair exists to compare.
- **VER-NUM** is N/A only where the run published no figure at all.

Everything else applies whenever the browser walk ran. `N/A` is not available for a
category the run skipped: a skipped category is a narrowed scope, and it is reported
under VER-SCOPE-002 as such.

---

# MUST HAVE

---

## VER-SCOPE - Declared Scope

### VER-SCOPE-001: The Declared Set Is Covered in Full
**Severity**: CRITICAL

- [ ] The theme set was read from the host's own theme registration - the source
      file where themes are registered, or the list it exports
- [ ] The set was not taken from the entries a switcher happens to offer
- [ ] The count of registered themes and the count of walked themes are the same number
- [ ] Every screen under verification, and every state the declared checks call
      for, is covered
- [ ] No theme, screen or state was set aside as a sample or a representative subset

### VER-SCOPE-002: A Narrowing Is Stated in the Visible Output
**Severity**: CRITICAL

- [ ] Any narrowing names which part of the scope is narrowed, what is left out of
      it, and why
- [ ] That reason is written into the text the developer reads, not only into the
      coverage file, which records what was covered and cannot carry the reason
- [ ] Everything left out is reported as not verified
- [ ] An unexplained narrowing is reported as a verification failure, not as a scope
      decision this run was free to make

### VER-SCOPE-003: The Reason Answers the Narrowed Check's Own Axis
**Severity**: CRITICAL

- [ ] Each narrowing's reason argues the axis the narrowed check covers
- [ ] A visual check - what a state looks like once a theme's tokens are applied -
      is not closed by an argument about behavior, however true that argument is
- [ ] A reason arguing another axis is recorded as an unexplained narrowing and
      handled under VER-SCOPE-002

---

## VER-STATE - State and Capture Evidence

### VER-STATE-001: Each Theme Starts From a State This Run Knows
**Severity**: HIGH

- [ ] Every theme's block begins with a reload, the first theme included
- [ ] A state is named `fresh` only for a capture taken after that reload and before
      any interaction in that theme
- [ ] The active theme was read before anything was verified, and the host's default
      theme was selected before the first capture

### VER-STATE-002: The Theme Switch Is Confirmed Off the Switcher's Own Label
**Severity**: CRITICAL

- [ ] The switcher's label was read after each switch, and it names the theme just
      selected
- [ ] No attribute, class, computed style or source file was used to detect which
      theme is active
- [ ] The label line's output was actually read: it prints and the batch carries on,
      so every line after it ran whatever the label said
- [ ] A label still naming the previous theme was recorded as not-opened with that as
      the reason, its block's captures discarded, and nothing under it passed as verified

### VER-STATE-003: Every Claimed State Cites Its Own Capture
**Severity**: CRITICAL

- [ ] Every state named as captured has a capture artifact of that state, in that theme
- [ ] Each state names the capture it is claimed from - the screenshot's file name, or
      the accessibility snapshot taken at that point - in the cell or in a notes line
      under the table
- [ ] A state this theme only drove is listed apart, as `<state> driven, not captured`
- [ ] No state captured in one theme is claimed on another theme's row

### VER-STATE-004: State Is Read Back From Something That Looked at the Page
**Severity**: HIGH

- [ ] Every click and every navigation is followed by a reading of the page, never by
      the runner's own confirmation that it issued the command
- [ ] Each fill is confirmed by reading the value back off the same handle
- [ ] Screen controls were driven by the handles read out of the shadow roots, not by
      an outside selector that cannot see in
- [ ] What a compact snapshot leaves out was not read as evidence of absence
- [ ] No product source was edited on a snapshot-only signal

---

## VER-CMP - Capture Comparison

### VER-CMP-001: Distinctness Is Read Off a Command's Result
**Severity**: CRITICAL

- [ ] Each theme's captures were compared against the previous theme's by running the
      comparison as a command over the two files
- [ ] Every distinctness cell carries that command's own result - the printed exit
      code, or the two hashes
- [ ] No cell was filled by opening two captures and judging them different by eye
- [ ] A capture pair the command was never run over is recorded as not-compared, with
      the reason, and carries no verdict
- [ ] Identical captures are recorded as the fact they are, neither reported as a
      failure nor passed off as visibly distinct
- [ ] The first theme's cell says it has no predecessor to compare against

---

## VER-ROUTE - Address and Routing

### VER-ROUTE-001: Each Screen Answers Its Own Declared Route
**Severity**: CRITICAL

- [ ] Each screen's route was read out of the manifest that declares it, and no path
      named by the skill, the plan or the report was navigated to
- [ ] Each screen was reached by a full load of that route, not by a menu click
- [ ] The reading after that load confirms it is that screen which mounted

### VER-ROUTE-002: The Address Follows the Menu Click
**Severity**: CRITICAL

- [ ] After clicking another screen's menu item, the URL was read back with the
      runner's own url reading
- [ ] The pathname read back equals the clicked screen's declared route
- [ ] The reading after that click confirms the clicked screen is the one mounted

### VER-ROUTE-003: Routing Is Reported Per Screen
**Severity**: HIGH

- [ ] The report carries one line per realized screen: the declared route it was
      deep-linked at, the screen that mounted, and the pathname read back
- [ ] A failure here is reported as a defect carrying those three readings, and the
      project reported as not verified for routing
- [ ] Routing left unexercised is reported as unexercised, never left unmentioned

---

## VER-NUM - Published Figures

### VER-NUM-001: Every Figure Was Printed by a Command
**Severity**: CRITICAL

- [ ] Each figure points at the captured output line that carries it verbatim
- [ ] The command each figure came from is named
- [ ] No figure was recalled from earlier in the session or carried over from an
      earlier run

### VER-NUM-002: No Total the Run Did Not Observe
**Severity**: CRITICAL

- [ ] Where no command printed a grand total, the report carries no grand total
- [ ] Where a run printed one summary line per workspace, every one of those lines is
      published as it stands and no number standing for the whole is published beside them
- [ ] No figure was obtained by adding captured lines together
- [ ] A phrase naming a total appears only beside the output line that itself contains it

### VER-NUM-003: The Run Being Quoted Was Captured Whole
**Severity**: HIGH

- [ ] The run whose figures the report quotes was captured without truncation that
      could hide a workspace's summary
- [ ] Where the output had to be reduced, it was filtered for the summary lines rather
      than sliced from either end, and the whole log kept beside it
- [ ] Every total comes from the last fully green run and from no other
- [ ] A workspace whose summary was never observed is named as uncaptured and re-run,
      neither inferred from its neighbours nor dropped in silence

### VER-NUM-004: Every Figure Postdates the Last Source Edit
**Severity**: CRITICAL

- [ ] No source file was changed after the gates whose figures the report quotes
- [ ] Where one was, the unit legs and then the aggregate gates were re-run, and the
      report drawn from that run alone

---

## VER-ENV - Run Environment

### VER-ENV-001: Captures Land in a Directory This Run Created
**Severity**: HIGH

- [ ] The capture directory was created by this run, before the first capture
- [ ] Every capture path is written with that directory resolved into it
- [ ] No capture was taken into a fixed path shared across runs
- [ ] No claim is satisfied by a file this run did not write

### VER-ENV-002: Servers Are Stopped by Recorded Process Id, and the Ports Confirmed Free
**Severity**: HIGH

- [ ] Each dev server's process id was recorded at start, or the runner's own stop
      mechanism was used where it declares one
- [ ] No process was stopped by a pattern match against command lines
- [ ] After each kill, every port this run started was asked whether anything still holds it
- [ ] Every surviving process id printed was killed by that printed id, and the port
      re-asked until it printed nothing

### VER-ENV-003: Host Chrome Is Off the Captures
**Severity**: HIGH

- [ ] The host's dev panel was collapsed before the first capture in every theme, and
      the collapse confirmed rather than assumed
- [ ] No capture was taken, and no click aimed, while that panel overlaid screen content

### VER-ENV-004: An Already-Listening Browser Is Attached To
**Severity**: MEDIUM

- [ ] The debugging endpoint was probed once before any browser was launched
- [ ] Where it answered, the run attached to that browser rather than launching a second one

---

## VER-REPORT - Coverage File and Report

### VER-REPORT-001: The Coverage File Exists and Was Written First
**Severity**: CRITICAL

- [ ] The coverage file exists beside the project's provenance record, at the path the
      skill names
- [ ] It was written before the final report was composed
- [ ] It holds one row per registered theme, including every theme recorded as not-opened
- [ ] It holds the distinctness verdict and one states-captured column per screen under
      verification

### VER-REPORT-002: The Coverage Table Is Reproduced in Full
**Severity**: CRITICAL

- [ ] The report reproduces the table row for row and column for column
- [ ] The path of the file it was reproduced from follows it
- [ ] No link, file name, row count or summarizing sentence stands in its place

### VER-REPORT-003: The Report Walks Every Category of This Checklist
**Severity**: CRITICAL

- [ ] The report carries one status line per category, in the form this document's
      [Reporting](#reporting) section fixes
- [ ] Every category appears, including the MUST NOT HAVE partition
- [ ] Each FAIL names what the run did not establish, and each N/A names why the
      category was out of reach
- [ ] A category the report leaves out is treated as a failure of the report, not as a
      category that passed

### VER-REPORT-004: A Failed Verification Is Reported as One
**Severity**: HIGH

- [ ] A failing declared verification stopped the flow where it failed
- [ ] The project is reported as applied and realized but not verified, with that
      verification's own output relayed unreinterpreted
- [ ] No correction retry was attempted
- [ ] Scaffolding is not reported as complete over a failing gate

---

# MUST NOT HAVE

### VER-NO-001: No Claim Resting on the Runner's Own Exit Report
**Severity**: CRITICAL

**What to check**:
- [ ] No state confirmed from the runner reporting that it issued a command
- [ ] No fill confirmed from its exit code alone
- [ ] No distinctness verdict without the comparison command's printed result

**Where the evidence belongs**: a reading of the page, or the comparison command's output

### VER-NO-002: No Figure the Run Did Not Observe
**Severity**: CRITICAL

**What to check**:
- [ ] No repository-wide total assembled by summing per-workspace lines
- [ ] No figure taken from a failed run, or from a run predating the fix
- [ ] No figure predating the last source edit

**Where the evidence belongs**: the captured output line carrying the figure verbatim

### VER-NO-003: No Capture Standing In for Another Theme or Another Run
**Severity**: CRITICAL

**What to check**:
- [ ] No state claimed on a theme's row whose own artifacts do not carry it
- [ ] No file written by an earlier run cited as this run's evidence
- [ ] No capture taken after an interaction named `fresh`

**Where the evidence belongs**: this run's own capture directory, per theme

### VER-NO-004: No Scope Narrowed in Silence
**Severity**: CRITICAL

**What to check**:
- [ ] No theme, screen or state dropped without its reason in the visible output text
- [ ] No reason arguing an axis other than the one the narrowed check covers
- [ ] No sample or subset presented as the registered set

**Where the evidence belongs**: the report's own text, beside the coverage table

### VER-NO-005: No Source Edited to Move a Check Along
**Severity**: HIGH

**What to check**:
- [ ] No product source changed during the browser walk
- [ ] No correction retry after a failing command or a failing declared verification
- [ ] No environment torn down to chase a signal a screenshot or a DOM reading would have settled

**Where it belongs**: a defect report handed back with the run

### VER-NO-006: No Category Left Out of the Status Walk
**Severity**: CRITICAL

**What to check**:
- [ ] No category of this checklist absent from the report's status walk
- [ ] No blanket statement standing in for the per-category lines
- [ ] No PASS on a category whose evidence the report does not carry

**Where it belongs**: the [Reporting](#reporting) status walk below

---

## Reporting

The report carries one line per category, in this order and this form:

```
VER-SCOPE:  PASS | FAIL (<what was not established>) | N/A (<why out of reach>)
VER-STATE:  ...
VER-CMP:    ...
VER-ROUTE:  ...
VER-NUM:    ...
VER-ENV:    ...
VER-REPORT: ...
VER-NO:     ...
```

- **PASS** means every item in that category holds and the report carries the evidence
  each one asks for.
- **FAIL** names the item that did not hold and what the run did not establish. A FAIL
  on any CRITICAL item means the verification is not reported as passed.
- **N/A** names why the category was out of reach, under [Applicability](#applicability).
  A category the run simply skipped is a FAIL, not an N/A.

An absent line is a FAIL of the report, not a category that passed.
