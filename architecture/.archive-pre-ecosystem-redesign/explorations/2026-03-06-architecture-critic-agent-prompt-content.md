# Exploration: Architecture Critic Agent -- Prompt Content Deep Dive


<!-- toc -->

- [Research question](#research-question)
- [Scope](#scope)
- [Findings](#findings)
  - [1. Evaluation dimensions the critic should check](#1-evaluation-dimensions-the-critic-should-check)
  - [2. What makes criticism constructive vs. noise](#2-what-makes-criticism-constructive-vs-noise)
  - [3. Structured output format](#3-structured-output-format)
  - [4. Challenge questions to bake into the agent](#4-challenge-questions-to-bake-into-the-agent)
  - [5. Handling confidence levels and deferred decisions](#5-handling-confidence-levels-and-deferred-decisions)
- [Comparison](#comparison)
  - [Format comparison: Option A (flat list) vs. Option B (dimension-grouped)](#format-comparison-option-a-flat-list-vs-option-b-dimension-grouped)
- [Key takeaways](#key-takeaways)
- [Open questions](#open-questions)
- [Sources](#sources)

<!-- /toc -->

Date: 2026-03-06

## Research question

Given the decisions already made about the `architecture-critic` agent (name, scope, persona, invocation model, SOLID approach), what specific content should go into its system prompt? Five sub-questions:

1. What evaluation dimensions should the critic check that the architect does NOT already cover?
2. What makes criticism constructive vs. noise?
3. What structured output format works for iterative feedback?
4. What specific "challenge questions" should be baked into the agent?
5. How should the critic handle the architect's confidence levels and deferred decisions?

## Scope

**In scope**: Concrete prompt content -- evaluation dimensions, question lists, output format proposals, severity calibration, engagement with confidence levels and deferrals.

**Out of scope**: Agent implementation, tool selection, model choice, workflow integration. Prior exploration ([2026-03-06-architecture-reviewer-agent-design.md](./2026-03-06-architecture-reviewer-agent-design.md)) covers persona selection, role analysis, and comparison with the current `openspec-reviewer`.

**Constraint**: The architect agent already covers trade-offs, SOLID (with PASS/RISK/FAIL verdicts), risk assessment (technical/operational/integration), blast radius, anti-patterns (6 named patterns), confidence levels, and deferred decisions. The critic must NOT duplicate these -- it must add value on top.

---

## Findings

### 1. Evaluation dimensions the critic should check

The architect agent's prompt explicitly covers: trade-off evaluation, SOLID compliance (per-principle verdicts), risk assessment (technical/operational/integration rated H/M/L), blast radius assessment, anti-pattern detection (6 named patterns), confidence levels, and deferred decisions. The critic must operate in the gaps.

#### 1.1 ATAM-derived dimensions the architect does NOT cover

ATAM's core contribution beyond trade-off analysis is the identification of **sensitivity points** and **trade-off points** -- concepts the architect agent does not use. A sensitivity point is an architectural decision that has high impact on a single quality attribute. A trade-off point is where an architectural decision affects multiple quality attributes in tension ([ATAM Wikipedia](https://en.wikipedia.org/wiki/Architecture_tradeoff_analysis_method), [SEI ATAM Report](https://www.sei.cmu.edu/documents/629/2000_005_001_13706.pdf)).

The distinction matters: the architect identifies trade-offs (Option A vs. Option B), but does not systematically identify which specific architectural decisions are sensitivity points (small changes here cause large quality shifts) or trade-off points (improving X here necessarily degrades Y). These are different analytical acts.

ATAM also uses **scenario walkthroughs** -- taking a concrete quality attribute scenario (e.g., "response time under 200ms when 1000 concurrent users access the dashboard") and tracing it through the architecture to find where it breaks down. The architect does not do this. The critic can.

**Concrete dimensions to add:**

| Dimension | What the critic checks | What it catches |
|-----------|----------------------|-----------------|
| Sensitivity point identification | Which decisions, if changed slightly, would disproportionately affect a quality attribute? | Fragile design points the architect treated as routine |
| Trade-off point identification | Where does improving one quality attribute necessarily degrade another? | Unacknowledged zero-sum tensions |
| Scenario walkthrough | Trace a concrete scenario (load, failure, change) through the proposed architecture end-to-end | Gaps in the design that only appear when you follow a request path |
| Quality attribute coverage | Which quality attributes from ISO 25010 are addressed vs. silently ignored? | Missing "ilities" -- the architect may focus on modifiability while ignoring observability |

**Confidence:** Substantiated -- ATAM methodology is well-documented by SEI/CMU. Application to critic agent is the researcher's synthesis.

#### 1.2 Staff+ engineer dimensions the architect does NOT cover

Based on the [9 Things Staff+ Engineers Do in Architecture Reviews](https://www.devx.com/technology/9-things-staff-engineers-do-in-architecture-reviews/), staff engineers bring dimensions that differ from what the architect agent covers:

| Dimension | What the critic checks | What it catches |
|-----------|----------------------|-----------------|
| Quantitative scale validation | Are throughput, data growth, payload sizes, fan-out ratios stated? Are they realistic? | Designs that look elegant until scaled -- the architect may say "handles high traffic" without defining what "high" means |
| Organizational scalability | Do component boundaries align with team boundaries? How many teams must coordinate for a change? | Coordination bottlenecks invisible in the technical design |
| Hidden coupling detection | Shared databases, synchronous cross-service calls, embedded schema assumptions across boundaries | Distributed monolith patterns the architect's anti-pattern check may miss because they span components |
| Operability as design concern | How will this be debugged in production? What metrics signal saturation? What's the rollback path? | The architect has "operational risk" as a category but does not demand specific answers about observability, runbooks, or on-call ergonomics |
| Novelty justification | When the design introduces new technology or patterns, is the justification proportional to the operational cost? | Unmotivated technology choices where existing tools would suffice |
| Business invariant alignment | Does the technical guarantee match what the business actually requires? | Over-engineering (e.g., strict consistency when eventual consistency suffices) or under-engineering |

**Confidence:** Substantiated -- based on well-regarded engineering practice literature. The specific questions are concrete and actionable.

#### 1.3 Intent alignment verification

The current `openspec-reviewer` has an "Intent Alignment Check" that catches contradictions between stated goals and actual proposals. The prior exploration identified this as uniquely valuable. The critic should preserve this dimension but generalize it beyond OpenSpec to Cypilot artifacts:

- Does the DESIGN actually solve the problem stated in the PRD?
- Do DECOMPOSITION entries trace back to DESIGN components?
- Do FEATURE specs align with what the DECOMPOSITION promised?
- Are there PRD requirements with no corresponding design response?
- Are there design components that serve no stated requirement (gold-plating)?

**Confidence:** Corroborated -- verified by comparing both agent definitions and confirmed as a gap by the prior exploration.

#### 1.4 Completeness gap analysis

The architect produces artifacts with TODO markers (the current DESIGN.md has 15+ TODO sections). The critic should systematically identify:

- Sections marked TODO that downstream artifacts depend on
- Implicit dependencies on undocumented decisions
- Components referenced in DECOMPOSITION but absent from DESIGN
- Interfaces used in FEATURE specs but not defined in DESIGN

**Confidence:** Substantiated -- observed directly in the current architecture artifacts.

#### 1.5 Consistency with codebase patterns

The prior exploration identified this as a gap: does the proposed design match how things are actually built in the repo? The critic should check:

- Does the design follow the repo's established patterns (event-driven, registry-based, plugin-first composition)?
- When the design diverges from existing patterns, is the divergence acknowledged and justified?
- Does the design respect the repo invariants in `.ai/GUIDELINES.md`?

**Confidence:** Substantiated -- the GUIDELINES.md file codifies specific patterns (event-driven, registry Open/Closed, layer constraints) that designs must respect.

---

### 2. What makes criticism constructive vs. noise

#### 2.1 The feedback-centric model

[Subbu Allamaraju's analysis of technology decision-making](https://www.subbu.org/articles/2017/technology-decision-making-and-architecture-reviews/) makes a sharp distinction: traditional architecture review boards "are slow, impede team autonomy and produce top-heavy decisions." The alternative is a **feedback-centric** model where:

- Feedback is non-binding -- the architect retains decision authority
- Feedback must be constructive -- opinions are only useful when followed by specific alternatives
- The goal is teaching, not gate-keeping -- "teaching someone how to make better decisions through constructive feedback is far more valuable than making decisions for them"

This aligns with the decision to produce structured feedback rather than APPROVE/BLOCK verdicts.

**Confidence:** Substantiated -- one influential source, but consistent with broader patterns in engineering culture.

#### 2.2 Characteristics of actionable vs. vague feedback

Synthesizing across multiple sources ([Subbu Allamaraju](https://www.subbu.org/articles/2017/technology-decision-making-and-architecture-reviews/), [Ledwith on effective reviews](https://ledwith.tech/blog/2025/07/09/effective-architecture-reviews/), [Mozilla's review process](https://mozilla.github.io/firefox-browser-architecture/text/0006-architecture-review-process.html)):

| Actionable feedback | Vague/noisy feedback |
|---------------------|---------------------|
| Points to a specific artifact section and states what's missing | "The design needs more detail" |
| Asks a question the architect can answer concretely | "Have you considered scalability?" |
| Identifies a specific scenario that would break the design | "There might be edge cases" |
| Proposes a concrete alternative when challenging a decision | "This approach is wrong" |
| States what information is needed to resolve the concern | "I'm not sure about this" |
| Distinguishes between "I don't understand this" and "this is wrong" | Conflates confusion with deficiency |

The key pattern: **every finding must be either a question the architect can answer, a scenario the architect should trace, or a gap the architect should fill**. Findings that cannot be acted upon are noise.

**Confidence:** Corroborated -- consistent across multiple independent sources and engineering practices.

#### 2.3 Severity calibration

The critic needs a severity model that avoids two failure modes: (a) treating everything as critical (cry-wolf), and (b) burying real concerns in a list of nitpicks.

Drawing from [ATAM's risk categorization](https://en.wikipedia.org/wiki/Architecture_tradeoff_analysis_method) and the [MoSCoW prioritization method](https://en.wikipedia.org/wiki/MoSCoW_method), a three-tier model emerges:

| Severity | Definition | Architect action |
|----------|-----------|-----------------|
| **Must Address** | Finding blocks downstream work, or represents a risk that could invalidate the design if wrong. Missing a must-address finding would lead to rework or failure. | Architect must respond before the artifact moves to the next pipeline stage |
| **Should Address** | Finding represents a gap, unexamined assumption, or concern that could become a problem. Design can proceed but the concern should be resolved. | Architect should respond, but can defer with explicit reasoning |
| **Consider** | Finding is an observation, alternative perspective, or question that may improve the design. Not addressing it does not create risk. | Architect acknowledges and decides whether to act |

The implementation-reviewer's philosophy -- "everything is either a BLOCK or clean" -- is too blunt for architecture review. Architecture artifacts are iterative works-in-progress, and binary verdicts would either block too aggressively or approve too leniently.

**Confidence:** Substantiated -- synthesized from ATAM risk categorization and industry prioritization practices.

#### 2.4 Anti-patterns in criticism itself

The critic agent should be explicitly instructed to avoid these:

- **Checklist theater**: Producing findings for every section just to show thoroughness. If a section is solid, say so and move on.
- **Rehashing the architect's work**: Re-stating trade-offs the architect already surfaced. The critic should reference the architect's analysis and build on it, not repeat it.
- **Hypothetical criticism**: "What if the requirements change completely?" -- findings must be grounded in stated requirements and known constraints, not speculative futures.
- **Tone failure**: The critic is a collaborator, not an adversary. Findings should be framed as "Have you considered X?" or "The design does not address Y -- this matters because Z" rather than "You failed to consider X."

**Confidence:** Substantiated -- derived from the feedback-centric model and practical review experience documented across sources.

---

### 3. Structured output format

#### 3.1 Analysis of existing formats

Three models were analyzed:

**ATAM output**: Produces lists of risks, non-risks, sensitivity points, and trade-off points. Highly structured but designed for committee presentation, not iterative artifact improvement.

**Mozilla review output**: Produces minuted discussion with action items. Good for synchronous review meetings, too unstructured for an AI agent's output.

**Implementation-reviewer output** (current repo): APPROVE/BLOCK with BLOCKERS table and section-by-section findings. Clean but binary -- not suited for iterative architecture work.

#### 3.2 Proposed format

The format must serve these goals: (a) the architect can scan severity quickly, (b) each finding points to a specific location, (c) findings are actionable, and (d) the format supports iteration (the architect addresses findings and the critic can re-review).

Two format options with distinct structures:

**Option A: Finding-centric flat list**

```markdown
## Architecture Critique: [artifact name]

### Summary
[2-3 sentence overall assessment. What is strong. What needs attention.]

### Findings

#### [F1] [Severity: Must Address] [Category: Hidden Assumption]
**Location:** DESIGN.md, Section 3.2 Component Model
**Finding:** The design assumes all SDK packages can be loaded synchronously,
but the DECOMPOSITION specifies lazy loading for i18n dictionaries. If screenset
registration triggers i18n loading, a synchronous assumption creates a race condition.
**Question for architect:** What is the loading guarantee for SDK packages at
screenset registration time? Is there a dependency ordering contract?

#### [F2] [Severity: Should Address] [Category: Missing Scenario]
**Location:** DESIGN.md, Section 3.6 Interactions
**Finding:** The Screen-Set Data Flow sequence does not account for the case
where a microfrontend's Shadow DOM encapsulation blocks event propagation to
the parent layout.
**Scenario to trace:** An MFE dispatches a navigation event. Trace it from
Shadow DOM → event bus → layout state → router. Where does it cross isolation
boundaries?

...

### What Looks Solid
[Specific acknowledgment of design strengths -- not filler, but genuine recognition
of well-handled concerns.]

### Open Questions for the Architect
[Questions that could not be resolved from the artifacts alone -- things that
need the architect's reasoning or additional context.]
```

**Option B: Dimension-grouped table**

```markdown
## Architecture Critique: [artifact name]

### Summary
[2-3 sentence overall assessment.]

### Findings by Dimension

#### Traceability and Intent Alignment
| # | Severity | Location | Finding | Action |
|---|----------|----------|---------|--------|
| 1 | Must Address | PRD s5.1 -> DESIGN s3.2 | No design response for configurable build targets | Fill gap or document as deferred |

#### Sensitivity and Trade-off Points
| # | Severity | Location | Finding | Action |
|---|----------|----------|---------|--------|
| 2 | Should Address | DESIGN s3.4 | Event bus throughput is a sensitivity point... | Quantify or document threshold |

#### Hidden Assumptions and Missing Scenarios
...

#### Consistency with Codebase
...

### What Looks Solid
...

### Open Questions for the Architect
...
```

**Trade-offs between formats:**

| Criteria | Option A (flat list) | Option B (dimension-grouped) |
|----------|---------------------|------------------------------|
| Scannability | Moderate -- must read each finding | High -- can skip entire dimensions |
| Deduplication | Risk of overlapping findings | Lower risk -- dimensions are distinct |
| Completeness signal | Unclear which dimensions were checked | Clear -- empty dimension = checked and clean |
| Iteration support | Easy to reference by F-number | Harder to reference across dimensions |
| LLM output reliability | Simpler structure, more reliable | Complex tables may degrade with many findings |

**Confidence:** Substantiated -- both formats are synthesized from analyzed review templates. Neither is directly taken from a single source.

#### 3.3 Finding categories

Based on ATAM outputs, staff engineer review patterns, and the gap analysis against the architect's coverage, the following categories emerge:

| Category | Definition | Example |
|----------|-----------|---------|
| **Hidden Assumption** | Something the design takes for granted without stating or validating | "Assumes event bus is synchronous" |
| **Missing Scenario** | A concrete use case, failure mode, or change case not addressed | "No handling for partial API response" |
| **Sensitivity Point** | A decision that disproportionately affects a quality attribute | "Cache TTL choice drives P99 latency" |
| **Trade-off Tension** | Improving one quality attribute here necessarily degrades another | "Shadow DOM isolation vs. event propagation" |
| **Traceability Gap** | A requirement with no design response, or a component with no requirement | "PRD s5.8 security has no DESIGN section" |
| **Consistency Conflict** | Design contradicts existing codebase patterns or GUIDELINES.md invariants | "Proposes direct dispatch; repo requires events" |
| **Under-specification** | A decision or interface that lacks enough detail for implementation | "API contract defined but no error schema" |
| **Over-specification** | Premature detail that constrains implementation without justification | "Prescribes Redis when any cache would work" |
| **Quantification Gap** | A claim about scale, performance, or capacity with no numbers | "'Handles high traffic' -- how much traffic?" |
| **Deferred Decision Concern** | A deferral that may be avoidance, or that blocks downstream work | "Database choice deferred but FEATURE specs assume SQL queries" |

**Confidence:** Substantiated -- categories derived from ATAM methodology, staff engineer practices, and direct analysis of what the architect agent does vs. does not cover.

---

### 4. Challenge questions to bake into the agent

These questions are organized by what they expose. Each is sourced from ATAM methodology, staff engineer practices, DRBFM (Design Review Based on Failure Mode), or architecture pitfall literature.

#### 4.1 Questions that expose hidden coupling

1. Which components share persistent state (database, cache, file system)? If any do, what happens when the schema changes?
2. How many synchronous hops does a request traverse end-to-end? Where is the latency budget spent?
3. If Component A is deployed independently, which other components must be re-deployed or re-tested?
4. Which components share type definitions or generated code? What happens when those types diverge?
5. Are there implicit ordering dependencies between event handlers? What happens if execution order changes?

Source: [Staff+ engineer review patterns](https://www.devx.com/technology/9-things-staff-engineers-do-in-architecture-reviews/) -- specifically dimension 4 (surface coupling early).

**Confidence:** Substantiated.

#### 4.2 Questions that expose premature decisions

1. What evidence supports this choice over alternatives? Is the evidence from this project or imported from a different context?
2. Could this decision be deferred without blocking downstream work? If yes, why is it being made now?
3. Is this component designed for a hypothetical future requirement or a current, validated need?
4. Does this abstraction earn its complexity? What concrete extension scenario justifies it?
5. If we removed this component entirely, what would break? If the answer is "nothing yet," the component may be premature.

Source: [12 Software Architecture Pitfalls](https://www.infoq.com/articles/avoid-architecture-pitfalls/) -- pitfalls 2 (blind reuse), 6 (perfecting before delivery), 10 (over-generalizing).

**Confidence:** Substantiated.

#### 4.3 Questions that expose missing failure modes

1. What happens when [dependency X] is unavailable for 5 minutes? 30 minutes? Permanently?
2. What happens when this component receives malformed input? Is there a validation boundary?
3. What happens when the data volume is 10x the expected amount? Where is the first bottleneck?
4. What is the blast radius if this component fails silently (produces wrong results without error)?
5. What is the recovery path? Can the system self-heal, or does it require manual intervention?
6. What happens when two users/processes perform the same operation simultaneously?

Source: [DRBFM methodology](https://en.wikipedia.org/wiki/Design_review_based_on_failure_mode) (Toyota's "what's stopping this from working as intended?"), [Microsoft FMA](https://learn.microsoft.com/en-us/azure/well-architected/reliability/failure-mode-analysis), [Staff+ engineer dimension 1](https://www.devx.com/technology/9-things-staff-engineers-do-in-architecture-reviews/) (anchor on failure modes).

**Confidence:** Corroborated -- failure mode analysis is well-established across DRBFM, FMEA, and production engineering practices.

#### 4.4 Questions that expose implicit assumptions about scale, team, and timeline

1. What are the concrete numbers? Requests per second, data growth per month, payload sizes, concurrent users? If not stated, the design is making implicit scale assumptions.
2. How many teams need to coordinate to deliver this? Do component boundaries align with team boundaries?
3. What is the smallest increment that delivers user-visible value? Can it be shipped independently?
4. What operational expertise does this design assume? Does the team have it, or is it aspirational?
5. What is the learning curve for a new developer joining this part of the system?

Source: [Staff+ engineer dimensions 3 and 7](https://www.devx.com/technology/9-things-staff-engineers-do-in-architecture-reviews/) (pressure-test scale, organizational scalability).

**Confidence:** Substantiated.

#### 4.5 Questions that expose gaps between design and need

1. For each component: why does this exist? Trace it to a specific PRD requirement. If you cannot, it may be gold-plating.
2. For each stated requirement: where in the design is this addressed? If nowhere, it is a gap.
3. Does the technical guarantee match what the business actually requires? (e.g., strict consistency when eventual suffices, or vice versa)
4. What quality attributes does the PRD demand that the design does not explicitly address?
5. Are there design components that exist "because best practice says so" rather than because a concrete requirement demands them?

Source: ATAM utility tree approach (mapping business goals to quality attribute scenarios), [Skeptic's Guide to Architecture Decisions](https://www.infoq.com/articles/architecture-skeptics-guide/) ("every requirement represents a hypothesis about value"), [Three Questions for Better Architecture](https://www.infoq.com/articles/three-questions-better-architecture/) (is the business idea worth pursuing?).

**Confidence:** Substantiated.

#### 4.6 Questions specific to FrontX context

Given the FrontX architecture (4-layer SDK, event-driven, plugin-first composition, microfrontend isolation):

1. Does this design respect the layer boundary constraints? (No React below L3, SDK packages have zero @gears-frontx dependencies)
2. Does cross-component communication go through the event bus, or does the design introduce direct coupling?
3. If this involves a registry, does it follow the Open/Closed principle -- can items be added without modifying registry root files?
4. How does this interact with the plugin system? Can it be composed via `.use()` and `.build()`?
5. If this involves microfrontends, how does Shadow DOM encapsulation affect event propagation, state access, and style inheritance?
6. Does this design work in both SDK mode and Full Platform mode, or does it assume one?

Source: Direct analysis of `.ai/GUIDELINES.md` repo invariants and the architect's DESIGN.md/DECOMPOSITION.md.

**Confidence:** Corroborated -- derived directly from codebase artifacts.

---

### 5. Handling confidence levels and deferred decisions

#### 5.1 Engaging with confidence levels

The architect tags recommendations as Conjecture, Substantiated, or Corroborated. The critic should engage differently with each:

**Conjecture (hypothesis, not verified):**
- The critic should actively probe conjectures. A Conjecture that downstream artifacts depend on is a risk.
- Key question: "What would need to be true for this conjecture to hold? What happens if it's wrong?"
- If a Conjecture drives a significant design choice, the critic should flag it as a sensitivity point: "This design depends on [conjecture X]. If X turns out to be false, [Y breaks]."
- The critic should NOT challenge conjectures just because they are conjectures. Conjectures are legitimate when the architect acknowledges the uncertainty and designs for reversibility.

**Substantiated (supported by docs/patterns):**
- The critic should verify the chain of reasoning. "Supported by documentation" does not mean "correct for this context."
- Key question: "The cited pattern applies in [context A]. Does our context match? What's different?"
- The critic should check whether the supporting evidence is from the FrontX codebase/explorations or from generic best practices. Context-specific evidence is stronger.

**Corroborated (validated by testing/production):**
- The critic should generally accept these but check scope: "This was validated in [scope X]. Does the current design extend beyond that scope?"
- The critic should note if a Corroborated claim is being extrapolated to a different context.

**Confidence:** Substantiated -- synthesized from the [Skeptic's Guide to Architecture Decisions](https://www.infoq.com/articles/architecture-skeptics-guide/) ("what evidence will we need to see to know that is true?") and ATAM's scenario-based validation.

#### 5.2 Evaluating deferred decisions

The architect explicitly practices "defer by default" and documents deferred decisions with rationale. The critic must distinguish legitimate deferral from avoidance.

**Signals of legitimate deferral** (synthesized from [Lean Last Responsible Moment literature](https://www.eferro.net/2022/08/software-development-art-of-postponing.html), [Ben Morris on LRM](https://www.ben-morris.com/lean-developments-last-responsible-moment-should-address-uncertainty-not-justify-procrastination/)):

| Signal | Meaning |
|--------|---------|
| The design is structured to work regardless of the deferred choice | The deferral is backed by an abstraction |
| A concrete trigger is stated for when the decision must be made | The architect has thought about timing |
| The deferred decision does not block any downstream artifact | Nothing stalls waiting for this |
| The cost of deciding now with incomplete information exceeds the cost of deferring | Genuine uncertainty reduction |

**Warning signs of avoidance:**

| Signal | Meaning |
|--------|---------|
| Downstream artifacts (DECOMPOSITION, FEATURE) make implicit assumptions about the deferred choice | The decision is actually already made -- just not documented |
| No trigger or timeline is stated for when the decision must be made | Deferral is open-ended -- it may never be revisited |
| Multiple deferred decisions interact with each other, creating compounding uncertainty | "Too many open decisions can create mental clutter that impedes progress" |
| The deferred decision affects an irreversible aspect of the design (data model, public API shape) | Reversibility is the precondition for deferral; irreversible decisions cannot safely be deferred |
| The deferral removes a difficult conversation rather than a premature commitment | Avoidance disguised as prudence |

**How the critic should engage:**

For each deferred decision, the critic should check:
1. Is the design structured to accommodate multiple outcomes? (If not, the decision is implicitly made.)
2. Are downstream artifacts making assumptions that contradict the deferral? (If so, there's a consistency gap.)
3. Is there a stated trigger for when the decision must be made? (If not, flag as open-ended.)
4. Does this deferral interact with other deferrals? (Compounding deferrals are a risk.)
5. Is the deferred aspect reversible? (Irreversible aspects should not be deferred without strong justification.)

**Confidence:** Substantiated -- deferral evaluation criteria are synthesized from multiple LRM sources. The specific application to the critic agent's workflow is the researcher's synthesis.

---

## Comparison

### Format comparison: Option A (flat list) vs. Option B (dimension-grouped)

| Criteria | Option A: Flat list | Option B: Dimension-grouped |
|----------|--------------------|-----------------------------|
| Scannability by severity | High -- sorted by severity | Moderate -- severity mixed within dimensions |
| Coverage completeness signal | Low -- unclear which dimensions were checked | High -- empty dimension = checked and clean |
| Referenceability | High -- F1, F2, F3 numbering | Moderate -- dimension + row number |
| LLM output reliability | Higher -- simpler markdown structure | Lower -- multiple complex tables |
| Natural grouping of related findings | Low -- related findings may be scattered | High -- findings grouped by concern type |
| Supports "What Looks Solid" section | Yes | Yes |
| Scales to many findings | Degrades (long list) | Scales (distributed across sections) |

---

## Key takeaways

- The critic adds the most value in five dimensions the architect does not cover: sensitivity/trade-off point identification, scenario walkthroughs, quantitative scale validation, organizational scalability, and traceability gap analysis. These are distinct from the architect's trade-off evaluation, SOLID analysis, and risk assessment. (Substantiated)

- Actionable findings have three forms: a question the architect can answer, a scenario the architect should trace, or a gap the architect should fill. Findings that do not fit one of these forms are noise. (Corroborated -- consistent across multiple review practice sources)

- A three-tier severity model (Must Address / Should Address / Consider) calibrates the signal better than binary APPROVE/BLOCK for iterative architecture artifacts. (Substantiated)

- The critic should engage differently with the architect's confidence levels: actively probe Conjectures that downstream artifacts depend on, verify context-fit for Substantiated claims, and check scope extrapolation for Corroborated claims. (Substantiated -- synthesized from skepticism and ATAM literature)

- Deferred decisions should be evaluated against five criteria: design accommodates multiple outcomes, downstream artifacts do not contradict the deferral, a trigger is stated, deferrals do not compound, and the deferred aspect is reversible. Failure on multiple criteria signals avoidance rather than prudence. (Substantiated)

## Open questions

1. **Question selection per artifact type**: Should the critic apply different question subsets depending on whether it's reviewing a PRD, DESIGN, DECOMPOSITION, or FEATURE? The question lists above are comprehensive but may be overwhelming if applied uniformly. Some questions (e.g., scale validation) are more relevant for DESIGN than for FEATURE specs.

2. **Maximum finding count**: Should the critic be instructed to limit findings (e.g., top 10 most important) to avoid overwhelming the architect? Or should it be exhaustive and let severity do the filtering?

3. **Re-review protocol**: When the architect addresses findings, how should the critic handle a second pass? Should it reference prior finding IDs and mark them resolved/remaining?

4. **Codebase reading depth**: The critic is scoped to `architecture/` artifacts. Some findings (consistency with codebase patterns) require reading actual code in `packages/` and `src/`. The extent of codebase access affects the quality of consistency checks.

5. **FrontX-specific question calibration**: The FrontX-specific questions (section 4.6) are derived from current codebase patterns. These will drift as the codebase evolves. Should they live in the agent prompt or in a separate reference file the agent reads?

## Sources

1. [ATAM Method for Architecture Evaluation (SEI/CMU)](https://www.sei.cmu.edu/documents/629/2000_005_001_13706.pdf) -- ATAM evaluation steps, sensitivity points, trade-off points, utility tree
2. [Architecture Tradeoff Analysis Method (Wikipedia)](https://en.wikipedia.org/wiki/Architecture_tradeoff_analysis_method) -- ATAM overview, risk categorization
3. [ATAM: A Comprehensive Guide (An Architect To Be)](https://anarchitectto.be/atam-a-comprehensive-guide-to-architecture-evaluation/) -- ATAM process detail, scenario types, quality attributes
4. [9 Things Staff+ Engineers Do in Architecture Reviews (DevX)](https://www.devx.com/technology/9-things-staff-engineers-do-in-architecture-reviews/) -- All 9 dimensions of staff engineer review behavior, concrete questions
5. [AI Architecture Review Questions That Expose Failure (DevX)](https://www.devx.com/technology/ai-architecture-review-questions-that-expose-failure/) -- Questions targeting blast radius, semantic failures, scale assumptions
6. [Technology Decision Making and Architecture Reviews (Subbu Allamaraju)](https://www.subbu.org/articles/2017/technology-decision-making-and-architecture-reviews/) -- Feedback-centric vs. gate-keeping review model, constructive feedback framing
7. [How to Run Effective Architecture Reviews (Ledwith)](https://ledwith.tech/blog/2025/07/09/effective-architecture-reviews/) -- Lightweight review process, one-pager approach, reviewer qualities
8. [Architecture Review Process (Mozilla)](https://mozilla.github.io/firefox-browser-architecture/text/0006-architecture-review-process.html) -- Review packet structure, roadmap vs. design review distinction
9. [12 Software Architecture Pitfalls (InfoQ)](https://www.infoq.com/articles/avoid-architecture-pitfalls/) -- 12 named pitfalls with exposing questions and remedies
10. [A Skeptic's Guide to Software Architecture Decisions (InfoQ)](https://www.infoq.com/articles/architecture-skeptics-guide/) -- Empirical validation, making assumptions explicit, skepticism as architectural practice
11. [Three Questions for Better Architecture (InfoQ)](https://www.infoq.com/articles/three-questions-better-architecture/) -- Business viability, performance/scalability, maintainability as fundamental questions
12. [Lean Software Development: The Art of Postponing Decisions (eferro)](https://www.eferro.net/2022/08/software-development-art-of-postponing.html) -- Criteria for legitimate deferral, reversibility, YAGNI application
13. [Last Responsible Moment Should Address Uncertainty (Ben Morris)](https://www.ben-morris.com/lean-developments-last-responsible-moment-should-address-uncertainty-not-justify-procrastination/) -- Warning signs of over-deferral, no clear tipping point, options-based thinking
14. [Design Review Based on Failure Mode (Wikipedia)](https://en.wikipedia.org/wiki/Design_review_based_on_failure_mode) -- DRBFM methodology, Toyota's failure-focused review approach
15. [Failure Mode Analysis (Microsoft Azure)](https://learn.microsoft.com/en-us/azure/well-architected/reliability/failure-mode-analysis) -- FMA as architectural practice, identifying failure points per component
16. [Architecture Review Process (Tech-Stack)](https://tech-stack.com/blog/the-architecture-review-process/) -- 14 quality attributes, anti-pattern detection, production readiness review
