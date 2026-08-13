// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildNpmDeprecateArgs,
  caretUpperBound,
  checkConsumerUpgrade,
  checkDeprecationGate,
  checkEdgeCompatibility,
  compareVersions,
  coupledEdgeConsumer,
  coupledEdgeProvider,
  ecosystemArtifactDirs,
  isExactPin,
  minimumDeprecationWindowMs,
  parseMajorMinor,
  parseVersion,
  readDeclaredEdgeRange,
  readEcosystemArtifacts,
  runCli,
  runIndependentPublication,
  tildeUpperBound,
  transitionRegistryVersionAvailability,
  versionSatisfiesRange,
} from './ecosystem-version-policy.mjs';

describe('parseVersion / parseMajorMinor', () => {
  it('extracts major/minor/patch/prerelease from a pre-release version', () => {
    expect(parseVersion('0.3.0-alpha.0')).toEqual({ major: 0, minor: 3, patch: 0, prerelease: 'alpha.0' });
  });

  it('extracts major/minor/patch from a plain release version', () => {
    expect(parseVersion('2.10.4')).toEqual({ major: 2, minor: 10, patch: 4, prerelease: undefined });
  });

  it('throws on an unparseable version', () => {
    expect(() => parseVersion('not-a-version')).toThrow();
  });

  it('parseMajorMinor extracts only major/minor', () => {
    expect(parseMajorMinor('0.3.0-alpha.0')).toEqual({ major: 0, minor: 3 });
  });
});

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions(parseVersion('1.0.0'), parseVersion('0.9.9'))).toBeGreaterThan(0);
    expect(compareVersions(parseVersion('0.3.1'), parseVersion('0.3.0'))).toBeGreaterThan(0);
    expect(compareVersions(parseVersion('0.3.0'), parseVersion('0.3.0'))).toBe(0);
  });

  it('sorts a prerelease below its corresponding release', () => {
    expect(compareVersions(parseVersion('0.3.0-alpha.0'), parseVersion('0.3.0'))).toBeLessThan(0);
  });
});

describe('isExactPin — cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check', () => {
  it('classifies a bare version as an exact pin', () => {
    expect(isExactPin('0.3.0-alpha.0')).toBe(true);
    expect(isExactPin('1.2.3')).toBe(true);
  });

  it('classifies a caret range as NOT an exact pin', () => {
    expect(isExactPin('^0.3.0')).toBe(false);
  });

  it('classifies a tilde range as NOT an exact pin', () => {
    expect(isExactPin('~0.3.0')).toBe(false);
  });

  it('throws on an empty range', () => {
    expect(() => isExactPin('')).toThrow();
  });
});

describe('caretUpperBound / tildeUpperBound', () => {
  it('caret on a >=1.0.0 base bounds to the next major', () => {
    expect(caretUpperBound(parseVersion('1.2.3'))).toEqual({ major: 2, minor: 0, patch: 0 });
  });

  it('caret on a 0.x.y (x>0) base bounds to the next minor', () => {
    expect(caretUpperBound(parseVersion('0.3.0'))).toEqual({ major: 0, minor: 4, patch: 0 });
  });

  it('caret on a 0.0.z base bounds to the next patch', () => {
    expect(caretUpperBound(parseVersion('0.0.5'))).toEqual({ major: 0, minor: 0, patch: 6 });
  });

  it('tilde bounds to the next minor regardless of major', () => {
    expect(tildeUpperBound(parseVersion('0.3.0'))).toEqual({ major: 0, minor: 4, patch: 0 });
  });
});

describe('versionSatisfiesRange', () => {
  it('a caret range on a 0.x base admits only the same minor line', () => {
    expect(versionSatisfiesRange('0.3.5', '^0.3.0')).toBe(true);
    expect(versionSatisfiesRange('0.4.0', '^0.3.0')).toBe(false);
  });

  it('a matching prerelease satisfies the range for its own release tuple', () => {
    expect(versionSatisfiesRange('0.3.0-alpha.1', '^0.3.0')).toBe(true);
  });

  it('an unrelated prerelease does not satisfy the range', () => {
    expect(versionSatisfiesRange('0.4.0-alpha.0', '^0.3.0')).toBe(false);
  });

  it('throws on an unsupported operator', () => {
    expect(() => versionSatisfiesRange('1.0.0', '>=1.0.0')).toThrow();
  });
});

