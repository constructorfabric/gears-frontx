// @cpt-algo:cpt-frontx-algo-cli-tooling-generate-project:p1
// @cpt-dod:cpt-frontx-dod-cli-tooling-templates:p1
// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-template-selection:p1:inst-template-no-uikit-utils
import path from 'path';
import { createRequire } from 'module';
import fs from 'fs-extra';
import type {
  GeneratedFile,
  Hai3Config,
  LayerType,
  PackageManager,
} from '../core/types.js';
import {
  DEFAULT_PACKAGE_MANAGER,
  STANDALONE_APP_WORKSPACES,
  getPackageManagerEngines,
  getManagerWorkspaceFiles,
  getWorkspaceRunScriptCommand,
  packageManagerFieldValue,
  transformPackageManagerText,
} from '../core/packageManager.js';
import { getTemplatesDir } from '../core/templates.js';
import { isTargetApplicableToLayer, selectCommandVariant } from '../core/layers.js';
import {
  getLocalPackageRef,
  resolvePathUnderProjectRoot,
  rewriteTsconfigPackagePaths,
} from '../utils/project.js';
import { applyMfeReplacements, applyMfeFileRename } from './screenset.js';
import { isCustomUikit, assertValidUikitForCodegen, normalizeUikit } from '../utils/validation.js';
import {
  getUikitBridge,
  generateGenericThemes,
  generateGenericGlobalsCss,
  type CssAliasBridge,
} from './uikitBridges.js';

/**
 * Test scaffold choice for generated projects.
 * - `'unit'`: ship Vitest config, test files, deps, and scripts (default)
 * - `'none'`: skip every test artifact for prototype/demo scaffolds
 */
export type TestsScaffold = 'unit' | 'none';

const TESTS_SCAFFOLD_VALUES: readonly TestsScaffold[] = ['unit', 'none'];

export function isTestsScaffold(value: unknown): value is TestsScaffold {
  return typeof value === 'string' && (TESTS_SCAFFOLD_VALUES as readonly string[]).includes(value);
}

/**
 * Input for project generation
 */
export interface ProjectGeneratorInput {
  /** Project name (npm package name format) */
  projectName: string;
  /** Include studio */
  studio: boolean;
  /** UI components: 'shadcn' (default), 'none', or an npm package name */
  uikit?: string;
  /** Package manager to configure generated project for */
  packageManager?: PackageManager;
  /** Project layer (SDK architecture tier) */
  layer?: LayerType;
  /** Use local monorepo packages via file: (for linked CLI development) */
  useLocalPackages?: boolean;
  /** Monorepo root path when useLocalPackages is true */
  monorepoRoot?: string;
  /** Absolute path where the project will be written (for file: relative paths) */
  projectPath?: string;
  /** Test scaffold variant. Default: 'unit'. Use 'none' to skip Vitest scaffolding. */
  tests?: TestsScaffold;
}

const NO_UIKIT_UTILS_TEMPLATE = 'src/app/lib/utils.no-uikit.ts';
const NO_UIKIT_UTILS_CONTENT = `type ClassInput = string | false | null | undefined;

export function cn(...inputs: ClassInput[]) {
  return inputs.filter(Boolean).join(' ');
}
`;
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-template-selection:p1:inst-template-no-uikit-utils

/**
 * Unit-test devDependencies injected into every generated project's package.json.
 *
 * Kept as a CLI-owned constant so the generator (and its tests) never need to
 * read the monorepo root package.json. Cross-workspace version consistency is
 * enforced separately by `scripts/check-test-dependency-versions.mjs`.
 */
export const UNIT_TEST_DEV_DEPENDENCIES = {
  '@testing-library/dom': '10.4.1',
  '@testing-library/react': '16.3.2',
  '@vitest/coverage-v8': '4.1.4',
  jsdom: '26.1.0',
  vitest: '4.1.4',
} as const;

const TEST_ARTIFACT_PATTERNS: readonly RegExp[] = [
  /(?:^|\/)[^/]+\.test\.[cm]?[tj]sx?$/,
  /(?:^|\/)[^/]+\.spec\.[cm]?[tj]sx?$/,
  /(?:^|\/)__tests__\//,
  /(?:^|\/)__test-utils__\//,
  /(?:^|\/)vitest\.config\.[cm]?[tj]sx?$/,
  /(?:^|\/)vitest\.setup\.[cm]?[tj]sx?$/,
  /(?:^|\/)vitest\.mfe\.base\.[cm]?[tj]sx?$/,
  /(?:^|\/)vitest\.shared\.[cm]?[tj]sx?$/,
];

const TEST_DEV_DEP_NAMES: readonly string[] = [
  '@testing-library/dom',
  '@testing-library/react',
  '@vitest/coverage-v8',
  'jsdom',
  'vitest',
];

const TEST_SCRIPT_NAMES: readonly string[] = ['test', 'test:unit', 'test:unit:watch'];

function isTestArtifactPath(filePath: string): boolean {
  const normalized = filePath.split('\\').join('/');
  return TEST_ARTIFACT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function stripTestEntriesFromPackageJson(content: string): string {
  let pkg: {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
  };
  try {
    pkg = JSON.parse(content);
  } catch {
    return content;
  }
  if (pkg.scripts) {
    for (const name of TEST_SCRIPT_NAMES) {
      delete pkg.scripts[name];
    }
  }
  if (pkg.devDependencies) {
    for (const name of TEST_DEV_DEP_NAMES) {
      delete pkg.devDependencies[name];
    }
  }
  return JSON.stringify(pkg, null, 2) + '\n';
}

// @cpt-algo:cpt-frontx-algo-ui-libraries-choice-template-selection:p1
// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-template-selection:p1:inst-template-utils
export function getProjectUtilsTemplate(uikit: string): string {
  return uikit === 'shadcn' ? 'src/app/lib/utils.ts' : NO_UIKIT_UTILS_TEMPLATE;
}
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-template-selection:p1:inst-template-utils

/**
 * Read all files from a directory recursively
 */
// @cpt-begin:cpt-frontx-dod-ui-libraries-choice-create-scaffolding:p2:inst-scaffolding-read-dir
async function readDirRecursive(
  dir: string,
  basePath: string = ''
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];

  if (!(await fs.pathExists(dir))) {
    return files;
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(basePath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await readDirRecursive(fullPath, relativePath)));
    } else {
      const content = await fs.readFile(fullPath, 'utf-8');
      files.push({ path: relativePath, content });
    }
  }

  return files;
}
// @cpt-end:cpt-frontx-dod-ui-libraries-choice-create-scaffolding:p2:inst-scaffolding-read-dir

