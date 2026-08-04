/**
 * F1 Ecosystem Distribution & Versioning Policy — per-concern
 * INDEPENDENT versioning: edge-compatibility check on the single
 * `@gears-frontx/mfes -> @gears-frontx/gts-plugin` compile-time coupling
 * edge, registry-side deprecation gate, and the independent
 * consumer-upgrade check.
 *
 * This is the EXISTING CI/release tooling extension point for the FrontX
 * ecosystem's per-concern, independent artifact-distribution policy
 * (`cpt-frontx-adr-artifact-versioning-and-distribution`,
 * `cpt-frontx-contract-package-registry-distribution`). It reads the five
 * ecosystem artifacts' `package.json` files directly — no new release
 * platform (changesets/lerna/semantic-release) is introduced; this module is
 * wired into the existing `.github/workflows/publish-packages.yml` workflow
 * and the existing `npm run` script surface (`policy:version-check`) exactly
 * the way `scripts/check-test-dependency-versions.mjs` is wired into `lint`.
 *
 * There is NO matched-major/minor gate and NO in-package lifecycle-state
 * field: each artifact publishes on its own semver line/cadence, and
 * deprecation/removal are modeled entirely as REGISTRY-side state (`npm
 * deprecate` + dist-tags), never as source-side data.
 *
 * CLI entry: `node scripts/ecosystem-version-policy.mjs` (exit 0 on success).
 * Core logic is exported for unit tests in
 * `scripts/ecosystem-version-policy.test.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * The five FrontX ecosystem artifacts this policy governs
 * (DESIGN §1.3). Directory names are relative to
 * `packages/`. Descriptive, non-binding per ADR-0001 "More Information" —
 * adding/retiring an artifact requires no amendment to the policy itself,
 * only to this enumeration.
 */
export const ecosystemArtifactDirs = ['mfes', 'gts-plugin', 'api', 'cli', 'cyber-pilot-kit-frontx'];

/** Required npm publish scope — never `@cyberfabric`. */
export const requiredNpmScope = '@gears-frontx';

/** The name of the one coupled edge's consumer artifact. */
export const coupledEdgeConsumer = '@gears-frontx/mfes';

/** The name of the one coupled edge's provider artifact. */
export const coupledEdgeProvider = '@gears-frontx/gts-plugin';

/**
 * Minimum registry-side deprecation window (target — FEATURE.md flags the
 * exact duration as "to be specified by release policy"). 90 days matches
 * this ecosystem's pre-1.0 alpha release cadence and gives consumers a full
 * quarter to migrate before a version may transition DEPRECATED -> REMOVED.
 */
export const minimumDeprecationWindowMs = 90 * 24 * 60 * 60 * 1000;

/**
 * @param {string} version A semver-like string, e.g. "0.3.0-alpha.0".
 * @returns {{ major: number; minor: number; patch: number; prerelease: string | undefined }}
 */
export function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(version ?? '');
  if (!match) {
    throw new Error(`Cannot parse semver version from "${version}"`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] };
}

/**
 * @param {string} version A semver-like string, e.g. "0.3.0-alpha.0".
 * @returns {{ major: number; minor: number }}
 */
export function parseMajorMinor(version) {
  const { major, minor } = parseVersion(version);
  return { major, minor };
}

/**
 * Compares two parsed versions by release tuple (major.minor.patch), then by
 * prerelease presence (a prerelease sorts below its corresponding release).
 *
 * @param {{ major: number; minor: number; patch: number; prerelease?: string }} a
 * @param {{ major: number; minor: number; patch: number; prerelease?: string }} b
 * @returns {number} negative if a < b, 0 if equal, positive if a > b
 */
export function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && b.prerelease) return a.prerelease.localeCompare(b.prerelease);
  return 0;
}

/** Matches any semver range operator/wildcard — the ABSENCE of a match on a range string means it is an exact pin. */
const RANGE_OPERATOR_RE = /^[\^~]|[<>]=?|\*|x|X|\|\|/;

