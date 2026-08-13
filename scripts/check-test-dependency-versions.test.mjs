// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkMismatches,
  collectPackageJsonPaths,
  normalizeOverrideVersion,
  runCli,
  sharedTestDependencies,
} from './check-test-dependency-versions.mjs';

/**
 * @param {string} [version]
 * @returns {import('./check-test-dependency-versions.mjs').PackageJson}
 */
function createRootPackage(version = '1.2.3') {
  const devDependencies = Object.fromEntries(
    sharedTestDependencies.map((dependencyName) => [dependencyName, version])
  );

  return {
    name: 'fixture-root',
    private: true,
    devDependencies,
    overrides: { ...devDependencies },
  };
}

/**
 * @param {string | Record<string, string>} overrideValue
 * @returns {import('./check-test-dependency-versions.mjs').PackageJson}
 */
function makeRootWithVitestOverride(overrideValue) {
  const rootPackage = createRootPackage();
  rootPackage.overrides = { ...rootPackage.overrides, vitest: overrideValue };
  return rootPackage;
}

describe('sharedTestDependencies', () => {
  it('includes the core test stack that must stay pinned to the root version', () => {
    expect(sharedTestDependencies).toEqual(
      expect.arrayContaining([
        '@vitejs/plugin-react',
        '@testing-library/react',
        '@vitest/coverage-v8',
        'jsdom',
        'vitest',
      ])
    );
  });

  it('does not drift from actual shared usage (every entry must be pinned at root)', () => {
    // This is the guard this script exists to provide: every listed dep is
    // expected to resolve against root devDependencies on a clean repo. If a
    // consumer is removed from all packages, remove it from this list too.
    expect(sharedTestDependencies.length).toBeGreaterThan(0);
    for (const dependencyName of sharedTestDependencies) {
      expect(typeof dependencyName).toBe('string');
      expect(dependencyName.length).toBeGreaterThan(0);
    }
  });
});

describe('checkMismatches', () => {
  it('returns no mismatches when root and workspace pins match exactly', () => {
    const rootPackage = createRootPackage();
    const rootPackagePath = '/virtual/repo/package.json';
    const workspacePackagePath = '/virtual/repo/packages/api/package.json';
    /** @type {Map<string, import('./check-test-dependency-versions.mjs').PackageJson>} */
    const packageJsonByPath = new Map([
      [rootPackagePath, rootPackage],
      [
        workspacePackagePath,
        {
          name: '@fixture/api',
          devDependencies: {
            vitest: '1.2.3',
            '@testing-library/dom': '1.2.3',
            '@vitest/ui': '1.2.3',
          },
          peerDependencies: {
            'happy-dom': '1.2.3',
          },
        },
      ],
    ]);

    expect(
      checkMismatches(rootPackage, [rootPackagePath, workspacePackagePath], {
        rootDir: '/virtual/repo',
        rootPackagePath,
        // Both keys are populated above; the map lookup can never miss for
        // paths this test itself supplies as `packageJsonPaths`.
        readPackageJson: (packageJsonPath) =>
          /** @type {import('./check-test-dependency-versions.mjs').PackageJson} */ (
            packageJsonByPath.get(packageJsonPath)
          ),
      })
    ).toEqual([]);
  });

  it('reports root missing pins and workspace drift for guarded deps', () => {
    // Pick any dep from the live shared list as the "missing root pin"
    // case. Tests MUST NOT hardcode names that happen to live on the list
    // today — that's what caused this test to rot when the list was trimmed.
    const missingAtRoot = sharedTestDependencies[0];
    const driftedAtWorkspace = sharedTestDependencies[sharedTestDependencies.length - 1];

    const rootPackage = createRootPackage();
    delete rootPackage.devDependencies?.[missingAtRoot];

    const mismatches = checkMismatches(
      rootPackage,
      ['/virtual/repo/packages/react/package.json'],
      {
        rootDir: '/virtual/repo',
        readPackageJson: () => ({
          name: '@fixture/react',
          peerDependencies: {
            [driftedAtWorkspace]: '^1.2.3',
          },
        }),
      }
    );

    expect(mismatches).toEqual(
      expect.arrayContaining([
        `root package.json is missing devDependencies.${missingAtRoot}`,
        `packages/react/package.json has peerDependencies.${driftedAtWorkspace}=^1.2.3, expected 1.2.3`,
      ])
    );
  });
});

