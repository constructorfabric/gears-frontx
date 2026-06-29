---
status: accepted
date: 2025-12-08
---

# ESM-First Module Format


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [ESM-only output across all packages](#esm-only-output-across-all-packages)
  - [Dual ESM/CJS exports per package](#dual-esmcjs-exports-per-package)
  - [Stay CJS and use dynamic import() for ESM dependencies](#stay-cjs-and-use-dynamic-import-for-esm-dependencies)
  - [Downgrade to CJS-compatible dependency versions](#downgrade-to-cjs-compatible-dependency-versions)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-esm-first-module-format`
## Context and Problem Statement

The CLI package depended on ESM-only packages (inquirer ^9.x) but was built as CommonJS, causing import resolution failures at runtime. The broader ecosystem — Node.js, Vite, and modern bundlers — is converging on ESM as the standard module format. Maintaining CJS output alongside ESM creates dual-format build complexity, requires interop shims, and defeats static tree-shaking because CJS exports are evaluated dynamically.

## Decision Drivers

* ESM-only dependencies (inquirer ^9.x) must be consumable without dynamic import workarounds
* Tree-shaking must work correctly across all packages — CJS defeats static analysis
* Build configuration must be kept simple — dual-format output doubles the surface area for configuration bugs

## Considered Options

* ESM-only output across all packages
* Dual ESM/CJS exports per package
* Stay CJS and use dynamic import() for ESM dependencies
* Downgrade to CJS-compatible dependency versions

## Decision Outcome

Chosen option: "ESM-only output across all packages", because it resolves ESM-only dependency import failures, enables correct static tree-shaking, aligns with the direction of Node.js and browser runtimes, and eliminates dual-format build complexity.

### Consequences

* Good, because module resolution is unambiguous, tree-shaking works as intended, and build configuration is simpler with a single output format
* Bad, because CJS consumers cannot `require()` FrontX packages — this is accepted because the CLI is an entry point, not a library consumed by CJS hosts, and all application-layer consumers are expected to use Vite or another ESM-aware bundler

### Confirmation

Every `packages/*/package.json` contains `"type": "module"` and an `"exports"` field pointing to `.js` ESM entry points. All `tsup.config.ts` files specify `format: ['esm']` with no `cjs` entry. CI type-check (`npx tsc --noEmit`) validates that import resolution succeeds for all ESM-only dependencies.

## Pros and Cons of the Options

### ESM-only output across all packages

* Good, because a single output format eliminates interop shims, keeps `package.json` exports fields minimal, and makes static analysis unambiguous for bundlers
* Bad, because any downstream consumer using `require()` cannot consume FrontX packages without a bundler or dynamic import wrapper

### Dual ESM/CJS exports per package

* Good, because CJS consumers retain compatibility without code changes
* Bad, because dual output doubles the number of build artifacts, adds conditional export field complexity, and creates subtle interop bugs when CJS and ESM instances of the same module coexist at runtime

### Stay CJS and use dynamic import() for ESM dependencies

* Good, because no change to existing build configuration is required
* Bad, because wrapping every ESM-only dependency in `import()` forces async initialization paths in code that should be synchronous, and the pattern is unsustainable as more ESM-only dependencies are adopted

### Downgrade to CJS-compatible dependency versions

* Good, because it defers the ESM migration without any build changes
* Bad, because older dependency versions accumulate security debt and miss features; the ecosystem migration to ESM is irreversible, making this approach a recurring maintenance burden

## More Information

- Node.js treats `.js` files as ESM when the nearest `package.json` contains `"type": "module"`, which is the mechanism relied upon here — no `.mjs` file extensions are needed
- Related: ADR 0001 (Four-Layer SDK Architecture) — ESM is required for correct tree-shaking across the four-layer package graph
- Related: ADR 0004 (Blob URL MFE Isolation) — the blob URL approach depends on ESM `import()` semantics for module evaluation isolation

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:
* `cpt-frontx-fr-pub-esm` — functional requirement for ESM-format package publication
* `cpt-frontx-nfr-compat-esm` — non-functional requirement for ESM-only runtime compatibility
* `cpt-frontx-constraint-esm-first-module-format` — hard constraint prohibiting CJS output from FrontX packages
