/**
 * FrontX Dependency Cruiser Configuration (Ecosystem Root)
 *
 * Contains the dependency rules for the FrontX ecosystem packages (mfes,
 * gts-plugin, api, cli, cyber-pilot-kit-frontx).
 *
 * The non-Pillar-1 packages (state, i18n, framework, react, auth, studio)
 * and the host app now live in the self-contained top-level
 * `template-standard/` (Phase 11 template-move); its template-internal
 * layering/isolation rules moved into its own `.dependency-cruiser.cjs`.
 * Once template-standard is no longer an npm workspace of this repo,
 * ecosystem packages have no module-resolution path into it at all — the
 * forbid rules below enforce that boundary generically (by shape, not by
 * naming the template's path), so they keep working if the template's
 * location or identity changes.
 */

module.exports = {
  forbidden: [
    // ============ L0 BASE: UNIVERSAL RULES ============
    {
      name: 'no-circular',
      severity: 'error',
      from: { path: '^(?!.*node_modules)' },
      to: { circular: true },
      comment: 'Circular dependencies create tight coupling and make code harder to reason about.',
    },

    // ============ @gears-frontx/mfes BOUNDARY STUBS ============
    {
      name: 'mfes-no-type-format-literals',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-no-type-format-literals (MFES-1) — @gears-frontx/mfes must contain no type-system-format string literals.',
    },
    {
      name: 'mfes-no-solution-shared-properties',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-no-solution-shared-properties (MFES-2)',
    },
    {
      name: 'mfes-no-layout-domain-values',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-no-layout-domain-values (MFES-3)',
    },
    {
      name: 'mfes-no-type-format-dependency',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-no-type-format-dependency (MFES-4)',
    },
    {
      name: 'mfes-opaque-schema-surface',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-mfes-opaque-schema-surface (MFES-5)',
    },

    // ============ @gears-frontx/gts-plugin BOUNDARY STUBS ============
    {
      name: 'gts-plugin-owns-infra-schemas',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-gts-plugin-owns-infra-schemas (GTS-PLUGIN-1)',
    },
    {
      name: 'gts-plugin-excludes-solution-schemas',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-gts-plugin-excludes-solution-schemas (GTS-PLUGIN-2)',
    },

    // ============ @gears-frontx/api BOUNDARY STUB ============
    {
      name: 'api-no-solution-content',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-api-no-solution-content (API-1)',
    },

    // ============ @gears-frontx/cli BOUNDARY STUB ============
    {
      name: 'cli-template-independence',
      severity: 'warn',
      from: {},
      to: {},
      comment: 'STUB: cpt-frontx-constraint-cli-template-independence (CLI-1)',
    },

    // ============ PILLAR-1 BOUNDARY ENFORCEMENT (Phase 10) ============

    // @cpt-begin:cpt-frontx-constraint-mfes-no-type-format-dependency:p10:inst-dep-cruiser-rule
    {
      name: 'frontx-mfes-4-type-format-dep',
      severity: 'error',
      from: { path: '^packages/mfes/' },
      to: { path: '^packages/gts-plugin/|node_modules/@globaltypesystem/' },
      comment: 'cpt-frontx-constraint-mfes-no-type-format-dependency (MFES-4): @gears-frontx/mfes must declare no dependency on any concrete type-format implementation.',
    },
    // @cpt-end:cpt-frontx-constraint-mfes-no-type-format-dependency:p10:inst-dep-cruiser-rule

    // @cpt-begin:cpt-frontx-constraint-gts-plugin-owns-infra-schemas:p10:inst-dep-cruiser-rule
    {
      name: 'frontx-gts-plugin-1-infra-schemas',
      severity: 'error',
      from: { path: '^packages/', pathNot: '^packages/gts-plugin/' },
      to: { path: '^packages/gts-plugin/src/frontx\\.mfes/' },
      comment: 'cpt-frontx-constraint-gts-plugin-owns-infra-schemas (GTS-PLUGIN-1): Infrastructure schemas are owned exclusively by @gears-frontx/gts-plugin.',
    },
    // @cpt-end:cpt-frontx-constraint-gts-plugin-owns-infra-schemas:p10:inst-dep-cruiser-rule

    // @cpt-begin:cpt-frontx-constraint-gts-plugin-excludes-solution-schemas:p10:inst-dep-cruiser-rule
    {
      name: 'frontx-gts-plugin-2-no-solution-schemas',
      severity: 'error',
      from: { path: '^packages/gts-plugin/' },
      to: { path: '^(?!packages/|node_modules/|internal/|scripts/).+' },
      comment: 'cpt-frontx-constraint-gts-plugin-excludes-solution-schemas (GTS-PLUGIN-2): @gears-frontx/gts-plugin must not import solution-specific schemas.',
    },
    // @cpt-end:cpt-frontx-constraint-gts-plugin-excludes-solution-schemas:p10:inst-dep-cruiser-rule

    // @cpt-begin:cpt-frontx-constraint-api-no-solution-content:p10:inst-dep-cruiser-rule
    {
      name: 'frontx-api-1-no-solution-content',
      severity: 'error',
      from: { path: '^packages/api/src/', pathNot: '__tests__' },
      to: { path: '^(?!packages/|node_modules/|internal/|scripts/).+' },
      comment: 'cpt-frontx-constraint-api-no-solution-content (API-1): @gears-frontx/api production surface must contain no solution-specific content.',
    },
    // @cpt-end:cpt-frontx-constraint-api-no-solution-content:p10:inst-dep-cruiser-rule

    {
      name: 'frontx-telemetry-1-no-template-content',
      severity: 'error',
      from: { path: '^packages/telemetry/src/', pathNot: '__tests__' },
      to: { path: '^(?!packages/|node_modules/|internal/|scripts/).+' },
      comment:
        'ecosystem-boundaries: @gears-frontx/telemetry is an ecosystem package and must not import template territory at the source level.',
    },

    // ============ PILLAR-2 BOUNDARY ENFORCEMENT (Phase 17) ============

    // @cpt-begin:cpt-frontx-constraint-cli-template-independence:p17:inst-dep-cruiser-rule
    // Scoped to SHIPPED source only (packages/cli/src, excluding the
    // auto-generated version registry). packages/cli/templates/ and
    // packages/cli/template-sources/ are fixture/scratch dirs (NOT shipped —
    // package.json "files": ["dist"]) that legitimately contain template
    // names/content; they must never trip the CLI-1 boundary check.
    {
      name: 'frontx-cli-1-no-bundled-template-content',
      severity: 'error',
      from: { path: '^packages/cli/src/', pathNot: '^packages/cli/src/generated/' },
      to: { path: '^(?!packages/|node_modules/|internal/|scripts/).+', dependencyTypesNot: ['core'] },
      comment: 'cpt-frontx-constraint-cli-template-independence (CLI-1): @gears-frontx/cli must have zero dependency on bundled template content/assets/packages. Templates are resolved by source-spec at runtime.',
    },
    // @cpt-end:cpt-frontx-constraint-cli-template-independence:p17:inst-dep-cruiser-rule

    // ============ PILLAR-3 BOUNDARY ENFORCEMENT (Phase 20) ============

    // @cpt-begin:cpt-frontx-adr-ai-driven-upgrade-orchestration:p20:inst-dep-cruiser-rule
    // DESIGN §3.4: "the inter-package dependency graph is intentionally
    // minimal. The single intra-ecosystem package dependency is the MFE
    // Runtime's consumption of the Type System plugin... The API Protocol
    // Surface, the CLI, and the AI Tooling Framework hold no intra-ecosystem
    // package dependencies. Coordination between the AI Tooling Framework
    // and the CLI is an orchestration relationship over the CLI's command
    // surface, not a compile-time package dependency." (ADR-0027
    // cpt-frontx-adr-ai-driven-upgrade-orchestration). These two rules
    // together enforce that the ONLY intra-ecosystem package edge is
    // @gears-frontx/mfes -> @gears-frontx/gts-plugin — in particular they
    // forbid @gears-frontx/cyber-pilot-kit-frontx -> @gears-frontx/cli
    // (reopened after a prior run shipped that edge).
    {
      name: 'frontx-single-intra-ecosystem-edge-api-standalone',
      severity: 'error',
      from: { path: '^packages/api/src/' },
      to: { path: '^packages/(mfes|gts-plugin|cli|cyber-pilot-kit-frontx|telemetry)/' },
      comment:
        'cpt-frontx-adr-ai-driven-upgrade-orchestration: @gears-frontx/api holds no intra-ecosystem package dependency.',
    },
    {
      name: 'frontx-single-intra-ecosystem-edge-cli-standalone',
      severity: 'error',
      from: { path: '^packages/cli/src/' },
      to: { path: '^packages/(mfes|gts-plugin|api|cyber-pilot-kit-frontx|telemetry)/' },
      comment:
        'cpt-frontx-adr-ai-driven-upgrade-orchestration: @gears-frontx/cli holds no intra-ecosystem package dependency.',
    },
    {
      name: 'frontx-single-intra-ecosystem-edge-kit-standalone',
      severity: 'error',
      from: { path: '^packages/cyber-pilot-kit-frontx/src/' },
      to: { path: '^packages/(mfes|gts-plugin|api|cli|telemetry)/' },
      comment:
        'cpt-frontx-adr-ai-driven-upgrade-orchestration: @gears-frontx/cyber-pilot-kit-frontx holds no intra-ecosystem package dependency — in particular no @gears-frontx/cli edge; it coordinates with the CLI only over its command/invocation surface.',
    },
    {
      name: 'frontx-single-intra-ecosystem-edge-mfes-gts-plugin-only',
      severity: 'error',
      from: { path: '^packages/mfes/src/' },
      to: { path: '^packages/(api|cli|cyber-pilot-kit-frontx|telemetry)/' },
      comment:
        'cpt-frontx-adr-ai-driven-upgrade-orchestration: the only intra-ecosystem package edge is @gears-frontx/mfes -> @gears-frontx/gts-plugin (via the type-substrate port); @gears-frontx/mfes must not depend on @gears-frontx/api, @gears-frontx/cli, or @gears-frontx/cyber-pilot-kit-frontx.',
    },
    {
      name: 'frontx-single-intra-ecosystem-edge-telemetry-standalone',
      severity: 'error',
      from: { path: '^packages/telemetry/src/' },
      to: { path: '^packages/(mfes|gts-plugin|api|cli|cyber-pilot-kit-frontx)/' },
      comment:
        'cpt-frontx-adr-ai-driven-upgrade-orchestration: @gears-frontx/telemetry holds no intra-ecosystem package dependency.',
    },
    // @cpt-end:cpt-frontx-adr-ai-driven-upgrade-orchestration:p20:inst-dep-cruiser-rule
  ],
  options: {
    doNotFollow: '^node_modules',
    exclude: {
      dynamic: true,
      // `.claude/worktrees` are disposable agent-spawned repo checkouts, not
      // part of the ecosystem's own dependency graph.
      path: 'packages/.*/dist|node_modules|packages/mfes/mfes|packages/cli/templates|packages/cli/template-sources|\\.claude',
    },
  },
};
