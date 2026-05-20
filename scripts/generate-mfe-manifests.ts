#!/usr/bin/env node

// @cpt-dod:cpt-frontx-dod-mfe-isolation-mf-vite-plugin:p1

/**
 * MFE Manifest Generation Script
 *
 * Reads the enriched mfe-manifest.json (produced by the frontx-mf-gts Vite
 * plugin into each MFE's dist directory) and writes the aggregated manifest
 * to a public asset (`public/generated-mfe-manifests.json`) served by Vite at
 * the runtime URL `/generated-mfe-manifests.json`. Every FrontX app instance
 * (root host AND any nested app) reads it from that URL at runtime.
 *
 * The enriched mfe-manifest.json already contains all required data:
 * - manifest.metaData: publicPath, remoteEntry, buildInfo from mf-manifest.json
 * - manifest.shared[]: standalone ESM deps with resolved versions and chunkPaths
 * - entries[].exposeAssets: from mf-manifest.json exposes[]
 *
 * Pipeline per MFE package:
 *   1. Read dist/mfe-manifest.json — enriched by the build plugin
 *   2. Inject resolved publicPath (overrides build-time placeholder)
 *   3. Copy shared dep `chunkPath` entries unchanged from the enriched manifest
 *   4. Map entries to MfeEntryMF shape with the resolved MfManifest object
 *      inlined into each entry's `manifest` field (the schema accepts both
 *      string ID and inline object; inline removes the need for any consumer
 *      to spread/override the entry to attach the manifest reference at
 *      registration time, so consumers can pass entries opaquely to
 *      `typeSystem.register()`)
 *
 * Usage:
 *   npx tsx scripts/generate-mfe-manifests.ts [--base-url <url>]
 *
 * When --base-url is omitted, publicPath comes from manifest.metaData.publicPath
 * in the enriched mfe-manifest.json (set by the build plugin from mf-manifest.json).
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Raw JSON shape types (what we read from the enriched mfe-manifest.json on disk)
// ---------------------------------------------------------------------------

interface RawMetaData {
  name: string;
  type: string;
  buildInfo: { buildVersion: string; buildName: string };
  remoteEntry: { name: string; path: string; type: string };
  globalName: string;
  publicPath: string;
}

interface RawShared {
  name: string;
  version: string;
  chunkPath: string;
  unwrapKey: string | null;
}

interface RawExposeAssets {
  js: { async: string[]; sync: string[] };
  css: { async: string[]; sync: string[] };
}

interface RawEntry {
  id: string;
  requiredProperties: string[];
  optionalProperties?: string[];
  actions: string[];
  domainActions: string[];
  manifest: string;
  exposedModule: string;
  exposeAssets: RawExposeAssets;
}

interface RawExtension {
  id: string;
  domain: string;
  entry: string;
  presentation?: Record<string, unknown>;
  [key: string]: unknown;
}

interface RawSchema {
  $id?: string;
  [key: string]: unknown;
}

interface RawDomain {
  id: string;
  sharedProperties: string[];
  actions: string[];
  extensionsActions: string[];
  defaultActionTimeout: number;
  lifecycleStages: string[];
  extensionsLifecycleStages: string[];
}

interface RawManifest {
  id: string;
  name: string;
  remoteEntry: string;
  metaData: RawMetaData;
  shared: RawShared[];
}

/** Enriched mfe-manifest.json shape produced by the frontx-mf-gts Vite plugin. */
interface RawEnrichedMfeJson {
  manifest: RawManifest;
  domains?: RawDomain[];
  entries: RawEntry[];
  extensions: RawExtension[];
  schemas?: RawSchema[];
}

// ---------------------------------------------------------------------------
// Output shape types (mirror the SDK MfManifest / MfeEntryMF types; kept
// local so the script has no dependency on @cyberfabric packages at run time)
// ---------------------------------------------------------------------------

interface OutMfManifestShared {
  name: string;
  version: string;
  chunkPath: string;
  unwrapKey: string | null;
}

interface OutMfManifest {
  id: string;
  name: string;
  metaData: {
    name: string;
    type: string;
    buildInfo: { buildVersion: string; buildName: string };
    remoteEntry: { name: string; path: string; type: string };
    globalName: string;
    publicPath: string;
  };
  shared: OutMfManifestShared[];
}

interface OutMfManifestAssets {
  js: { async: string[]; sync: string[] };
  css: { async: string[]; sync: string[] };
}

