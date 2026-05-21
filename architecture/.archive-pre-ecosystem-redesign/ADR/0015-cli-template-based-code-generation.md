---
status: accepted
date: 2025-11-24
---

# CLI Template-Based Code Generation from Project Files


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Copy real project files at build time as templates](#copy-real-project-files-at-build-time-as-templates)
  - [Programmatic string generation](#programmatic-string-generation)
  - [EJS template language](#ejs-template-language)
  - [Monolithic command dispatch](#monolithic-command-dispatch)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-cli-template-based-code-generation`
## Context and Problem Statement

CLI code generation must produce code that follows current framework patterns and passes architecture checks. Programmatic string generation drifts from actual patterns when the framework evolves, because the generator and the framework evolve independently. Template languages add parsing complexity and a new authoring surface that contributors must learn. Generated code must always be valid TypeScript that satisfies the project's architecture rules.

## Decision Drivers

* Generated code must remain valid as the framework evolves — zero drift tolerance
* No new template language or authoring surface should be introduced
* CLI commands must work for both human (interactive) and AI agent (programmatic) invocation
* New commands must be addable without modifying CLI core

## Considered Options

* Copy real project files at build time as templates, apply ID transformations at runtime
* Programmatic string generation
* EJS template language
* Monolithic command dispatch

## Decision Outcome

Chosen option: "Copy real project files at build time as templates, apply ID transformations at runtime", because the monorepo's own `src/` directory and a minimal `_blank` screenset serve as the template source, making templates always current with framework patterns — they are the actual code, not a representation of it. A plugin-based command registry with `CommandDefinition<TArgs, TResult>` enables new commands without touching CLI core. Dual-mode execution via `ExecutionMode { interactive: boolean; answers?: Record<string, unknown> }` means the same command implementations serve both humans and AI agents.

### Consequences

* Good, because there is zero drift between generated code and framework patterns, there is a single source of truth, the command registry is extensible, and AI agents can invoke commands programmatically
* Bad, because a build step is required to copy templates into the CLI package, and the minimal `_blank` screenset template may not provide enough guidance for complex generation scenarios

### Confirmation

`packages/cli/` has a build step that copies templates from monorepo source directories. The `CommandDefinition` interface is present in the CLI source. The `ExecutionMode` type exists and supports both `interactive: true` (human) and `interactive: false` with `answers` pre-populated (programmatic/agent).

## Pros and Cons of the Options

### Copy real project files at build time as templates

* Good, because templates are always in sync with the framework — they are maintained by normal feature development, not a separate template authoring process
* Bad, because the build step adds a dependency between the CLI package and the monorepo source layout

### Programmatic string generation

* Good, because no files need to be copied and the generator is self-contained
* Bad, because string generation drifts from framework patterns whenever the framework changes without a corresponding generator update

### EJS template language

* Good, because EJS is a well-known templating system with a familiar syntax
* Bad, because it introduces a new authoring surface, a parsing dependency, and templates that are not valid TypeScript and cannot be type-checked

### Monolithic command dispatch

* Good, because all command routing is in one place and easy to trace
* Bad, because adding a new command requires modifying the core dispatch, violating the Open/Closed Principle

## More Information

- Related: ADR 0003 (Plugin-Based Framework Composition) — same plugin registry pattern applied to CLI commands

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:

* `cpt-frontx-fr-cli-package` — CLI package structure and build step for template copying
* `cpt-frontx-fr-cli-commands` — `CommandDefinition<TArgs, TResult>` plugin registry interface
* `cpt-frontx-fr-cli-templates` — real project files used as code generation templates
* `cpt-frontx-fr-cli-skills` — AI agent skill invocation via `ExecutionMode` programmatic path
* `cpt-frontx-component-cli` — CLI package scope
