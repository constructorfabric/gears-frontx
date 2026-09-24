import fs from "node:fs";
import path from "node:path";

import MagicString from "magic-string";
import type { PreRenderedAsset, PreRenderedChunk } from "rollup";
import { nodeExternals } from "rollup-plugin-node-externals";
import type { Plugin, PluginOption, UserConfig } from "vite";
import dts from "vite-plugin-dts";
import { libInjectCss } from "vite-plugin-lib-inject-css";

import { sortCopy } from "../src/core/array";

const discoverPublicEntries = (sourceRoot = "src") => {
  const files = sortCopy(fs.globSync(path.join(sourceRoot, "**/public.ts")));

  const entries: Record<string, string> = {};

  for (const file of files) {
    const name = path.basename(path.dirname(file));

    if (name === path.basename(sourceRoot) || entries[name]) {
      throw new Error(`Duplicate public calendar entry: ${name}`);
    }

    entries[name] = file;
  }

  return entries;
};

const assertUiFamilyDocs = (entries: Record<string, string>): void => {
  const uiRoot = path.join("src", "ui");

  for (const file of Object.values(entries)) {
    if (!file.startsWith(`${uiRoot}${path.sep}`)) {
      continue;
    }

    const family = path.basename(path.dirname(file));

    if (fs.globSync(path.join(path.dirname(file), "*.md")).length === 0) {
      throw new Error(
        `Public calendar family ${family} has no sibling .md file in src/ui/${family}/`
      );
    }
  }
};