interface OutMfeEntryMF {
  id: string;
  requiredProperties: string[];
  optionalProperties?: string[];
  actions: string[];
  domainActions: string[];
  manifest: OutMfManifest;
  exposedModule: string;
  exposeAssets: OutMfManifestAssets;
}

interface OutMfeManifestConfig {
  manifest: OutMfManifest;
  domains?: RawDomain[];
  entries: OutMfeEntryMF[];
  extensions: RawExtension[];
  schemas?: RawSchema[];
}

// ---------------------------------------------------------------------------
// ManifestGenerator — class-based implementation
// ---------------------------------------------------------------------------

// @cpt-begin:cpt-frontx-dod-mfe-isolation-mf-vite-plugin:p1:inst-2
class ManifestGenerator {
  private readonly mfePackagesDir: string;
  private readonly outputFile: string;
  private readonly globalBaseUrl: string | null;
  private readonly mfeManifestPath: string;

  // Packages to skip (hidden dirs, non-MFE directories)
  private static readonly EXCLUDED = new Set(['.git', '.DS_Store']);

  constructor(
    mfePackagesDir: string,
    outputFile: string,
    mfeManifestPath: string,
    globalBaseUrl: string | null
  ) {
    this.mfePackagesDir = mfePackagesDir;
    this.outputFile = outputFile;
    this.mfeManifestPath = mfeManifestPath;
    this.globalBaseUrl = globalBaseUrl;
  }

  run(): void {
    const packageDirs = this.discoverPackages();
    console.log(`Found ${packageDirs.length} MFE package(s):`);
    packageDirs.forEach((p) => console.log(`  - ${p}`));

    const configs = packageDirs.map((dir) => this.processPackage(dir));
    const output = this.renderOutputFile(configs);
    writeFileSync(this.outputFile, output, 'utf-8');
    console.log(`\nGenerated ${this.outputFile}`);
  }

  private discoverPackages(): string[] {
    return readdirSync(this.mfePackagesDir).filter((dir) => {
      if (ManifestGenerator.EXCLUDED.has(dir) || dir.startsWith('.')) {
        return false;
      }
      const pkgPath = join(this.mfePackagesDir, dir);
      return existsSync(join(pkgPath, 'mfe.json'));
    });
  }

  private processPackage(packageDir: string): OutMfeManifestConfig {
    const pkgPath = join(this.mfePackagesDir, packageDir);

    const mfeJson = this.readEnrichedMfeJson(pkgPath, packageDir);
    const publicPath = this.resolvePublicPath(mfeJson, packageDir);

    const outManifest = this.buildManifest(mfeJson.manifest, publicPath);
    const outEntries = this.buildEntries(mfeJson.entries, outManifest, packageDir);

    return {
      manifest: outManifest,
      ...(mfeJson.domains !== undefined && { domains: mfeJson.domains }),
      entries: outEntries,
      extensions: mfeJson.extensions,
      ...(mfeJson.schemas !== undefined && { schemas: mfeJson.schemas }),
    };
  }

  private readEnrichedMfeJson(pkgPath: string, packageDir: string): RawEnrichedMfeJson {
    const manifestFilePath = join(pkgPath, this.mfeManifestPath);
    if (!existsSync(manifestFilePath)) {
      throw new Error(
        `[${packageDir}] ${this.mfeManifestPath} not found. ` +
          `Build the MFE package first and ensure the frontxMfGts plugin is configured in vite.config.ts.`
      );
    }
    let mfeJson: RawEnrichedMfeJson;
    try {
      mfeJson = JSON.parse(readFileSync(manifestFilePath, 'utf-8')) as RawEnrichedMfeJson;
    } catch (err) {
      throw new Error(`[${packageDir}] Cannot parse ${this.mfeManifestPath}: ${String(err)}`);
    }
    if (!mfeJson.manifest?.metaData) {
      throw new Error(
        `[${packageDir}] ${this.mfeManifestPath} is missing manifest.metaData. ` +
          `Build the MFE package first and ensure the frontxMfGts plugin is configured in vite.config.ts.`
      );
    }
    return mfeJson;
  }