/**
 * Edge-Compatibility Check — exact-pin detection
 * (`cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check`).
 *
 * @param {string} range
 * @returns {boolean} true when `range` is an exact version pin (no range operator).
 */
export function isExactPin(range) {
  if (typeof range !== 'string' || range.trim().length === 0) {
    throw new Error('Cannot classify an empty or non-string dependency range');
  }
  return !RANGE_OPERATOR_RE.test(range.trim());
}

/**
 * @param {{ major: number; minor: number; patch: number }} base
 * @returns {{ major: number; minor: number; patch: number }} exclusive upper bound under npm caret (`^`) semantics.
 */
export function caretUpperBound(base) {
  if (base.major > 0) return { major: base.major + 1, minor: 0, patch: 0 };
  if (base.minor > 0) return { major: 0, minor: base.minor + 1, patch: 0 };
  return { major: 0, minor: 0, patch: base.patch + 1 };
}

/**
 * @param {{ major: number; minor: number; patch: number }} base
 * @returns {{ major: number; minor: number; patch: number }} exclusive upper bound under npm tilde (`~`) semantics.
 */
export function tildeUpperBound(base) {
  return { major: base.major, minor: base.minor + 1, patch: 0 };
}

/**
 * Parses a caret/tilde range into its operator and base version.
 *
 * @param {string} range
 * @returns {{ operator: '^' | '~'; base: ReturnType<typeof parseVersion> }}
 */
export function parseCaretOrTildeRange(range) {
  const trimmed = range.trim();
  const operator = trimmed[0];
  if (operator !== '^' && operator !== '~') {
    throw new Error(`Unsupported range operator in "${range}" — only caret (^) and tilde (~) ranges are supported`);
  }
  return { operator, base: parseVersion(trimmed.slice(1)) };
}

/**
 * @param {string} version
 * @param {string} range A caret/tilde range, e.g. "^0.3.0".
 * @returns {boolean} whether `version` satisfies `range`.
 */
export function versionSatisfiesRange(version, range) {
  const { operator, base } = parseCaretOrTildeRange(range);
  const parsedVersion = parseVersion(version);

  // A prerelease only satisfies a range comparator sharing its exact release
  // tuple (npm/semver default — prereleases are otherwise excluded so an
  // unrelated pre-release build never silently satisfies a stable range).
  if (
    parsedVersion.prerelease &&
    !(parsedVersion.major === base.major && parsedVersion.minor === base.minor && parsedVersion.patch === base.patch)
  ) {
    return false;
  }

  // Bound comparison ignores prerelease identifiers — an unrelated
  // prerelease was already excluded above, and a matching prerelease's
  // release tuple is what determines range membership.
  const versionTuple = { major: parsedVersion.major, minor: parsedVersion.minor, patch: parsedVersion.patch };
  const upper = operator === '^' ? caretUpperBound(base) : tildeUpperBound(base);
  return compareVersions(versionTuple, base) >= 0 && compareVersions(versionTuple, upper) < 0;
}

/**
 * Coupled-Edge Compatibility Check
 * (`cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check`).
 *
 * Input: the version range `@gears-frontx/mfes` declares on its
 * `@gears-frontx/gts-plugin` peer dependency, and the set of `gts-plugin`
 * versions published on the registry.
 * Output: PASS if the declared range is a satisfiable, non-exact semver
 * range; FAIL with the reason otherwise.
 *
 * @param {{ declaredRange: string; publishedVersions: string[] }} input
 * @returns {{ pass: boolean; reason?: string }}
 */
