/**
 * Single source of truth for the FrontX ecosystem's boundary model.
 *
 * Both the depcruise rules (internal/depcruise-config/core.cjs, consumed by
 * `npm run arch:deps:core`) and the package.json edge guard
 * (scripts/package-edge-tests.ts, consumed by `npm run arch:edges`) derive
 * their layer membership and allowed-edge lists from this module, so the
 * import-graph check and the manifest check cannot disagree about what the
 * layering is.
 *
 * The model here is the boundary model of `architecture/DESIGN.md` §1.3
 * (`cpt-frontx-adr-core-package-boundaries`), NOT the historic L1/L2/L3
 * SDK -> framework -> react chain. That chain described packages
 * (`state`, `i18n`, `framework`, `react`, `auth`, `studio`) that emigrated to
 * the self-contained `template-shell/` tree; the template owns and enforces
 * its own internal layering in `template-shell/.dependency-cruiser.cjs`.
 * Nothing in this file may reference template-side packages.
 */

/**
 * TWO WAYS A PACKAGE CAN BE AWAITING #495, AND WHY THEY ARE NOT THE SAME
 *
 * `telemetry` and `ui-kit` both arrived after DESIGN §1.3 was written and both
 * wait on #495 for a permanent home. They are nonetheless handled differently,
 * and the difference is deliberate rather than an oversight:
 *
 * - **Provisional member of a real layer** (`telemetry`, in Core Framework
 *   below). Use when a layer's rules are *all true* of the package today. The
 *   package gets that layer's full rule set, enforced — for Core Framework that
 *   means no React, no cross-package edge, and inclusion in the source set
 *   `arch:deps:core` cruises. What #495 may change is the label, not whether
 *   the package is guarded.
 * - **`INTERIM_UNCLASSIFIED_PACKAGES`** (`ui-kit`). Use when *no* layer's rules
 *   are true, so joining one would assert something false. The package is still
 *   named, allowlisted and covered by rules that mention it directly, but no
 *   layer rule set is applied to it.
 *
 * The test is "are this layer's rules true of the package", not "is this layer
 * a plausible eventual home". Pick the strictest layer whose rules genuinely
 * hold; if none does, use the interim list. Enforcement is what matters while
 * the taxonomy is unsettled — moving `telemetry` to the interim list for the
 * sake of symmetry would trade real guards for tidiness.
 */

// Core Framework layer (DESIGN §1.3): the agnostic runtime substrate, the
// concrete type-system provider behind its opaque port, and the protocol
// surface. Directory names under `packages/`.
//
// `telemetry` is a provisional member (see the note above). Core Framework's
// rules are all true of it today — it is a standalone browser SDK with one
// third-party dependency and zero `@gears-frontx` edges, which is exactly what
// `frontx-single-intra-ecosystem-edge-telemetry-standalone` in the root
// `.dependency-cruiser.cjs` already asserts. #495 decides the label; if it
// moves telemetry somewhere looser, nothing was under-enforced in the meantime.
const CORE_FRAMEWORK_PACKAGES = Object.freeze(['api', 'gts-plugin', 'mfes', 'telemetry']);

// Tooling layer (DESIGN §1.3): the lifecycle CLI and the AI Tooling Framework
// kit that drives it. Directory names under `packages/`.
const TOOLING_PACKAGES = Object.freeze(['cli', 'cyber-pilot-kit-frontx']);

// Build-time config packages. `internal/*` is a root workspace just like
// `packages/*`, so these are `@gears-frontx/*` packages the layering has to
// account for — a package consuming one is declaring a real workspace edge, even
// though the edge only exists at lint/build time. Directory names under
// `internal/`.
const INTERNAL_TOOLING_PACKAGES = Object.freeze(['eslint-config', 'depcruise-config']);

/**
 * Packages for which no existing layer's rules are true — see the note above
 * for how this differs from provisional membership of a real layer.
 *
 * This is not an escape hatch, and membership here is not free: a package
 * listed here still gets its manifest edges allowlisted below, still has to be
 * added deliberately, still fails the workspace coverage check if dropped, and
 * is still covered by whatever import-graph rules name it directly. What it
 * does *not* get is a layer's rule set applied to it on a guess.
 *
 * `ui-kit` is here because it is a React component library: Core Framework
 * forbids React outright, and Tooling is about lifecycle commands, so asserting
 * either would be false. #495 owns the decision — the root config's two
 * `frontx-ui-kit-interim-*` rules isolate it in the meantime and say the same
 * thing. This list should be empty; a non-empty entry is a debt with a ticket.
 */
const INTERIM_UNCLASSIFIED_PACKAGES = Object.freeze(['ui-kit']);