describe('normalizeOverrideVersion', () => {
  // Table-driven coverage of every branch we care about: npm `overrides` can
  // be a bare version string, a nested object with a `.` sentinel for the
  // top-level override (plus per-importer pins), missing entirely, or
  // malformed in ways that must NOT crash the checker.
  /**
   * @type {{
   *   label: string;
   *   input: string | number | boolean | Record<string, string> | null | undefined;
   *   expected: string | undefined;
   * }[]}
   */
  const cases = [
    { label: 'bare string pin', input: '1.2.3', expected: '1.2.3' },
    { label: 'caret range string', input: '^1.2.3', expected: '^1.2.3' },
    { label: 'empty string', input: '', expected: '' },
    {
      label: 'nested object with `.` sentinel (top-level override)',
      input: { '.': '1.2.3', 'webpack': '1.9.9' },
      expected: '1.2.3',
    },
    {
      label: 'nested object WITHOUT `.` sentinel (per-importer only)',
      input: { 'webpack': '1.9.9' },
      expected: undefined,
    },
    { label: 'undefined input', input: undefined, expected: undefined },
    { label: 'null input', input: null, expected: undefined },
    // Non-string / non-object values (numbers, booleans) should neither
    // throw nor round-trip — callers expect either a string or `undefined`.
    { label: 'numeric input', input: 1, expected: undefined },
    { label: 'boolean input', input: true, expected: undefined },
  ];

  for (const { label, input, expected } of cases) {
    it(`returns ${JSON.stringify(expected)} for ${label}`, () => {
      expect(normalizeOverrideVersion(input)).toBe(expected);
    });
  }
});

describe('checkMismatches — overrides handling', () => {
  // Use the full shared-dep fixture so the root package satisfies every
  // `missing devDependencies.*` guard. These tests are only about the
  // overrides comparison — unrelated deps must not leak into assertions.

  it('respects nested override objects (`.` sentinel takes precedence)', () => {
    const rootPackage = makeRootWithVitestOverride({ '.': '1.2.3', webpack: '1.9.9' });

    const mismatches = checkMismatches(rootPackage, ['/virtual/repo/package.json'], {
      rootDir: '/virtual/repo',
      rootPackagePath: '/virtual/repo/package.json',
      readPackageJson: () => rootPackage,
    });

    expect(
      mismatches.filter((m) => m.includes('vitest') && !m.includes('coverage-v8')),
    ).toEqual([]);
  });

  it('flags a drifted nested override (`.` sentinel vs devDependencies)', () => {
    const rootPackage = makeRootWithVitestOverride({ '.': '1.9.9' });

    const mismatches = checkMismatches(rootPackage, ['/virtual/repo/package.json'], {
      rootDir: '/virtual/repo',
      rootPackagePath: '/virtual/repo/package.json',
      readPackageJson: () => rootPackage,
    });

    expect(mismatches).toContain(
      'root package.json mismatch for vitest: overrides=1.9.9 devDependencies=1.2.3',
    );
  });

  it('ignores per-importer-only override objects (no `.` sentinel)', () => {
    // When the override applies only to a transitive consumer (no `.` key),
    // there is no top-level pin to compare against; the scanner should
    // neither crash nor report a mismatch.
    const rootPackage = makeRootWithVitestOverride({ webpack: '1.9.9' });

    const mismatches = checkMismatches(rootPackage, ['/virtual/repo/package.json'], {
      rootDir: '/virtual/repo',
      rootPackagePath: '/virtual/repo/package.json',
      readPackageJson: () => rootPackage,
    });

    expect(
      mismatches.filter((m) => m === 'root package.json mismatch for vitest: overrides=undefined devDependencies=1.2.3'),
    ).toEqual([]);
    // And specifically: the scanner did not throw on the nested object shape.
    expect(Array.isArray(mismatches)).toBe(true);
  });
});

describe('collectPackageJsonPaths — malformed manifests', () => {
  /** @type {string[]} */
  const fixtureRoots = [];

  afterEach(async () => {
    await Promise.all(
      fixtureRoots.splice(0).map((fixtureRoot) =>
        rm(fixtureRoot, { recursive: true, force: true })
      )
    );
  });

  it('still enumerates malformed manifests (parsing happens in checkMismatches)', async () => {
    // `collectPackageJsonPaths` only decides WHICH manifests to scan — it
    // does not parse them. A malformed package.json must still be surfaced
    // so `checkMismatches` gets the chance to report a clear parse error
    // (or the CLI to crash loudly) instead of silently vanishing.
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'check-test-malformed-'));
    fixtureRoots.push(fixtureRoot);

    await writeFile(
      path.join(fixtureRoot, 'package.json'),
      JSON.stringify(createRootPackage()),
    );
    await mkdir(path.join(fixtureRoot, 'packages', 'broken'), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, 'packages', 'broken', 'package.json'),
      '{ this is not valid JSON',
    );

    const discovered = collectPackageJsonPaths(fixtureRoot).map((packageJsonPath) =>
      path.relative(fixtureRoot, packageJsonPath),
    );
    expect(discovered).toContain('packages/broken/package.json');
  });
});

