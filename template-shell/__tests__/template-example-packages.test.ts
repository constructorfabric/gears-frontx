// @vitest-environment node

/**
 * Tests for the rule that keeps a template's own example and scaffold MFE
 * packages out of the running application (constructorfabric/gears-frontx#550).
 *
 * Three scanners decide it and all are exercised here against a fixture tree
 * rather than against a restatement of their rules: `getMFEPackages`, which
 * feeds `dev-all.ts` and `build-mfes.ts`; `ManifestGenerator`, which writes the
 * aggregate the host registers from; and `discoverMfeProjects`, which picks the
 * packages `type-check:mfe` spawns a child for. Testing only the predicates
 * would have left any of them free to stop calling them with every case still
 * green.
 *
 * All three take their directory as an argument for that reason. The
 * module-level defaults resolve against the working directory at import time,
 * which a test cannot move afterwards.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  TEMPLATE_EXAMPLES_ENV_VAR,
  getMFEPackages,
  isTemplateExamplePackage,
  templateExamplesIncluded,
} from '../scripts/lib/mfe-tools';
import { ManifestGenerator } from '../scripts/generate-mfe-manifests';
import { discoverMfeProjects } from '../scripts/run-mfe-type-checks';

const MFE_MANIFEST_PATH = 'dist/mfe-manifest.json';

let workspace: string;
let mfePackagesDir: string;

/**
 * Writes a package directory holding `body` as its `mfe.json` and returns the
 * package path. The body is a raw string rather than an object so a case can
 * write a manifest that is not valid JSON.
 */
function packageWithMfeJson(name: string, body: string): string {
  const packagePath = join(mfePackagesDir, name);
  mkdirSync(packagePath, { recursive: true });
  writeFileSync(join(packagePath, 'mfe.json'), body, 'utf-8');
  return packagePath;
}

/**
 * Writes a package complete enough for all three scanners: an `mfe.json`
 * carrying the flag or not, a `package.json` whose `preview` script declares the
 * port `getMFEPackages` reads and whose `type-check` script is what
 * `discoverMfeProjects` requires, and the enriched build output
 * `ManifestGenerator` aggregates. Every value is neutral fixture data - no
 * identifier here is borrowed from a shipped package.
 */
function mfePackage(name: string, options: { templateExample: boolean; port: number }): void {
  const flag = options.templateExample ? '"templateExample": true, ' : '';
  const packagePath = packageWithMfeJson(name, `{ ${flag}"entries": [], "extensions": [] }`);

  writeFileSync(
    join(packagePath, 'package.json'),
    JSON.stringify({
      name,
      scripts: {
        preview: `vite preview --port ${options.port}`,
        'type-check': 'tsc --noEmit',
      },
    }),
    'utf-8',
  );

  mkdirSync(join(packagePath, 'dist'), { recursive: true });
  writeFileSync(
    join(packagePath, MFE_MANIFEST_PATH),
    JSON.stringify({
      manifest: {
        id: `${name}.manifest`,
        name,
        remoteEntry: `http://localhost:${options.port}/assets/remoteEntry.js`,
        metaData: {
          name,
          type: 'app',
          buildInfo: { buildVersion: '0', buildName: name },
          remoteEntry: { name: 'remoteEntry.js', path: 'assets', type: 'module' },
          globalName: name,
          publicPath: `http://localhost:${options.port}/`,
        },
        shared: [],
      },
      entries: [],
      extensions: [{ id: `${name}.screen`, domain: 'screen', entry: `${name}.entry` }],
    }),
    'utf-8',
  );
}

/** Manifest ids in the aggregate `ManifestGenerator` just wrote. */
function generatedManifestIds(): string[] {
  const outputFile = join(workspace, 'public', 'generated-mfe-manifests.json');
  new ManifestGenerator(mfePackagesDir, outputFile, MFE_MANIFEST_PATH, null).run();

  const configs: unknown = JSON.parse(readFileSync(outputFile, 'utf-8'));
  if (!Array.isArray(configs)) return [];
  return configs.map((config) =>
    typeof config === 'object' && config !== null && 'manifest' in config
      ? String((config.manifest as { id: unknown }).id)
      : '',
  );
}