/**
 * Inject the concrete UI kit package name into the GUIDELINES.md UI KIT DISCOVERY section
 * so AI agents can immediately identify the library without reading frontx.config.json first.
 */
// @cpt-dod:cpt-frontx-dod-ui-libraries-choice-ai-guidelines:p1
// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-uikit-resolution:p1:inst-uikit-resolution-4
function injectUikitDiscovery(content: string, uikit: string): string {
  if (!isCustomUikit(uikit)) return content;

  // Add routing entry for UIKIT.md so AI is directed there when creating components
  content = content.replace(
    '### Application Layer\n- src/screensets',
    `### Application Layer\n- UI components, component creation -> .ai/targets/UIKIT.md\n- src/screensets`
  );

  content = content.replace(
    '## UI KIT DISCOVERY (REQUIRED)',
    `## UI KIT DISCOVERY (REQUIRED)\n- **This project uses**: \`${uikit}\` — check \`node_modules/${uikit}/\` for available exports before creating components.`
  );

  return content;
}
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-uikit-resolution:p1:inst-uikit-resolution-4

/**
 * Generate a .ai/targets/UIKIT.md for custom uikit projects.
 * Gives AI agents concrete, actionable instructions about the third-party library.
 */
// @cpt-begin:cpt-frontx-dod-ui-libraries-choice-ai-guidelines:p1:inst-ai-guidelines-uikit-target
function generateUikitTarget(uikit: string): string {
  return `# UI Kit: \`${uikit}\`

## AI WORKFLOW (REQUIRED)
1) Read this file before creating or modifying any UI component.
2) Check \`${uikit}\` exports FIRST — only create local components for gaps.

## PACKAGE
- npm package: \`${uikit}\`
- Barrel re-export: \`src/app/components/ui/index.ts\` (re-exports \`${uikit}\`)
- Import path: \`import { ComponentName } from '@/app/components/ui'\` or directly from \`${uikit}\`

## DISCOVERY
- REQUIRED: Read \`node_modules/${uikit}/\` to find available exports (check package.json \`exports\` field, then \`dist/index.d.ts\` or \`src/index.ts\`).
- REQUIRED: Search the package for the component you need before writing any new component code.

## RULES
- REQUIRED: Use \`${uikit}\` components for all standard UI (buttons, inputs, cards, dialogs, tables, etc.).
- REQUIRED: Import from \`@/app/components/ui\` or directly from \`${uikit}\`.
- REQUIRED: Follow the library's component API and prop patterns.
- REQUIRED: Only create local components in \`src/app/components/\` or screenset \`components/ui/\` when the library genuinely lacks the component.
- FORBIDDEN: Creating a local component that duplicates functionality already exported by \`${uikit}\`.
- FORBIDDEN: Wrapping \`${uikit}\` components in trivial pass-through wrappers.

## LOCAL COMPONENTS
When \`${uikit}\` does not provide a needed component:
- Screenset-specific UI primitives -> \`src/screensets/{name}/components/ui/\`
- Screenset-specific shared components -> \`src/screensets/{name}/components/\`
- App-wide shared components -> \`src/app/components/\`
`;
}
// @cpt-end:cpt-frontx-dod-ui-libraries-choice-ai-guidelines:p1:inst-ai-guidelines-uikit-target


/**
 * Generate theme files for a custom UI kit project.
 * For known bridges: library-specific themes.ts, bridge.css, index.ts.
 * For unknown libraries: generic themes with inline HSL values.
 */
// @cpt-algo:cpt-frontx-algo-ui-libraries-choice-bridge-generation:p1
// @cpt-dod:cpt-frontx-dod-ui-libraries-choice-bridge-generation:p1
// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-bridge-generation:p1:inst-bridge-generation-3
function generateCustomUikitThemes(uikit: string): GeneratedFile[] {
  const bridge = getUikitBridge(uikit);
  const themeFiles: GeneratedFile[] = [];

  if (bridge && bridge.type === 'css-alias') {
    const cssAlias = bridge as CssAliasBridge;

    // themes.ts — theme mapping using empty variables (library CSS classes handle styling)
    const themeEntries = cssAlias.themes.map((t) => {
      const defaultProp = t.default ? '\n    default: true,' : '';
      return `{
    id: '${t.id}',
    name: '${t.name}',${defaultProp}
    variables: {},
  }`;
    });

    themeFiles.push({
      path: 'src/app/themes/themes.ts',
      content: `import type { ThemeConfig } from '@gears-frontx/react';

export const hai3Themes: ThemeConfig[] = [
  ${themeEntries.join(',\n  ')},
];

export const DEFAULT_THEME_ID = '${cssAlias.themes.find((t) => t.default)?.id ?? cssAlias.themes[0].id}';
`,
    });

    // bridge.css — CSS aliases from library vars to FrontX vars
    themeFiles.push({
      path: 'src/app/themes/bridge.css',
      content: cssAlias.bridgeCss,
    });

    // index.ts — barrel export
    themeFiles.push({
      path: 'src/app/themes/index.ts',
      content: `export { hai3Themes, DEFAULT_THEME_ID } from './themes';\n`,
    });
  } else {
    // Unknown library — generate generic themes with inline values
    const { themes, defaultId } = generateGenericThemes();

    themeFiles.push({
      path: 'src/app/themes/adapter.ts',
      content: buildThemeAdapterFile(themes, defaultId),
    });

    themeFiles.push({
      path: 'src/app/themes/index.ts',
      content: `export { hai3Themes, DEFAULT_THEME_ID } from './adapter';\n`,
    });
  }

  return themeFiles;
}
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-bridge-generation:p1:inst-bridge-generation-3