// Every ecosystem package, in layer order.
const ECOSYSTEM_PACKAGES = Object.freeze([
  ...CORE_FRAMEWORK_PACKAGES,
  ...TOOLING_PACKAGES,
  ...INTERNAL_TOOLING_PACKAGES,
  ...INTERIM_UNCLASSIFIED_PACKAGES,
]);

/**
 * Directory of each ecosystem package, relative to the repo root. The two
 * workspace roots (`packages/*`, `internal/*`) mean a package's name does not
 * determine its location, so anything resolving a package directory must go
 * through this map rather than assuming a prefix.
 */
const ECOSYSTEM_PACKAGE_DIRS = Object.freeze(
  Object.fromEntries([
    ...CORE_FRAMEWORK_PACKAGES.map((name) => [name, `packages/${name}`]),
    ...TOOLING_PACKAGES.map((name) => [name, `packages/${name}`]),
    ...INTERNAL_TOOLING_PACKAGES.map((name) => [name, `internal/${name}`]),
    ...INTERIM_UNCLASSIFIED_PACKAGES.map((name) => [name, `packages/${name}`]),
  ])
);

/**
 * The complete set of `@gears-frontx/*` package.json edges the boundary model
 * permits, keyed by the depending package's directory name. An ecosystem package
 * declaring any `@gears-frontx/*` dependency outside its entry here is a layer
 * violation — which is also how the template boundary is enforced: no
 * template-side package name appears in any allowlist, so an ecosystem package
 * that starts depending on one fails without the guard needing to know the
 * template's identity or location.
 *
 * Each entry splits the edges by what the dependency group *means*, because the
 * two are not interchangeable:
 *
 * - `runtime` — `dependencies` + `peerDependencies`. These are the layering
 *   proper: an edge here ships to consumers and constrains the
 *   architecture. Keep these minimal and justified individually.
 * - `dev` — `devDependencies`. Build/lint config consumed at development time
 *   only. Still allowlisted rather than waved through, so a genuine
 *   boundary-crossing coupling cannot hide by being declared under devDeps, but
 *   held separately so that legitimately depending on a shared ESLint config is
 *   not reported as a runtime layer violation.
 *
 * An omitted or empty list means "zero @gears-frontx dependencies in that group".
 */
const ALLOWED_ECOSYSTEM_EDGES = Object.freeze({
  // ---- Core Framework ----
  api: Object.freeze({
    runtime: Object.freeze([]),
    dev: Object.freeze([
      // Shared lint/architecture config, required by `eslint.config.js` and
      // `.dependency-cruiser.cjs`. Build-time only — nothing under `src/` may
      // import these, which `core-no-gears-frontx-imports` enforces separately.
      '@gears-frontx/eslint-config',
      '@gears-frontx/depcruise-config',
    ]),
  }),
  mfes: Object.freeze({
    runtime: Object.freeze([
      // Optional peer only — the injection contract for the default type-substrate
      // provider (`cpt-frontx-adr-default-type-substrate-provider`). The runtime
      // must not *import* it; that direction is forbidden by
      // `core-no-gears-frontx-imports` in core.cjs and by the MFES-4 boundary
      // check in `npm run arch:check`.
      '@gears-frontx/gts-plugin',
    ]),
    dev: Object.freeze([]),
  }),
  // Standalone browser SDK: no `@gears-frontx` edge in either group. Asserted
  // rather than assumed — an empty entry here is what makes adding one fail.
  telemetry: Object.freeze({ runtime: Object.freeze([]), dev: Object.freeze([]) }),
  'gts-plugin': Object.freeze({
    runtime: Object.freeze([
      // The type-substrate port: the provider implements the runtime's opaque
      // port, so it imports the port's types from the runtime. This is the
      // `GTS -- "type-substrate port" --> MFES` edge of the DESIGN §1.3
      // diagram, specified in `architecture/features/type-substrate-port/`.
      '@gears-frontx/mfes',
    ]),
    dev: Object.freeze([]),
  }),

  // ---- Tooling ----
  cli: Object.freeze({ runtime: Object.freeze([]), dev: Object.freeze([]) }),
  // KIT --> CLI is a *command-surface* relationship, not a package edge: the AI
  // upgrade orchestration (`cpt-frontx-adr-ai-driven-upgrade-orchestration`)
  // invokes the `frontx` CLI as a process, deliberately without depending on it
  // (see the wiring commit "command-surface-only, no package edge"). The
  // import-graph side of that is `frontx-single-intra-ecosystem-edge-kit-standalone`
  // in the root `.dependency-cruiser.cjs`; listing `@gears-frontx/cli` here would
  // permit exactly the manifest edge the ADR forbids.
  'cyber-pilot-kit-frontx': Object.freeze({
    runtime: Object.freeze([]),
    dev: Object.freeze([]),
  }),

  // ---- Build-time config (internal/*) ----
  // These sit below everything: a config package depending on another ecosystem
  // package would invert the build order.
  'eslint-config': Object.freeze({ runtime: Object.freeze([]), dev: Object.freeze([]) }),
  'depcruise-config': Object.freeze({ runtime: Object.freeze([]), dev: Object.freeze([]) }),

  // ---- Layer pending (#495) ----
  // React and react-dom are peers, not `@gears-frontx` edges, so the isolation
  // asserted here is the same one the interim depcruise rules assert: no
  // intra-ecosystem package edge in either direction.
  'ui-kit': Object.freeze({ runtime: Object.freeze([]), dev: Object.freeze([]) }),
});

