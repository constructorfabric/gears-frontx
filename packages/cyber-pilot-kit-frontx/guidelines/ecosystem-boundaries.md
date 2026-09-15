# FrontX Ecosystem Boundary Guidelines

## Published Libraries — Ecosystem Packages (extraction)

These packages are the realized FrontX runtime substrate. Do NOT move content into
template territory and do NOT add solution-specific logic.

| Package | Constraint |
|---|---|
| `@gears-frontx/mfes` | MFES-2: no template deps; MFES-3: no solution schemas |
| `@gears-frontx/gts-plugin` | GTS-PLUGIN-2: no solution schemas |
| `@gears-frontx/api` | API-1: handler-agnostic, no mocks |
| `@gears-frontx/routing` | ROUTING-1: no template content (`frontx-routing-1-no-template-content`); ROUTING-2: no intra-ecosystem dependency — declares and imports no other `@gears-frontx/*` package (`frontx-routing-2-no-intra-ecosystem-dependency`, `arch:edges`); ROUTING-3: no router-engine import (`frontx-routing-3-no-engine-leak`). May be depended on only by `@gears-frontx/routing-tanstack`, its one declared runtime edge (`arch:edges`, `cpt-frontx-routing-tanstack-nfr-single-ecosystem-edge`). |
| `@gears-frontx/routing-tanstack` | ROUTING-TANSTACK-1: no template content (`frontx-routing-tanstack-1-no-template-content`). Depends on exactly one ecosystem package, `@gears-frontx/routing` (ROUTING-TANSTACK-2, `frontx-routing-tanstack-2-single-ecosystem-edge`, `arch:edges`); no ecosystem package may depend on it. ROUTING-TANSTACK-3: sole ecosystem package permitted to import a concrete router engine (`frontx-routing-tanstack-3-sole-engine-import`). |

## Projects Orchestration — CLI (greenfield)

`@gears-frontx/cli` must satisfy CLI-1 at all times:
> The CLI has zero dependency on any template. It resolves templates by source-spec
> at runtime and bundles none.

## Projects Orchestration — AI Tooling Kit (greenfield)

`@gears-frontx/cyber-pilot-kit-frontx` must satisfy KIT-1:
> Every resource identifier carries the `frontx_` prefix.

Base content is solution-agnostic. Template-specific AI extensions arrive via the
extension contract defined in F16 (Phase 19).

## Template Territory

The resolved template root (external, out of this repo) and everything under it is
template territory. No ecosystem package may import from it at the source level.