/**
 * Check whether a CSS import path references a file that exists in the installed package.
 * Resolves the package root via its package.json, then checks for the subpath file
 * with and without a .css extension.
 * Returns true when the package is not resolvable (to avoid silently dropping imports
 * for packages that simply aren't installed yet in the CLI's environment).
 */
// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-bridge-generation:p1:inst-bridge-css-import-check
async function cssImportFileExists(modulePath: string): Promise<boolean> {
  try {
    const require = createRequire(import.meta.url);

    const parts = modulePath.split('/');
    const packageName = modulePath.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
    const subPath = modulePath.startsWith('@') ? parts.slice(2).join('/') : parts.slice(1).join('/');

    if (!subPath) return true;

    const pkgJsonPath = require.resolve(`${packageName}/package.json`);
    const pkgRoot = path.dirname(pkgJsonPath);

    const filePath = path.join(pkgRoot, subPath);
    return (await fs.pathExists(filePath)) || (await fs.pathExists(`${filePath}.css`));
  } catch {
    // Package not installed in the CLI environment — keep the import
    return true;
  }
}
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-bridge-generation:p1:inst-bridge-css-import-check

/**
 * Generate globals.css for a custom UI kit project.
 * For known bridges: library CSS imports + bridge.css import.
 * For unknown libraries: :root fallback variables and base styling.
 */
// @cpt-algo:cpt-frontx-algo-ui-libraries-choice-theme-propagation:p1
// @cpt-dod:cpt-frontx-dod-ui-libraries-choice-theme-propagation:p1
// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-theme-propagation:p1:inst-theme-custom-globals-css
async function generateCustomGlobalsCss(uikit: string): Promise<string> {
  const bridge = getUikitBridge(uikit);

  if (bridge && bridge.type === 'css-alias') {
    const cssAlias = bridge as CssAliasBridge;

    const filteredImports = (
      await Promise.all(
        cssAlias.cssImports.map(async (importLine) => {
          const match = importLine.match(/@import\s+["']([^"']+)["']/);
          if (!match) return importLine;
          const exists = await cssImportFileExists(match[1]);
          return exists ? importLine : null;
        })
      )
    ).filter(Boolean);

    const importLines = filteredImports.join('\n');

    return `${importLines}
@import './themes/bridge.css';

html, body {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
`;
  }

  return generateGenericGlobalsCss();
}
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-theme-propagation:p1:inst-theme-custom-globals-css

/**
 * Replace __LIBRARY_SYNC_IMPORT__ and __LIBRARY_SYNC_EFFECT__ placeholders
 * in App.tsx with bridge-specific or generic fallback code.
 */
// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-theme-propagation:p1:inst-theme-propagation-4
function applyAppPlaceholders(content: string, uikit: string): string {
  const bridge = getUikitBridge(uikit);

  if (bridge && bridge.type === 'css-alias') {
    content = content.replace('__LIBRARY_SYNC_IMPORT__', bridge.syncImport);
    content = content.replace('__LIBRARY_SYNC_EFFECT__', bridge.syncEffect);
  } else {
    content = content.replace(
      '__LIBRARY_SYNC_IMPORT__',
      '// TODO: Import your library\'s theme switching API here'
    );
    content = content.replace(
      '__LIBRARY_SYNC_EFFECT__',
      '    // TODO: Sync HAI3 theme to your library\'s theme API\n    // e.g., yourLibrary.setTheme(currentTheme);'
    );
    // For unknown libraries, initializeThemeSystem doesn't exist — replace with no-op
    content = content.replace(
      'const cleanup = initializeThemeSystem();\n    return cleanup;',
      '// TODO: Initialize your library\'s theme system here\n    return () => {};'
    );
  }

  return content;
}
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-theme-propagation:p1:inst-theme-propagation-4

function shouldTransformForPackageManager(filePath: string): boolean {
  const textExtensions = new Set([
    '.md',
    '.mdc',
    '.ts',
    '.tsx',
    '.js',
    '.cjs',
    '.mjs',
    '.yaml',
    '.yml',
  ]);
  const ext = path.extname(filePath);
  return textExtensions.has(ext);
}

function rewriteCyberfabricDepsToLocalRefs(
  packageJsonContent: string,
  monorepoRoot: string,
  projectPath: string,
): string {
  const packageJson = JSON.parse(packageJsonContent) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const rewriteDeps = (deps?: Record<string, string>) => {
    if (!deps) {
      return deps;
    }

    const nextDeps: Record<string, string> = {};
    for (const [name, value] of Object.entries(deps)) {
      nextDeps[name] = name.startsWith('@gears-frontx/')
        ? getLocalPackageRef(name, monorepoRoot, projectPath)
        : value;
    }
    return nextDeps;
  };

  return JSON.stringify(
    {
      ...packageJson,
      dependencies: rewriteDeps(packageJson.dependencies),
      devDependencies: rewriteDeps(packageJson.devDependencies),
    },
    null,
    2,
  ) + '\n';
}

/**
 * Generate all files for a new FrontX project
 * Combines template files with dynamically generated config files
 */
// @cpt-dod:cpt-frontx-dod-ui-libraries-choice-create-scaffolding:p2
// @cpt-dod:cpt-frontx-dod-ui-libraries-choice-template-selection-impl:p1
// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-template-selection:p1:inst-template-types
type TemplateCopyInput = {
  templatesDir: string;
  studio: boolean;
  uikit: string;
  useLocalPackages: boolean;
  monorepoRoot?: string;
  projectPath?: string;
};

type AiTargetsInput = {
  templatesDir: string;
  layer: LayerType;
  uikit: string;
};