// @cpt-dod:cpt-frontx-dod-ecosystem-distribution-edge-compatibility:p1
describe('checkEdgeCompatibility — cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check', () => {
  it('fails when the declared range is an exact pin', () => {
    const result = checkEdgeCompatibility({ declaredRange: '0.3.0-alpha.0', publishedVersions: ['0.3.0-alpha.0'] });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('exact pin');
  });

  it('fails when the declared range is unsatisfiable against published versions', () => {
    const result = checkEdgeCompatibility({ declaredRange: '^1.0.0', publishedVersions: ['0.3.0-alpha.0'] });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('unsatisfiable');
  });

  it('passes when the declared caret range is satisfied by a published version', () => {
    const result = checkEdgeCompatibility({ declaredRange: '^0.3.0', publishedVersions: ['0.3.0-alpha.0', '0.3.1'] });

    expect(result).toEqual({ pass: true });
  });
});

describe('readDeclaredEdgeRange / readEcosystemArtifacts', () => {
  /** @type {string[]} */
  const cleanupDirs = [];

  afterEach(async () => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  /**
   * @param {Record<string, { version: string; peerDependencies?: Record<string, string> }>} artifacts
   * @returns {Promise<string>}
   */
  async function makeFixtureRoot(artifacts) {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'ecosystem-version-policy-'));
    cleanupDirs.push(rootDir);

    for (const dir of ecosystemArtifactDirs) {
      const pkgDir = path.join(rootDir, 'packages', dir);
      await mkdir(pkgDir, { recursive: true });
      const entry = artifacts[dir];
      await writeFile(
        path.join(pkgDir, 'package.json'),
        JSON.stringify(
          {
            name: `@gears-frontx/${dir}`,
            version: entry.version,
            ...(entry.peerDependencies ? { peerDependencies: entry.peerDependencies } : {}),
          },
          null,
          2,
        ),
      );
    }

    return rootDir;
  }

  it('reads all five ecosystem artifacts with no frontxLifecycle field', async () => {
    const rootDir = await makeFixtureRoot({
      mfes: { version: '0.3.0-alpha.0', peerDependencies: { '@gears-frontx/gts-plugin': '^0.3.0' } },
      'gts-plugin': { version: '0.3.0-alpha.0' },
      api: { version: '0.2.0-alpha.0' },
      cli: { version: '0.1.0-alpha.0' },
      'cyber-pilot-kit-frontx': { version: '0.4.0-alpha.0' },
    });

    const artifacts = readEcosystemArtifacts(rootDir);

    expect(artifacts).toHaveLength(5);
    expect(artifacts.map((a) => a.name)).toContain(coupledEdgeConsumer);
    // Independent versioning: nothing forces the five versions equal.
    expect(new Set(artifacts.map((a) => a.version)).size).toBeGreaterThan(1);
    expect(artifacts.every((a) => !('frontxLifecycle' in a))).toBe(true);
  });

  it('reads the declared peer range mfes declares on gts-plugin', async () => {
    const rootDir = await makeFixtureRoot({
      mfes: { version: '0.3.0-alpha.0', peerDependencies: { '@gears-frontx/gts-plugin': '^0.3.0' } },
      'gts-plugin': { version: '0.3.0-alpha.0' },
      api: { version: '0.3.0-alpha.0' },
      cli: { version: '0.3.0-alpha.0' },
      'cyber-pilot-kit-frontx': { version: '0.3.0-alpha.0' },
    });

    expect(readDeclaredEdgeRange(rootDir)).toBe('^0.3.0');
  });
});