export function checkEdgeCompatibility(input) {
  // @cpt-algo:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1
  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-read-range
  const { declaredRange, publishedVersions } = input;
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-read-range

  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-if-pinned
  if (isExactPin(declaredRange)) {
    // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-return-pinned
    return {
      pass: false,
      reason: `"${declaredRange}" is an exact pin — an exact pin forces duplicate-runtime skew; a caret/range is required`,
    };
    // @cpt-end:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-return-pinned
  }
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-if-pinned

  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-resolve
  const satisfied = publishedVersions.some((version) => versionSatisfiesRange(version, declaredRange));
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-resolve

  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-if-unsat
  if (!satisfied) {
    // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-return-unsat
    return {
      pass: false,
      reason: `declared range "${declaredRange}" is unsatisfiable against published ${coupledEdgeProvider} versions: ${publishedVersions.join(', ') || '(none)'}`,
    };
    // @cpt-end:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-return-unsat
  }
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-if-unsat

  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-return-pass
  return { pass: true };
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check:p1:inst-edge-return-pass
}

/**
 * Read the `{name, version}` pair for every ecosystem artifact directly from
 * disk (no `frontxLifecycle` field — deprecation/removal are registry-side).
 *
 * @param {string} rootDir
 * @param {{ readFileSync?: typeof fs.readFileSync }} [options]
 * @returns {Array<{ name: string; dir: string; version: string }>}
 */
export function readEcosystemArtifacts(rootDir, options = {}) {
  const readFileSyncFn = options.readFileSync ?? fs.readFileSync;

  return ecosystemArtifactDirs.map((dir) => {
    const packageJsonPath = path.join(rootDir, 'packages', dir, 'package.json');
    const packageJson = JSON.parse(readFileSyncFn(packageJsonPath, 'utf8'));
    return { name: packageJson.name, dir, version: packageJson.version };
  });
}

/**
 * Reads the declared peer/caret range `@gears-frontx/mfes` declares on
 * `@gears-frontx/gts-plugin` directly from `packages/mfes/package.json`.
 *
 * @param {string} rootDir
 * @param {{ readFileSync?: typeof fs.readFileSync }} [options]
 * @returns {string | undefined}
 */
export function readDeclaredEdgeRange(rootDir, options = {}) {
  const readFileSyncFn = options.readFileSync ?? fs.readFileSync;
  const mfesPackageJsonPath = path.join(rootDir, 'packages', 'mfes', 'package.json');
  const mfesPackageJson = JSON.parse(readFileSyncFn(mfesPackageJsonPath, 'utf8'));
  return mfesPackageJson.peerDependencies?.[coupledEdgeProvider];
}

/**
 * Independent Per-Concern Publication flow
 * (`cpt-frontx-flow-ecosystem-distribution-independent-publication`).
 *
 * @param {{
 *   artifactName: string;
 *   changeClass: 'major' | 'minor' | 'patch';
 *   declaredEdgeRange?: string;
 *   publishedGtsPluginVersions?: string[];
 * }} input
 * @returns {{ pass: boolean; reason?: string }}
 */
export function runIndependentPublication(input) {
  // @cpt-flow:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1
  // @cpt-dod:cpt-frontx-dod-ecosystem-distribution-independent-publication:p1
  // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-trigger
  const { artifactName, changeClass, declaredEdgeRange, publishedGtsPluginVersions } = input;
  // @cpt-end:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-trigger

  // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-classify
  // The change class is determined independently of any sibling artifact's
  // version — no cross-artifact comparison occurs anywhere in this flow.
  const independentChangeClass = changeClass;
  // @cpt-end:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-classify

  // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-if-mfes
  if (artifactName === coupledEdgeConsumer) {
    // @cpt-dod:cpt-frontx-dod-ecosystem-distribution-edge-compatibility:p1
    // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-invoke-edge-check
    const edgeResult = checkEdgeCompatibility({
      declaredRange: declaredEdgeRange ?? '',
      publishedVersions: publishedGtsPluginVersions ?? [],
    });
    // @cpt-end:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-invoke-edge-check

    // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-if-edge-fail
    if (!edgeResult.pass) {
      // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-block
      const report = `publication of ${artifactName} blocked: ${edgeResult.reason}`;
      // @cpt-end:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-block

      // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-return-fail
      return { pass: false, reason: report };
      // @cpt-end:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-return-fail
    }
    // @cpt-end:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-if-edge-fail
  }
  // @cpt-end:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-if-mfes

  // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-publish
  // Publication itself is delegated to the existing `npm publish` step in
  // `.github/workflows/publish-packages.yml`; this flow only gates it. No
  // sibling artifact's version is read, compared, or required to change —
  // independent publication requires no matched-version gate.
  const publishGate = { artifactName, changeClass: independentChangeClass, blockedBySibling: false };
  // @cpt-end:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-publish

  // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-return-pass
  return { pass: true, reason: undefined, ...publishGate };
  // @cpt-end:cpt-frontx-flow-ecosystem-distribution-independent-publication:p1:inst-pub-return-pass
}