// The opt-in is read from the real environment, so a value already set where
// this suite runs would put the default-exclusion cases in the wrong mode. It is
// captured once, cleared per case, and put back afterwards, so the suite neither
// inherits a caller's setting nor destroys it.
let originalIncludeExamples: string | undefined;

beforeEach(() => {
  originalIncludeExamples = process.env[TEMPLATE_EXAMPLES_ENV_VAR];
  delete process.env[TEMPLATE_EXAMPLES_ENV_VAR];

  workspace = mkdtempSync(join(tmpdir(), 'frontx-mfe-packages-'));
  mfePackagesDir = join(workspace, 'src-app', 'mfe_packages');
  mkdirSync(mfePackagesDir, { recursive: true });
  mkdirSync(join(workspace, 'public'), { recursive: true });
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });

  if (originalIncludeExamples === undefined) {
    delete process.env[TEMPLATE_EXAMPLES_ENV_VAR];
  } else {
    process.env[TEMPLATE_EXAMPLES_ENV_VAR] = originalIncludeExamples;
  }
});

describe('isTemplateExamplePackage', () => {
  it('reports a package as example content when its mfe.json declares templateExample', () => {
    const packagePath = packageWithMfeJson('example-mfe', '{ "templateExample": true }');

    expect(isTemplateExamplePackage(packagePath)).toBe(true);
  });

  it('reports a package as product content when its mfe.json declares no flag', () => {
    const packagePath = packageWithMfeJson('product-mfe', '{ "extensions": [] }');

    expect(isTemplateExamplePackage(packagePath)).toBe(false);
  });

  // An unparseable manifest is the build's failure to report, through the
  // frontxMfGts plugin's own parse. Answering "example" here would drop the
  // package before it ever reached that build.
  it('keeps a package with an unparseable mfe.json in discovery', () => {
    const packagePath = packageWithMfeJson('broken-mfe', '{ not json');

    expect(isTemplateExamplePackage(packagePath)).toBe(false);
  });
});

describe('templateExamplesIncluded', () => {
  it('includes example packages for either accepted spelling of the variable', () => {
    expect(templateExamplesIncluded({ [TEMPLATE_EXAMPLES_ENV_VAR]: '1' })).toBe(true);
    expect(templateExamplesIncluded({ [TEMPLATE_EXAMPLES_ENV_VAR]: 'TRUE' })).toBe(true);
  });

  it('excludes example packages when the variable is unset or carries any other value', () => {
    expect(templateExamplesIncluded({})).toBe(false);
    expect(templateExamplesIncluded({ [TEMPLATE_EXAMPLES_ENV_VAR]: '0' })).toBe(false);
  });
});

describe('getMFEPackages - what dev:all builds and serves', () => {
  it('leaves an example package out of the served set and names it as skipped', () => {
    mfePackage('tasks-mfe', { templateExample: false, port: 3010 });
    mfePackage('sample-mfe', { templateExample: true, port: 3020 });

    const discovery = getMFEPackages(mfePackagesDir);

    expect(discovery).toEqual({
      packages: [{ name: 'tasks-mfe', port: 3010 }],
      skippedExamples: ['sample-mfe'],
    });
  });

  it('serves the example package too when the environment includes template examples', () => {
    mfePackage('tasks-mfe', { templateExample: false, port: 3010 });
    mfePackage('sample-mfe', { templateExample: true, port: 3020 });
    process.env[TEMPLATE_EXAMPLES_ENV_VAR] = '1';

    const discovery = getMFEPackages(mfePackagesDir);

    expect(discovery).toEqual({
      packages: [
        { name: 'sample-mfe', port: 3020 },
        { name: 'tasks-mfe', port: 3010 },
      ],
      skippedExamples: [],
    });
  });
});