// @cpt-dod:cpt-frontx-dod-ecosystem-distribution-independent-publication:p1
describe('runIndependentPublication — cpt-frontx-flow-ecosystem-distribution-independent-publication', () => {
  it('passes for a non-mfes artifact regardless of sibling versions', () => {
    const result = runIndependentPublication({ artifactName: '@gears-frontx/api', changeClass: 'major' });

    expect(result).toEqual({ pass: true, reason: undefined, artifactName: '@gears-frontx/api', changeClass: 'major', blockedBySibling: false });
  });

  it('blocks mfes publication when its declared gts-plugin range is an exact pin', () => {
    const result = runIndependentPublication({
      artifactName: coupledEdgeConsumer,
      changeClass: 'patch',
      declaredEdgeRange: '0.3.0-alpha.0',
      publishedGtsPluginVersions: ['0.3.0-alpha.0'],
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('exact pin');
  });

  it('blocks mfes publication when its declared range is unsatisfiable', () => {
    const result = runIndependentPublication({
      artifactName: coupledEdgeConsumer,
      changeClass: 'patch',
      declaredEdgeRange: '^1.0.0',
      publishedGtsPluginVersions: ['0.3.0-alpha.0'],
    });

    expect(result.pass).toBe(false);
  });

  it('publishes mfes independently once the edge-compatibility check passes', () => {
    const result = runIndependentPublication({
      artifactName: coupledEdgeConsumer,
      changeClass: 'minor',
      declaredEdgeRange: '^0.3.0',
      publishedGtsPluginVersions: ['0.3.0-alpha.0'],
    });

    expect(result.pass).toBe(true);
    expect(result.blockedBySibling).toBe(false);
  });
});

// @cpt-dod:cpt-frontx-dod-ecosystem-distribution-deprecation-cycle-enforced:p1
describe('checkDeprecationGate — cpt-frontx-algo-ecosystem-distribution-deprecation-gate', () => {
  it('fails when no deprecation notice was published', () => {
    const result = checkDeprecationGate({ noticePublished: false });

    expect(result).toEqual({ pass: false, reason: 'a published npm deprecate notice is required before removal' });
  });

  it('fails when the minimum deprecation window has not elapsed', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const deprecatedAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const result = checkDeprecationGate({ deprecatedAt, noticePublished: true, now });

    expect(result).toEqual({ pass: false, reason: 'the minimum deprecation window has not elapsed' });
  });

  it('passes once the notice is published and the window has fully elapsed', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const deprecatedAt = new Date(now.getTime() - minimumDeprecationWindowMs - 1).toISOString();

    const result = checkDeprecationGate({ deprecatedAt, noticePublished: true, now });

    expect(result).toEqual({ pass: true });
  });
});

describe('buildNpmDeprecateArgs', () => {
  it('builds the npm deprecate CLI args for a version + message', () => {
    expect(buildNpmDeprecateArgs('@gears-frontx/api', '0.1.0', 'Use 0.3.x instead')).toEqual([
      'deprecate',
      '@gears-frontx/api@0.1.0',
      'Use 0.3.x instead',
    ]);
  });
});

// @cpt-dod:cpt-frontx-dod-ecosystem-distribution-deprecation-cycle-enforced:p1
describe('transitionRegistryVersionAvailability — cpt-frontx-state-ecosystem-distribution-registry-version-availability', () => {
  it('moves ACTIVE -> DEPRECATED once an npm deprecate notice is published', () => {
    const result = transitionRegistryVersionAvailability('ACTIVE', 'deprecate', { deprecationNoticePublished: true });

    expect(result).toEqual({ pass: true, nextState: 'DEPRECATED' });
  });

  it('refuses ACTIVE -> DEPRECATED without a published notice', () => {
    const result = transitionRegistryVersionAvailability('ACTIVE', 'deprecate', { deprecationNoticePublished: false });

    expect(result.pass).toBe(false);
  });

  it('refuses to skip a state (ACTIVE straight to REMOVED)', () => {
    const result = transitionRegistryVersionAvailability('ACTIVE', 'remove', { deprecationGateResult: { pass: true } });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('ACTIVE');
  });

  it('moves DEPRECATED -> REMOVED only once the registry-side deprecation-cycle gate passes', () => {
    const blocked = transitionRegistryVersionAvailability('DEPRECATED', 'remove', {
      deprecationGateResult: { pass: false, reason: 'the minimum deprecation window has not elapsed' },
    });
    expect(blocked).toEqual({ pass: false, reason: 'the minimum deprecation window has not elapsed' });

    const allowed = transitionRegistryVersionAvailability('DEPRECATED', 'remove', {
      deprecationGateResult: { pass: true },
    });
    expect(allowed).toEqual({ pass: true, nextState: 'REMOVED' });
  });
});

