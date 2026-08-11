// @vitest-environment node

/**
 * Tests for the gate that stops an unparseable GTS identifier from reaching the
 * generated aggregate (constructorfabric/gears-frontx#550).
 *
 * The failure this covers is silent everywhere else: an id one dot-token short
 * of `vendor.package.namespace.type.vN` builds, type-checks and generates, and
 * only the host's bootstrap rejects it, as a console error behind an empty
 * navigation menu. So the cases here assert the build refusal and the text that
 * names where to edit, not the parser, which is GTS's own.
 *
 * `ManifestGenerator` takes its directories as arguments; the module-level
 * defaults resolve against the working directory at import time, which a test
 * cannot move afterwards.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ManifestGenerator } from '../scripts/generate-mfe-manifests';

const MFE_MANIFEST_PATH = 'dist/mfe-manifest.json';

const PACKAGE_NAME = 'billing-mfe';

// The type portions every fixture id is chained onto. They are contracts rather
// than borrowed sample data: an entry or extension is an instance of exactly
// these types, so a fixture cannot pick neutral values for them.
const MANIFEST_TYPE = 'gts.frontx.mfes.mfe.mf_manifest.v1';
const ENTRY_TYPE = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1';
const EXTENSION_TYPE = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1';
const SCREEN_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1';

const VALID_MANIFEST_ID = `${MANIFEST_TYPE}~fixture.billing.mfe.manifest.v1`;
const VALID_ENTRY_ID = `${ENTRY_TYPE}~fixture.billing.mfe.home.v1`;
const VALID_EXTENSION_ID = `${EXTENSION_TYPE}~fixture.billing.screens.home.v1`;

// Four dot-tokens where GTS requires five: 'screens' is missing the namespace
// position, so the segment ends up one short. This is the exact shape that cost
// two scaffolding runs their debug time.
const FOUR_TOKEN_EXTENSION_ID = `${EXTENSION_TYPE}~fixture.billing.screens.v1`;

let workspace: string;
let mfePackagesDir: string;
let outputFile: string;

interface ManifestOverrides {
  manifestId?: string;
  entryId?: string;
  extensionId?: string;
}

/**
 * Writes one package's enriched build output, with the ids a case wants to bend.
 * Everything else is the shape the frontxMfGts plugin emits, so a refusal in a
 * case can only come from the id under test.
 */
function mfePackageWithIds(overrides: ManifestOverrides): void {
  const packagePath = join(mfePackagesDir, PACKAGE_NAME);
  mkdirSync(join(packagePath, 'dist'), { recursive: true });
  writeFileSync(join(packagePath, 'mfe.json'), '{ "extensions": [] }', 'utf-8');

  const manifestId = overrides.manifestId ?? VALID_MANIFEST_ID;

  writeFileSync(
    join(packagePath, MFE_MANIFEST_PATH),
    JSON.stringify({
      manifest: {
        id: manifestId,
        name: PACKAGE_NAME,
        remoteEntry: 'http://localhost:3010/assets/remoteEntry.js',
        metaData: {
          name: PACKAGE_NAME,
          type: 'app',
          buildInfo: { buildVersion: '0', buildName: PACKAGE_NAME },
          remoteEntry: { name: 'remoteEntry.js', path: 'assets', type: 'module' },
          globalName: PACKAGE_NAME,
          publicPath: 'http://localhost:3010/',
        },
        shared: [],
      },
      entries: [
        {
          id: overrides.entryId ?? VALID_ENTRY_ID,
          requiredProperties: [],
          actions: [],
          domainActions: [],
          manifest: manifestId,
          exposedModule: './lifecycle',
          exposeAssets: { js: { async: [], sync: [] }, css: { async: [], sync: [] } },
        },
      ],
      extensions: [
        {
          id: overrides.extensionId ?? VALID_EXTENSION_ID,
          domain: SCREEN_DOMAIN,
          entry: overrides.entryId ?? VALID_ENTRY_ID,
        },
      ],
    }),
    'utf-8',
  );
}

function generate(): void {
  new ManifestGenerator(mfePackagesDir, outputFile, MFE_MANIFEST_PATH, null).run();
}

/**
 * The refusal message, so a case can read it rather than match a pattern
 * against it. A generator that wrote an aggregate instead fails here with what
 * it did, not with an unmatched pattern.
 */
function messageFromRefusal(): string {
  try {
    generate();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('ManifestGenerator wrote an aggregate where the case expected a refusal');
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'frontx-mfe-gts-ids-'));
  mfePackagesDir = join(workspace, 'src-app', 'mfe_packages');
  outputFile = join(workspace, 'public', 'generated-mfe-manifests.json');
  mkdirSync(mfePackagesDir, { recursive: true });
  mkdirSync(join(workspace, 'public'), { recursive: true });
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('ManifestGenerator - GTS identifier validation', () => {
  it('refuses the run when an extension id carries a segment one dot-token short of five', () => {
    mfePackageWithIds({ extensionId: FOUR_TOKEN_EXTENSION_ID });

    expect(messageFromRefusal()).toContain(`extensions[0].id: "${FOUR_TOKEN_EXTENSION_ID}"`);
  });

  it('names the mfe.json to edit and the five-token rule when it refuses', () => {
    mfePackageWithIds({ extensionId: FOUR_TOKEN_EXTENSION_ID });

    const message = messageFromRefusal();

    expect(message).toContain(join(mfePackagesDir, PACKAGE_NAME, 'mfe.json'));
    expect(message).toContain('vendor.package.namespace.type.vN');
  });

  it('writes no aggregate when an id is refused, so a stale file cannot be mistaken for a good build', () => {
    mfePackageWithIds({ extensionId: FOUR_TOKEN_EXTENSION_ID });

    expect(() => generate()).toThrow();
    expect(existsSync(outputFile)).toBe(false);
  });

  it('reports every invalid id in the package rather than stopping at the first', () => {
    mfePackageWithIds({
      manifestId: `${MANIFEST_TYPE}~fixture.billing.manifest.v1`,
      extensionId: FOUR_TOKEN_EXTENSION_ID,
    });

    expect(messageFromRefusal()).toContain('3 invalid GTS identifier(s)');
  });

  it('accepts an id carrying the optional minor version, which a five-token-exact rule would reject', () => {
    mfePackageWithIds({ manifestId: `${MANIFEST_TYPE}~fixture.billing.mfe.manifest.v1.2` });

    expect(() => generate()).not.toThrow();
  });

  it('writes the aggregate when every id parses', () => {
    mfePackageWithIds({});

    generate();

    expect(existsSync(outputFile)).toBe(true);
  });
});