const declarationSpecifierPattern =
  /(?<prefix>\bfrom\s+|\bimport\s*\(\s*)(?<quote>['"])(?<specifier>\.\.?\/[^'"]+)\k<quote>/gu;

const RESOLVED_SPECIFIER_SUFFIXES = [".js", ".css", ".json", "?raw"];

const DIRECTORY_SPECIFIER = /(?:^|\/)\.{1,2}$/u;

// A directory specifier ('..', '../..') resolves through the index file it
// names; appending '.js' to it would emit '../...js'. Naming the index keeps
// the specifier explicit for NodeNext consumers.
export const ensureDeclarationSpecifierExtension = (
  specifier: string
): string => {
  if (specifier.endsWith("/")) {
    return `${specifier}index.js`;
  }

  if (DIRECTORY_SPECIFIER.test(specifier)) {
    return `${specifier}/index.js`;
  }

  return RESOLVED_SPECIFIER_SUFFIXES.some((suffix) =>
    specifier.endsWith(suffix)
  )
    ? specifier
    : `${specifier}.js`;
};

const rewriteDeclarationSpecifiers = (filePath: string, content: string) => {
  const rewrittenContent = content.replace(
    declarationSpecifierPattern,
    (_match: string, prefix: string, quote: string, specifier: string) =>
      `${prefix}${quote}${ensureDeclarationSpecifierExtension(specifier)}${quote}`
  );

  return { content: rewrittenContent, filePath };
};

const assertUniqueDocsBasenames = (
  files: readonly string[],
  docsDir = "dist/docs"
): void => {
  const seen = new Map<string, string>();

  for (const file of files) {
    const base = path.basename(file);
    const previous = seen.get(base);

    if (previous !== undefined) {
      throw new Error(
        `Duplicate calendar docs basename ${base}: ${previous} and ${file} both copy to ${docsDir}/${base}`
      );
    }

    seen.set(base, file);
  }
};

const RELATIVE_DOC_LINK =
  /\]\((?!https?:)(?:[^)#\s]*\/)?(?<file>[^/)#\s]+\.md)(?<hash>#[^)\s]*)?\)/gu;

export const flattenDocLinks = (markdown: string): string =>
  markdown.replaceAll(
    RELATIVE_DOC_LINK,
    (_link, file: string, hash: string | undefined) => `](${file}${hash ?? ""})`
  );

const readShippedDoc = (file: string): string =>
  flattenDocLinks(fs.readFileSync(file, "utf-8"));

const docRank = (file: string): number => {
  if (file.startsWith("src/docs/")) {
    return file.endsWith("index.md") ? 0 : 1;
  }

  return file.startsWith("src/styles/") ? 2 : 3;
};

export const shippedDocs = (): string[] =>
  sortCopy(
    fs.globSync("src/**/*.md"),
    (left, right) => docRank(left) - docRank(right) || left.localeCompare(right)
  );

export const buildLlmsFull = (
  docs: readonly string[],
  index: string
): string => {
  const sections = docs.map(
    (file) =>
      `<!-- ${path.basename(file)} -->\n\n${readShippedDoc(file).trimEnd()}`
  );

  return `${[index.trimEnd(), ...sections].join("\n\n")}\n`;
};

const copyDocsToDist = (docs: readonly string[], distDir: string): void => {
  const docsDir = path.join(distDir, "docs");

  assertUniqueDocsBasenames(docs, docsDir);
  fs.mkdirSync(docsDir, { recursive: true });

  for (const file of docs) {
    fs.writeFileSync(
      path.join(docsDir, path.basename(file)),
      readShippedDoc(file)
    );
  }
};

const normalizeModuleId = (moduleId: string): string => {
  const [modulePath] = moduleId.split("?");

  return modulePath.split(path.sep).join("/");
};

const SOURCE_MODULE_PATH =
  /(?:^|\/)src\/(?<layer>ui|core|react|i18n)\/(?<rest>.+)$/u;

const sourceModuleBaseName = (fileName: string | undefined): string | null => {
  if (fileName === undefined) {
    return null;
  }

  const baseName = fileName
    .replace(/\.module\.css$/u, "")
    .replace(/\.(?:[cm]?[jt]sx?)$/u, "");

  return baseName === fileName || baseName === "public" ? null : baseName;
};

const sourceModuleName = (
  moduleId: string
): { readonly layer: "ui" | "shared"; readonly name: string } | null => {
  const groups = SOURCE_MODULE_PATH.exec(normalizeModuleId(moduleId))?.groups;

  if (groups?.layer === undefined || groups.rest === undefined) {
    return null;
  }

  const segments = groups.rest.split("/");
  const family = segments.at(0);

  if (groups.layer === "ui" && family !== "primitives") {
    return family === undefined ? null : { layer: "ui", name: family };
  }

  const name = sourceModuleBaseName(segments.at(-1));

  if (name === null) {
    return null;
  }

  return { layer: groups.layer === "ui" ? "ui" : "shared", name };
};

export const resolveManualChunkName = (
  moduleId: string
): string | undefined => {
  const normalizedId = normalizeModuleId(moduleId);
  const sourceName = sourceModuleName(moduleId);

  if (sourceName === null) {
    return undefined;
  }

  if (sourceName.layer !== "ui" || !normalizedId.includes("/src/ui/")) {
    return undefined;
  }

  return sourceName.name;
};

export const resolveChunkName = (
  chunk: Pick<PreRenderedChunk, "isEntry" | "moduleIds" | "name">
): string => {
  if (chunk.isEntry) {
    return chunk.name;
  }

  const uiFamilies = new Set<string>();
  const sharedModules = new Set<string>();

  for (const moduleId of chunk.moduleIds) {
    const sourceName = sourceModuleName(moduleId);

    if (sourceName === null) {
      continue;
    }

    if (sourceName.layer === "ui") {
      uiFamilies.add(sourceName.name);
    } else {
      sharedModules.add(sourceName.name);
    }
  }

  const sortedFamilies = sortCopy([...uiFamilies]);

  if (sortedFamilies.length > 1) {
    throw new Error(
      `Calendar UI families cannot share a chunk: ${sortedFamilies.join(", ")}`
    );
  }

  const family = sortedFamilies.at(0);

  if (family !== undefined) {
    return family;
  }

  const sharedModule = sortCopy([...sharedModules]).at(0);

  if (sharedModule !== undefined) {
    return sharedModule;
  }

  if (chunk.name === "public") {
    throw new Error(
      "Unable to name a public calendar chunk from its source modules"
    );
  }

  return chunk.name;
};

export const createOutputFileNames = () => {
  const resolvedChunkNames = new Map<string, string>();

  return {
    assetFileNames(asset: PreRenderedAsset): string {
      const assetName =
        asset.names?.at(0) ?? asset.originalFileNames?.at(0) ?? "asset";
      const baseName = path.basename(assetName, path.extname(assetName));
      const resolvedName = resolvedChunkNames.get(baseName) ?? baseName;

      if (resolvedName === "public") {
        throw new Error("Calendar build cannot emit a public asset chunk");
      }

      return `chunks/${resolvedName}.[hash][extname]`;
    },
    chunkFileNames(chunk: PreRenderedChunk): string {
      const resolvedName = resolveChunkName(chunk);
      resolvedChunkNames.set(chunk.name, resolvedName);

      return `chunks/${resolvedName}.js`;
    },
  };
};

const afterBuild = (emittedFiles: Map<string, string>): void => {
  const distDir = path.resolve("dist");

  for (const filename of emittedFiles.keys()) {
    if (!filename.endsWith(`${path.sep}public.d.ts`)) {
      continue;
    }

    const entryPath = path.relative(distDir, filename);
    const entryName = path.basename(path.dirname(entryPath));
    const declarationPath = path.resolve(distDir, `${entryName}.d.ts`);
    const declarationTarget = entryPath
      .replace(/\.d\.ts$/u, ".js")
      .split(path.sep)
      .join("/");
    fs.writeFileSync(
      declarationPath,
      `export * from './${declarationTarget}'`,
      "utf-8"
    );
  }
};

const buildEntries = (): Plugin => ({
  apply: "build",
  closeBundle(error) {
    if (error) {
      return;
    }

    const distDir = "dist";
    fs.mkdirSync(distDir, { recursive: true });
    fs.copyFileSync("src/styles/theme.css", `${distDir}/theme.css`);
    fs.copyFileSync("src/styles/reset.css", `${distDir}/reset.css`);

    const themesDir = path.join(distDir, "themes");
    fs.mkdirSync(themesDir, { recursive: true });
    fs.copyFileSync(
      "src/styles/themes/onecloud.css",
      path.join(themesDir, "onecloud.css")
    );

    const docs = shippedDocs();

    if (docs.length === 0) {
      return;
    }

    copyDocsToDist(docs, distDir);
    fs.writeFileSync(
      path.join(distDir, "llms-full.txt"),
      buildLlmsFull(docs, fs.readFileSync("llms.txt", "utf-8"))
    );
  },
  config(): UserConfig {
    const entries = discoverPublicEntries();
    assertUiFamilyDocs(entries);

    return {
      build: {
        lib: {
          entry: {
            index: "src/index.ts",
            ...entries,
          },
          formats: ["es"],
        },
        rollupOptions: {
          output: {
            ...createOutputFileNames(),
            hoistTransitiveImports: false,
            manualChunks: resolveManualChunkName,
            onlyExplicitManualChunks: true,
          },
          treeshake: {
            moduleSideEffects: (id) => id.endsWith(".css"),
          },
        },
        sourcemap: true,
      },
    };
  },
  name: "calendar-kit-build-entries",
});

const preserveUseClientPlugin = (): Plugin => {
  const useClient = "'use client';";
  const directive = /^['"]use client['"];?/u;
  const leadingTrivia = /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/u;
  const clientModuleIds = new Set<string>();

  const hasLeadingUseClient = (source: string): boolean => {
    const triviaLength = leadingTrivia.exec(source)?.[0].length ?? 0;

    return directive.test(source.slice(triviaLength));
  };

  return {
    apply: "build",
    name: "calendar-kit-preserve-use-client",
    renderChunk(code, chunk) {
      if (
        directive.test(code) ||
        !chunk.moduleIds.some((id) => clientModuleIds.has(id))
      ) {
        return null;
      }

      const magicString = new MagicString(code);
      magicString.prepend(`${useClient}\n`);

      return {
        code: magicString.toString(),
        map: magicString.generateMap({ hires: true }),
      };
    },
    transform(source, id) {
      if (hasLeadingUseClient(source)) {
        clientModuleIds.add(id);
      }

      return null;
    },
  };
};

export const buildPlugin = (): PluginOption[] => [
  nodeExternals(),
  libInjectCss(),
  buildEntries(),
  preserveUseClientPlugin(),
  dts({
    afterBuild,
    beforeWriteFile: rewriteDeclarationSpecifiers,
    entryRoot: "src",
    exclude: ["src/**/*.test.*", "src/**/*.spec.*", "src/__test-utils__/**"],
    outDir: "dist",
    tsconfigPath: "tsconfig.json",
  }),
];
