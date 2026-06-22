// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-uikit-resolution:p1:inst-uikit-project-utils
import fs from 'fs-extra';
import path from 'path';
import type { Hai3Config, ConfigLoadResult } from '../core/types.js';
import { isCustomUikit, isValidPackageName, normalizeUikit } from './validation.js';

/**
 * Config file name
 */
export const CONFIG_FILE = 'frontx.config.json';

function isSinglePathSegmentForProjectJoin(name: string): boolean {
  if (name.length === 0) {
    return false;
  }
  if (name === '.' || name === '..') {
    return false;
  }
  if (name.includes('\0')) {
    return false;
  }
  if (
    name.includes(path.sep) ||
    name.includes(path.posix.sep) ||
    name.includes(path.win32.sep)
  ) {
    return false;
  }
  return true;
}

/**
 * Join an absolute `projectRoot` with fixed relative path segments and ensure
 * the result cannot escape the resolved root (SAST: do not `path.join` a
 * tainted root with a multi-segment relative string).
 */
export function resolvePathUnderProjectRoot(
  projectRoot: string,
  ...relativeSegments: string[]
): string {
  if (!projectRoot || projectRoot.includes('\0') || !path.isAbsolute(projectRoot)) {
    throw new Error(
      `Refusing to resolve under non-absolute or unsafe project root: ${JSON.stringify(projectRoot)}`
    );
  }
  const resolvedRoot = path.resolve(projectRoot);
  let cursor = resolvedRoot;
  for (const seg of relativeSegments) {
    if (!isSinglePathSegmentForProjectJoin(seg)) {
      throw new Error(
        `Refusing to resolve disallowed project-relative path segment: ${JSON.stringify(seg)}`
      );
    }
    cursor = path.join(cursor, seg);
  }
  const rel = path.relative(resolvedRoot, cursor);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `Refusing to resolve project path outside project root (${resolvedRoot}): ${relativeSegments.join(
        path.sep
      )}`
    );
  }
  return cursor;
}

/**
 * Check if a directory has @gears-frontx/* dependencies in package.json
 */
async function hasHai3Dependencies(dir: string): Promise<boolean> {
  const packageJsonPath = path.join(dir, 'package.json');
  if (!(await fs.pathExists(packageJsonPath))) {
    return false;
  }
  try {
    const packageJson = await fs.readJson(packageJsonPath);
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    return Object.keys(allDeps).some((dep) => dep.startsWith('@gears-frontx/'));
  } catch {
    return false;
  }
}

/**
 * Find FrontX project root by looking for frontx.config.json or package.json with @gears-frontx/* deps
 * Traverses parent directories until found or reaches filesystem root
 */
