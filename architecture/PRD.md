# PRD — FrontX Ecosystem

<!-- toc -->

- [1. Overview](#1-overview)
  - [1.1 Purpose](#11-purpose)
  - [1.2 Background / Problem Statement](#12-background--problem-statement)
  - [1.3 Goals (Business Outcomes)](#13-goals-business-outcomes)
  - [1.4 Glossary](#14-glossary)

<!-- /toc -->

## 1. Overview

### 1.1 Purpose

The FrontX Ecosystem exists to enable AI-driven creation of frontend projects. It gives teams a product set in which AI agents can reliably scaffold, extend, and evolve frontend applications by targeting stable, narrow, explicitly-contracted product capabilities instead of improvising against an open-ended codebase. The ecosystem delivers this through three co-equal pillars: a **Core Framework** that makes an application runtime-extensible by composable microfrontends and provides cross-cutting client-server communication contracts over a substrate for typed entities; a **CLI** that owns the full project lifecycle — installing, listing, updating, and validating templates, scaffolding projects and microfrontends, resolving composed templates, recording project provenance, and upgrading existing projects to newer template versions; and an **AI Tooling Framework** that equips AI agents with ecosystem-wide capabilities, lets templates contribute their own AI capabilities, activates those capabilities automatically in consuming projects, and orchestrates AI-driven project upgrades.

Together these pillars let an AI agent carry a frontend project from first scaffold through ongoing extension and version upgrades, while the human Template Developers and Project Developers steering the work stay in control of intent and review. The product's value is measured by how predictably and safely AI agents and their human collaborators can produce and maintain real frontend applications on top of it.

### 1.2 Background / Problem Statement

Teams building frontend projects increasingly depend on AI agents to do the work — scaffolding new applications, adding features, and keeping projects current as their foundations evolve. For an AI agent to do this reliably, it needs a product surface that is stable, narrow, and explicitly contracted, so the agent targets well-defined capabilities rather than guessing at the shape of an open-ended codebase.

Two groups of people, each working alongside AI agents, have distinct needs. **Template Developers** design, version, and publish the project templates and microfrontend templates that other teams build from; they need stable product contracts, pre-publish validation, semantic-versioning discipline, deterministic composition of templates, and a way to bundle template-specific AI capabilities. **Project Developers** scaffold an application from a template and then build business code on top; they need predictable scaffolding output, reliable template upgrades, a clear boundary between what the product provides and what the application must supply, and AI agents that already understand both the ecosystem and the specific template in use.

Across both groups, three needs recur: stable, narrow contracts an AI agent can target; a project lifecycle — install, scaffold, compose, validate, and upgrade — that an AI agent can drive end to end; and AI tooling that knows the ecosystem out of the box and can be extended with knowledge specific to each template. The FrontX Ecosystem addresses these needs directly, so that AI-driven frontend development is predictable and safe for both the people directing it and the agents performing it.

### 1.3 Goals (Business Outcomes)

- **Bounded time-to-scaffold** — A Project Developer (or an AI agent acting for one) can scaffold a working project from a project template in a single operation whose duration is bounded by a target published in the platform's release notes. Baseline: not yet measured (new product); Target: a predictable, bounded scaffold operation; Timeframe: established and published at the first platform release.
- **Reviewable, reversible upgrades** — Every upgrade of an existing project to a newer template version is applied as a reviewable change set that a developer approves before it touches project files, with non-destructive rollback. Baseline: none (new product); Target: 100% of upgrades review-gated and reversible; Timeframe: first platform release.
- **Ecosystem-wide AI SDLC coverage** — AI agents working in any FrontX-based project have ecosystem SDLC operations available — creating and validating PRD, ADR, DESIGN, DECOMPOSITION, and FEATURE artifacts with traceability across them — at session start, with no per-project training step. Baseline: none (new product); Target: all five artifact types supported; Timeframe: first platform release.
- **Automatic activation of template AI extensions** — When a template that bundles AI capabilities is installed in a project, those capabilities become available to AI agents automatically, with no manual wiring by the developer. Baseline: none (new product); Target: zero manual wiring steps for template-bundled AI capabilities; Timeframe: first platform release.
- **Compatibility within a major version** — Platform releases preserve backward compatibility within a major version, so consuming applications are not forced to upgrade in lockstep with the product. Baseline: none (new product); Target: zero breaking changes to published product contracts within a major version line; Timeframe: ongoing from the first major release.
- **No architectural ceiling on application scale** — The platform places no upper limit on the number of microfrontends, type definitions, or communication patterns an application integrates, beyond the thresholds stated in the non-functional requirements. Baseline: none (new product); Target: scale governed only by the stated NFR thresholds, not by product architecture; Timeframe: first platform release.

### 1.4 Glossary

| Term | Definition |
|------|------------|
| ecosystem | The FrontX product set as a whole; referred to hereinafter as "the ecosystem". |
| microfrontend (MFE) | An independently-developed, runtime-loadable unit of user-facing functionality that the platform loads and places into a running application. Abbreviated **MFE**. |
| extension | A configured placement that binds one microfrontend into one extension domain, producing a concrete occupant of that domain. An extension is not the microfrontend itself; it is the microfrontend as placed and configured in a specific domain. |
| extension domain | A named extension point in the application where microfrontends can be placed. It governs which microfrontends may occupy it, whether it permits one or several occupants at once, and what shared state and capabilities its occupants receive. |
| type definition | A description of an entity's shape that the type system can validate against; specification-format-agnostic at the product-requirements level. |
| cross-cutting concern | A behavior that applies across many client-server communications, such as authentication, logging, response caching, or sourcing data from an alternate origin. |
| platform | The Core Framework pillar as a consuming application depends on it at runtime — the versioned runtime foundation an application is built upon. (Distinct from "ecosystem", which is the whole FrontX product set.) |
| project template | A template that scaffolds an entire new project. |
| microfrontend template | A template that scaffolds a single microfrontend into an existing project. |
| scaffold | The act of generating files and configuration into a target directory from a template. |
| composed template | A project template that references one or more microfrontend templates and resolves them as part of a single scaffold operation. |
| project provenance / project lineage | Recorded information about which template, and which template version, a project was scaffolded from. |
| upgrade | Application of a newer template version to an existing project, delivered as a reviewable change set. |
| update | Installation of a newer template version locally, without applying it to any existing project. |
| template-bundled AI extension | An AI capability — a skill, workflow, guideline, or reference artifact — that ships inside a template and activates when that template is installed. |
| AI Tooling Framework | The Pillar 3 component that provides base ecosystem AI capabilities, the extension contract templates use to bundle AI extensions, and the discovery-and-activation surface that turns installed-template extensions into available capabilities for AI agents. |