type PackageJsonInput = {
  projectName: string;
  studio: boolean;
  uikit: string;
  packageManager: PackageManager;
  useLocalPackages: boolean;
  monorepoRoot?: string;
  projectPath?: string;
};

const TEMPLATE_VARIANT_FILES = [
  'src/app/main.no-uikit.tsx',
  'src/app/main.custom-uikit.tsx',
  'src/app/lib/utils.no-uikit.ts',
  'src/app/App.no-studio.tsx',
  'src/app/App.no-uikit.tsx',
  'src/app/App.no-uikit.no-studio.tsx',
  'src/app/App.custom-uikit.tsx',
  'src/app/App.custom-uikit.no-studio.tsx',
];

const UI_DEPENDENT_TEMPLATE_FILES = [
  'tailwind.config.ts',
  'postcss.config.js',
  'components.json',
  'src/app/globals.css',
];

const ROOT_CONFIG_FILES = [
  'CLAUDE.md',
  'README.md',
  'eslint.config.js',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'vitest.setup.ts',
  '.dependency-cruiser.cjs',
  '.pre-commit-config.yaml',
  '.npmrc',
  '.nvmrc',
  '.github/workflows/ci.yml',
];
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-template-selection:p1:inst-template-types

// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-template-selection:p1:inst-template-manifest-load
async function loadTemplateManifest(templatesDir: string): Promise<{
  rootFiles: string[];
  directories: string[];
}> {
  const manifestPath = path.join(templatesDir, 'manifest.json');
  if (!(await fs.pathExists(manifestPath))) {
    throw new Error('Templates not found. Run `npm run build` in packages/cli first.');
  }

  const manifest = await fs.readJson(manifestPath);
  return {
    rootFiles: manifest.stage1b?.rootFiles || manifest.rootFiles || [],
    directories: manifest.stage1b?.directories || manifest.directories || [],
  };
}
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-template-selection:p1:inst-template-manifest-load

// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-template-selection:p1:inst-template-selection-3
// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-template-selection:p1:inst-template-selection-4
function getMainTemplateName(uikit: string): string {
  if (uikit === 'shadcn') return 'src/app/main.tsx';
  if (isCustomUikit(uikit)) return 'src/app/main.custom-uikit.tsx';
  return 'src/app/main.no-uikit.tsx';
}

function getAppTemplateName(uikit: string, studio: boolean): string {
  if (uikit === 'shadcn') return studio ? 'src/app/App.tsx' : 'src/app/App.no-studio.tsx';
  if (isCustomUikit(uikit)) {
    return studio ? 'src/app/App.custom-uikit.tsx' : 'src/app/App.custom-uikit.no-studio.tsx';
  }
  return studio ? 'src/app/App.no-uikit.tsx' : 'src/app/App.no-uikit.no-studio.tsx';
}

function sanitizeMainTemplateContent(content: string): string {
  return content.replace(
    /^\/\/ @ts-expect-error .*template-sources-only tree\.\n/gm,
    ''
  );
}

/**
 * Strip `@ts-nocheck` template-source directives that only exist because the
 * file lives in `template-sources/` where `@/` aliases don't resolve. In a
 * scaffolded project those aliases resolve, so the directive becomes dead
 * weight — and the project's eslint config bans `@ts-nocheck` anyway.
 */
function sanitizeTemplateTsNoCheck(content: string): string {
  return content.replace(
    /^\/\/ @ts-nocheck.*Template source:.*\n/gm,
    ''
  );
}
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-template-selection:p1:inst-template-selection-4
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-template-selection:p1:inst-template-selection-3