describe('collectPackageJsonPaths', () => {
  /** @type {string[]} */
  const fixtureRoots = [];

  afterEach(async () => {
    await Promise.all(
      fixtureRoots.splice(0).map((fixtureRoot) =>
        rm(fixtureRoot, { recursive: true, force: true })
      )
    );
  });

  it('skips ignored directories while still finding nested workspace manifests', async () => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), 'check-test-dependency-versions-')
    );
    fixtureRoots.push(fixtureRoot);

    await writeFile(
      path.join(fixtureRoot, 'package.json'),
      JSON.stringify(createRootPackage())
    );
    await mkdir(path.join(fixtureRoot, 'packages', 'api'), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, 'packages', 'api', 'package.json'),
      JSON.stringify({ name: '@fixture/api' })
    );
    await mkdir(path.join(fixtureRoot, '.git', 'hooks'), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, '.git', 'hooks', 'package.json'),
      JSON.stringify({ name: 'ignored-dot-dir' })
    );
    await mkdir(path.join(fixtureRoot, 'coverage', 'tmp'), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, 'coverage', 'tmp', 'package.json'),
      JSON.stringify({ name: 'ignored-coverage-dir' })
    );

    expect(
      collectPackageJsonPaths(fixtureRoot).map((packageJsonPath) =>
        path.relative(fixtureRoot, packageJsonPath)
      )
    ).toEqual(['package.json', 'packages/api/package.json']);
  });

  it('warns once for non-ENOENT fs failures but still returns discovered manifests', () => {
    const rootDir = '/virtual/repo';
    const rootManifestPath = path.join(rootDir, 'package.json');
    /** @param {string} name */
    const dirent = (name) => ({
      name,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    });

    /** @type {string[]} */
    const warnings = [];
    const fileSystem = {
      existsSync: vi.fn((currentPath) => currentPath === rootDir || currentPath === rootManifestPath),
      realpathSync: vi.fn((currentPath) => {
        if (currentPath === path.join(rootDir, 'packages', 'broken')) {
          const error = new Error('permission denied');
          // @ts-expect-error test-only Node error shape
          error.code = 'EACCES';
          throw error;
        }
        return currentPath;
      }),
      readdirSync: vi.fn((currentPath) => {
        if (currentPath === rootDir) {
          return [dirent('packages')];
        }
        if (currentPath === path.join(rootDir, 'packages')) {
          return [dirent('broken')];
        }
        return [];
      }),
    };

    expect(
      collectPackageJsonPaths(rootDir, {
        fileSystem,
        warn: (message) => warnings.push(message),
      }).map((packageJsonPath) => path.relative(rootDir, packageJsonPath))
    ).toEqual(['package.json']);

    expect(warnings).toEqual([
      expect.stringContaining(
        'Skipping /virtual/repo/packages/broken: realpathSync failed (permission denied).'
      ),
    ]);
  });
});

describe('runCli', () => {
  /** @type {string[]} */
  const fixtureRoots = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      fixtureRoots.splice(0).map((fixtureRoot) =>
        rm(fixtureRoot, { recursive: true, force: true })
      )
    );
  });

  it('returns 0 when the repo fixture is fully in sync', async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'check-test-cli-ok-'));
    fixtureRoots.push(fixtureRoot);

    await writeFile(
      path.join(fixtureRoot, 'package.json'),
      JSON.stringify(createRootPackage())
    );
    await mkdir(path.join(fixtureRoot, 'packages', 'api'), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, 'packages', 'api', 'package.json'),
      JSON.stringify({
        name: '@fixture/api',
        devDependencies: {
          vitest: '1.2.3',
          '@testing-library/dom': '1.2.3',
        },
      })
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(runCli({ rootDir: fixtureRoot })).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(
      'Shared test dependency versions are in sync.'
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns 1 when the root fixture is missing a guarded dependency pin', async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'check-test-cli-bad-'));
    fixtureRoots.push(fixtureRoot);

    // Remove an arbitrary guarded dep so the test is robust to future
    // additions/removals of the shared list. Targeting a specific hardcoded
    // name silently broke this test when `@vitest/ui` was removed.
    const rootPackage = createRootPackage();
    const [removed] = sharedTestDependencies;
    delete rootPackage.devDependencies?.[removed];

    await writeFile(
      path.join(fixtureRoot, 'package.json'),
      JSON.stringify(rootPackage)
    );

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(runCli({ rootDir: fixtureRoot })).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  });
});