/**
 * Registry-Side Deprecation Cycle
 * (`cpt-frontx-algo-ecosystem-distribution-deprecation-gate`).
 *
 * There is no in-package lifecycle-state field; the cycle is realized
 * entirely through registry metadata (`npm deprecate` notice + elapsed time).
 *
 * @param {{
 *   deprecatedAt?: string;
 *   noticePublished?: boolean;
 *   now?: Date;
 *   windowMs?: number;
 * }} record
 * @returns {{ pass: boolean; reason?: string }}
 */
export function checkDeprecationGate(record) {
  // @cpt-dod:cpt-frontx-dod-ecosystem-distribution-deprecation-cycle-enforced:p1
  // @cpt-algo:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2
  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-read
  const now = record.now ?? new Date();
  const windowMs = record.windowMs ?? minimumDeprecationWindowMs;
  const deprecatedAt = record.deprecatedAt ? new Date(record.deprecatedAt) : undefined;
  const noticePublished = Boolean(record.noticePublished);
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-read

  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-if-no-notice
  const hasNotice = noticePublished && deprecatedAt !== undefined;
  if (!hasNotice) {
    // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-return-no-notice
    return { pass: false, reason: 'a published npm deprecate notice is required before removal' };
    // @cpt-end:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-return-no-notice
  }
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-if-no-notice

  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-elapsed
  const elapsedMs = now.getTime() - /** @type {Date} */ (deprecatedAt).getTime();
  const windowElapsed = elapsedMs >= windowMs;
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-elapsed

  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-if-window
  if (!windowElapsed) {
    // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-return-window
    return { pass: false, reason: 'the minimum deprecation window has not elapsed' };
    // @cpt-end:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-return-window
  }
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-if-window

  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-return-pass
  return { pass: true };
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-deprecation-gate:p2:inst-dep-return-pass
}

/**
 * Registry Version Availability State Machine
 * (`cpt-frontx-state-ecosystem-distribution-registry-version-availability`).
 *
 * Models the availability of a single published artifact VERSION as
 * recorded on the package registry (dist-tags + `npm deprecate` metadata).
 * Registry-side and descriptive — there is NO in-package lifecycle-state
 * field. States: ACTIVE (initial) -> DEPRECATED -> REMOVED.
 *
 * @param {'ACTIVE' | 'DEPRECATED' | 'REMOVED'} currentState
 * @param {'deprecate' | 'remove'} event
 * @param {{ deprecationNoticePublished?: boolean; deprecationGateResult?: { pass: boolean; reason?: string } }} [context]
 * @returns {{ pass: boolean; nextState?: 'DEPRECATED' | 'REMOVED'; reason?: string }}
 */
