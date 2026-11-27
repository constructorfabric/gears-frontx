---
name: frontx
description: "FrontX ecosystem AI capabilities: MFE runtime substrate, GTS type system, API protocol surface, CLI scaffolding, and AI tooling kit. Routes a FrontX request to the capability that serves it. Solution-agnostic base only."
---

# FrontX AI Tooling Kit

Provides AI agents with ecosystem-level fluency for FrontX projects, and routes
a FrontX request to the capability that serves it.

<!-- frontx:routing:begin -->

## Request Routing

Read this before answering a FrontX request. Decide from the request itself and
from whether the working directory already holds applied templates - a
`.frontx/provenance.json` with records means it does.

| The request is to | Served by |
|---|---|
| Create a new project from what the developer wants to be built, holding no reference to start from | `frontx_project_scaffolding` - matches the stated intent against what the installed inventory declares, applies the chosen set through the `frontx` executable, and realizes the units the intent names inside selected or already-applied template ground, reporting the rest as residual work |
| Apply a specific template whose reference the developer already holds | The `frontx` executable directly - `frontx seed` for a new repository, `frontx add` for an existing one. This path is unchanged and needs no capability here |
| Add a unit to a project that already holds applied templates - one more screen, one more isolated UI unit | `frontx_project_scaffolding` - it offers the unit to the installed inventory first, because a unit may have a template of its own, and drives the skills the owning template activates under `.frontx/ai/<template-identity>/` only for a unit no installed template claims and that lies inside an applied template's ground. A unit outside that ground is reported as residual work and nothing is written for it. Do not send this request to those skills directly: that answers the inventory's question without asking it. The base kit adds no unit itself |
| Move an applied template to a newer version | `frontx upgrade <projectRoot> <targetVersion>` directly, or its `--json` form, which emits the change set for review and reads a decision back before anything is applied |
| Understand the ecosystem - runtime substrate, type system, API surface, package boundaries | This document and the guidelines it ships with |
| Check that a template is publishable | The `frontx` executable directly - `frontx validate <templateDir>` |
| See how a new page or screen will look before it is built, or choose among drawn options for it | The route above that builds it - `frontx_project_scaffolding` first for a new project or a new unit - with the page proposal step below, where it applies, taken before that page is built, with no further ask. The base kit draws no proposal itself |

If the request matches none of these, say so and name the capabilities above.
Do not route it to the closest one; a capability applied to a request it does
not serve produces a confident wrong answer.

The page proposal step is a skill in an applied template's bundle under
`.frontx/ai/<template-identity>/`, read from disk - a bundle scaffolding has just
applied counts, activated or not. It builds nothing and never replaces or precedes
the route that builds: it applies when a new page or screen is about to be built,
on whatever route builds it. That means a page built from the applied bundles'
skills. A page a template writes while it is applied - by `frontx seed` or `frontx
add` - is that template's shipped content and gets no proposal and no offer; tell
a person who asked to see it first that it comes ready from the template. When no
applied bundle offers the step, build without it; tell a person who asked to see
the page first that this project offers no drawn proposal, then build. That line
answers the person and is not an error: do not report the absence as a missing
capability or as an unmatched request. A person who asked to see the page or
options first gets the step with no further ask. Otherwise, for new pages or
screens whose look the person has neither seen nor described, offer it once, in
one short line covering them all, in the person's own language - every text the
step shows them is in that language too; never offer again for a screen already
offered or declined. The offer ends your turn: build nothing in it. A reply that
accepts takes the step. Any other reply (a refusal, a wish to build at once, or
one that ignores the offer) means build now, with no second ask. Make no offer
when the person already gave a design, a mockup or an exact description, or when
the change is small - a fix, one more field, a text change. Only the person
chooses an option; never pick one for them.

<!-- frontx:routing:end -->

## Packages

| Package | Scope | Purpose |
|---|---|---|
| `@gears-frontx/mfes` | Ecosystem | MFE runtime substrate — registration, loading, isolation, mediation |
| `@gears-frontx/gts-plugin` | Ecosystem | GTS default type-system plugin |
| `@gears-frontx/api` | Ecosystem | API protocol surface — handler-agnostic fetch, cache sharing |
| `@gears-frontx/cli` | Ecosystem | Template resolution CLI — zero bundled template content (CLI-1) |
| `@gears-frontx/cyber-pilot-kit-frontx` | Ecosystem | This AI tooling kit |

## Architecture Principles

- **CLI-1**: CLI has zero dependency on any template; resolves by source-spec at runtime.
- **KIT-1**: All resource identifiers in this kit carry the `frontx_` prefix.
- **MFES-2 / MFES-3**: MFE packages do not depend on template packages.
- **API-1**: API package is handler-agnostic; mocks are template territory.
- **GTS-PLUGIN-2**: GTS plugin ships no solution schemas; schemas are template territory.

## Key Concepts

- **MFE** (Microfrontend): isolated UI unit registered through the MFE registry.
- **Extension domain**: capability grouping that governs which MFEs may mount in a given area.
- **Source-spec**: `host:owner/repo[//subtree]@ref` — the address the CLI resolves to a template at runtime; the optional `//subtree` addresses a template occupying a subdirectory of a repository.
- **Template**: an external project-type deliverable (not bundled into core packages).
- **Constructor Studio kit**: declarative content bundle installable via `cfs kit install`.