// @cpt-begin:cpt-frontx-dod-ui-libraries-choice-template-selection-impl:p1:inst-template-copy
async function copyTemplateFiles(input: TemplateCopyInput): Promise<GeneratedFile[]> {
  // @cpt-begin:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-validate-runner
  const { templatesDir, studio, uikit, useLocalPackages, monorepoRoot, projectPath } = input;
  const files: GeneratedFile[] = [];
  const { rootFiles, directories } = await loadTemplateManifest(templatesDir);
  // @cpt-end:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-validate-runner

  for (const file of rootFiles) {
    if (file === 'src/app/lib/utils.ts' && uikit !== 'shadcn') {
      const templatePath = path.join(templatesDir, getProjectUtilsTemplate(uikit));
      const content = (await fs.pathExists(templatePath))
        ? await fs.readFile(templatePath, 'utf-8')
        : NO_UIKIT_UTILS_CONTENT;
      files.push({ path: 'src/app/lib/utils.ts', content });
      continue;
    }

    if (file === 'src/app/main.tsx') {
      const templatePath = path.join(templatesDir, getMainTemplateName(uikit));
      const content = sanitizeMainTemplateContent(await fs.readFile(templatePath, 'utf-8'));
      files.push({ path: 'src/app/main.tsx', content });
      continue;
    }

    if (file === 'src/app/App.tsx') {
      const templatePath = path.join(templatesDir, getAppTemplateName(uikit, studio));
      let content = await fs.readFile(templatePath, 'utf-8');
      if (isCustomUikit(uikit)) {
        content = applyAppPlaceholders(content, uikit);
      }
      files.push({ path: 'src/app/App.tsx', content });
      continue;
    }

    if (TEMPLATE_VARIANT_FILES.includes(file)) {
      continue;
    }
    if (uikit !== 'shadcn' && UI_DEPENDENT_TEMPLATE_FILES.includes(file)) {
      continue;
    }

    const filePath = path.join(templatesDir, file);
    if (await fs.pathExists(filePath)) {
      const raw = await fs.readFile(filePath, 'utf-8');
      // Strip template-source-only `@ts-nocheck` directives: they exist because
      // `@/` aliases don't resolve inside the CLI's template-sources tree, but
      // in a scaffolded project the aliases resolve and the directive is dead
      // weight (and the project's eslint config bans `@ts-nocheck`).
      files.push({ path: file, content: sanitizeTemplateTsNoCheck(raw) });
    }
  }

  // @cpt-begin:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-generate-starter-tests
  for (const dir of directories) {
    if (dir === 'src/app/themes' && uikit !== 'shadcn') continue;
    if (dir === 'src/app/components' && uikit !== 'shadcn') continue;
    const dirSegments = dir.split('/').filter((segment) => segment.length > 0);
    let dirFiles = await readDirRecursive(
      resolvePathUnderProjectRoot(templatesDir, ...dirSegments),
      dir,
    );
    if (dir === 'src/app/lib' && uikit !== 'shadcn') {
      dirFiles = dirFiles.filter((file) => file.path !== 'src/app/lib/utils.ts');
    }
    files.push(...dirFiles);
  }
  // @cpt-end:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-generate-starter-tests

  const mfeCoreFiles = ['MfeScreenContainer.tsx', 'bootstrap.ts'];
  for (const mfeFile of mfeCoreFiles) {
    const mfePath = path.join(templatesDir, 'src/app/mfe', mfeFile);
    if (await fs.pathExists(mfePath)) {
      files.push({
        path: `src/app/mfe/${mfeFile}`,
        content: await fs.readFile(mfePath, 'utf-8'),
      });
    }
  }

  // @cpt-begin:cpt-frontx-dod-ui-libraries-choice-template-selection-impl:p1:inst-mfe-runtime-fetch-placeholder
  // The bootstrap fetches `/generated-mfe-manifests.json` from public/ at
  // runtime. Ship an empty `[]` placeholder produced by the templates pipeline
  // so a freshly-scaffolded project boots before its first
  // `npm run generate:mfe-manifests`. Same script regenerates this JSON in both
  // monorepo and scaffolded contexts.
  const manifestPlaceholderSrc = path.join(templatesDir, 'public/generated-mfe-manifests.json');
  if (await fs.pathExists(manifestPlaceholderSrc)) {
    files.push({
      path: 'public/generated-mfe-manifests.json',
      content: await fs.readFile(manifestPlaceholderSrc, 'utf-8'),
    });
  }
  // @cpt-end:cpt-frontx-dod-ui-libraries-choice-template-selection-impl:p1:inst-mfe-runtime-fetch-placeholder

  // @cpt-begin:cpt-frontx-dod-ui-libraries-choice-template-selection-impl:p1:inst-mfe-manifest-generator-script
  const generatorScriptSrc = path.join(templatesDir, 'scripts/generate-mfe-manifests.ts');
  if (await fs.pathExists(generatorScriptSrc)) {
    files.push({
      path: 'scripts/generate-mfe-manifests.ts',
      content: await fs.readFile(generatorScriptSrc, 'utf-8'),
    });
  }
  // @cpt-end:cpt-frontx-dod-ui-libraries-choice-template-selection-impl:p1:inst-mfe-manifest-generator-script

  const layoutDir = uikit === 'shadcn'
    ? path.join(templatesDir, 'layout', 'shadcn')
    : path.join(templatesDir, 'layout', 'custom-uikit');
  if (await fs.pathExists(layoutDir)) {
    files.push(...(await readDirRecursive(layoutDir, 'src/app/layout')));
  }

  const eslintPluginDir = path.join(templatesDir, 'eslint-plugin-local');
  if (await fs.pathExists(eslintPluginDir)) {
    files.push(...(await readDirRecursive(eslintPluginDir, 'eslint-plugin-local')));
  }

  const scriptsDir = path.join(templatesDir, 'scripts');
  if (await fs.pathExists(scriptsDir)) {
    const scriptFiles = (await readDirRecursive(scriptsDir, 'scripts'))
      .filter((f) => !f.path.includes('generate-colors'));
    files.push(...scriptFiles);
  }

  const rootConfigFiles = uikit === 'shadcn' ? [...ROOT_CONFIG_FILES, 'postcss.config.js'] : ROOT_CONFIG_FILES;
  // @cpt-begin:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-generate-runner-config
  for (const file of rootConfigFiles) {
    const filePath = path.join(templatesDir, file);
    if (await fs.pathExists(filePath)) {
      files.push({ path: file, content: await fs.readFile(filePath, 'utf-8') });
    }
  }
  // @cpt-end:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-generate-runner-config

  const mfeSharedDir = path.join(templatesDir, 'mfe-shared');
  if (await fs.pathExists(mfeSharedDir)) {
    files.push(...(await readDirRecursive(mfeSharedDir, 'src/mfe_packages/shared')));
  }

  const mfeVitestBasePath = resolvePathUnderProjectRoot(
    templatesDir,
    'src',
    'mfe_packages',
    'vitest.mfe.base.ts',
  );
  if (await fs.pathExists(mfeVitestBasePath)) {
    files.push({
      path: 'src/mfe_packages/vitest.mfe.base.ts',
      content: await fs.readFile(mfeVitestBasePath, 'utf-8'),
    });
  }

  // @cpt-begin:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-generate-blank-mfe-tests
  if (uikit === 'shadcn') {
    const mfeTemplateDir = path.join(templatesDir, 'mfe-template');
    if (await fs.pathExists(mfeTemplateDir)) {
      const templateFiles = await readDirRecursive(mfeTemplateDir);
      const demoFiles = templateFiles.map((file) => {
        const normalizedPath = file.path.replace(/\\/g, path.posix.sep);
        const parts = normalizedPath.split(path.posix.sep);
        const renamedParts = parts.map((part) => applyMfeFileRename(part, 'demo'));
        const renamedPath = renamedParts.join(path.posix.sep);
        let content = applyMfeReplacements(file.content, 'demo', 'Demo', 3001);
        if (
          useLocalPackages &&
          monorepoRoot &&
          projectPath &&
          normalizedPath === 'package.json'
        ) {
          content = rewriteCyberfabricDepsToLocalRefs(
            content,
            monorepoRoot,
            resolvePathUnderProjectRoot(projectPath, 'src', 'mfe_packages', 'demo-mfe'),
          );
        }
        return { path: path.posix.join('src/mfe_packages/demo-mfe', renamedPath), content };
      });
      files.push(...demoFiles);
    }
  }
  // @cpt-end:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-generate-blank-mfe-tests

  return files;
}
// @cpt-end:cpt-frontx-dod-ui-libraries-choice-template-selection-impl:p1:inst-template-copy

// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-theme-propagation:p1:inst-theme-adapter-build
function buildThemeAdapterFile(themes: ReturnType<typeof generateGenericThemes>['themes'], defaultId: string): string {
  const themeBlocks = themes.map((theme) => {
    const varsBlock = Object.entries(theme.variables)
      .map(([key, value]) => `      '${key}': '${value}',`)
      .join('\n');
    const defaultProp = theme.default ? '\n    default: true,' : '';
    return `{
    id: '${theme.id}',
    name: '${theme.name}',${defaultProp}
    variables: {
${varsBlock}
    },
  }`;
  });

  return `import type { ThemeConfig } from '@gears-frontx/react';

export const hai3Themes: ThemeConfig[] = [
  ${themeBlocks.join(',\n  ')},
];

export const DEFAULT_THEME_ID = '${defaultId}';
`;
}
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-theme-propagation:p1:inst-theme-adapter-build

// @cpt-begin:cpt-frontx-dod-ui-libraries-choice-theme-propagation:p1:inst-theme-files-generate
async function generateThemeFiles(uikit: string): Promise<GeneratedFile[]> {
  const resolvedUikit = normalizeUikit(uikit);
  const files: GeneratedFile[] = [];

  if (isCustomUikit(resolvedUikit)) {
    assertValidUikitForCodegen(resolvedUikit);
    const bridge = getUikitBridge(resolvedUikit);
    const primitiveWarning = bridge
      ? ''
      : [
        `// WARNING: '${resolvedUikit}' is not a recognized bridge package.`,
        '// The following normalized primitives may not be available from this library:',
        '//   Button, Input, Card, Dialog, Form, Notification',
        '// If any are missing, add manual re-exports or wrapper components below.',
        '',
      ].join('\n');

    files.push({
      path: 'src/app/components/ui/index.ts',
      content: `${primitiveWarning}export * from '${resolvedUikit}';\n`,
    });
    files.push(...generateCustomUikitThemes(resolvedUikit));
    files.push({
      path: 'src/app/globals.css',
      content: await generateCustomGlobalsCss(resolvedUikit),
    });
  }

  if (resolvedUikit === 'none') {
    files.push({
      path: 'src/app/globals.css',
      content: generateGenericGlobalsCss(),
    });
    const { themes, defaultId } = generateGenericThemes();
    files.push({
      path: 'src/app/themes/adapter.ts',
      content: buildThemeAdapterFile(themes, defaultId),
    });
    files.push({
      path: 'src/app/themes/index.ts',
      content: `export { hai3Themes, DEFAULT_THEME_ID } from './adapter';\n`,
    });
  }

  return files;
}
// @cpt-end:cpt-frontx-dod-ui-libraries-choice-theme-propagation:p1:inst-theme-files-generate

// @cpt-begin:cpt-frontx-dod-ui-libraries-choice-ai-guidelines:p1:inst-ai-targets-generate
async function generateAiTargets(input: AiTargetsInput): Promise<GeneratedFile[]> {
  const { templatesDir, layer, uikit } = input;
  const files: GeneratedFile[] = [];

  const aiTargetsDir = path.join(templatesDir, '.ai/targets');
  if (await fs.pathExists(aiTargetsDir)) {
    const targetFiles = await fs.readdir(aiTargetsDir);
    for (const targetFile of targetFiles) {
      if (!targetFile.endsWith('.md')) continue;
      if (!isTargetApplicableToLayer(targetFile, layer)) continue;
      files.push({
        path: `.ai/targets/${targetFile}`,
        content: await fs.readFile(path.join(aiTargetsDir, targetFile), 'utf-8'),
      });
    }
  }

  if (isCustomUikit(uikit)) {
    files.push({
      path: '.ai/targets/UIKIT.md',
      content: generateUikitTarget(uikit),
    });
  }

  const guidelinesVariants: Record<LayerType, string> = {
    sdk: 'GUIDELINES.sdk.md',
    framework: 'GUIDELINES.framework.md',
    react: 'GUIDELINES.md',
    app: 'GUIDELINES.md',
  };
  const guidelinesVariant = guidelinesVariants[layer];
  const guidelinesPath = path.join(templatesDir, '.ai', guidelinesVariant);
  if (await fs.pathExists(guidelinesPath)) {
    let content = await fs.readFile(guidelinesPath, 'utf-8');
    content = injectUikitDiscovery(content, uikit);
    files.push({ path: '.ai/GUIDELINES.md', content });
  } else {
    console.warn(`Warning: ${guidelinesVariant} not found, using default GUIDELINES.md`);
    const fallbackPath = path.join(templatesDir, '.ai/GUIDELINES.md');
    if (await fs.pathExists(fallbackPath)) {
      let content = await fs.readFile(fallbackPath, 'utf-8');
      content = injectUikitDiscovery(content, uikit);
      files.push({ path: '.ai/GUIDELINES.md', content });
    }
  }

  // @cpt-begin:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-write-testing-guidance
  for (const dirName of ['company', 'project']) {
    const hierarchyDir = path.join(templatesDir, '.ai', dirName);
    if (await fs.pathExists(hierarchyDir)) {
      files.push(...(await readDirRecursive(hierarchyDir, `.ai/${dirName}`)));
    }
  }
  // @cpt-end:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-write-testing-guidance

  for (const ideDir of ['.claude', '.cursor', '.windsurf']) {
    const dirPath = path.join(templatesDir, ideDir);
    if (await fs.pathExists(dirPath)) {
      files.push(...(await readDirRecursive(dirPath, ideDir)));
    }
  }

  const commandsBundleDir = path.join(templatesDir, 'commands-bundle');
  if (await fs.pathExists(commandsBundleDir)) {
    const bundledFiles = await fs.readdir(commandsBundleDir);
    const commandGroups = new Map<string, string[]>();
    for (const file of bundledFiles) {
      if (!file.endsWith('.md')) continue;
      const baseName = file.replace(/\.(sdk|framework|react)\.md$/, '.md');
      if (!commandGroups.has(baseName)) {
        commandGroups.set(baseName, []);
      }
      commandGroups.get(baseName)!.push(file);
    }
    for (const [baseName, variants] of commandGroups.entries()) {
      const selectedVariant = selectCommandVariant(baseName, layer, variants);
      if (!selectedVariant) continue;
      files.push({
        path: `.ai/commands/${baseName}`,
        content: await fs.readFile(path.join(commandsBundleDir, selectedVariant), 'utf-8'),
      });
    }
  }

  const userCommandsDir = path.join(templatesDir, '.ai/commands/user');
  if (await fs.pathExists(userCommandsDir)) {
    files.push(...(await readDirRecursive(userCommandsDir, '.ai/commands/user')));
  }

  return files;
}
// @cpt-end:cpt-frontx-dod-ui-libraries-choice-ai-guidelines:p1:inst-ai-targets-generate

