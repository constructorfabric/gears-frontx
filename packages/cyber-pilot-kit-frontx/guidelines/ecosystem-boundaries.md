# FrontX Ecosystem Boundary Guidelines

## Published Libraries — Ecosystem Packages (extraction)

These packages are the realized FrontX runtime substrate. Do NOT move content into
template territory and do NOT add solution-specific logic.

| Package | Constraint |
|---|---|
| `@gears-frontx/mfes` | MFES-2: no template deps; MFES-3: no solution schemas |
| `@gears-frontx/gts-plugin` | GTS-PLUGIN-2: no solution schemas |
| `@gears-frontx/api` | API-1: handler-agnostic, no mocks |

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
