// @cpt-dod:cpt-hai3-dod-mfe-isolation-externalize-plugin:p1
// @cpt-flow:cpt-hai3-flow-mfe-isolation-build:p2
import type { Plugin, ResolvedConfig } from 'vite';

export interface Hai3MfeExternalizeOptions {
  shared: string[];
}

type OutputAssetLike = {
  type: 'asset';
  fileName: string;
};

type OutputChunkLike = {
  type: 'chunk';
  fileName: string;
  code: string;
  imports: string[];
  dynamicImports: string[];
};

type OutputBundleLike = Record<string, OutputAssetLike | OutputChunkLike>;

function isOutputChunkLike(
  entry: OutputAssetLike | OutputChunkLike
): entry is OutputChunkLike {
  return entry.type === 'chunk';
}

/**
 * Custom Vite plugin that transforms ALL import statements for shared
 * dependencies into importShared() calls across the entire MFE bundle —
 * not just expose entry files.
 *
 * This is a build-time plugin only (no-op in dev mode). It works alongside
 * @originjs/vite-plugin-federation, which only transforms expose entry files.
 * This plugin covers all remaining code-split chunks.
 *
 * Additionally, it renames __federation_shared_* chunks in the output to use
 * deterministic filenames (no content hashes), so chunkPath values in mfe.json
 * remain stable across rebuilds.
 */
