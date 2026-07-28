---
status: accepted
date: 2026-06-05
---

# AI Tooling Framework Packaging


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Constructor Studio kit](#constructor-studio-kit)
  - [Bespoke library package with a custom installer](#bespoke-library-package-with-a-custom-installer)
  - [In-repo scaffolding](#in-repo-scaffolding)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-ai-tooling-framework-packaging`
## Context and Problem Statement

The AI Tooling Framework (`cpt-frontx-component-ai-tooling-kit`, packaged as `cyber-pilot-kit-frontx`) must reach a consuming project so that AI agents working in that project gain the framework's skills and ecosystem-knowledge artifacts at session start (`cpt-frontx-fr-ai-session-start-knowledge`). Delivery flows through the AI-tooling command-line integration (`cpt-frontx-actor-ai-tooling-cli`) as the installation contract requires (`cpt-frontx-contract-kit-installation`), and the framework exposes a single versioned public surface (`cpt-frontx-interface-ai-tooling-framework`). What packaging and distribution form should the framework take so that it installs through that integration, presents one governed public surface, and carries no template-specific content of its own?

## Decision Drivers

* **Capabilities available at session start** — installing the framework must make its skills and ecosystem-knowledge artifacts available to AI agents from the first interaction, with no separate training or setup step (`cpt-frontx-fr-ai-session-start-knowledge`).
* **Install through the AI-tooling CLI integration** — the framework reaches a consuming project through the command-line integration, which is the channel the installation contract defines (`cpt-frontx-contract-kit-installation`, `cpt-frontx-actor-ai-tooling-cli`).
* **One governed, versioned public surface** — the delivered artifact is the framework's public interface (`cpt-frontx-interface-ai-tooling-framework`); its compatibility must be governed by an explicit versioning policy rather than left implicit.
* **Declarative, repeatable install and update** — what gets installed, and where, should be declared rather than imperative, so installation and later updates are deterministic and inspectable.
* **Collision-free resource identity** — the framework's resources coexist with other installed kits in one project, so each resource needs a namespaced identifier that cannot collide with another kit's.
* **Reuse of a proven distribution substrate** — a declarative kit-manifest install mechanism and a versioned source-reference convention already serve this purpose; a bespoke alternative would duplicate them.

## Considered Options

* **Constructor Studio kit** (evaluated as "Cypilot kit"; renamed by the 2026-07-28 amendment) — the framework ships as a Constructor Studio kit with a declarative `.cf-studio-kit.toml`; every resource identifier is `frontx_`-prefixed (constraint KIT-1); the package is published as a versioned npm artifact and installed through the AI Tooling CLI by source reference. The kit is the framework's delivered public surface.
* **Bespoke library package with a custom installer** — the framework ships as a standalone package with its own install-and-load logic and its own resource layout, independent of the kit-manifest mechanism.
* **In-repo scaffolding** — the framework's capabilities are copied into each consuming project at scaffold time, with no separately versioned package to install or update.

## Decision Outcome

Chosen option: **Constructor Studio kit**, because it is the only option that installs through the CLI integration the contract defines, presents one declaratively-described public surface, and reuses the existing declarative install substrate instead of duplicating it. The framework ships as a kit whose `.cf-studio-kit.toml` enumerates exactly the resources to install and their destinations; every resource identifier carries the `frontx_` prefix (KIT-1) so the framework's resources cannot collide with another kit installed in the same project. The package is published as a versioned npm artifact and installed and updated through the AI Tooling CLI by source reference, and the kit as a whole IS the framework's delivered public surface (`cpt-frontx-interface-ai-tooling-framework`).

The kit's public surface is a library boundary whose stability is governed by the matched-version artifact-distribution policy decided in `cpt-frontx-adr-artifact-versioning-and-distribution`: an incompatible change to the surface requires a major version bump, while minor and patch versions preserve backward compatibility. The scope of this decision is the framework's packaging form, its resource-identity rule, its agent-facing resource-kind model — public agent entry points are declared as resources of kind `skill` or `rule`, with each entry point's applicability metadata carried in the resource document itself rather than in manifest fields, and supporting knowledge content declared as non-public resources (KIT-4) — and its distribution and install path; it does not decide the shape of any template-carried AI extension (that is `cpt-frontx-adr-template-ai-extension-contract`) nor how installed extensions are discovered (that is `cpt-frontx-adr-extension-discovery-activation`). The bespoke-package option fragments the install path away from the CLI integration and reimplements a declarative install mechanism that already exists; the in-repo-scaffolding option gives no separately versioned surface and no clean update path, so the framework's capabilities could not evolve and be re-delivered independently of each project.

### Consequences

* Good, because installing the kit makes the framework's skills and ecosystem-knowledge artifacts available to AI agents at session start through the standard install path.
* Good, because the kit manifest declares exactly what is installed and where, so installation and update are deterministic and inspectable.
* Good, because the `frontx_` resource-identity rule guarantees the framework's resources never collide with another kit in the same project.
* Good, because the kit is one governed public surface whose compatibility is bound to the matched-version policy.
* Bad, because the framework's deliverable form is constrained to what the kit-manifest mechanism can express; a capability that does not fit the manifest's resource model needs the mechanism extended.
* Bad, because the framework's delivery is coupled to the AI Tooling CLI and the kit substrate, so a consuming project must adopt that toolchain to receive the framework.

### Confirmation

Compliance is confirmed by the `cyber-pilot-kit-frontx` package's own test suite, which parses the shipped `.cf-studio-kit.toml` from disk and asserts that every resource identifier matches `^frontx_` (KIT-1), that each declared resource source exists, and that the manifest passes `validateKitManifest`. The same suite asserts the agent-facing resource-kind model: every resource the packaged kit declares public is of kind `skill` or `rule`, and each such resource's document carries non-empty applicability metadata in its frontmatter or description (KIT-4). Because the kit is registered at `[kits.cyber-pilot-kit-frontx]` in `.cf-studio/config/core.toml`, the repository's `cfs validate-kits` CI job additionally validates it against the kit specification (only declared resources install, each at its declared or user-overridden path). A public-interface compatibility check (tied to the matched-version policy) asserts that an incompatible change to the kit's public surface is accompanied by a major version bump. Design and code review confirm the kit carries no template-specific content.

## Pros and Cons of the Options

### Constructor Studio kit

The framework ships as a Constructor Studio kit with a declarative `.cf-studio-kit.toml`, `frontx_`-prefixed resource ids, versioned npm distribution, and CLI install by source reference; the kit is the public surface.

* Good, because it installs through the CLI integration the installation contract defines.
* Good, because the manifest declares install targets deterministically and supports repeatable updates.
* Good, because `frontx_`-prefixed identifiers give collision-free resource identity in a shared project.
* Good, because it reuses a proven declarative install substrate rather than duplicating one.
* Neutral, because it composes with the matched-version policy, which is a separate decision it relies on for compatibility governance.
* Bad, because the deliverable is bounded by what the kit-manifest resource model can express.

### Bespoke library package with a custom installer

The framework ships as a standalone package with its own install-and-load logic.

* Good, because the framework controls its own install behaviour without conforming to a manifest model.
* Bad, because it reimplements a declarative install mechanism that already exists, duplicating substrate.
* Bad, because it fragments the install path away from the CLI integration the contract defines.
* Bad, because resource-identity collision avoidance must be re-solved instead of inherited from a kit-wide prefix rule.

### In-repo scaffolding

The framework's capabilities are copied into each project at scaffold time, with no separately versioned package.

* Good, because there is no separate artifact to publish or install.
* Bad, because there is no separately versioned public surface to govern for compatibility.
* Bad, because there is no clean update path: capabilities cannot evolve and be re-delivered independently of each project's scaffolded copy.

## More Information

**Amendment (2026-07-28)** — The vendor substrate this decision rides on was renamed
from Cypilot to Constructor Studio, and the declarative kit manifest moved from
`manifest.toml` to the canonical `.cf-studio-kit.toml` (`manifest_version` +
`kits[]`, with `default_path` renamed to `install_path`). The decision's durable
identity is unchanged: the framework still ships as a declaratively-described kit,
installed through the AI-tooling CLI integration, presenting one governed public
surface with `frontx_`-prefixed resource identity. Only the vendor name, the CLI
binary, and the manifest's filename and schema changed — all neutral substrate under
the citation policy stated below. Neither revisit trigger recorded in this ADR fired,
so this is an amendment rather than a supersession.

The same amendment corrects the distribution description. This ADR previously
stated the package was "distributed as a GitHub tarball". No standalone
`cyber-pilot-kit-frontx` repository has ever existed: the kit ships inside the
`constructorfabric/gears-frontx` monorepo and is published to npm as
`@gears-frontx/cyber-pilot-kit-frontx`, while `cfs kit install` — which cannot
consume npm — resolves it by generic-Git subdirectory reference or local path.
The tarball wording described a channel that was never in use; the actual
distribution has not changed, so this is a correction of an inaccurate
description rather than a change of distribution path under the scope stated
above.

The kit-installation substrate this decision rides on is the declarative kit manifest defined by the Constructor Studio kit specification (`.cf-studio/.core/architecture/specs/kit/kit.md`) (only declared resources install, each at its declared `install_path` or a user-overridden path) and the `[kits.*]` registration in `.cf-studio/config/core.toml` (each kit records its `path`, `version`, and install mode or resolved source); the `.cf-studio/config/kits/sdlc/` kit is a working exemplar of this packaging. These are neutral substrate citations and are not part of this decision's durable identity. KIT-1's `frontx_` prefix maps to the `resource.id` field of the kit-manifest schema, layered above that field's general identifier pattern. The matched-version policy that governs the kit's public-surface compatibility is decided in `cpt-frontx-adr-artifact-versioning-and-distribution` — a non-binding pointer to a related decision.

Integration treatment (INT): the kit installation is the integration contract (`cpt-frontx-contract-kit-installation`), required from the consuming side and serviced through the CLI integration. **Interface stability and versioning (INT-ADR-001)** — the kit's public surface is `cpt-frontx-interface-ai-tooling-framework`; an incompatible change to it requires a major version bump, while minor and patch versions preserve backward compatibility, governed by the matched-version policy. **Contract changes (INT-ADR-002)** — the installation contract remains backward-compatible across minor and patch versions; an incompatible change to it is a public-interface change subject to the same compatibility policy, and consumers are notified through the version bump. There is no wire protocol to version here.

Applicability of the remaining checklist categories: **PERF** — Not applicable, because no latency or throughput budget is bound to the packaging form. **SEC** — Not applicable, because no secret material and no authentication surface are introduced by the packaging decision. **REL** — Not applicable, because there is no service-availability target; install and update run locally and on demand. **DATA** — Not applicable, because no persistent database or schema is defined here. **OPS** — Not applicable, because there are no runbooks or operational procedures for a local kit install. **COMPL** — Not applicable, because no regulatory obligation bears on the packaging form. **ARCH-ADR-008 (supersession)** — Not applicable, because this ADR supersedes no live ADR. **Review cadence**: revisit if the kit-manifest resource model cannot express a required framework capability, or if a distribution channel beyond the present npm-artifact and source-reference install paths becomes a requirement.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-contract-kit-installation` — This decision defines the packaging and install path that realizes the kit-installation contract through the CLI integration.
* `cpt-frontx-fr-ai-session-start-knowledge` — Installing the kit is what makes the framework's skills and ecosystem-knowledge artifacts available to AI agents at session start.
* `cpt-frontx-fr-ai-agent-skill-resources` — This decision fixes the agent-facing resource-kind model that exposes the framework's capabilities as declared resources a conforming agent host can discover and invoke.
* `cpt-frontx-actor-ai-tooling-cli` — The CLI integration is the install channel; this decision binds the framework's delivery to it.
* `cpt-frontx-interface-ai-tooling-framework` — The kit is the delivered public surface of this interface; this decision fixes its packaging form and binds its compatibility to the matched-version policy.
* `cpt-frontx-component-ai-tooling-kit` — This component is packaged as `cyber-pilot-kit-frontx`; this decision determines that packaging and its resource-identity rule.
