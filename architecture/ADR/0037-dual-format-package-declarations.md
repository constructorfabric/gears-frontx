---
status: proposed
date: 2026-10-20
description: "Decides that packages keep shipping both ESM and CommonJS builds, with each module format's declarations nested under its own exports condition."
---

# Keep Dual ESM/CommonJS Packages and Give Each Format Its Own Declarations

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Keep both formats and nest each format's declarations under its own condition](#keep-both-formats-and-nest-each-formats-declarations-under-its-own-condition)
  - [Publish ESM only](#publish-esm-only)
  - [Keep the shared top-level declarations](#keep-the-shared-top-level-declarations)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-dual-format-package-declarations`

## Context and Problem Statement

Seven published packages — `@gears-frontx/api`, `cli`, `gts-plugin`, `mfes`, `routing`, `routing-tanstack` and `telemetry` — build an ESM and a CommonJS output, with a declaration file for each (`.d.ts` and `.d.cts`), and their manifests offer both through `import` and `require` export conditions. Each `exports` entry, however, placed one `types` key ahead of both conditions. TypeScript matches conditions in order, so under `moduleResolution` Node16 or NodeNext that key matched first for a CommonJS consumer as well, handing it the ESM declarations of a `"type": "module"` package, and every import failed with TS1479 although the runtime `require()` worked and the `.d.cts` file was published beside it.

The documents that once disagreed about the module format — a root DESIGN constraint calling the ecosystem ESM-only and a publishing-pipeline FEATURE requiring a CommonJS build — no longer exist, and nothing in the current architecture states which formats a package ships. `@gears-frontx/ui-kit` settles it for itself: its PRD makes it ESM-only, and its manifest offers no `require` condition. Which contract do the other packages publish, and how is it kept true?

## Decision Drivers

* **Consumers in either format** — a project that compiles to CommonJS must be able to depend on a FrontX package without changing its own module system, as long as the package offers a CommonJS entry.
* **No silent removals** — dropping a format every published version has shipped is a breaking change for its consumers, even before 1.0.
* **Declarations match runtime** — a consumer must type-check against the declarations of the file Node actually loads for it.
* **Kept true by a check** — the contract must be asserted against packed tarballs, where the manifest, the `files` list and the build output meet, not only against source.
* **Members may opt out** — a member whose own PRD declares it ESM-only, as ui-kit's does, stays ESM-only.

## Considered Options

* **Keep both formats and nest each format's declarations under its own condition** — every entry with a `require` condition becomes `{ "import": { "types": "*.d.ts", "default": "*.js" }, "require": { "types": "*.d.cts", "default": "*.cjs" } }`.
* **Publish ESM only** — drop the CommonJS build, the `require` conditions and the `main` field from every package.
* **Keep the shared top-level declarations** — leave the manifests as they are and document that CommonJS consumers must use another module resolution mode.

## Decision Outcome

Chosen option: **keep both formats and nest each format's declarations under its own condition**, because it repairs the CommonJS contract every dual-format package already advertises without removing anything a consumer may rely on, and the build already emits the files it points to.

A published package that offers a CommonJS entry offers it for every entry point, and each `exports` entry nests `types` first inside each condition: the ESM declarations and module under `import`, the CommonJS declarations and module under `require`. No `types` key stands beside the conditions. The top-level `main`, `module` and `types` fields stay for resolvers that read no `exports`. A member whose own PRD declares it ESM-only offers no `require` condition and is outside this rule; whether a member is dual-format is read from its manifest, not from a list. The concrete check belongs to `cpt-frontx-feature-ecosystem-distribution` under ADR 0027's ownership rule (`cpt-frontx-adr-contract-schema-ownership`).

### Consequences

* Good, because a CommonJS TypeScript consumer resolves the `.d.cts` of every entry point and type-checks, and ESM and bundler consumers keep resolving the `.d.ts` they resolved before.
* Good, because no package loses a format or an entry point, so the fix ships as a patch release of each package.
* Good, because the check packs each package the way publication does, so a manifest that names a file the tarball lacks fails CI instead of reaching the registry.
* Bad, because every dual-format package keeps two builds and two declaration sets, and the `exports` entries are longer.
* Neutral, because the choice can be revisited: going ESM-only later is a breaking change on each package's own version line, and the check would then find no dual-format package and fail until it is retired with that decision.

### Confirmation

`scripts/verify-dual-format-consumers.mjs` (`cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check`) runs in CI after the packages are built. It rejects any entry with a `require` condition whose shape differs from the decision, packs every dual-format package, fails when a packed tarball lacks a file its `exports` name, and type-checks a `.cts` and an `.mts` consumer importing every entry point under Node16 and NodeNext. Against the manifests this decision replaces, the CommonJS consumer fails with TS1479 for every entry point.

## Pros and Cons of the Options

### Keep both formats and nest each format's declarations under its own condition

* Good, because it is the shape TypeScript's own module documentation describes for a package with separate CommonJS and ESM declarations.
* Good, because nothing is removed and the change is limited to manifests.
* Bad, because the CommonJS build and its declarations must keep being produced and verified for every dual-format package.

### Publish ESM only

* Good, because one build and one declaration set per package is simpler, and Node can now `require()` an ESM module in many cases.
* Bad, because it removes the `require` entry every dual-format package has published so far, a breaking change for CommonJS consumers on seven version lines at once.
* Bad, because `require()` of an ESM module still fails when the module graph uses top-level `await`, and older Node lines and some test runners do not support it at all.

### Keep the shared top-level declarations

* Good, because nothing changes.
* Bad, because the packages keep advertising a CommonJS entry that a CommonJS TypeScript consumer under Node16 or NodeNext cannot use.

## More Information

Raised in #503 while reviewing #499. #462 asked the same format question about documents that have since been removed, and was closed in favour of #503.

**Review trigger.** Revisit if the ecosystem decides to stop shipping CommonJS, or if a package needs export conditions beyond `import` and `require` (for example a `browser` or `worker` build), which this decision's shape does not cover.

**Checklist applicability.** ARCH — applicable and addressed above: the published module-format contract binds every consumer of seven packages. INT — applicable and addressed above: the `exports` map is the packages' integration contract with every consumer's toolchain. REL — applicable: the packed-consumer check runs on every change. SEC, PERF, DATA, OPS, COMPL, UX, BIZ — Not applicable, because the decision changes package metadata only.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-contract-package-registry-distribution` — the root contract under which packages are published to and installed from the registry; this decision fixes which module formats a published package's manifest offers and how each format's declarations are reached.
* `cpt-frontx-interface-package-registry-distribution` — the DESIGN interface that records the module-format contract this decision chooses.
* `cpt-frontx-fr-versioned-platform-evolution` — keeping both formats avoids a breaking removal across every dual-format package's version line.
* `cpt-frontx-component-ecosystem-version-policy` — the root component whose distribution policy the packed-consumer check extends.
* `cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check` — the algorithm that confirms this decision against packed tarballs.
* `cpt-frontx-dod-ecosystem-distribution-dual-format-declarations` — the definition of done that binds every dual-format package to it.