// @cpt-begin:cpt-frontx-dod-ui-libraries-choice-create-scaffolding:p2:inst-scaffolding-package-json
export function buildPackageJson(input: PackageJsonInput): string {
  const {
    projectName,
    studio,
    uikit,
    packageManager,
    useLocalPackages,
    monorepoRoot,
    projectPath,
  } = input;
  const resolvedUikit = normalizeUikit(uikit);

  const dependencies: Record<string, string> = {
    '@gears-frontx/react': 'alpha',
    '@gears-frontx/framework': 'alpha',
    '@gears-frontx/api': 'alpha',
    '@gears-frontx/auth': 'alpha',
    '@gears-frontx/i18n': 'alpha',
    '@gears-frontx/screensets': 'alpha',
    '@gears-frontx/state': 'alpha',
    '@hookform/resolvers': '5.2.2',
    '@iconify/react': '5.0.2',
    '@radix-ui/react-avatar': '1.1.10',
    '@radix-ui/react-slot': '1.2.3',
    '@tanstack/query-core': '5.90.20',
    '@tanstack/react-query': '5.90.21',
    '@reduxjs/toolkit': '2.11.2',
    'class-variance-authority': '0.7.1',
    clsx: '2.1.1',
    'date-fns': '4.1.0',
    'input-otp': '1.4.2',
    lodash: '4.17.21',
    'lucide-react': '0.563.0',
    react: '19.2.4',
    'react-day-picker': '9.12.0',
    'react-dom': '19.2.4',
    'react-hook-form': '7.68.0',
    'react-redux': '9.2.0',
    sonner: '2.0.7',
    'tailwind-merge': '3.3.0',
    'tailwindcss-animate': '1.0.7',
    zod: '4.0.0',
  };

  // @cpt-begin:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-add-package-json-entries
  const devDependencies: Record<string, string> = {
    '@gears-frontx/cli': 'alpha',
    '@j178/prek': '0.2.25',
    '@types/node': '^24.9.1',
    '@types/lodash': '4.17.20',
    '@types/react': '19.0.8',
    '@types/react-dom': '19.0.3',
    '@testing-library/dom': UNIT_TEST_DEV_DEPENDENCIES['@testing-library/dom'],
    '@testing-library/react': UNIT_TEST_DEV_DEPENDENCIES['@testing-library/react'],
    '@eslint/js': '9.27.0',
    '@vitejs/plugin-react': '4.3.4',
    '@vitest/coverage-v8': UNIT_TEST_DEV_DEPENDENCIES['@vitest/coverage-v8'],
    autoprefixer: '10.4.18',
    eslint: '9.27.0',
    'eslint-plugin-react-hooks': '5.0.0',
    'eslint-plugin-unused-imports': '4.1.4',
    globals: '15.12.0',
    jsdom: UNIT_TEST_DEV_DEPENDENCIES.jsdom,
    postcss: '8.4.35',
    'postcss-load-config': '6.0.1',
    tailwindcss: '3.4.1',
    '@module-federation/vite': '^1.14.2',
    'dependency-cruiser': '17.3.2',
    tsx: '4.20.6',
    typescript: '5.4.2',
    'typescript-eslint': '8.32.1',
    vite: '6.4.2',
    vitest: UNIT_TEST_DEV_DEPENDENCIES.vitest,
  };

  if (studio) {
    devDependencies['@gears-frontx/studio'] = 'alpha';
  }

  if (resolvedUikit !== 'shadcn') {
    const tailwindDeps = ['tailwind-merge', 'tailwindcss-animate', 'class-variance-authority', 'clsx'];
    for (const dep of tailwindDeps) delete dependencies[dep];
    const tailwindDevDeps = ['tailwindcss', 'autoprefixer', 'postcss', 'postcss-load-config'];
    for (const dep of tailwindDevDeps) delete devDependencies[dep];
  }

  if (isCustomUikit(resolvedUikit)) {
    assertValidUikitForCodegen(resolvedUikit);
    dependencies[resolvedUikit] = 'latest';
    const bridge = getUikitBridge(resolvedUikit);
    if (bridge) {
      Object.assign(dependencies, bridge.dependencies);
    }
  }

  if (useLocalPackages && monorepoRoot && projectPath) {
    const toLocalRefs = (deps: Record<string, string>): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(deps)) {
        out[name] =
          name.startsWith('@gears-frontx/') ? getLocalPackageRef(name, monorepoRoot, projectPath) : value;
      }
      return out;
    };
    Object.assign(dependencies, toLocalRefs(dependencies));
    Object.assign(devDependencies, toLocalRefs(devDependencies));
  }

  const workspaceBuildCommand = getWorkspaceRunScriptCommand(
    packageManager,
    'eslint-plugin-local',
    'build'
  );

  const packageJson = {
    name: projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    packageManager: packageManagerFieldValue(packageManager),
    engines: getPackageManagerEngines(packageManager, '>=24.14.0'),
    workspaces: [...STANDALONE_APP_WORKSPACES],
    scripts: {
      'generate:mfe-manifests': 'tsx scripts/generate-mfe-manifests.ts',
      dev: 'tsx scripts/generate-mfe-manifests.ts && vite',
      'dev:all': 'tsx scripts/generate-mfe-manifests.ts && tsx scripts/dev-all.ts',
      'check:mcp': 'tsx scripts/check-mcp.ts',
      build: 'tsx scripts/generate-mfe-manifests.ts && vite build',
      preview: 'vite preview',
      test: 'vitest run',
      'test:unit': 'vitest --run --passWithNoTests=false',
      'test:unit:watch': 'vitest --watch',
      lint: `${workspaceBuildCommand} && eslint . --max-warnings 0`,
      'type-check': 'tsc --noEmit',
      'arch:check': 'tsx scripts/test-architecture.ts',
      'arch:deps': 'dependency-cruiser src/ --config .dependency-cruiser.cjs --output-type err-long',
      'ai:sync': 'frontx ai sync',
      'prek:install': 'prek install',
      'prek:run': 'prek run --all-files',
      postinstall: 'prek install',
    },
    dependencies,
    devDependencies,
    ...(packageManager === 'yarn'
      ? {
          // Yarn does not apply npm's `overrides`; pin React like npm/pnpm so nested
          // deps cannot pull a second copy (duplicate @types/react breaks `tsc`).
          resolutions: {
            react: dependencies.react,
            'react-dom': dependencies['react-dom'],
          },
        }
      : {
          overrides: {
            react: '$react',
            'react-dom': '$react-dom',
          },
        }),
  };
  // @cpt-end:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-add-package-json-entries

  return JSON.stringify(packageJson, null, 2) + '\n';
}
// @cpt-end:cpt-frontx-dod-ui-libraries-choice-create-scaffolding:p2:inst-scaffolding-package-json

