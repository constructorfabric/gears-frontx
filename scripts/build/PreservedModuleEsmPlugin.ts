/**
 * Preserved-module ESM output for the shareable ecosystem packages
 * (`ecosystem_package_build_output`, brainstorm issue-718-redo-20261105).
 *
 * A host or MFE build shares an ecosystem package at unit granularity: the
 * producer splits the package's ESM into strongly connected components of its
 * module graph. A single-file bundle is one module, so every importer reaches
 * all of it. This esbuild plugin, given to tsup through `esbuildPlugins`,
 * makes the ESM build emit one file per source module instead: every source
 * module reachable from the public entries becomes an entry point of its own
 * (named by its path under the source root, the public entries keeping their
 * names), and every relative import between them stays an import of the
 * emitted sibling file, rewritten to its output path with the `.js`
 * extension. The CJS build of the same tsup config is left bundled; the
 * plugin acts only when esbuild's format is `esm`. Public entry names, and so
 * `exports` maps and the `.d.ts` files tsup derives from the config's `entry`,
 * are unchanged.
 *
 * Anything esbuild still inlines into a module (a JSON file, a package the
 * build does not externalize) is checked once the build ends: inlining the
 * same input into two modules would ship two copies of it, so that fails the
 * build naming the input.
 */
import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Options } from 'tsup';

type EsbuildPlugin = NonNullable<Options['esbuildPlugins']>[number];
type PluginBuild = Parameters<EsbuildPlugin['setup']>[0];
type BuildOptions = PluginBuild['initialOptions'];

export interface PreservedModuleEsmPluginOptions {
  /** Directory holding the source modules, relative to the build's working directory. Default `src`. */
  readonly sourceRoot?: string;
}

export class PreservedModuleEsmPlugin {
  private static readonly SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'];

  private static readonly RELATIVE_SPECIFIER = /^\.\.?(?:\/|$)/;

  private readonly sourceRoot: string;

  constructor(options: PreservedModuleEsmPluginOptions = {}) {
    this.sourceRoot = options.sourceRoot ?? 'src';
  }

  /**
   * Output name (path under the output directory, without extension) for a
   * source module: the public entry's own name when the module is a public
   * entry, else its path under the source root.
   */
  static outputNameOf(sourceRootAbs: string, moduleAbs: string): string {
    const relative = path.relative(sourceRootAbs, moduleAbs);
    const parsed = path.parse(relative);
    return path.join(parsed.dir, parsed.name).split(path.sep).join('/');
  }

  /** Relative import specifier from one emitted module to another. */
  static specifierBetween(fromOutputName: string, toOutputName: string, extension: string): string {
    const relative = path.posix.relative(path.posix.dirname(fromOutputName), toOutputName);
    const specifier = `${relative}${extension}`;
    return specifier.startsWith('.') ? specifier : `./${specifier}`;
  }

  /** Candidate files an extensionless or `.js`-suffixed relative specifier may name. */
  static candidatesFor(resolveDir: string, specifier: string): string[] {
    const base = path.resolve(resolveDir, specifier);
    const candidates = [base];
    const jsExtension = /\.(m?)jsx?$/.exec(base);
    if (jsExtension) {
      const stem = base.slice(0, -jsExtension[0].length);
      candidates.push(`${stem}.${jsExtension[1]}ts`, `${stem}.${jsExtension[1]}tsx`, `${stem}.tsx`);
    }
    for (const extension of PreservedModuleEsmPlugin.SOURCE_EXTENSIONS) {
      candidates.push(`${base}${extension}`);
    }
    for (const extension of PreservedModuleEsmPlugin.SOURCE_EXTENSIONS) {
      candidates.push(path.join(base, `index${extension}`));
    }
    return candidates;
  }