describe('discoverMfeProjects - what type-check:mfe spawns a child for', () => {
  it('leaves an example package out of the checked set and names it as skipped', async () => {
    mfePackage('tasks-mfe', { templateExample: false, port: 3010 });
    mfePackage('sample-mfe', { templateExample: true, port: 3020 });

    const discovery = await discoverMfeProjects(mfePackagesDir);

    expect(discovery).toEqual({
      projects: [{ name: 'tasks-mfe', cwd: join(mfePackagesDir, 'tasks-mfe') }],
      missingTypeCheckScript: [],
      skippedExamples: ['sample-mfe'],
    });
  });

  it('checks the example package too when the environment includes template examples', async () => {
    mfePackage('tasks-mfe', { templateExample: false, port: 3010 });
    mfePackage('sample-mfe', { templateExample: true, port: 3020 });
    process.env[TEMPLATE_EXAMPLES_ENV_VAR] = '1';

    const { projects, skippedExamples } = await discoverMfeProjects(mfePackagesDir);

    expect(projects.map((project) => project.name)).toEqual(['sample-mfe', 'tasks-mfe']);
    expect(skippedExamples).toEqual([]);
  });

  // A missing `type-check` script fails the whole run, product packages
  // included. The example filter runs ahead of that check for exactly this
  // case: a scaffold nothing intends to check must not be able to refuse the
  // run over a script it was never required to declare.
  it('reports no missing type-check script for an example package it skipped', async () => {
    mfePackage('tasks-mfe', { templateExample: false, port: 3010 });
    const scaffold = packageWithMfeJson('_blank-mfe', '{ "templateExample": true }');
    writeFileSync(
      join(scaffold, 'package.json'),
      JSON.stringify({ name: '_blank-mfe' }),
      'utf-8',
    );

    const { missingTypeCheckScript, skippedExamples } = await discoverMfeProjects(mfePackagesDir);

    expect(missingTypeCheckScript).toEqual([]);
    expect(skippedExamples).toEqual(['_blank-mfe']);
  });

  // `shared` declares no `type-check` script, so before this scanner applied the
  // same non-package rule its siblings do, a tree holding one failed the whole
  // run as a package missing its script.
  it('leaves the shared library and dot-directories out without reporting them', async () => {
    mfePackage('tasks-mfe', { templateExample: false, port: 3010 });

    // `shared` is a real workspace package, so it carries a `package.json`; what
    // it does not carry is a `type-check` script. That is the shape that reaches
    // the hard failure, and a bare directory would not - it falls out at the
    // manifest read whether the non-package rule ran or not.
    const shared = join(mfePackagesDir, 'shared');
    mkdirSync(shared, { recursive: true });
    writeFileSync(
      join(shared, 'package.json'),
      JSON.stringify({ name: '@fixture/shared' }),
      'utf-8',
    );

    const dotDir = join(mfePackagesDir, '.cache');
    mkdirSync(dotDir, { recursive: true });
    writeFileSync(join(dotDir, 'package.json'), JSON.stringify({ name: 'cache' }), 'utf-8');

    const discovery = await discoverMfeProjects(mfePackagesDir);

    expect(discovery).toEqual({
      projects: [{ name: 'tasks-mfe', cwd: join(mfePackagesDir, 'tasks-mfe') }],
      missingTypeCheckScript: [],
      skippedExamples: [],
    });
  });

  // A shell-only seed has no packages directory at all, which is a legitimate
  // empty rather than a failure.
  it('reports an empty set when the packages directory does not exist', async () => {
    const discovery = await discoverMfeProjects(join(workspace, 'nowhere'));

    expect(discovery).toEqual({
      projects: [],
      missingTypeCheckScript: [],
      skippedExamples: [],
    });
  });

  // The counterpart to the case above, and the reason the two are told apart: a
  // read that fails for any other reason must not read as "nothing to check",
  // which would let type-check:mfe pass having checked nothing.
  it('propagates a read failure that is not an absent directory', async () => {
    const notADirectory = join(workspace, 'packages-file');
    writeFileSync(notADirectory, 'not a directory', 'utf-8');

    await expect(discoverMfeProjects(notADirectory)).rejects.toThrow();
  });
});

describe('ManifestGenerator - what the host registers from', () => {
  it('writes an aggregate without the example package, so its screen cannot reach the menu', () => {
    mfePackage('tasks-mfe', { templateExample: false, port: 3010 });
    mfePackage('sample-mfe', { templateExample: true, port: 3020 });

    expect(generatedManifestIds()).toEqual(['tasks-mfe.manifest']);
  });

  it('writes an aggregate holding the example package when the environment includes examples', () => {
    mfePackage('tasks-mfe', { templateExample: false, port: 3010 });
    mfePackage('sample-mfe', { templateExample: true, port: 3020 });
    process.env[TEMPLATE_EXAMPLES_ENV_VAR] = '1';

    expect(generatedManifestIds()).toEqual(['sample-mfe.manifest', 'tasks-mfe.manifest']);
  });
});
