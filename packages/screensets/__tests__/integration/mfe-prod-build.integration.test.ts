/**
 * Production MFE integration: build _blank-mfe and verify that:
 *  - mf-manifest.json is emitted by @module-federation/vite
 *  - dist/mfe-manifest.json is written by the frontxMfGts plugin with
 *    manifest metaData, shared[] (chunkPath, version, unwrapKey), and per-entry exposeAssets
 *  - source mfe.json remains human-authored and unenriched
 *  - MfeHandlerMF can derive chunk paths from it without regex parsing
 *
 * Full load()+mount() is not run here: Node's default ESM loader cannot evaluate
 * the handler's blob/data dynamic imports the way a browser can. Browser E2E
 * can extend this to a live load test.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MfeHandlerMF } from '../../src/mfe/handler/mf-handler';


const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const BLANK_MFE_ROOT = join(REPO_ROOT, 'src', 'mfe_packages', '_blank-mfe');
/** Root of the build output; chunk paths in manifests are relative to this. */
const DIST_DIR = join(BLANK_MFE_ROOT, 'dist');
/** Raw @module-federation/vite output — used for expose chunk verification */
const RAW_MANIFEST_PATH = join(DIST_DIR, 'mf-manifest.json');
/** Enriched build-output manifest consumed by host manifest generation. */
const ENRICHED_MANIFEST_PATH = join(DIST_DIR, 'mfe-manifest.json');
/** Human-authored source contract; must remain unenriched after build. */
const MFE_JSON_PATH = join(BLANK_MFE_ROOT, 'mfe.json');
const POSIX_NPM_PATHS = ['/usr/bin/npm', '/usr/local/bin/npm'] as const;

type SourceMfeJson = {
  manifest?: {
    id?: string;
    remoteEntry?: string;
    metaData?: object;
    shared?: object[];
  };
  entries?: Array<{
    exposeAssets?: object;
  }>;
};

type CommandSpec = {
  command: string;
  args: string[];
};

function resolveNpmBuildCommand(): CommandSpec {
  const nodeBinDir = dirname(process.execPath);
  const npmExecPath = process.env.npm_execpath;

  if (
    typeof npmExecPath === 'string' &&
    npmExecPath.length > 0 &&
    isAbsolute(npmExecPath) &&
    existsSync(npmExecPath)
  ) {
    return npmExecPath.endsWith('.js')
      ? {
          command: process.execPath,
          args: [npmExecPath, 'run', 'build'],
        }
      : {
          command: npmExecPath,
          args: ['run', 'build'],
        };
  }

  const npmCliPath = join(
    nodeBinDir,
    '..',
    'lib',
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js'
  );

  if (existsSync(npmCliPath)) {
    return {
      command: process.execPath,
      args: [npmCliPath, 'run', 'build'],
    };
  }

  if (process.platform === 'win32') {
    const npmCmdPath = join(nodeBinDir, 'npm.cmd');
    if (existsSync(npmCmdPath)) {
      return {
        command: npmCmdPath,
        args: ['run', 'build'],
      };
    }
  } else {
    for (const npmPath of POSIX_NPM_PATHS) {
      if (existsSync(npmPath)) {
        return {
          command: npmPath,
          args: ['run', 'build'],
        };
      }
    }
  }

  throw new Error(
    'Unable to resolve an absolute npm executable path for the integration build.'
  );
}

