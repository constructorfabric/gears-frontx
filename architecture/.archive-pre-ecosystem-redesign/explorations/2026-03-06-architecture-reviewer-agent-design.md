# Exploration: Architecture Reviewer Agent Design


<!-- toc -->

- [Research question](#research-question)
- [Scope](#scope)
- [Findings](#findings)
  - [1. Real-world roles that review architecture](#1-real-world-roles-that-review-architecture)
  - [2. Context and knowledge needed for high-quality review](#2-context-and-knowledge-needed-for-high-quality-review)
  - [3. Persona and lens options](#3-persona-and-lens-options)
  - [4. Analysis of the current openspec-reviewer](#4-analysis-of-the-current-openspec-reviewer)
- [Comparison](#comparison)
- [Key takeaways](#key-takeaways)
- [Open questions](#open-questions)
- [Sources](#sources)

<!-- /toc -->

Date: 2026-03-06

## Research question

What role, persona, knowledge base, and review lens should a new AI agent have to effectively review the output of the architect agent -- replacing the current legacy reviewer with something better positioned alongside the architect in the Cypilot artifact workflow?

Sub-questions:
1. What real-world roles review architecture output, and what distinct perspectives do they bring?
2. What context/knowledge does a high-quality architecture review need?
3. What persona/lens would produce reviews that complement (not duplicate) the architect's work?
4. What should be kept, changed, or dropped from the current legacy reviewer?

## Scope

**In scope**: Reviewing the architect agent's output (PRD, ADR, DESIGN, DECOMPOSITION, FEATURE artifacts). Identifying the right reviewer persona, knowledge base, evaluation framework, and differentiated lens. Analyzing the current openspec-reviewer for reuse.

**Out of scope**: Implementation code review (covered by `implementation-reviewer`). The OpenSpec CLI workflow and `openspec-architect` agent. Actual agent implementation -- this exploration provides decision-support for whoever builds it.

**Constraint**: The reviewer must operate within the Cypilot artifact pipeline (PRD -> ADR + DESIGN -> DECOMPOSITION -> FEATURE -> CODE). It reviews artifacts, not code.

## Findings

### 1. Real-world roles that review architecture

#### 1.1 Architecture Review Boards (ARBs)

In industry, formal architecture review is governed by Architecture Review Boards -- cross-functional committees that evaluate architectural proposals against organizational standards and strategic alignment. ARBs typically include representatives from [security, development, enterprise architecture, infrastructure, and operations](https://aws.amazon.com/blogs/architecture/build-and-operate-an-effective-architecture-review-board/). The key insight: effective review requires **multiple distinct perspectives**, not a single generalist.

TOGAF defines the ARB as a governance entity responsible for reviewing and approving architectural aspects, setting standards, and ensuring alignment with business strategy ([TOGAF Architecture Review Board](https://pubs.opengroup.org/architecture/togaf8-doc/arch/chap23.html)).

**Confidence:** Corroborated -- well-established industry practice documented across multiple authoritative sources.

#### 1.2 Staff+ engineer review perspective

Staff and Principal engineers bring a qualitatively different lens than the architect who produced the design. Key differences documented in practice:

- **Risk pattern-matching**: Staff+ engineers [pattern-match against incidents, migrations, and failures they have lived through](https://www.devx.com/technology/9-things-staff-engineers-do-in-architecture-reviews/), not theoretical quality attributes.
- **Implementation-awareness**: They assess whether a design will actually work for the teams building it -- ownership boundaries, coordination bottlenecks, cross-team dependencies.
- **Business alignment**: Principal engineers [force teams to articulate the true invariant rather than defaulting to theoretical correctness](https://www.devx.com/technology/9-things-staff-engineers-do-in-architecture-reviews/).
- **Implicit coupling detection**: Senior reviewers identify distributed monolith patterns -- shared databases, synchronous cross-service calls, embedded schema assumptions.

The core differentiator: **Staff+ engineers evaluate "will this work in practice?" while architects evaluate "is this correct in theory?"**

**Confidence:** Substantiated -- based on well-regarded engineering blog posts and consistent with documented industry patterns.

#### 1.3 Distinct review perspectives (de Bono's Six Hats applied to architecture)

[De Bono's Six Thinking Hats](https://www.agile-moose.com/debonos-6-hats) maps cleanly to architecture review perspectives, demonstrating that effective review requires multiple lenses:

| Hat | Architecture review lens | Who typically brings this |
|-----|-------------------------|--------------------------|
| White (facts) | Data-driven analysis -- benchmarks, capacity numbers, measured latency | Performance engineer, SRE |
| Black (risks) | Risk identification -- what breaks, what fails, what has hidden cost | Staff engineer, security reviewer |
| Yellow (benefits) | Value assessment -- what does this enable, what's the upside | Product architect, engineering manager |
| Green (alternatives) | Alternative approaches -- what else could solve this | Senior architect, principal engineer |
| Red (intuition) | Gut check -- does this feel over-engineered, too clever, wrong | Experienced practitioner |
| Blue (process) | Meta-review -- is the design complete, well-structured, reviewable | Quality architect, tech lead |

The current architect agent primarily operates in the **Green** (alternatives/trade-offs) and **Blue** (process/structure) space. A reviewer that covers **Black** (risks), **White** (facts/data), and **Red** (pragmatic gut-check) would maximize complementary value.

**Confidence:** Substantiated -- framework is well-established; application to architecture review is the researcher's synthesis.

#### 1.4 Formal architecture evaluation methods

Several methods exist for systematic architecture evaluation:

| Method | Focus | Approach | Fit for AI agent |
|--------|-------|----------|-----------------|
| [ATAM](https://en.wikipedia.org/wiki/Architecture_tradeoff_analysis_method) (Architecture Tradeoff Analysis) | Quality attribute trade-offs | Scenario-based, identifies sensitivity points and trade-offs | High -- structured, can be encoded as evaluation steps |
| [CBAM](https://insights.sei.cmu.edu/library/integrating-the-architecture-tradeoff-analysis-method-atam-with-the-cost-benefit-analysis-method-cbam/) (Cost Benefit Analysis) | Economic trade-offs | Extends ATAM with cost-benefit quantification | Medium -- requires cost data the agent may not have |
| [SAAM](https://www.academia.edu/62875196/Scenario_based_software_architecture_evaluation_methods_An_overview) (Software Architecture Analysis) | Modifiability | Scenario-based, focused on change impact | Medium -- narrower scope |
| [TARA](https://pmc.ncbi.nlm.nih.gov/articles/PMC8838159/) (Tiny Architecture Review Approach) | Lightweight evaluation | Minimal-ceremony review for agile teams | High -- designed for speed and iteration |
| [ARID](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/) (Active Reviews for Intermediate Designs) | In-progress designs | Evaluates partial designs during development | High -- matches artifact pipeline review |

ATAM is the most mature and widely adopted. Its core output -- identification of **sensitivity points**, **trade-off points**, **risks**, and **non-risks** -- maps directly to what a reviewer agent should produce. ARID is notable because it specifically targets intermediate/in-progress designs, which aligns with reviewing Cypilot artifacts before they reach CODE stage.

**Confidence:** Corroborated -- SEI/CMU methods are extensively documented and peer-reviewed.

### 2. Context and knowledge needed for high-quality review

#### 2.1 Artifacts the reviewer must access

Based on the Cypilot pipeline (PRD -> ADR + DESIGN -> DECOMPOSITION -> FEATURE -> CODE):

| Artifact | Why the reviewer needs it | Priority |
|----------|--------------------------|----------|
| PRD.md | Verify design traces back to requirements; catch gold-plating or missed requirements | Critical |
| DESIGN.md | Primary review target -- component model, dependencies, contracts | Critical |
| DECOMPOSITION.md | Verify scope boundaries, sequencing, dependency ordering | Critical |
| ADR/*.md | Understand prior decisions and constraints; check for contradictions | High |
| FEATURE files | Verify behavioral specs align with design; check completeness | High |
| .ai/GUIDELINES.md | Enforce repo invariants, import rules, type rules, blocklist | Critical |
| Existing codebase patterns | Consistency check -- does the design match how things are actually built | High |
| architecture/explorations/ | Verify the architect consumed available research; check for ignored findings | Medium |

#### 2.2 Reference knowledge for evaluation

| Knowledge area | What it provides | Example |
|---------------|------------------|---------|
| SOLID principles | Structural quality gate | SRP violation: component has multiple reasons to change |
| Design patterns catalog | Pattern recognition and naming | "This is essentially a Mediator pattern -- name it as such" |
| Anti-pattern catalog | Smell detection | God class, feature envy, shotgun surgery |
| [ISO 25010 quality attributes](https://en.wikipedia.org/wiki/Non-functional_requirement) | Systematic NFR coverage | Performance, security, maintainability, portability |
| ATAM sensitivity/trade-off framework | Structured risk identification | "Changing X affects both Y and Z -- this is a sensitivity point" |
| FrontX-specific patterns | Repo-specific consistency | Event-driven architecture, registry patterns, layer boundaries |

#### 2.3 How reviewer context differs from architect context

The architect's context is **generative** -- they synthesize requirements into design. The reviewer's context must be **evaluative and adversarial** -- they stress-test the design against multiple failure modes:

| Dimension | Architect thinks about | Reviewer should think about |
|-----------|----------------------|----------------------------|
| Completeness | "What needs to be designed?" | "What was missed or assumed?" |
| Correctness | "Does this solve the problem?" | "Does this solve the RIGHT problem? Does it match the PRD?" |
| Feasibility | "Can this be built?" | "Can this be built BY THIS TEAM with THESE constraints?" |
| Risk | "What's the trade-off?" | "What's the blast radius if this trade-off is wrong?" |
| Consistency | "What pattern should I use?" | "Does this match existing patterns? If not, is divergence justified?" |
| Simplicity | "What's the elegant solution?" | "Is this over-engineered? Could a simpler approach work?" |

**Confidence:** Substantiated -- synthesized from ATAM methodology, ARB documentation, and staff engineer literature.

### 3. Persona and lens options

#### Option A: Staff Engineer lens

**Name candidates**: `staff-reviewer`, `technical-reviewer`, `design-reviewer`

**Persona**: A pragmatic senior engineer who has built and maintained large systems. Reviews from the perspective of "will this actually work?" Focuses on implementation feasibility, operational concerns, hidden complexity, and developer experience.

**Lens emphasis**: Black hat (risks) + Red hat (gut-check) + White hat (facts)

**Strengths**:
- Catches over-engineering and theoretical designs that break in practice
- Evaluates operational concerns (deployment, debugging, monitoring)
- Assesses developer experience -- will the team understand and maintain this?
- Identifies hidden coupling and coordination bottlenecks

**Weaknesses**:
- May under-value long-term architectural elegance
- Less systematic than formal methods
- "Pragmatic" can slide into "conservative" -- may resist necessary innovation

**Differentiation from architect**: High. The architect operates in design-space; this persona operates in reality-space. Minimal overlap.

#### Option B: Quality Architect lens (ATAM-style)

**Name candidates**: `quality-reviewer`, `architecture-assessor`, `design-auditor`

**Persona**: A systematic evaluator who applies formal architecture evaluation methods. Reviews against quality attributes, identifies sensitivity points and trade-off points, maps scenarios to architectural decisions.

**Lens emphasis**: Blue hat (process) + White hat (facts) + Black hat (risks)

**Strengths**:
- Highly systematic and repeatable
- Covers quality attributes comprehensively (ISO 25010)
- Produces structured, evidence-based output
- Strong at identifying trade-offs the architect didn't surface

**Weaknesses**:
- Significant overlap with what the architect agent already does (SOLID analysis, trade-off evaluation, risk assessment)
- Can be rigid and ceremonious
- May produce "checklist reviews" that miss contextual issues

**Differentiation from architect**: Medium. Both already think about trade-offs and quality attributes. The architect agent explicitly includes SOLID compliance, risk assessment, and blast radius analysis -- a quality architect reviewer would duplicate much of this.

#### Option C: Devil's Advocate lens

**Name candidates**: `challenger`, `design-critic`, `adversary`

**Persona**: An intentionally contrarian reviewer whose job is to find weak spots, challenge assumptions, and argue against the design. Asks "why not the opposite?" for every decision.

**Lens emphasis**: Black hat (risks) + Green hat (alternatives)

**Strengths**:
- Forces the architect to defend decisions explicitly
- Surfaces hidden assumptions and unstated constraints
- Catches groupthink and confirmation bias
- High differentiation -- entirely different mode than design

**Weaknesses**:
- Pure criticism without constructive direction can be unproductive
- Risk of false positives -- challenging for the sake of challenging
- No systematic coverage guarantee -- might miss entire quality dimensions
- Tone management is critical -- must be constructive, not hostile

**Differentiation from architect**: Very high. Completely different mode of thinking. Risk of being annoying rather than useful if not well-calibrated.

#### Option D: Hybrid Staff Engineer + ATAM lens

**Name candidates**: `design-reviewer`, `architecture-critic`, `staff-reviewer`

**Persona**: A senior staff engineer who brings practical experience AND uses a lightweight version of ATAM for systematic coverage. Reviews with the pragmatism of a staff engineer but the rigor of a quality framework. Specifically focuses on what the architect's own process does NOT cover.

**Lens emphasis**: Black hat (risks) + Red hat (gut-check) + White hat (facts). Uses ATAM-derived checklist for coverage but applies staff-engineer judgment for assessment.

**Strengths**:
- Systematic coverage from ATAM prevents blind spots
- Pragmatic assessment from staff engineer perspective prevents checklist-only reviews
- Can evaluate both "is this correct?" AND "will this work?"
- Explicitly designed to complement the architect's existing SOLID/risk/trade-off work

**Weaknesses**:
- More complex persona to calibrate -- two modes of thinking
- Risk of being "a little of everything, master of nothing"
- Requires clear delineation of what the architect already covers vs. what this agent adds

**Differentiation from architect**: High. Fills the gaps the architect leaves: implementation feasibility, operational concerns, developer experience, hidden assumptions, codebase consistency.

#### Option E: Platform/DX Engineer lens

**Name candidates**: `platform-reviewer`, `dx-reviewer`, `ergonomics-reviewer`

**Persona**: An engineer who evaluates architecture from the consumer's perspective -- how will developers actually use this? Focuses on API ergonomics, learning curve, documentation completeness, testing ease, and day-to-day developer workflow.

**Lens emphasis**: Red hat (gut-check) + Yellow hat (benefits/value)

**Strengths**:
- Unique perspective not covered by any existing agent
- Directly tied to adoption and productivity outcomes
- Catches designs that are correct but hostile to use
- Evaluates extension points and plugin ergonomics (relevant for FrontX's plugin-first composition)

**Weaknesses**:
- Narrow focus -- misses structural and correctness concerns
- More relevant for API/SDK design than system architecture
- May not be sufficient as a standalone reviewer

**Differentiation from architect**: High in its specific domain, but too narrow for a general architecture reviewer.

### 4. Analysis of the current openspec-reviewer

#### 4.1 What works well

- **Structured output format**: The APPROVE/BLOCK decision framework with tables is clear and actionable. This pattern should be preserved.
- **Intent alignment check**: Section 1.5 is genuinely valuable -- catching contradictions between stated goals and actual proposals. This is a unique contribution not covered elsewhere.
- **SOLID compliance report**: Systematic per-principle evaluation with PASS/RISK/FAIL verdicts. However, this duplicates what the architect agent already does (the architect has an identical SOLID section).
- **Linting policy check**: Prevents scope creep in proposals.
- **Layer propagation check**: FrontX-specific, catches missing cross-layer updates.
- **Read-only restriction**: Appropriate for a reviewer role.
- **Binary decision model**: "Everything is either a BLOCK or clean" (borrowed from implementation-reviewer) prevents ambiguous feedback.

#### 4.2 What is missing or could be improved

- **Duplicates the architect's SOLID analysis**: Both the architect (`agent.md` lines 116-139) and the reviewer (`openspec-reviewer.md` lines 64-95) have nearly identical SOLID evaluation sections. The reviewer re-runs the same analysis the architect already performed. This is low-value repetition.
- **No feasibility assessment**: The reviewer never asks "can this actually be built with the team's constraints?" It evaluates specification quality, not design quality.
- **No consistency check against codebase**: The reviewer does not compare the proposed design against existing code patterns. Designs that contradict established patterns pass without comment.
- **No evaluation of what was NOT designed**: Missing components, unaddressed edge cases, and gaps in the decomposition are not systematically checked.
- **"Best practices" section is vague**: "Compare against current industry standards and patterns" with no specific framework or checklist. This produces inconsistent results.
- **Too focused on OpenSpec structure, not architecture quality**: The reviewer evaluates "does this spec have all its sections filled in?" more than "is this architecture sound?" Completeness is not quality.
- **No adversarial/challenge dimension**: The reviewer validates but does not challenge. It confirms the spec is internally consistent but does not question whether the design is right.
- **No operational/runtime considerations**: How will this be deployed, debugged, monitored? These concerns are absent.
- **No codebase context consumption**: The reviewer reads `openspec/project.md` but does not examine the actual codebase to assess whether the design fits reality.
- **Web search tool included but purpose unclear**: The reviewer has `WebSearch` and `WebFetch` tools but no guidance on when/how to use them for verifying best practices claims.

#### 4.3 How the new agent should differ

The current reviewer is essentially a **specification completeness checker with SOLID overlay**. The new agent should be an **architecture quality assessor** that:

1. Evaluates the design itself, not just the document structure
2. Brings a different analytical lens than the architect
3. Checks designs against the actual codebase for consistency
4. Challenges assumptions and surfaces hidden risks
5. Assesses feasibility and operational concerns
6. Uses a systematic evaluation framework (ATAM-derived) for coverage
7. Preserves the intent alignment check (unique and valuable)
8. Drops the duplicated SOLID section or reframes it as verification (confirming the architect's analysis, not re-doing it)

## Comparison

| Criteria | Option A: Staff Eng | Option B: Quality Arch | Option C: Devil's Advocate | Option D: Hybrid | Option E: DX Eng |
|----------|---------------------|----------------------|--------------------------|-----------------|------------------|
| Differentiation from architect | High | Medium | Very high | High | High (narrow) |
| Systematic coverage | Low | Very high | Low | High | Low |
| Catches over-engineering | High | Low | High | High | Medium |
| Catches missed requirements | Medium | High | Medium | High | Low |
| Catches operational issues | High | Low | Low | High | Medium |
| Catches feasibility gaps | Very high | Low | Medium | High | Medium |
| Risk of duplicating architect | Low | High | Low | Low | Low |
| Risk of false positives | Low | Low | High | Low | Low |
| Calibration complexity | Low | Medium | High | Medium | Low |
| Fits FrontX artifact pipeline | Yes | Yes | Partially | Yes | Partially |

## Key takeaways

- The current `openspec-reviewer` primarily checks specification completeness and re-runs the architect's SOLID analysis. It does not bring a distinct evaluative perspective. (Corroborated -- verified by reading both agent definitions side by side)

- Effective architecture review in industry comes from **multiple complementary perspectives** (ARBs, Six Hats framework). The most valuable addition is a lens the architect does not already use. (Corroborated -- consistent across ARB literature, ATAM methodology, and staff engineer practices)

- The **Staff Engineer + lightweight ATAM hybrid** (Option D) scores highest across the comparison criteria: high differentiation, systematic coverage, catches multiple issue categories, and low duplication risk. (Substantiated -- based on the comparison matrix; actual agent quality depends on implementation)

- The intent alignment check from the current reviewer is a unique contribution that no other agent covers and should be preserved in any replacement. (Substantiated -- verified by reviewing all agent definitions)

- The key gap to fill is the **evaluative/adversarial dimension** -- the architect generates designs, the reviewer should stress-test them against reality (codebase consistency, operational concerns, feasibility, hidden assumptions, blast radius of being wrong). (Substantiated -- derived from the architect-vs-reviewer context analysis)

## Open questions

1. **Should the reviewer have access to the codebase?** The current reviewer is read-only on OpenSpec files. Expanding to read the actual codebase would significantly improve consistency checking but increases scope and context window usage. What tools should the new agent have?

2. **Should the reviewer produce a BLOCK/APPROVE verdict or structured feedback?** The current binary model is clean but may be too blunt for architecture artifacts that are iterative works-in-progress (unlike OpenSpec changes which have a clear "done" state).

3. **What is the reviewer's position in the workflow?** Does it review after the architect produces each artifact, or only at specific gates (e.g., before DECOMPOSITION -> FEATURE transition)?

4. **Should SOLID verification be kept, dropped, or transformed?** Three options: (a) drop it since the architect already does it, (b) keep it as independent verification, (c) transform it into "verify the architect's SOLID claims are correct" rather than re-analyzing from scratch.

5. **What model should the agent use?** The current reviewer uses `opus`. Architecture review benefits from strong reasoning capability but the context window needs depend on whether codebase access is included.

6. **Agent naming**: The name signals the lens. Candidates from findings include `design-reviewer`, `architecture-critic`, `staff-reviewer`, `technical-reviewer`. The name should convey "I evaluate architecture quality from a practitioner's perspective" rather than "I check specifications for completeness."

## Sources

1. [AWS Architecture Blog -- Build and operate an effective architecture review board](https://aws.amazon.com/blogs/architecture/build-and-operate-an-effective-architecture-review-board/) -- ARB composition and multi-disciplinary review structure
2. [TOGAF Architecture Review Board](https://pubs.opengroup.org/architecture/togaf8-doc/arch/chap23.html) -- Formal ARB role definition and governance responsibilities
3. [9 Things Staff+ Engineers Do in Architecture Reviews (DevX)](https://www.devx.com/technology/9-things-staff-engineers-do-in-architecture-reviews/) -- Staff engineer review perspective, risk pattern-matching, practical evaluation lens
4. [ATAM on Wikipedia](https://en.wikipedia.org/wiki/Architecture_tradeoff_analysis_method) -- ATAM process overview, sensitivity points, trade-off points
5. [SEI ATAM Collection](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/) -- Full SEI method library including ATAM, CBAM, ARID
6. [Integrating ATAM with CBAM (SEI)](https://insights.sei.cmu.edu/library/integrating-the-architecture-tradeoff-analysis-method-atam-with-the-cost-benefit-analysis-method-cbam/) -- Cost-benefit extension to ATAM
7. [Lightweight Architecture Review Methods (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8838159/) -- TARA and lightweight alternatives survey
8. [De Bono's Six Hats applied to architecture (Agile Moose)](https://www.agile-moose.com/debonos-6-hats) -- Multi-perspective review framework applied to software design
9. [Manifestly -- ARB Roles and Best Practices](https://www.manifest.ly/blog/architecture-review-board-arb-roles/) -- ARB member composition and responsibilities
10. [Persona-based approach to AI-assisted development](https://humanwhocodes.com/blog/2025/06/persona-based-approach-ai-assisted-programming/) -- Agent specialization through persona design
11. [Architecture of Agentic Code Review (Baz)](https://baz.co/resources/engineering-intuition-at-scale-the-architecture-of-agentic-code-review) -- Multi-agent review architecture with specialized roles
12. [ISO 25010 Quality Attributes overview](https://en.wikipedia.org/wiki/Non-functional_requirement) -- Comprehensive quality attribute taxonomy
13. [Red Hat -- Non-functional requirements in enterprise architecture](https://www.redhat.com/architect/nonfunctional-requirements-architecture) -- NFR categories for architecture evaluation
14. [Charity Majors -- Architects, Anti-Patterns, and Organizational Fuckery](https://charity.wtf/2023/03/09/architects-anti-patterns-and-organizational-fuckery/) -- Critique of ivory-tower architecture and the value of practitioner review
