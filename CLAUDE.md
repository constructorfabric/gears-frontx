<!-- @cf:root-agents -->
```toml
cf-studio-path = ".cf-studio"
```

ALWAYS resolve and enforce prerequisites of skills/workflows/commands BEFORE applying user intent.
<!-- /@cf:root-agents -->

AI tooling and FrontX development guidelines are provided by the Constructor Studio kit under `.cf-studio/`.

Treat `architecture/` as the authority on what the system is and why: PRD for intent, DESIGN for structure, ADRs for decisions, and each FEATURE for the behaviour its numbered instructions specify. Ecosystem code carries `@cpt-` markers back to those instructions; `cfs validate` checks that the chain holds. Templates live in their own repository, `constructorfabric/gears-frontx-templates`, addressed by source-spec (`github:constructorfabric/gears-frontx-templates//template-shell@<ref>`); no template territory — a directory carrying a `frontx-template.json` manifest — remains here, and `@cpt-` markers found in template territory bind nothing wherever it lives (`cpt-frontx-adr-template-repository-separation`, `cpt-frontx-adr-template-territory-traceability`).

ALL user requests MUST be handled by the Orchestrator agent.