describe('MfeHandlerMF + production _blank-mfe build', () => {
  beforeAll(() => {
    const npmBuild = resolveNpmBuildCommand();
    // Build the subprocess environment:
    //  - Strip ALL npm_* lifecycle vars: when the outer `npm run test` runs in
    //    packages/screensets, npm sets npm_config_local_prefix and npm_package_json
    //    pointing to the screensets workspace; if forwarded, npm in the subprocess
    //    may resolve the wrong workspace root.
    //  - Force NODE_ENV=production: when vitest sets NODE_ENV=test, Vite runs in
    //    test mode and @module-federation/vite skips the federation plugin entirely,
    //    producing only 1 module with no mf-manifest.json output.
    //  - Strip VITEST* and VITE_* test vars that vitest injects and that may affect
    //    Vite's build mode inside the subprocess.
    //  - Preserve PATH and all other system vars so node/npm remain accessible.
    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value !== 'string') continue;
      if (key.startsWith('npm_')) continue;
      if (key.startsWith('VITEST')) continue;
      if (key.startsWith('VITE_')) continue;
      if (key === 'NODE_ENV') continue;
      cleanEnv[key] = value;
    }
    cleanEnv['NODE_ENV'] = 'production';

    const result = spawnSync(npmBuild.command, npmBuild.args, {
      cwd: BLANK_MFE_ROOT,
      encoding: 'utf8',
      shell: false,
      env: cleanEnv,
    });
    const buildInfo = `Build command: ${npmBuild.command} ${npmBuild.args.join(' ')}\n` +
      `Build stdout:\n${result.stdout ?? ''}\n` +
      `Build stderr:\n${result.stderr ?? ''}`;

    if (result.status !== 0) {
      throw new Error(`blank-mfe production build failed (status ${result.status}):\n${buildInfo}`);
    }
    if (!existsSync(RAW_MANIFEST_PATH)) {
      throw new Error(`Expected mf-manifest.json at ${RAW_MANIFEST_PATH} after build.\n${buildInfo}`);
    }
    if (!existsSync(ENRICHED_MANIFEST_PATH)) {
      throw new Error(`Expected mfe-manifest.json at ${ENRICHED_MANIFEST_PATH} after build.\n${buildInfo}`);
    }

    const sourceMfeJson = JSON.parse(readFileSync(MFE_JSON_PATH, 'utf8')) as SourceMfeJson;
    if (!sourceMfeJson.manifest?.id || !sourceMfeJson.manifest.remoteEntry) {
      throw new Error(`Expected source mfe.json to keep manifest.id and manifest.remoteEntry after build.\n${buildInfo}`);
    }
    if (sourceMfeJson.manifest.metaData || sourceMfeJson.manifest.shared) {
      throw new Error(`Expected source mfe.json manifest to remain unenriched after build.\n${buildInfo}`);
    }
    for (const entry of sourceMfeJson.entries ?? []) {
      if (entry.exposeAssets) {
        throw new Error(`Expected source mfe.json entries to remain without exposeAssets after build.\n${buildInfo}`);
      }
    }
  }, 120_000);

  it('emits mf-manifest.json (raw @module-federation/vite output) with correct base structure', () => {
    // mf-manifest.json is the raw MF plugin output (not the GTS manifest).
    // We assert on the fields common to both formats.
    const rawManifest = JSON.parse(readFileSync(RAW_MANIFEST_PATH, 'utf8')) as Record<string, unknown>;

    expect(typeof rawManifest['id']).toBe('string');
    expect(typeof rawManifest['name']).toBe('string');
    expect(typeof rawManifest['metaData']).toBe('object');
    expect(Array.isArray(rawManifest['shared'])).toBe(true);
    expect(Array.isArray(rawManifest['exposes'])).toBe(true);
  });

  it('mf-manifest.json exposes[].assets.js.sync points to existing chunk files', () => {
    type RawExposeEntry = {
      id: string; name: string; path: string;
      assets: { js: { sync: string[]; async: string[] }; css: { sync: string[]; async: string[] } };
    };
    const manifest = JSON.parse(readFileSync(RAW_MANIFEST_PATH, 'utf8')) as {
      exposes: RawExposeEntry[];
    };

    expect(Array.isArray(manifest.exposes)).toBe(true);
    expect(manifest.exposes.length).toBeGreaterThan(0);

    for (const expose of manifest.exposes) {
      const syncChunks = expose.assets.js.sync;
      expect(syncChunks.length).toBeGreaterThan(0);
      for (const chunk of syncChunks) {
        // Chunk paths are relative to DIST_DIR (e.g. 'assets/lifecycle-xxx.js')
        const chunkPath = join(DIST_DIR, chunk);
        expect(statSync(chunkPath).isFile()).toBe(true);
      }
    }
  });

  it('mf-manifest.json exposes ./lifecycle and its sync chunk is on disk', () => {
    type RawExposeEntry = {
      id: string; name: string; path: string;
      assets: { js: { sync: string[]; async: string[] }; css: { sync: string[]; async: string[] } };
    };
    const manifest = JSON.parse(readFileSync(RAW_MANIFEST_PATH, 'utf8')) as {
      exposes: RawExposeEntry[];
    };

    // _blank-mfe exposes './lifecycle'. The MF 2.0 plugin emits name without
    // the './' prefix (name: 'lifecycle'), so match by path or name.
    const lifecycleExpose = manifest.exposes.find(
      (e) => e.name === './lifecycle' || e.name === 'lifecycle' || e.path === './lifecycle'
    );
    if (!lifecycleExpose) {
      throw new Error('lifecycle expose entry not found in manifest');
    }

    const syncChunk = lifecycleExpose.assets.js.sync[0];
    expect(typeof syncChunk).toBe('string');
    expect(syncChunk.length).toBeGreaterThan(0);

    // Chunk paths are relative to DIST_DIR (e.g. 'assets/lifecycle-xxx.js')
    const chunkPath = join(DIST_DIR, syncChunk);
    expect(statSync(chunkPath).isFile()).toBe(true);
  });

  it('expose chunk uses import syntax the blob rewriter recognizes', () => {
    type RawExposeEntry = {
      id: string; name: string; path: string;
      assets: { js: { sync: string[]; async: string[] }; css: { sync: string[]; async: string[] } };
    };
    const manifest = JSON.parse(readFileSync(RAW_MANIFEST_PATH, 'utf8')) as {
      exposes: RawExposeEntry[];
    };

    const lifecycleExpose = manifest.exposes.find(
      (e) => e.name === './lifecycle' || e.name === 'lifecycle' || e.path === './lifecycle'
    );
    if (!lifecycleExpose) {
      throw new Error('lifecycle expose entry not found in manifest');
    }

    const handler = new MfeHandlerMF(
      'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~',
      { timeout: 30_000, retries: 0 }
    );

    // parseStaticImportFilenames is private. Integration tests access it via
    // prototype to verify the blob rewriter handles real production-minified
    // import syntax — the public load() API cannot be driven in Node because
    // dynamic blob/data imports require a browser ESM loader.
    type MfeHandlerMFInternal = Record<string, (source: string, chunkFilename: string) => string[]>;
    const proto = MfeHandlerMF.prototype as unknown as MfeHandlerMFInternal;
    const parseStaticImportFilenames = proto.parseStaticImportFilenames;

    // Chunk paths in manifest are relative to DIST_DIR
    const chunkFilename = lifecycleExpose.assets.js.sync[0];
    const exposeSrc = readFileSync(join(DIST_DIR, chunkFilename), 'utf8');
    // Pass just the filename portion (no 'assets/' prefix) as the chunk identity
    // for path resolution purposes — imports within the chunk are relative to it.
    const deps = parseStaticImportFilenames.call(handler, exposeSrc, chunkFilename);

    expect(deps.length).toBeGreaterThan(0);
    for (const dep of deps) {
      expect(statSync(join(DIST_DIR, dep)).isFile()).toBe(true);
    }
  });

  it('parses bare side-effect imports from minified and multiline sources', () => {
    const handler = new MfeHandlerMF(
      'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~',
      { timeout: 30_000, retries: 0 }
    );
    type MfeHandlerMFInternal = Record<string, (source: string, chunkFilename: string) => string[]>;
    const proto = MfeHandlerMF.prototype as unknown as MfeHandlerMFInternal;
    const parseStaticImportFilenames = proto.parseStaticImportFilenames;

    const deps = parseStaticImportFilenames.call(
      handler,
      'const setup=1;import"./dep.js";\n  import "../other.js";\nimport { helper } from "./named.js";import("./dynamic.js");',
      'chunks/widget.js'
    );

    expect(deps).toEqual([
      'chunks/named.js',
      'chunks/dep.js',
      'other.js',
    ]);
  });

  it('writes build-output mfe-manifest.json with manifest metaData and shared[]', () => {
    type EnrichedManifest = {
      id: string;
      remoteEntry: string;
      metaData: {
        publicPath: string;
        name: string;
        type: string;
        buildInfo: { buildVersion: string; buildName: string };
        remoteEntry: { name: string; path: string; type: string };
        globalName: string;
      };
      shared: { name: string; version: string; chunkPath: string; unwrapKey: string | null }[];
    };
    type EnrichedMfeJson = { manifest: EnrichedManifest };
    const mfeJson = JSON.parse(readFileSync(ENRICHED_MANIFEST_PATH, 'utf8')) as EnrichedMfeJson;

    expect(typeof mfeJson.manifest.id).toBe('string');
    expect(mfeJson.manifest.metaData).toBeDefined();
    expect(typeof mfeJson.manifest.metaData.publicPath).toBe('string');
    expect(mfeJson.manifest.metaData.remoteEntry).toBeDefined();
    expect(typeof mfeJson.manifest.metaData.remoteEntry.name).toBe('string');
    expect(Array.isArray(mfeJson.manifest.shared)).toBe(true);
    // Note: `mfInitKey` (an MF 1.0 vestige) is not asserted here — the
    // `frontx-mf-gts` enricher does not set it; it survives only via
    // spread-preservation of authored-source fields. Asserting it would
    // couple this plugin-contract test to fixture state.
  });

  it('build-output mfe-manifest.json shared[] has chunkPath pointing to standalone ESMs', () => {
    type SharedEntry = { name: string; version: string; chunkPath: string; unwrapKey: string | null };
    type EnrichedMfeJson = { manifest: { shared: SharedEntry[] } };
    const mfeJson = JSON.parse(readFileSync(ENRICHED_MANIFEST_PATH, 'utf8')) as EnrichedMfeJson;

    expect(mfeJson.manifest.shared.length).toBeGreaterThan(0);
    for (const dep of mfeJson.manifest.shared) {
      // chunkPath points to the standalone ESM, MFE-relative (e.g., shared/react.js).
      // Handler resolves it against manifest.metaData.publicPath at runtime.
      expect(typeof dep.chunkPath).toBe('string');
      expect(dep.chunkPath).toMatch(/^shared\/.+\.js$/);
      // unwrapKey is null for default export
      expect(dep.unwrapKey).toBeNull();
    }
  });

  it('build-output mfe-manifest.json shared[] has resolved versions from node_modules', () => {
    type SharedEntry = { name: string; version: string; chunkPath: string; unwrapKey: string | null };
    type EnrichedMfeJson = { manifest: { shared: SharedEntry[] } };
    const mfeJson = JSON.parse(readFileSync(ENRICHED_MANIFEST_PATH, 'utf8')) as EnrichedMfeJson;

    expect(mfeJson.manifest.shared.length).toBeGreaterThan(0);
    for (const dep of mfeJson.manifest.shared) {
      expect(typeof dep.name).toBe('string');
      expect(dep.name.length).toBeGreaterThan(0);
      // Version is resolved from node_modules package.json (not wildcard '*')
      expect(typeof dep.version).toBe('string');
      expect(dep.version).toMatch(/^\d+\.\d+/);
    }
  });

  it('build-output mfe-manifest.json entries have exposeAssets from mf-manifest.json', () => {
    type ExposeAssets = { js: { async: string[]; sync: string[] }; css: { async: string[]; sync: string[] } };
    type EnrichedEntry = { id: string; exposedModule: string; exposeAssets: ExposeAssets };
    type EnrichedMfeJson = { entries: EnrichedEntry[] };
    const mfeJson = JSON.parse(readFileSync(ENRICHED_MANIFEST_PATH, 'utf8')) as EnrichedMfeJson;

    expect(mfeJson.entries.length).toBeGreaterThan(0);
    for (const entry of mfeJson.entries) {
      expect(entry.exposeAssets).toBeDefined();
      expect(Array.isArray(entry.exposeAssets.js.sync)).toBe(true);
      expect(entry.exposeAssets.js.sync.length).toBeGreaterThan(0);
      // Verify expose chunk file exists on disk
      for (const chunk of entry.exposeAssets.js.sync) {
        expect(statSync(join(DIST_DIR, chunk)).isFile()).toBe(true);
      }
    }
  });
});