export function transitionRegistryVersionAvailability(currentState, event, context = {}) {
  // @cpt-state:cpt-frontx-state-ecosystem-distribution-registry-version-availability:p2
  if (event === 'deprecate') {
    // @cpt-begin:cpt-frontx-state-ecosystem-distribution-registry-version-availability:p2:inst-rva-active-to-deprecated
    if (currentState !== 'ACTIVE') {
      return { pass: false, reason: `cannot deprecate from state ${currentState}` };
    }
    if (!context.deprecationNoticePublished) {
      return { pass: false, reason: 'an npm deprecate notice must be published against the version on the registry' };
    }
    return { pass: true, nextState: 'DEPRECATED' };
    // @cpt-end:cpt-frontx-state-ecosystem-distribution-registry-version-availability:p2:inst-rva-active-to-deprecated
  }

  if (event === 'remove') {
    // @cpt-begin:cpt-frontx-state-ecosystem-distribution-registry-version-availability:p2:inst-rva-deprecated-to-removed
    if (currentState !== 'DEPRECATED') {
      return { pass: false, reason: `cannot remove from state ${currentState}` };
    }
    if (!context.deprecationGateResult?.pass) {
      return { pass: false, reason: context.deprecationGateResult?.reason ?? 'registry-side deprecation-cycle gate not satisfied' };
    }
    return { pass: true, nextState: 'REMOVED' };
    // @cpt-end:cpt-frontx-state-ecosystem-distribution-registry-version-availability:p2:inst-rva-deprecated-to-removed
  }

  return { pass: false, reason: `unknown event ${event}` };
}

/**
 * Builds the `npm deprecate` CLI arguments that realize an ACTIVE ->
 * DEPRECATED registry-side transition. Pure/testable — the caller decides
 * whether/how to execute it (`runCli`'s `--deprecate` mode below).
 *
 * @param {string} name
 * @param {string} version
 * @param {string} message
 * @returns {string[]}
 */
export function buildNpmDeprecateArgs(name, version, message) {
  return ['deprecate', `${name}@${version}`, message];
}

/**
 * Consumer Independent Upgrade flow
 * (`cpt-frontx-flow-ecosystem-distribution-consumer-upgrade`).
 *
 * @param {{
 *   requestedArtifact: {
 *     name: string;
 *     version: string;
 *     deprecationNotice?: { publishedAt: string; recommendedVersion: string; endOfLifeTarget?: string };
 *     declaredEdgeRange?: string;
 *   };
 *   projectDependencies: Array<{ name: string; version: string }>;
 * }} input
 * @returns {{ pass: boolean; reason?: string; warning?: string; conflict?: { name: string; version: string }; installed?: { name: string; version: string } }}
 */
export function checkConsumerUpgrade(input) {
  // @cpt-dod:cpt-frontx-dod-ecosystem-distribution-independent-upgrade:p1
  // @cpt-flow:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1
  // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-request
  const { requestedArtifact, projectDependencies } = input;
  // @cpt-end:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-request

  // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-resolve
  const resolved = requestedArtifact;
  // @cpt-end:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-resolve

  /** @type {string | undefined} */
  let warning;
  // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-if-deprecated
  if (resolved.deprecationNotice) {
    // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-warn-deprecated
    warning = `${resolved.name}@${resolved.version} carries a registry deprecation notice (published ${resolved.deprecationNotice.publishedAt}); recommended version: ${resolved.deprecationNotice.recommendedVersion}`;
    // @cpt-end:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-warn-deprecated
  }
  // @cpt-end:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-if-deprecated

  // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-if-coupled
  if (resolved.name === coupledEdgeConsumer || resolved.name === coupledEdgeProvider) {
    const isMfesRequest = resolved.name === coupledEdgeConsumer;
    const declaredEdgeRange = isMfesRequest
      ? resolved.declaredEdgeRange
      : projectDependencies.find((d) => d.name === coupledEdgeConsumer)?.declaredEdgeRange;
    const gtsPluginVersion = isMfesRequest
      ? projectDependencies.find((d) => d.name === coupledEdgeProvider)?.version
      : resolved.version;

    // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-check-edge
    const edgeSatisfied =
      declaredEdgeRange === undefined || gtsPluginVersion === undefined
        ? true // nothing to check yet — the counterpart artifact is not present in the project
        : versionSatisfiesRange(gtsPluginVersion, declaredEdgeRange);
    // @cpt-end:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-check-edge

    // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-if-edge-conflict
    if (!edgeSatisfied) {
      // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-report-conflict
      const report = `${coupledEdgeConsumer}'s declared peer range "${declaredEdgeRange}" is not satisfied by ${coupledEdgeProvider}@${gtsPluginVersion}`;
      // @cpt-end:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-report-conflict

      // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-return-conflict
      return {
        pass: false,
        reason: report,
        conflict: { name: coupledEdgeProvider, version: /** @type {string} */ (gtsPluginVersion) },
      };
      // @cpt-end:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-return-conflict
    }
    // @cpt-end:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-if-edge-conflict
  }
  // @cpt-end:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-if-coupled

  // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-install
  // Independent install: no other FrontX artifact's version is touched —
  // `projectDependencies` is read-only input to this check, never mutated,
  // which is itself the "no lockstep update" guarantee
  // (`cpt-frontx-dod-ecosystem-distribution-independent-upgrade`).
  const installed = { name: resolved.name, version: resolved.version };
  // @cpt-end:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-install

  // @cpt-begin:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-return-pass
  return { pass: true, warning, installed };
  // @cpt-end:cpt-frontx-flow-ecosystem-distribution-consumer-upgrade:p1:inst-cu-return-pass
}

