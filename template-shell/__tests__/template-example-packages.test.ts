// @vitest-environment node

/**
 * Tests for the rule that keeps a template's own example and scaffold MFE
 * packages out of the running application (constructorfabric/gears-frontx#550).
 *
 * Two scanners decide it and both are exercised here against a fixture tree
 * rather than against a restatement of their rules: `getMFEPackages`, which
 * feeds `dev-all.ts` and `build-mfes.ts`, and `ManifestGenerator`, which writes
 * the aggregate the host registers from. Testing only the predicates would have
 * left either scanner free to stop calling them with every case still green.
 *
 * Both take their directory as an argument for that reason. The module-level
 * defaults resolve against the working directory at import time, which a test
 * cannot move afterwards.
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
 * GTS ids for a fixture package, under a neutral `fixture` vendor.
 *
 * `ManifestGenerator` refuses a manifest whose ids GTS cannot parse, so a
 * fixture has to carry real ones. They are derived from the package name
 * instead of written out per case so an assertion still reads as "which
 * package reached the aggregate"; the hyphens become underscores because a GTS
 * segment token admits none.
 */
function fixtureGtsIds(name: string): { manifest: string; entry: string; extension: string } {
  const instance = `fixture.${name.replace(/-/g, '_')}`;
  return {
    manifest: `gts.frontx.mfes.mfe.mf_manifest.v1~${instance}.mfe.manifest.v1`,
    entry: `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~${instance}.mfe.home.v1`,
    extension: `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~${instance}.screens.home.v1`,
  };
}

/**
 * Writes a package complete enough for both scanners: an `mfe.json` carrying
 * the flag or not, a `package.json` whose `preview` script declares the port
 * `getMFEPackages` reads, and the enriched build output `ManifestGenerator`
 * aggregates. Every value is neutral fixture data - no identifier here is
 * borrowed from a shipped package.
 */
function mfePackage(name: string, options: { templateExample: boolean; port: number }): void {
  const flag = options.templateExample ? '"templateExample": true, ' : '';
  const packagePath = packageWithMfeJson(name, `{ ${flag}"entries": [], "extensions": [] }`);

  writeFileSync(
    join(packagePath, 'package.json'),
    JSON.stringify({ name, scripts: { preview: `vite preview --port ${options.port}` } }),
    'utf-8',
  );

  const ids = fixtureGtsIds(name);

  mkdirSync(join(packagePath, 'dist'), { recursive: true });
  writeFileSync(
    join(packagePath, MFE_MANIFEST_PATH),
    JSON.stringify({
      manifest: {
        id: ids.manifest,
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
      extensions: [
        {
          id: ids.extension,
          domain: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
          entry: ids.entry,
        },
      ],
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

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'frontx-mfe-packages-'));
  mfePackagesDir = join(workspace, 'src-app', 'mfe_packages');
  mkdirSync(mfePackagesDir, { recursive: true });
  mkdirSync(join(workspace, 'public'), { recursive: true });
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  delete process.env[TEMPLATE_EXAMPLES_ENV_VAR];
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

describe('ManifestGenerator - what the host registers from', () => {
  it('writes an aggregate without the example package, so its screen cannot reach the menu', () => {
    mfePackage('tasks-mfe', { templateExample: false, port: 3010 });
    mfePackage('sample-mfe', { templateExample: true, port: 3020 });

    expect(generatedManifestIds()).toEqual([fixtureGtsIds('tasks-mfe').manifest]);
  });

  it('writes an aggregate holding the example package when the environment includes examples', () => {
    mfePackage('tasks-mfe', { templateExample: false, port: 3010 });
    mfePackage('sample-mfe', { templateExample: true, port: 3020 });
    process.env[TEMPLATE_EXAMPLES_ENV_VAR] = '1';

    expect(generatedManifestIds()).toEqual([
      fixtureGtsIds('sample-mfe').manifest,
      fixtureGtsIds('tasks-mfe').manifest,
    ]);
  });
});
