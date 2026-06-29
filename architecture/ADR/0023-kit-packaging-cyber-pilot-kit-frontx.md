---
status: proposed
date: 2026-06-05
---

# Packaging the AI Tooling Framework as a Cypilot Kit


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Cypilot kit](#cypilot-kit)
  - [Bespoke library package with a custom installer](#bespoke-library-package-with-a-custom-installer)
  - [In-repo scaffolding](#in-repo-scaffolding)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-kit-packaging-cyber-pilot-kit-frontx`
## Context and Problem Statement

The AI Tooling Framework (`cpt-frontx-component-ai-tooling-kit`, packaged as `cyber-pilot-kit-frontx`) must reach a consuming project so that AI agents working in that project gain the framework's skills and ecosystem-knowledge artifacts at session start (`cpt-frontx-fr-ai-session-start-knowledge`). Delivery flows through the AI-tooling command-line integration (`cpt-frontx-actor-cypilot-cli`) as the installation contract requires (`cpt-frontx-contract-kit-installation`), and the framework exposes a single versioned public surface (`cpt-frontx-interface-ai-tooling-framework`). What packaging and distribution form should the framework take so that it installs through that integration, presents one governed public surface, and carries no template-specific content of its own?

## Decision Drivers

* **Capabilities available at session start** — installing the framework must make its skills and ecosystem-knowledge artifacts available to AI agents from the first interaction, with no separate training or setup step (`cpt-frontx-fr-ai-session-start-knowledge`).
* **Install through the AI-tooling CLI integration** — the framework reaches a consuming project through the command-line integration, which is the channel the installation contract defines (`cpt-frontx-contract-kit-installation`, `cpt-frontx-actor-cypilot-cli`).
* **One governed, versioned public surface** — the delivered artifact is the framework's public interface (`cpt-frontx-interface-ai-tooling-framework`); its compatibility must be governed by an explicit versioning policy rather than left implicit.
* **Declarative, repeatable install and update** — what gets installed, and where, should be declared rather than imperative, so installation and later updates are deterministic and inspectable.
* **Collision-free resource identity** — the framework's resources coexist with other installed kits in one project, so each resource needs a namespaced identifier that cannot collide with another kit's.
* **Reuse of a proven distribution substrate** — a declarative kit-manifest install mechanism and a tarball-source convention already serve this purpose; a bespoke alternative would duplicate them.

## Considered Options

* **Cypilot kit** — the framework ships as a Cypilot kit with a declarative `manifest.toml`; every resource identifier is `frontx_`-prefixed (constraint KIT-1); the package is distributed as a GitHub tarball and installed through the Cypilot CLI. The kit is the framework's delivered public surface.
* **Bespoke library package with a custom installer** — the framework ships as a standalone package with its own install-and-load logic and its own resource layout, independent of the kit-manifest mechanism.
* **In-repo scaffolding** — the framework's capabilities are copied into each consuming project at scaffold time, with no separately versioned package to install or update.

## Decision Outcome

Chosen option: **Cypilot kit**, because it is the only option that installs through the CLI integration the contract defines, presents one declaratively-described public surface, and reuses the existing declarative install substrate instead of duplicating it. The framework ships as a kit whose `manifest.toml` enumerates exactly the resources to install and their destinations; every resource identifier carries the `frontx_` prefix (KIT-1) so the framework's resources cannot collide with another kit installed in the same project. The package is distributed as a GitHub tarball and installed and updated through the Cypilot CLI, and the kit as a whole IS the framework's delivered public surface (`cpt-frontx-interface-ai-tooling-framework`).

The kit's public surface is a library boundary whose stability is governed by the matched-version artifact-distribution policy decided in `cpt-frontx-adr-matched-version-artifact-distribution`: an incompatible change to the surface requires a major version bump, while minor and patch versions preserve backward compatibility. The scope of this decision is the framework's packaging form, its resource-identity rule, and its distribution and install path; it does not decide the shape of any template-carried AI extension (that is `cpt-frontx-adr-template-ai-extension-contract`) nor how installed extensions are discovered (that is `cpt-frontx-adr-extension-discovery-activation`). The bespoke-package option fragments the install path away from the CLI integration and reimplements a declarative install mechanism that already exists; the in-repo-scaffolding option gives no separately versioned surface and no clean update path, so the framework's capabilities could not evolve and be re-delivered independently of each project.

### Consequences

* Good, because installing the kit makes the framework's skills and ecosystem-knowledge artifacts available to AI agents at session start through the standard install path.
* Good, because the kit manifest declares exactly what is installed and where, so installation and update are deterministic and inspectable.
* Good, because the `frontx_` resource-identity rule guarantees the framework's resources never collide with another kit in the same project.
* Good, because the kit is one governed public surface whose compatibility is bound to the matched-version policy.
* Bad, because the framework's deliverable form is constrained to what the kit-manifest mechanism can express; a capability that does not fit the manifest's resource model needs the mechanism extended.
* Bad, because the framework's delivery is coupled to the Cypilot CLI and the kit substrate, so a consuming project must adopt that toolchain to receive the framework.

### Confirmation

Compliance is confirmed by a continuous-integration check on the `cyber-pilot-kit-frontx` package that asserts every resource identifier in its `manifest.toml` matches `^frontx_` (KIT-1), and that the manifest validates against the kit-manifest schema (only declared resources install, each at its declared or user-overridden path). A further check asserts the package installs through the Cypilot CLI from its GitHub-tarball source, and a public-interface compatibility check (tied to the matched-version policy) asserts that an incompatible change to the kit's public surface is accompanied by a major version bump. Design and code review confirm the kit carries no template-specific content.

## Pros and Cons of the Options

### Cypilot kit

The framework ships as a Cypilot kit with a declarative `manifest.toml`, `frontx_`-prefixed resource ids, GitHub-tarball distribution, and CLI install; the kit is the public surface.

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

The kit-installation substrate this decision rides on is the declarative kit manifest defined by `.cypilot/.core/schemas/kit-manifest.schema.json` (only declared resources install, each at its declared `default_path` or a user-overridden path) and the `[kits.*]` registration in `.cypilot/config/core.toml` (each kit records its `path`, `version`, and tarball `source`); the `.cypilot/config/kits/sdlc/` kit is a working exemplar of this packaging. These are neutral substrate citations and are not part of this decision's durable identity. KIT-1's `frontx_` prefix maps to the `resource.id` field of the kit-manifest schema, layered above that field's general identifier pattern. The matched-version policy that governs the kit's public-surface compatibility is decided in `cpt-frontx-adr-matched-version-artifact-distribution` — a non-binding pointer to a related decision.

Integration treatment (INT): the kit installation is the integration contract (`cpt-frontx-contract-kit-installation`), required from the consuming side and serviced through the CLI integration. **Interface stability and versioning (INT-ADR-001)** — the kit's public surface is `cpt-frontx-interface-ai-tooling-framework`; an incompatible change to it requires a major version bump, while minor and patch versions preserve backward compatibility, governed by the matched-version policy. **Contract changes (INT-ADR-002)** — the installation contract remains backward-compatible across minor and patch versions; an incompatible change to it is a public-interface change subject to the same compatibility policy, and consumers are notified through the version bump. There is no wire protocol to version here.

Applicability of the remaining checklist categories: **PERF** — Not applicable, because no latency or throughput budget is bound to the packaging form. **SEC** — Not applicable, because no secret material and no authentication surface are introduced by the packaging decision. **REL** — Not applicable, because there is no service-availability target; install and update run locally and on demand. **DATA** — Not applicable, because no persistent database or schema is defined here. **OPS** — Not applicable, because there are no runbooks or operational procedures for a local kit install. **COMPL** — Not applicable, because no regulatory obligation bears on the packaging form. **ARCH-ADR-008 (supersession)** — Not applicable, because this ADR supersedes no live ADR. **Review cadence**: revisit if the kit-manifest resource model cannot express a required framework capability, or if a second distribution channel beyond the GitHub-tarball source becomes a requirement.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-contract-kit-installation` — This decision defines the packaging and install path that realizes the kit-installation contract through the CLI integration.
* `cpt-frontx-fr-ai-session-start-knowledge` — Installing the kit is what makes the framework's skills and ecosystem-knowledge artifacts available to AI agents at session start.
* `cpt-frontx-actor-cypilot-cli` — The CLI integration is the install channel; this decision binds the framework's delivery to it.
* `cpt-frontx-interface-ai-tooling-framework` — The kit is the delivered public surface of this interface; this decision fixes its packaging form and binds its compatibility to the matched-version policy.
* `cpt-frontx-component-ai-tooling-kit` — This component is packaged as `cyber-pilot-kit-frontx`; this decision determines that packaging and its resource-identity rule.