/**
 * CI entry point: reads the five ecosystem artifacts' `package.json` files
 * and asserts the single `mfes -> gts-plugin` coupled edge declares a
 * satisfiable, non-exact-pinned semver range. There is NO cross-artifact
 * matched-version gate — the five artifacts are free to diverge. Wired into
 * `npm run policy:version-check` and `.github/workflows/publish-packages.yml`.
 *
 * @param {{ rootDir?: string; getPublishedGtsPluginVersions?: (artifacts: Array<{ name: string; dir: string; version: string }>) => string[] }} [options]
 * @returns {number} 0 on success, 1 on failure.
 */
export function runCli(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const artifacts = readEcosystemArtifacts(rootDir);
  const declaredEdgeRange = readDeclaredEdgeRange(rootDir);

  // Local/offline-friendly default: the currently checked-out `gts-plugin`
  // version stands in for "published registry versions" so this check is
  // deterministic without a live registry round-trip. CI environments with
  // registry access may inject `getPublishedGtsPluginVersions` to widen the
  // check against every version actually published.
  const gtsPluginArtifact = artifacts.find((a) => a.name === coupledEdgeProvider);
  const publishedGtsPluginVersions = options.getPublishedGtsPluginVersions
    ? options.getPublishedGtsPluginVersions(artifacts)
    : [gtsPluginArtifact?.version ?? ''].filter(Boolean);

  const result = runIndependentPublication({
    artifactName: coupledEdgeConsumer,
    changeClass: 'patch',
    declaredEdgeRange,
    publishedGtsPluginVersions,
  });

  if (!result.pass) {
    console.error(`[ecosystem-version-policy] FAIL: ${result.reason}`);
    console.error(
      '\nEdge-compatibility check failed. @gears-frontx/mfes must declare a satisfiable, non-exact-pinned ' +
        "semver range (peer/caret) on @gears-frontx/gts-plugin — the ecosystem's one compile-time coupling edge.",
    );
    return 1;
  }

  console.log(
    `Edge-compatibility check passed: ${coupledEdgeConsumer} declares "${declaredEdgeRange}" on ${coupledEdgeProvider} ` +
      `(satisfied by: ${publishedGtsPluginVersions.join(', ')}). Independent publication holds for: ` +
      `${artifacts.map((a) => `${a.name}@${a.version}`).join(', ')}.`,
  );
  return 0;
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  process.exit(runCli());
}