export async function findProjectRoot(
  startDir: string
): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  const { root } = path.parse(currentDir);

  while (currentDir !== root) {
    // First check for explicit frontx.config.json
    const configPath = path.join(currentDir, CONFIG_FILE);
    if (await fs.pathExists(configPath)) {
      return currentDir;
    }
    // Fallback: check for package.json with @gears-frontx/* dependencies
    if (await hasHai3Dependencies(currentDir)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-uikit-resolution:p1:inst-uikit-resolution-2
// @cpt-begin:cpt-frontx-algo-ui-libraries-choice-uikit-resolution:p1:inst-uikit-resolution-7
async function parseAndValidateConfig(configPath: string): Promise<Hai3Config> {
  const content = await fs.readFile(configPath, 'utf-8');
  let config: Hai3Config;
  try {
    config = JSON.parse(content) as Hai3Config;
  } catch (err) {
    throw new Error(`Invalid JSON in ${CONFIG_FILE}: ${(err as Error).message}`);
  }
  if (config.uikit !== undefined && (typeof config.uikit !== 'string' || config.uikit === '')) {
    throw new Error(
      `Invalid "uikit" value in ${CONFIG_FILE}: expected a non-empty string ("shadcn", "none", or an npm package name), got ${JSON.stringify(config.uikit)}.`
    );
  }
  if (typeof config.uikit === 'string') {
    config.uikit = normalizeUikit(config.uikit);
  }
  if (typeof config.uikit === 'string' && isCustomUikit(config.uikit) && !isValidPackageName(config.uikit)) {
    throw new Error(
      `Invalid "uikit" value in ${CONFIG_FILE}: "${config.uikit}" is not a valid npm package name.`
    );
  }
  return config;
}
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-uikit-resolution:p1:inst-uikit-resolution-7
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-uikit-resolution:p1:inst-uikit-resolution-2

/**
 * Load FrontX config from project root.
 * Returns a discriminated union — callers handle every outcome explicitly.
 */
// @cpt-algo:cpt-frontx-algo-ui-libraries-choice-uikit-resolution:p1
// @cpt-dod:cpt-frontx-dod-ui-libraries-choice-uikit-resolution-impl:p1
export async function loadConfig(
  projectRoot: string
): Promise<ConfigLoadResult> {
  // @cpt-begin:cpt-frontx-algo-ui-libraries-choice-uikit-resolution:p1:inst-uikit-resolution-1
  const configPath = path.join(projectRoot, CONFIG_FILE);
  // @cpt-end:cpt-frontx-algo-ui-libraries-choice-uikit-resolution:p1:inst-uikit-resolution-1
  if (!(await fs.pathExists(configPath))) {
    return {
      ok: false,
      error: 'not_found',
      message: `${CONFIG_FILE} not found in ${projectRoot}. Run this command from a FrontX project root created with \`frontx create\`.`,
    };
  }
  try {
    const config = await parseAndValidateConfig(configPath);
    return { ok: true, config };
  } catch (err) {
    return {
      ok: false,
      error: 'invalid',
      message: (err as Error).message,
    };
  }
}

/**
 * Save FrontX config to project root
 */
export async function saveConfig(
  projectRoot: string,
  config: Hai3Config
): Promise<void> {
  const configPath = path.join(projectRoot, CONFIG_FILE);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Check if a directory is inside a FrontX project
 */
export async function isInsideProject(dir: string): Promise<boolean> {
  return (await findProjectRoot(dir)) !== null;
}

/**
 * Get screensets directory path
 */
export function getScreensetsDir(projectRoot: string): string {
  return path.join(projectRoot, 'src', 'screensets');
}

/**
 * Check if a screenset exists
 */
export async function screensetExists(
  projectRoot: string,
  screensetId: string
): Promise<boolean> {
  const screensetPath = path.join(getScreensetsDir(projectRoot), screensetId);
  return fs.pathExists(screensetPath);
}

/**
 * Find FrontX monorepo root by walking up from a given path.
 * A directory is the monorepo root if it has packages/ and a root package.json
 * with workspaces that include "packages/*".
 * Use when the CLI runs from a linked copy (npm link) so generated projects
 * can reference local packages via file:.
 */
export async function findMonorepoRoot(fromPath: string): Promise<string | null> {
  const envRoot = process.env.FRONTX_MONOREPO_ROOT;
  if (envRoot && (await fs.pathExists(path.join(envRoot, 'packages', 'react', 'package.json')))) {
    return path.resolve(envRoot);
  }

  let currentDir = path.resolve(fromPath);
  const { root } = path.parse(currentDir);

  while (currentDir !== root) {
    const pkgPath = path.join(currentDir, 'package.json');
    const reactPkgPath = path.join(currentDir, 'packages', 'react', 'package.json');
    if ((await fs.pathExists(pkgPath)) && (await fs.pathExists(reactPkgPath))) {
      try {
        const pkg = await fs.readJson(pkgPath);
        const rawWorkspaces = pkg.workspaces;
        const workspaces = Array.isArray(rawWorkspaces)
          ? rawWorkspaces.filter((workspace): workspace is string => typeof workspace === 'string')
          : [];
        if (workspaces.some((workspace) => workspace.startsWith('packages/'))) {
          return currentDir;
        }
      } catch {
        // ignore
      }
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

const CURRENT_FRONTX_PACKAGE_SCOPE = '@gears-frontx/';
const TEMPLATE_PROJECT_TSCONFIG_SEGMENT = 'template-sources/project/configs/tsconfig.json';

/**
 * Resolve a @gears-frontx package name to a file: URL path relative to projectPath.
 * e.g. '@gears-frontx/react' with monorepoRoot /repo and projectPath /repo/app
 * returns 'file:../packages/react'.
 */
export function getLocalPackageRef(
  packageName: string,
  monorepoRoot: string,
  projectPath: string
): string {
  if (!packageName.startsWith(CURRENT_FRONTX_PACKAGE_SCOPE)) {
    return packageName;
  }
  const subPackage = packageName.slice(CURRENT_FRONTX_PACKAGE_SCOPE.length);
  const packageDir = path.join(monorepoRoot, 'packages', subPackage);
  const relativePath = path.relative(projectPath, packageDir);
  const normalized = relativePath.split(path.sep).join('/');
  return `file:${normalized}`;
}

function getLocalPackageSourceRef(
  packageName: string,
  monorepoRoot: string,
  projectPath: string,
  isWildcard: boolean
): string {
  const subPackage = packageName.slice(CURRENT_FRONTX_PACKAGE_SCOPE.length);
  const sourceDir = path.join(monorepoRoot, 'packages', subPackage, 'src');
  const relativePath = path.relative(projectPath, sourceDir).split(path.sep).join('/');
  return isWildcard ? `${relativePath}/*` : `${relativePath}/index.ts`;
}

function getInstalledPackageSourceRef(packageName: string, isWildcard: boolean): string {
  const basePath = `./node_modules/${packageName}`;
  return isWildcard ? `${basePath}/*` : basePath;
}

/**
 * Rewrite scaffolded tsconfig package aliases so generated apps do not keep
 * template-relative monorepo source paths.
 */
export function rewriteTsconfigPackagePaths(
  tsconfigContent: string,
  input: {
    useLocalPackages: boolean;
    monorepoRoot?: string;
    projectPath?: string;
    tsconfigPath?: string;
  }
): string {
  const shouldRewriteTemplateExtends = tsconfigContent.includes(TEMPLATE_PROJECT_TSCONFIG_SEGMENT);
  let nextContent = tsconfigContent;

  if (shouldRewriteTemplateExtends && input.tsconfigPath) {
    const normalizedTsconfigPath = input.tsconfigPath.split(path.sep).join(path.posix.sep);
    const relativeRootTsconfig = path.posix.relative(
      path.posix.dirname(normalizedTsconfigPath),
      'tsconfig.json',
    );
    nextContent = nextContent.replace(
      /("extends"\s*:\s*")([^"]*template-sources\/project\/configs\/tsconfig\.json)(")/,
      `$1${relativeRootTsconfig}$3`,
    );
  }

  // Standalone preset tsconfig files are JSONC and often have no package aliases.
  // Avoid strict JSON parsing unless there is actually a @gears-frontx path to rewrite.
  if (!nextContent.includes(CURRENT_FRONTX_PACKAGE_SCOPE)) {
    return nextContent;
  }

  const tsconfig = JSON.parse(nextContent) as {
    compilerOptions?: {
      paths?: Record<string, string[]>;
    };
  };
  const existingPaths = tsconfig.compilerOptions?.paths;
  if (!existingPaths) {
    return tsconfigContent;
  }

  const rewrittenPaths: Record<string, string[]> = {};
  for (const [alias, targets] of Object.entries(existingPaths)) {
    if (!alias.startsWith(CURRENT_FRONTX_PACKAGE_SCOPE)) {
      rewrittenPaths[alias] = targets;
      continue;
    }

    const isWildcard = alias.endsWith('/*');
    const packageName = isWildcard ? alias.slice(0, -2) : alias;
    const rewrittenTarget =
      input.useLocalPackages && input.monorepoRoot && input.projectPath
        ? getLocalPackageSourceRef(packageName, input.monorepoRoot, input.projectPath, isWildcard)
        : getInstalledPackageSourceRef(packageName, isWildcard);

    rewrittenPaths[alias] = [rewrittenTarget];
  }

  tsconfig.compilerOptions ??= {};
  tsconfig.compilerOptions.paths = rewrittenPaths;
  return JSON.stringify(tsconfig, null, 2) + '\n';
}
// @cpt-end:cpt-frontx-algo-ui-libraries-choice-uikit-resolution:p1:inst-uikit-project-utils