// @cpt-flow:cpt-frontx-flow-ui-libraries-choice-create-shadcn:p2
// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-project-scaffold:p1
// @cpt-algo:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1
// @cpt-begin:cpt-frontx-dod-ui-libraries-choice-create-scaffolding:p2:inst-scaffolding-orchestrate
export async function generateProject(input: ProjectGeneratorInput): Promise<GeneratedFile[]> {
  // @cpt-begin:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-receive-runner
  const {
    projectName,
    studio,
    uikit = 'shadcn',
    packageManager = DEFAULT_PACKAGE_MANAGER,
    layer = 'app',
    useLocalPackages = false,
    monorepoRoot,
    projectPath,
    tests = 'unit',
  } = input;

  const templatesDir = getTemplatesDir();
  let files: GeneratedFile[] = [];
  // @cpt-end:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-receive-runner

  files.push(...(await copyTemplateFiles({
    templatesDir,
    studio,
    uikit,
    useLocalPackages,
    monorepoRoot,
    projectPath,
  })));
  files.push(...(await generateThemeFiles(uikit)));
  files.push(...(await generateAiTargets({ templatesDir, layer, uikit })));

  const config: Hai3Config = {
    frontx: true,
    layer,
    uikit,
    packageManager,
    ...(packageManager === 'yarn' ? { linkerMode: 'node-modules' as const } : {}),
  };
  files.push({
    path: 'frontx.config.json',
    content: JSON.stringify(config, null, 2) + '\n',
  });

  if (uikit === 'shadcn') {
    const componentsJson = {
      $schema: 'https://ui.shadcn.com/schema.json',
      style: 'new-york',
      rsc: false,
      tsx: true,
      tailwind: {
        config: 'tailwind.config.ts',
        css: 'src/app/globals.css',
        baseColor: 'neutral',
        cssVariables: true,
        prefix: '',
      },
      iconLibrary: 'lucide',
      aliases: {
        components: '@/app/components',
        utils: '@/app/lib/utils',
        ui: '@/app/components/ui',
        lib: '@/app/lib',
        hooks: '@/app/hooks',
      },
      registries: {},
    };
    files.push({
      path: 'components.json',
      content: JSON.stringify(componentsJson, null, 2) + '\n',
    });
  }

  files.push({
    path: 'package.json',
    content: buildPackageJson({
      projectName,
      studio,
      uikit,
      packageManager,
      useLocalPackages,
      monorepoRoot,
      projectPath,
    }),
  });

  const workspaceFiles = getManagerWorkspaceFiles(packageManager);
  files.push(...workspaceFiles);

  for (const file of files) {
    if (!file.path.endsWith('tsconfig.json')) {
      continue;
    }
    file.content = rewriteTsconfigPackagePaths(file.content, {
      useLocalPackages,
      monorepoRoot,
      projectPath,
      tsconfigPath: file.path,
    });
  }

  // Rewrite npm-centric snippets in template-derived text files.
  for (const file of files) {
    if (!shouldTransformForPackageManager(file.path)) {
      continue;
    }
    file.content = transformPackageManagerText(file.content, packageManager);
  }

  if (tests === 'none') {
    files = files.filter((file) => !isTestArtifactPath(file.path));
    for (const file of files) {
      const normalized = file.path.split('\\').join('/');
      if (normalized === 'package.json' || normalized.endsWith('/package.json')) {
        file.content = stripTestEntriesFromPackageJson(file.content);
      }
    }
  }

  // @cpt-begin:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-return-scaffolded-tests
  return files;
  // @cpt-end:cpt-frontx-algo-unit-test-generation-and-agent-verification-scaffold-tests:p1:inst-return-scaffolded-tests
}
// @cpt-end:cpt-frontx-dod-ui-libraries-choice-create-scaffolding:p2:inst-scaffolding-orchestrate