// @cpt-dod:cpt-frontx-dod-ecosystem-distribution-independent-upgrade:p1
describe('checkConsumerUpgrade — cpt-frontx-flow-ecosystem-distribution-consumer-upgrade', () => {
  it('warns but proceeds when the artifact carries a deprecation notice', () => {
    const result = checkConsumerUpgrade({
      requestedArtifact: {
        name: '@gears-frontx/api',
        version: '0.3.2',
        deprecationNotice: { publishedAt: '2026-01-01', recommendedVersion: '0.3.9', endOfLifeTarget: '2026-06-01' },
      },
      projectDependencies: [],
    });

    expect(result.pass).toBe(true);
    expect(result.warning).toContain('0.3.9');
  });

  it('blocks upgrading gts-plugin when it falls outside the installed mfes peer range', () => {
    const result = checkConsumerUpgrade({
      requestedArtifact: { name: coupledEdgeProvider, version: '1.0.0' },
      projectDependencies: [{ name: coupledEdgeConsumer, version: '0.3.0-alpha.0', declaredEdgeRange: '^0.3.0' }],
    });

    expect(result.pass).toBe(false);
    expect(result.conflict).toEqual({ name: coupledEdgeProvider, version: '1.0.0' });
  });

  it('allows upgrading gts-plugin within the installed mfes peer range', () => {
    const result = checkConsumerUpgrade({
      requestedArtifact: { name: coupledEdgeProvider, version: '0.3.5' },
      projectDependencies: [{ name: coupledEdgeConsumer, version: '0.3.0-alpha.0', declaredEdgeRange: '^0.3.0' }],
    });

    expect(result.pass).toBe(true);
    expect(result.installed).toEqual({ name: coupledEdgeProvider, version: '0.3.5' });
  });

  it('allows the consumer to adopt one unrelated artifact independently of every other dependency version', () => {
    const projectDependencies = [
      { name: coupledEdgeConsumer, version: '0.3.0-alpha.0', declaredEdgeRange: '^0.3.0' },
      { name: coupledEdgeProvider, version: '0.3.0-alpha.0' },
    ];

    const result = checkConsumerUpgrade({
      requestedArtifact: { name: '@gears-frontx/api', version: '1.4.0-alpha.0' },
      projectDependencies,
    });

    expect(result.pass).toBe(true);
    expect(result.installed).toEqual({ name: '@gears-frontx/api', version: '1.4.0-alpha.0' });
    // Independent upgrade: the pre-existing dependency set is untouched.
    expect(projectDependencies).toEqual([
      { name: coupledEdgeConsumer, version: '0.3.0-alpha.0', declaredEdgeRange: '^0.3.0' },
      { name: coupledEdgeProvider, version: '0.3.0-alpha.0' },
    ]);
  });
});

describe('runCli', () => {
  /** @type {string[]} */
  const cleanupDirs = [];

  afterEach(async () => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  /**
   * @param {{ mfesRange: string; gtsPluginVersion: string; versions?: Record<string, string> }} spec
   * @returns {Promise<string>}
   */
  async function makeFixtureRoot({ mfesRange, gtsPluginVersion, versions = {} }) {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'ecosystem-version-policy-cli-'));
    cleanupDirs.push(rootDir);

    for (const dir of ecosystemArtifactDirs) {
      const pkgDir = path.join(rootDir, 'packages', dir);
      await mkdir(pkgDir, { recursive: true });
      const version = dir === 'gts-plugin' ? gtsPluginVersion : versions[dir] ?? '0.3.0-alpha.0';
      const peerDependencies = dir === 'mfes' ? { '@gears-frontx/gts-plugin': mfesRange } : undefined;
      await writeFile(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({ name: `@gears-frontx/${dir}`, version, ...(peerDependencies ? { peerDependencies } : {}) }, null, 2),
      );
    }

    return rootDir;
  }

  it('passes when mfes declares a satisfiable caret range on gts-plugin', async () => {
    const rootDir = await makeFixtureRoot({ mfesRange: '^0.3.0', gtsPluginVersion: '0.3.0-alpha.0' });

    expect(runCli({ rootDir })).toBe(0);
  });

  it('fails when mfes exact-pins gts-plugin', async () => {
    const rootDir = await makeFixtureRoot({ mfesRange: '0.3.0-alpha.0', gtsPluginVersion: '0.3.0-alpha.0' });

    /** @type {string[]} */
    const errorSpy = [];
    const originalError = console.error;
    console.error = (msg) => errorSpy.push(msg);
    try {
      expect(runCli({ rootDir })).toBe(1);
    } finally {
      console.error = originalError;
    }
    expect(errorSpy.some((m) => String(m).includes('exact pin'))).toBe(true);
  });

  it('does not require the five artifact versions to be equal', async () => {
    const rootDir = await makeFixtureRoot({
      mfesRange: '^0.3.0',
      gtsPluginVersion: '0.3.0-alpha.0',
      versions: { api: '1.4.0-alpha.0', cli: '0.1.0-alpha.0', 'cyber-pilot-kit-frontx': '2.0.0' },
    });

    expect(runCli({ rootDir })).toBe(0);
  });
});
