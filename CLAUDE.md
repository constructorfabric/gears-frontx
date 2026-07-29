<!-- @cf:root-agents -->
```toml
cf-studio-path = ".cf-studio"
```

ALWAYS resolve and enforce prerequisites of skills/workflows/commands BEFORE applying user intent.
<!-- /@cf:root-agents -->

AI tooling and FrontX development guidelines are provided by the Constructor Studio kit under `.cf-studio/`.

Treat `architecture/` as the authority on what the system is and why: PRD for intent, DESIGN for structure, ADRs for decisions, and each FEATURE for the behaviour its numbered instructions specify. Code carries `@cpt-` markers back to those instructions; `cfs validate` checks that the chain holds.

ALL user requests MUST be handled by the Orchestrator agent.