  /**
   * Resolve publicPath for this MFE.
   * Priority:
   *   1. --base-url CLI flag (global override for all packages)
   *   2. publicPath from enriched mfe-manifest.json manifest.metaData (set by plugin)
   *   3. Origin from mfe-manifest.json manifest.remoteEntry URL (per-package default)
   *   4. "/" as final fallback
   */
  private resolvePublicPath(
    mfeJson: RawEnrichedMfeJson,
    packageDir: string
  ): string {
    if (this.globalBaseUrl !== null) {
      return this.globalBaseUrl.endsWith('/')
        ? this.globalBaseUrl
        : `${this.globalBaseUrl}/`;
    }

    // Use publicPath from enriched manifest (set by the plugin from mfe-manifest.json).
    const manifestPublicPath = mfeJson.manifest.metaData.publicPath;
    if (manifestPublicPath && manifestPublicPath !== '/') {
      return manifestPublicPath.endsWith('/')
        ? manifestPublicPath
        : `${manifestPublicPath}/`;
    }

    // Fall back to mfe-manifest.json manifest.remoteEntry origin.
    const remoteEntry = mfeJson.manifest.remoteEntry;
    if (remoteEntry) {
      try {
        const url = new URL(remoteEntry);
        return `${url.origin}/`;
      } catch {
        console.warn(
          `[${packageDir}] Cannot parse remoteEntry URL "${remoteEntry}", defaulting publicPath to "/"`
        );
      }
    }

    return '/';
  }

  private buildManifest(rawManifest: RawManifest, publicPath: string): OutMfManifest {
    return {
      id: rawManifest.id,
      name: rawManifest.name,
      metaData: {
        name: rawManifest.metaData.name,
        type: rawManifest.metaData.type,
        buildInfo: {
          buildVersion: rawManifest.metaData.buildInfo.buildVersion,
          buildName: rawManifest.metaData.buildInfo.buildName,
        },
        remoteEntry: {
          name: rawManifest.metaData.remoteEntry.name,
          path: rawManifest.metaData.remoteEntry.path,
          type: rawManifest.metaData.remoteEntry.type,
        },
        globalName: rawManifest.metaData.globalName,
        // Inject resolved publicPath — overrides the "/" placeholder from the build
        publicPath,
      },
      shared: rawManifest.shared.map((s) => ({
        name: s.name,
        version: s.version,
        chunkPath: s.chunkPath,
        unwrapKey: s.unwrapKey,
      })),
    };
  }

  private buildEntries(
    entries: RawEntry[],
    outManifest: OutMfManifest,
    packageDir: string
  ): OutMfeEntryMF[] {
    return entries.map((entry) => {
      if (!entry.exposeAssets) {
        throw new Error(
          `[${packageDir}] Entry "${entry.id}" has no exposeAssets. ` +
            `This usually means the manifest was not enriched by the build plugin. ` +
            `Rebuild the MFE package and ensure the frontxMfGts plugin is configured.`
        );
      }

      const out: OutMfeEntryMF = {
        id: entry.id,
        requiredProperties: entry.requiredProperties,
        actions: entry.actions,
        domainActions: entry.domainActions,
        manifest: outManifest,
        exposedModule: entry.exposedModule,
        exposeAssets: {
          js: {
            async: entry.exposeAssets.js.async,
            sync: entry.exposeAssets.js.sync,
          },
          css: {
            async: entry.exposeAssets.css.async,
            sync: entry.exposeAssets.css.sync,
          },
        },
      };

      if (entry.optionalProperties !== undefined) {
        out.optionalProperties = entry.optionalProperties;
      }

      return out;
    });
  }

  private renderOutputFile(configs: OutMfeManifestConfig[]): string {
    return JSON.stringify(configs, null, 2) + '\n';
  }
}
// @cpt-end:cpt-frontx-dod-mfe-isolation-mf-vite-plugin:p1:inst-2

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { baseUrl: string | null } {
  const idx = argv.indexOf('--base-url');
  const baseUrl = (idx !== -1 && idx + 1 < argv.length) ? argv[idx + 1] : null;
  return { baseUrl };
}

const { baseUrl } = parseArgs(process.argv.slice(2));

const MFE_PACKAGES_DIR = join(process.cwd(), 'src/mfe_packages');
const OUTPUT_FILE = join(process.cwd(), 'public/generated-mfe-manifests.json');
const MFE_MANIFEST_PATH = 'dist/mfe-manifest.json';

try {
  new ManifestGenerator(MFE_PACKAGES_DIR, OUTPUT_FILE, MFE_MANIFEST_PATH, baseUrl).run();
} catch (err) {
  console.error('Error generating MFE manifests:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