export function hai3MfeExternalize(options: Hai3MfeExternalizeOptions): Plugin {
  const sharedPackageNames = new Set(options.shared);
  let isBuild = false;

  /**
   * Extract the package name from a __federation_shared_* bundle key.
   * Handles both:
   *   assets/__federation_shared_react-DMgTugcw.js  → react
   *   assets/__federation_shared_@gears-frontx/react-BYlz3jvo.js → @gears-frontx/react
   */
  function extractPackageNameFromFederationKey(bundleKey: string): string | null {
    const match = /__federation_shared_(.+)-[A-Za-z0-9_-]{8}\.js$/.exec(bundleKey);
    if (match) {
      return match[1];
    }
    return null;
  }

  /**
   * Return true if a bundle key refers to a federation infrastructure file
   * that should not be rewritten by this plugin.
   *
   * We skip:
   *   - __federation_shared_*: the shared wrapper chunks (they bundle the actual packages
   *     and should not be modified — their bundled imports are intentional)
   *   - __federation_fn_*: the federation runtime (importShared implementation)
   *   - _commonjsHelpers*: CJS interop helpers
   *
   * We do NOT skip:
   *   - __federation_expose_*: expose entry chunks (they need the same bundled-import
   *     rewriting as code-split chunks)
   */
  function isFederationInfrastructure(bundleKey: string): boolean {
    const base = baseName(bundleKey);
    return (
      base.startsWith('__federation_shared_') ||
      base.startsWith('__federation_fn_') ||
      base.startsWith('_commonjsHelpers')
    );
  }

  /**
   * Extract the base filename from a bundle key.
   * "assets/index-MCx4YXC7.js" → "index-MCx4YXC7.js"
   */
  function baseName(fileName: string): string {
    const slash = fileName.lastIndexOf('/');
    return slash >= 0 ? fileName.slice(slash + 1) : fileName;
  }

  return {
    name: 'hai3-mfe-externalize',
    enforce: 'post',

    configResolved(config: ResolvedConfig): void {
      isBuild = config.command === 'build';
    },

    generateBundle(_options, bundle): void {
      if (!isBuild) {
        return;
      }

      const outputBundle = bundle as OutputBundleLike;

      // ---- Step 1: Identify all __federation_shared_* chunks ----
      // @cpt-algo:cpt-hai3-algo-mfe-isolation-rename-shared-chunks:p1

      const renameMap = new Map<string, string>(); // oldKey → newKey
      // federationChunks: packageName → { chunk, codeLength }
      const federationChunks = new Map<string, { chunk: OutputChunkLike; codeLength: number }>();

      for (const [bundleKey, chunk] of Object.entries(outputBundle)) {
        if (!isOutputChunkLike(chunk)) {
          continue;
        }
        const pkgName = extractPackageNameFromFederationKey(bundleKey);
        if (pkgName !== null && sharedPackageNames.has(pkgName)) {
          const deterministicKey = bundleKey.replace(/-[A-Za-z0-9_-]{8}\.js$/, '.js');
          renameMap.set(bundleKey, deterministicKey);
          federationChunks.set(pkgName, {
            chunk,
            codeLength: chunk.code.length,
          });
        }
      }

      // ---- Step 2: Build bundled-chunk → package mapping ----
      // @cpt-algo:cpt-hai3-algo-mfe-isolation-map-bundled-chunks:p1
      //
      // For each bundled chunk imported by a federation shared wrapper, assign it to
      // the package whose shared chunk is a "thin wrapper" — i.e., a chunk whose job
      // is exclusively to re-export the bundled package.
      //
      // A federation shared chunk is a "thin wrapper" if its own code is SHORTER than
      // the bundled chunk it imports. This distinguishes thin re-export wrappers
      // (like __federation_shared_react.js at 0.27 kB) from large chunks that contain
      // a package's full source AND happen to import a bundled sub-module
      // (like __federation_shared_@gears-frontx/react.js at 22 kB importing jsx-runtime.js).
      //
      // Additionally, when multiple thin wrappers claim the same bundled chunk (e.g.,
      // both react and react-redux import index-MCx4YXC7.js), the SMALLEST wrapper wins.
      //
      // Example:
      //   __federation_shared_react.js (0.27 kB) imports index-MCx4YXC7.js (100 kB)
      //   → thin wrapper (268 < 102400) → react owns index-MCx4YXC7.js
      //
      //   __federation_shared_@gears-frontx/react.js (22 kB) imports jsx-runtime.js (5 kB)
      //   → NOT a thin wrapper (22576 > 5120) → jsx-runtime.js is NOT remapped

      // bundledChunkToPackage: baseName → packageName
      const bundledChunkToPackage = new Map<string, string>();

      // Get the code length of each bundled chunk (non-federation) for comparison
      const bundledChunkCodeLength = new Map<string, number>(); // baseName → codeLength
      for (const [bundleKey, chunk] of Object.entries(outputBundle)) {
        if (!isOutputChunkLike(chunk) || isFederationInfrastructure(bundleKey)) {
          continue;
        }
        // Skip federation shared wrappers themselves
        if (extractPackageNameFromFederationKey(bundleKey) !== null) {
          continue;
        }
        bundledChunkCodeLength.set(baseName(bundleKey), chunk.code.length);
      }

      for (const [pkgName, { chunk, codeLength }] of federationChunks) {
        for (const importedKey of chunk.imports) {
          if (isFederationInfrastructure(importedKey)) {
            continue;
          }
          const importedBase = baseName(importedKey);
          const importedLength = bundledChunkCodeLength.get(importedBase) ?? 0;

          // Only consider this a "thin wrapper" claim if the federation shared chunk
          // is SMALLER than the bundled chunk it imports. A wrapper that is larger
          // than what it imports has substantial own code (transitive dependencies)
          // and should not be considered the primary owner.
          if (codeLength >= importedLength) {
            continue;
          }

          // If this bundled chunk is already claimed by another thin wrapper, the
          // SMALLEST thin wrapper wins (most "pure" re-export).
          const existingPkg = bundledChunkToPackage.get(importedBase);
          if (existingPkg === undefined) {
            bundledChunkToPackage.set(importedBase, pkgName);
          } else {
            const existingLength = federationChunks.get(existingPkg)?.codeLength ?? Infinity;
            if (codeLength < existingLength) {
              bundledChunkToPackage.set(importedBase, pkgName);
            }
          }
        }
      }

      // ---- Step 3: Apply renames to bundle (deterministic filenames) ----

      for (const [oldKey, newKey] of renameMap) {
        const chunk = outputBundle[oldKey];
        if (chunk) {
          chunk.fileName = newKey;
          outputBundle[newKey] = chunk;
          delete outputBundle[oldKey];
        }
      }

      // Update import references in all chunks to point to renamed files
      for (const chunk of Object.values(outputBundle)) {
        if (!isOutputChunkLike(chunk)) {
          continue;
        }
        const outputChunk = chunk;

        if (outputChunk.imports) {
          outputChunk.imports = outputChunk.imports.map(
            (imp: string) => renameMap.get(imp) ?? imp
          );
        }
        if (outputChunk.dynamicImports) {
          outputChunk.dynamicImports = outputChunk.dynamicImports.map(
            (imp: string) => renameMap.get(imp) ?? imp
          );
        }

        for (const [oldKey, newKey] of renameMap) {
          const oldBase = baseName(oldKey);
          const newBase = baseName(newKey);
          if (oldBase !== newBase) {
            // Replace the base filename in any string context:
            // - relative imports: './oldBase.js'
            // - URL strings: '__federation_shared_@scope/oldBase.js'
            // Use a word-boundary-like approach: match the base name preceded by
            // a path separator (/ or ') or start-of-string.
            const escapedOld = oldBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escapedNew = newBase.replace(/[$]/g, '$$$$'); // escape replacement string
            outputChunk.code = outputChunk.code.replace(
              new RegExp(escapedOld, 'g'),
              escapedNew
            );
          }
        }
      }

      // ---- Step 4: Rewrite direct bundled imports in non-federation chunks ----
      // @cpt-algo:cpt-hai3-algo-mfe-isolation-rewrite-imports:p1
      //
      // Non-expose entry chunks still import from bundled copies of shared packages
      // (e.g., "import { r as requireReact } from './index-MCx4YXC7.js'").
      // These must be rewritten to use importShared() so all code paths route through
      // the federation runtime's per-MFE moduleCache.

      if (bundledChunkToPackage.size === 0) {
        return;
      }

      // Find the __federation_fn_import chunk filename (provides importShared)
      let federationFnImportFile: string | null = null;
      for (const fileName of Object.keys(outputBundle)) {
        if (baseName(fileName).startsWith('__federation_fn_import')) {
          federationFnImportFile = baseName(fileName);
          break;
        }
      }

      if (federationFnImportFile === null) {
        return;
      }

      for (const [chunkKey, chunk] of Object.entries(outputBundle)) {
        if (!isOutputChunkLike(chunk)) {
          continue;
        }

        const outputChunk = chunk;
        const chunkBase = baseName(chunkKey);

        // Skip federation infrastructure chunks — they import from bundled copies
        // intentionally (the federation runtime handles their isolation).
        if (isFederationInfrastructure(chunkBase)) {
          continue;
        }

        const alreadyHasImportSharedImport = outputChunk.code.includes(
          `from './${federationFnImportFile}'`
        );
        let code = outputChunk.code;
        let codeModified = false;
        let needsImportSharedImport = !alreadyHasImportSharedImport;

        for (const importedKey of outputChunk.imports) {
          const importedBase = baseName(importedKey);
          const pkgName = bundledChunkToPackage.get(importedBase);
          if (pkgName === undefined) {
            continue;
          }

          const escapedChunk = importedBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          // Named imports: import { a as b, c, ... } from './chunk.js'
          //
          // Bundled chunks in bundledChunkToPackage are CJS interop wrappers that
          // export require functions (e.g., `export { requireReact as r }`).
          // Consuming code calls these functions: `var React = requireReact()`.
          //
          // We replace each named import with a wrapper function that returns the
          // importShared() result, preserving the CJS calling convention:
          //   import { r as requireReact } from './index-MCx4YXC7.js'
          // becomes:
          //   const __importShared_react = await importShared('react');
          //   const requireReact = () => __importShared_react;
          code = code.replace(
            new RegExp(
              `import\\s+\\{([^}]+)\\}\\s+from\\s+['"]\\./${escapedChunk}['"];?`,
              'g'
            ),
            (_match, namedClause: string) => {
              const bindings = namedClause.split(',').map((s: string) => {
                const stripped = s.replace(/^\s+|\s+$/g, '');
                const asMatch = /^(\w+)\s+as\s+(\w+)$/.exec(stripped);
                return asMatch ? asMatch[2] : stripped;
              });
              const sanitizedPkg = pkgName.replace(/[^a-zA-Z0-9_]/g, '_');
              const sharedVar = `__importShared_${sanitizedPkg}`;
              const lines = [`const ${sharedVar} = await importShared('${pkgName}');`];
              for (const localName of bindings) {
                lines.push(`const ${localName} = () => ${sharedVar};`);
              }
              codeModified = true;
              needsImportSharedImport = true;
              return lines.join('\n');
            }
          );

          // Default imports: import Foo from './chunk.js'
          code = code.replace(
            new RegExp(
              `import\\s+(\\w+)\\s+from\\s+['"]\\./${escapedChunk}['"];?`,
              'g'
            ),
            (_match, defaultName: string) => {
              codeModified = true;
              needsImportSharedImport = true;
              return `const ${defaultName} = await importShared('${pkgName}');`;
            }
          );

          // Namespace imports: import * as Foo from './chunk.js'
          code = code.replace(
            new RegExp(
              `import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+['"]\\./${escapedChunk}['"];?`,
              'g'
            ),
            (_match, nsName: string) => {
              codeModified = true;
              needsImportSharedImport = true;
              return `const ${nsName} = await importShared('${pkgName}');`;
            }
          );
        }

        if (codeModified) {
          if (needsImportSharedImport && !alreadyHasImportSharedImport) {
            code = `import { importShared } from './${federationFnImportFile}';\n${code}`;
          }
          outputChunk.code = code;
        }
      }
    },
  };
}
