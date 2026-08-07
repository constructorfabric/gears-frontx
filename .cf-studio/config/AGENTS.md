# Custom Agent Navigation Rules

Add your project-specific WHEN rules here.
These rules are loaded alongside the generated rules in `{cf-studio-path}/.gen/AGENTS.md`.

---

## FrontX Architecture Binding

`architecture/` is the authority on what the system is and why: PRD for intent,
DESIGN for structure and constraints, ADRs for decisions, and each FEATURE for
the behaviour its numbered instructions specify. The kit guideline
`packages/cyber-pilot-kit-frontx/guidelines/ecosystem-boundaries.md` condenses
the per-package boundary constraints. The units below bind these sources into
Constructor Studio code work; they route to them and enforce their workflow —
they do not restate their rules. Corrections go to the architecture artifacts
through their own review workflows, not to this file.

```pdsl
UNIT FrontXCodebaseRules

PURPOSE:
  Bind FrontX repository architecture rules into every code implementation work
  package (cf-coding / cf-sdlc-implement coder dispatches and any direct code change).

WHEN:
  - REQUIRE implementing or revising code in this repository

DO:
  - LOAD `architecture/DESIGN.md` §1.3 (Architecture Layers) and §2.2 (Constraints) before editing any code
  - LOAD `packages/cyber-pilot-kit-frontx/guidelines/ecosystem-boundaries.md` and apply the boundary constraints for every touched package
  - LOAD the governing FEATURE.md — each lives with the package it describes, under `packages/*/architecture/features/` — before changing code that carries its `@cpt-` markers
  - RUN keep `@cpt-` traceability markers intact and aligned with the FEATURE instructions they cite

RULES:
  - ALWAYS read the named DESIGN constraint (MFES-*, GTS-PLUGIN-*, API-*, CLI-*, KIT-*) before editing code it governs; NEVER code from assumed rules
  - ALWAYS stop and ask when a change would cross a DESIGN §2.2 constraint or a package boundary from `ecosystem-boundaries.md`
  - ALWAYS stop and ask when no FEATURE covers behaviour the change introduces
  - NEVER restate architecture rules in artifacts or prompts; reference `architecture/DESIGN.md` and the kit guideline instead
```

```pdsl
UNIT FrontXCodeReviewChecks

PURPOSE:
  Bind FrontX-specific review criteria into every code review pass
  (cf-coding semantic review and cf-sdlc-pr-review Code Review), in addition
  to the kit `{codebase_checklist}`.

WHEN:
  - REQUIRE reviewing code changes in this repository

DO:
  - LOAD `architecture/DESIGN.md` §2.2 and `packages/cyber-pilot-kit-frontx/guidelines/ecosystem-boundaries.md`; NEVER review from memory of their rules
  - RUN FX-001 Constraints: every changed package complies with its named DESIGN §2.2 constraints and its package boundary in `ecosystem-boundaries.md`; ambiguous ownership was raised, not guessed
  - RUN FX-002 Traceability: changed code keeps `@cpt-` markers consistent with the governing FEATURE, and `cfs validate` passes
  - RUN FX-003 Architecture checks: `npm run arch:check` passes for the changed packages

RULES:
  - ALWAYS treat every FX finding as HIGH severity in the review verdict
  - ALWAYS run these checks in addition to, never instead of, the kit `{codebase_checklist}` and the generic code checklist
```