/**
 * Edges the boundary model requires to exist, asserted positively so the guard
 * fails if the port is silently dropped rather than only when an extra edge
 * appears. `[dependingPackageDir, dependencyName, whatItIs]`.
 */
const REQUIRED_ECOSYSTEM_EDGES = Object.freeze([
  Object.freeze(['gts-plugin', '@gears-frontx/mfes', 'type-substrate port']),
]);

/**
 * The one ecosystem package permitted to import another. Kept separate from
 * `ALLOWED_ECOSYSTEM_EDGES` because `mfes -> gts-plugin` is a manifest-level
 * injection contract with no matching import edge: at the import-graph level
 * the Core Framework is import-acyclic and only this package may reach across.
 */
const CORE_FRAMEWORK_IMPORT_PORT = Object.freeze({
  from: 'gts-plugin',
  to: 'mfes',
});

/**
 * Regex source matching every Core Framework package's src root, for depcruise
 * `from`/`to` path rules. Derived from the membership list above so the rules
 * and the manifest guard cannot drift.
 */
const CORE_FRAMEWORK_SRC_PATTERN = `^packages/(${CORE_FRAMEWORK_PACKAGES.join('|')})/src`;

/**
 * A `@gears-frontx/*` import reaches dependency-cruiser under one of three
 * resolved shapes, and a `to` rule that covers only one of them is a rule that
 * silently never fires. `preserveSymlinks` is false by default, so the shape you
 * would expect — `node_modules/@gears-frontx/<pkg>` — is in practice the one you
 * almost never see:
 *
 * 1. In-tree, symlink resolved: a workspace package resolves *through* the
 *    `node_modules/@gears-frontx/<pkg>` symlink to its real path, e.g.
 *    `@gears-frontx/mfes` -> `packages/mfes/dist/index.cjs`.
 * 2. Under `node_modules/`: a genuinely installed (non-workspace-linked) copy.
 * 3. Unresolvable: `resolved` falls back to the bare specifier, which is how a
 *    reference to a template-side package (`@gears-frontx/framework`, absent
 *    from the ecosystem tree) shows up. Matching it is what keeps the template
 *    boundary enforced at the import-graph level too.
 *
 * `ECOSYSTEM_TARGET_PATTERN` covers shape 1 and captures the target package name
 * so rules can exempt a module's own package; `BARE_SPECIFIER_PATTERN` covers
 * shapes 2 and 3.
 */
const ECOSYSTEM_TARGET_PATTERN = `^(${Object.values(ECOSYSTEM_PACKAGE_DIRS)
  .map((dir) => dir.replace('/', '\\/'))
  .join('|')})/`;
const BARE_SPECIFIER_PATTERN = '(^|/)@gears-frontx/';

/** Both shapes, for use as a `to.path` alternation. */
const GEARS_FRONTX_TARGET_PATTERNS = Object.freeze([
  ECOSYSTEM_TARGET_PATTERN,
  BARE_SPECIFIER_PATTERN,
]);

module.exports = {
  CORE_FRAMEWORK_PACKAGES,
  TOOLING_PACKAGES,
  INTERNAL_TOOLING_PACKAGES,
  INTERIM_UNCLASSIFIED_PACKAGES,
  ECOSYSTEM_PACKAGES,
  ECOSYSTEM_PACKAGE_DIRS,
  ALLOWED_ECOSYSTEM_EDGES,
  REQUIRED_ECOSYSTEM_EDGES,
  CORE_FRAMEWORK_IMPORT_PORT,
  CORE_FRAMEWORK_SRC_PATTERN,
  ECOSYSTEM_TARGET_PATTERN,
  BARE_SPECIFIER_PATTERN,
  GEARS_FRONTX_TARGET_PATTERNS,
};