  toEsbuildPlugin(): EsbuildPlugin {
    return {
      name: 'frontx-preserved-module-esm',
      setup: async (build) => {
        if (build.initialOptions.format !== 'esm') {
          return;
        }
        const workingDir = build.initialOptions.absWorkingDir ?? process.cwd();
        const sourceRootAbs = PreservedModuleEsmPlugin.canonical(path.resolve(workingDir, this.sourceRoot));
        const publicEntries = PreservedModuleEsmPlugin.publicEntriesOf(build.initialOptions, workingDir);
        const modules = await this.collectModules(build, publicEntries, sourceRootAbs, workingDir);
        build.initialOptions.entryPoints = Object.fromEntries(
          [...modules].map(([moduleAbs, outputName]) => [outputName, moduleAbs]),
        );
        build.initialOptions.splitting = false;
        build.initialOptions.metafile = true;
        const extension = build.initialOptions.outExtension?.['.js'] ?? '.js';

        build.onResolve({ filter: PreservedModuleEsmPlugin.RELATIVE_SPECIFIER }, (args) => {
          if (args.kind === 'entry-point') {
            return undefined;
          }
          const importerName = modules.get(PreservedModuleEsmPlugin.canonical(args.importer));
          if (importerName === undefined) {
            return undefined;
          }
          const candidates = PreservedModuleEsmPlugin.candidatesFor(args.resolveDir, args.path).map(
            (candidate) => PreservedModuleEsmPlugin.canonical(candidate),
          );
          const target = candidates.find((candidate) => modules.has(candidate));
          if (target !== undefined) {
            const targetName = modules.get(target) as string;
            return {
              path: PreservedModuleEsmPlugin.specifierBetween(importerName, targetName, extension),
              external: true,
            };
          }
          if (candidates.some((candidate) => PreservedModuleEsmPlugin.isFile(candidate))) {
            return undefined;
          }
          return {
            errors: [{ text: `cannot resolve relative import "${args.path}" from ${args.importer}` }],
          };
        });

        build.onEnd((result) => {
          const outputs = result.metafile?.outputs ?? {};
          const inlinedBy = new Map<string, string[]>();
          for (const [outputPath, output] of Object.entries(outputs)) {
            for (const [inputPath, input] of Object.entries(output.inputs)) {
              const inputAbs = PreservedModuleEsmPlugin.canonical(path.resolve(workingDir, inputPath));
              if (input.bytesInOutput === 0 || modules.has(inputAbs)) {
                continue;
              }
              inlinedBy.set(inputPath, [...(inlinedBy.get(inputPath) ?? []), outputPath]);
            }
          }
          const duplicated = [...inlinedBy].filter(([, outputPaths]) => outputPaths.length > 1);
          if (duplicated.length === 0) {
            return undefined;
          }
          return {
            errors: duplicated.map(([inputPath, outputPaths]) => ({
              text: `preserved-module ESM would inline ${inputPath} into ${outputPaths.length} modules (${outputPaths.join(', ')}); externalize it or import it from one module`,
            })),
          };
        });
      },
    };
  }

  /** Real path of an existing file, so symlinked working directories compare equal. */
  private static canonical(file: string): string {
    return existsSync(file) ? realpathSync(file) : file;
  }

  private static isFile(candidate: string): boolean {
    return existsSync(candidate) && statSync(candidate).isFile();
  }

  private static publicEntriesOf(options: BuildOptions, workingDir: string): Map<string, string> {
    const entries = new Map<string, string>();
    const entryPoints = options.entryPoints;
    if (entryPoints === undefined) {
      throw new Error('frontx-preserved-module-esm: the build has no entry points');
    }
    if (Array.isArray(entryPoints)) {
      for (const entry of entryPoints) {
        const input = typeof entry === 'string' ? entry : entry.in;
        const name = typeof entry === 'string' ? path.parse(entry).name : entry.out;
        entries.set(PreservedModuleEsmPlugin.canonical(path.resolve(workingDir, input)), name);
      }
    } else {
      for (const [name, input] of Object.entries(entryPoints)) {
        entries.set(PreservedModuleEsmPlugin.canonical(path.resolve(workingDir, input)), name);
      }
    }
    return entries;
  }

  /**
   * Every source module under the source root that a public entry reaches,
   * mapped to its output name. Found by a metafile-only bundle of the public
   * entries with every package external.
   */
  private async collectModules(
    build: PluginBuild,
    publicEntries: Map<string, string>,
    sourceRootAbs: string,
    workingDir: string,
  ): Promise<Map<string, string>> {
    const scan = await build.esbuild.build({
      absWorkingDir: workingDir,
      entryPoints: [...publicEntries.keys()],
      bundle: true,
      write: false,
      metafile: true,
      packages: 'external',
      format: 'esm',
      platform: build.initialOptions.platform,
      target: build.initialOptions.target,
      tsconfig: build.initialOptions.tsconfig,
      loader: build.initialOptions.loader,
      outdir: build.initialOptions.outdir,
      logLevel: 'silent',
    });
    const modules = new Map<string, string>(publicEntries);
    const taken = new Map<string, string>([...publicEntries].map(([abs, name]) => [name, abs]));
    for (const inputPath of Object.keys(scan.metafile.inputs)) {
      const moduleAbs = PreservedModuleEsmPlugin.canonical(path.resolve(workingDir, inputPath));
      if (modules.has(moduleAbs)) {
        continue;
      }
      const insideSourceRoot = !path.relative(sourceRootAbs, moduleAbs).startsWith('..');
      const isSourceModule = PreservedModuleEsmPlugin.SOURCE_EXTENSIONS.includes(path.extname(moduleAbs));
      if (!insideSourceRoot || !isSourceModule || moduleAbs.endsWith('.d.ts')) {
        continue;
      }
      const outputName = PreservedModuleEsmPlugin.outputNameOf(sourceRootAbs, moduleAbs);
      const holder = taken.get(outputName);
      if (holder !== undefined) {
        throw new Error(
          `frontx-preserved-module-esm: ${moduleAbs} and ${holder} would both emit ${outputName}`,
        );
      }
      taken.set(outputName, moduleAbs);
      modules.set(moduleAbs, outputName);
    }
    return modules;
  }
}
