/**
 * Unit and integration tests for screenset generator
 *
 */

import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import type { GeneratedFile } from '../core/types.js';
import {
  applyMfeReplacements,
  applyMfeFileRename,
  adaptMfeForCustomUikit,
  generateScreenset,
} from './screenset.js';
import { getTemplatesDir } from '../core/templates.js';
import { joinUnderRoot } from '../utils/fs.js';

vi.mock('../core/templates.js', async () => {
  const actual = await vi.importActual<typeof import('../core/templates.js')>('../core/templates.js');

  return {
    ...actual,
    getTemplatesDir: vi.fn(actual.getTemplatesDir),
  };
});

const mockedGetTemplatesDir = vi.mocked(getTemplatesDir);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const blankMfeSourceDir = path.join(repoRoot, 'src', 'mfe_packages', '_blank-mfe');
const mfeVitestBaseSourcePath = path.join(repoRoot, 'src', 'mfe_packages', 'vitest.mfe.base.ts');
const blankMfeTemplatePaths = [
  'index.html',
  'mfe.json',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'src',
] as const;

async function readBlankMfeTemplate(...segments: string[]): Promise<string> {
  for (const segment of segments) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(segment)) {
      throw new Error(`Refusing unsafe template segment: ${JSON.stringify(segment)}`);
    }
  }
  return fs.readFile(joinUnderRoot(blankMfeSourceDir, ...segments), 'utf-8');
}

function getGeneratedTemplatePath(templatePath: string, name: string): string {
  return templatePath
    .split(path.sep)
    .map((part) => applyMfeFileRename(part, name))
    .join(path.sep);
}

describe('applyMfeReplacements', () => {
  it('should replace class names', () => {
    const result = applyMfeReplacements('class BlankMfeLifecycle', 'contacts', 'Contacts', 3001);
    expect(result).toBe('class ContactsMfeLifecycle');
  });

  it('should replace API service class names', () => {
    const input = 'new _' + 'BlankApiService()';
    const expected = 'new _' + 'ContactsApiService()';
    const result = applyMfeReplacements(input, 'contacts', 'Contacts', 3001);
    expect(result).toBe(expected);
  });

  it('should replace mock map references', () => {
    const result = applyMfeReplacements('blankMockMap', 'contacts', 'Contacts', 3001);
    expect(result).toBe('contactsMockMap');
  });

  it('should replace slice name patterns', () => {
    const result = applyMfeReplacements("'_blank/home'", 'contacts', 'Contacts', 3001);
    expect(result).toBe("'contacts/home'");
  });

  it('should replace API routes', () => {
    const result = applyMfeReplacements('/api/blank', 'myContacts', 'MyContacts', 3001);
    expect(result).toBe('/api/my-contacts');
  });

  it('should replace federation names', () => {
    const result = applyMfeReplacements('blankMfe', 'contacts', 'Contacts', 3001);
    expect(result).toBe('contactsMfe');
  });

  it('should replace package scoped names', () => {
    const result = applyMfeReplacements('@cyberfabric/blank-mfe', 'contacts', 'Contacts', 3001);
    expect(result).toBe('@cyberfabric/contacts-mfe');
  });

  it('should replace port numbers', () => {
    const result = applyMfeReplacements('localhost:3099', 'contacts', 'Contacts', 3005);
    expect(result).toBe('localhost:3005');
  });

  it('should replace --port flag values', () => {
    const result = applyMfeReplacements('--port 3099', 'contacts', 'Contacts', 3005);
    expect(result).toBe('--port 3005');
  });

  it('should replace route paths (kebab-case)', () => {
    const result = applyMfeReplacements('/blank-home', 'myContacts', 'MyContacts', 3001);
    expect(result).toBe('/my-contacts');
  });

  it('should replace label strings', () => {
    const result = applyMfeReplacements('"Blank Home"', 'contacts', 'Contacts', 3001);
    expect(result).toBe('"Contacts"');
  });

  it('should replace monorepo file: refs with alpha', () => {
    const input = '"file:../../../packages/react"';
    const result = applyMfeReplacements(input, 'contacts', 'Contacts', 3001);
    expect(result).toBe('"alpha"');
  });

  it('should handle multiple replacements in a single string', () => {
    const input = `import { BlankMfeLifecycle } from './BlankMfeLifecycle';
const service = new _BlankApiService();
export { blankMfe };`;

    const result = applyMfeReplacements(input, 'contacts', 'Contacts', 3001);
    expect(result).toContain('ContactsMfeLifecycle');
    expect(result).toContain('_ContactsApiService');
    expect(result).toContain('contactsMfe');
    expect(result).not.toContain('Blank');
    expect(result).not.toContain('blank');
  });
});

describe('applyMfeFileRename', () => {
  it('should rename files containing _BlankApiService', () => {
    const result = applyMfeFileRename('_BlankApiService.ts', 'contacts');
    expect(result).toBe('_ContactsApiService.ts');
  });

  it('should leave files without blank placeholders unchanged', () => {
    const result = applyMfeFileRename('index.ts', 'contacts');
    expect(result).toBe('index.ts');
  });

  it('should handle nested path segments', () => {
    const result = applyMfeFileRename('_BlankApiService.test.ts', 'contacts');
    expect(result).toBe('_ContactsApiService.test.ts');
  });
});

describe('adaptMfeForCustomUikit', () => {
  const uiPrefix = path.join('src', 'components', 'ui') + path.sep;

  function makeFiles(specs: Array<[string, string]>): GeneratedFile[] {
    return specs.map(([p, content]) => ({ path: p, content }));
  }

  it('should generate a barrel re-export for the custom uikit', () => {
    const result = adaptMfeForCustomUikit([], '@acme/design-system');
    const barrel = result.find((f) => f.path === path.join('src', 'components', 'ui', 'index.ts'));
    expect(barrel, 'barrel file must be present').toBeTruthy();
    expect(barrel!.content).toBe("export * from '@acme/design-system';\n");
  });

  it('should drop shadcn files under src/components/ui/', () => {
    const files = makeFiles([
      [uiPrefix + 'button.tsx', 'shadcn button'],
      [uiPrefix + 'card.tsx', 'shadcn card'],
      [path.join('src', 'screens', 'Home.tsx'), "import { Button } from '../components/ui/button';"],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const paths = result.map((f) => f.path);
    expect(paths, 'button.tsx should be dropped').not.toContain(uiPrefix + 'button.tsx');
    expect(paths, 'card.tsx should be dropped').not.toContain(uiPrefix + 'card.tsx');
  });

  it('should replace src/lib/utils.ts with a dependency-free cn helper', () => {
    const files = makeFiles([
      [path.join('src', 'lib', 'utils.ts'), "import { clsx } from 'clsx';\nexport function cn() {}"],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const utils = result.find((f) => f.path === path.join('src', 'lib', 'utils.ts'));
    expect(utils).toBeTruthy();
    expect(utils!.content).toContain('inputs.filter(Boolean).join');
    expect(utils!.content).not.toContain('clsx');
  });

  it('should rewrite relative component/ui imports in .tsx files', () => {
    const files = makeFiles([
      [path.join('src', 'screens', 'Home.tsx'), "import { Button } from '../components/ui/button';"],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const home = result.find((f) => f.path.endsWith('Home.tsx'));
    expect(home).toBeTruthy();
    expect(home!.content).toBe("import { Button } from '../components/ui';");
  });

  it('should rewrite relative component/ui imports in .ts files', () => {
    const files = makeFiles([
      [path.join('src', 'hooks', 'useButton.ts'), "import { Button } from '../components/ui/button';"],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const hook = result.find((f) => f.path.endsWith('useButton.ts'));
    expect(hook).toBeTruthy();
    expect(hook!.content).toBe("import { Button } from '../components/ui';");
  });

  it('should rewrite deeply nested relative imports', () => {
    const files = makeFiles([
      [path.join('src', 'a', 'b', 'Deep.tsx'), "import { Skeleton } from '../../components/ui/skeleton';"],
    ]);
    const result = adaptMfeForCustomUikit(files, 'my-lib');
    const deep = result.find((f) => f.path.endsWith('Deep.tsx'));
    expect(deep).toBeTruthy();
    expect(deep!.content).toBe("import { Skeleton } from '../../components/ui';");
  });

  it('should rewrite aliased component/ui imports', () => {
    const files = makeFiles([
      [path.join('src', 'screens', 'Home.tsx'), "import { Button } from '@/components/ui/button';"],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const home = result.find((f) => f.path.endsWith('Home.tsx'));
    expect(home).toBeTruthy();
    expect(home!.content).toBe("import { Button } from '@/components/ui';");
  });

  it('should rewrite multiple imports in a single file', () => {
    const content = [
      "import { Button } from '../components/ui/button';",
      "import { Card } from '../components/ui/card';",
      "import { Skeleton } from '../components/ui/skeleton';",
    ].join('\n');
    const files = makeFiles([[path.join('src', 'screens', 'Home.tsx'), content]]);
    const result = adaptMfeForCustomUikit(files, 'my-lib');
    const home = result.find((f) => f.path.endsWith('Home.tsx'));
    expect(home).toBeTruthy();
    expect(home!.content).not.toContain('/button');
    expect(home!.content).not.toContain('/card');
    expect(home!.content).not.toContain('/skeleton');
    expect(home!.content.split("from '../components/ui'").length).toBe(4);
  });

  it('should pass through non-ts/tsx files unchanged', () => {
    const files = makeFiles([
      ['package.json', '{ "name": "test" }'],
      [path.join('src', 'styles', 'globals.css'), ':root { --bg: white; }'],
      ['README.md', '# Hello'],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const json = result.find((f) => f.path === 'package.json');
    const css = result.find((f) => f.path.endsWith('globals.css'));
    const md = result.find((f) => f.path === 'README.md');
    expect(json!.content).toBe('{ "name": "test" }');
    expect(css!.content).toBe(':root { --bg: white; }');
    expect(md!.content).toBe('# Hello');
  });

  it('should leave .tsx content without component/ui imports unchanged', () => {
    const content = "import React from 'react';\nexport const App = () => <div />;";
    const files = makeFiles([[path.join('src', 'App.tsx'), content]]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const app = result.find((f) => f.path.endsWith('App.tsx'));
    expect(app!.content).toBe(content);
  });

  it('should preserve screen cn() imports by keeping src/lib/utils.ts', () => {
    const content = [
      "import { cn } from '../lib/utils';",
      "export const App = () => <div className={cn('p-4')} />;",
    ].join('\n');
    const files = makeFiles([
      [path.join('src', 'lib', 'utils.ts'), 'export function cn() {}'],
      [path.join('src', 'screens', 'Home.tsx'), content],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const utils = result.find((f) => f.path === path.join('src', 'lib', 'utils.ts'));
    const home = result.find((f) => f.path.endsWith('Home.tsx'));
    expect(utils, 'screen cn() imports need utils.ts to remain available').toBeTruthy();
    expect(home).toBeTruthy();
    expect(home!.content).toBe(content);
  });

  it('should throw for an invalid uikit name', () => {
    expect(() => {
      adaptMfeForCustomUikit([], '../../etc/passwd');
    }).toThrow(/not a valid npm package name/);
  });

  it('should handle scoped package names in barrel content', () => {
    const result = adaptMfeForCustomUikit([], '@myorg/design-tokens');
    const barrel = result.find((f) => f.path === path.join('src', 'components', 'ui', 'index.ts'));
    expect(barrel!.content).toBe("export * from '@myorg/design-tokens';\n");
  });

  it('should handle double-quoted imports', () => {
    const files = makeFiles([
      [path.join('src', 'screens', 'Home.tsx'), 'import { Button } from "../components/ui/button";'],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const home = result.find((f) => f.path.endsWith('Home.tsx'));
    expect(home).toBeTruthy();
    expect(home!.content).toBe('import { Button } from "../components/ui";');
    expect(home!.content).not.toContain('/button');
  });
});

/* ---------- Integration tests for generateScreenset() ---------- */

describe('generateScreenset() integration', () => {
  let mfeTemplateDir: string;
  let templatesDir: string;
  let mfeVitestBaseTemplatePath: string;
  let sourceTemplatesDir: string;
  const tempRoots: string[] = [];

  beforeAll(async () => {
    sourceTemplatesDir = getTemplatesDir();
    templatesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'frontx-ss-templates-'));
    await fs.copy(sourceTemplatesDir, templatesDir);
    mockedGetTemplatesDir.mockReturnValue(templatesDir);

    mfeTemplateDir = path.join(templatesDir, 'mfe-template');
    mfeVitestBaseTemplatePath = path.join(templatesDir, 'src', 'mfe_packages', 'vitest.mfe.base.ts');
    await fs.remove(mfeTemplateDir);
    await fs.ensureDir(mfeTemplateDir);
    for (const entry of blankMfeTemplatePaths) {
      await fs.copy(path.join(blankMfeSourceDir, entry), path.join(mfeTemplateDir, entry));
    }
    await fs.ensureDir(path.dirname(mfeVitestBaseTemplatePath));
    await fs.copy(mfeVitestBaseSourcePath, mfeVitestBaseTemplatePath);
  });

  afterEach(async () => {
    for (const root of tempRoots.splice(0)) {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    mockedGetTemplatesDir.mockReset();
    mockedGetTemplatesDir.mockReturnValue(sourceTemplatesDir);
    await fs.rm(templatesDir, { recursive: true, force: true });
  });

  async function makeTempProject(uikit?: string): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frontx-ss-'));
    tempRoots.push(root);
    const config: Record<string, unknown> = { frontx: true };
    if (uikit !== undefined) config.uikit = uikit;
    await fs.writeJSON(path.join(root, 'frontx.config.json'), config);
    return root;
  }

  it('shadcn: writes MFE with replacements and preserves shadcn components', async () => {
    const projectRoot = await makeTempProject('shadcn');
    const result = await generateScreenset({ name: 'testWidget', port: 4001, projectRoot });

    const mfeRoot = joinUnderRoot(projectRoot, 'src', 'mfe_packages', 'test-widget-mfe');
    expect(result.mfePath).toBe(mfeRoot);
    expect(result.files.length > 0).toBeTruthy();

    const pkgJson = await fs.readJSON(joinUnderRoot(mfeRoot, 'package.json'));
    expect(pkgJson.name).toBe('@cyberfabric/test-widget-mfe');
    expect(pkgJson.scripts.dev).toMatch(/--port 4001/);
    expect(pkgJson.dependencies.tailwindcss, 'shadcn keeps tailwindcss').toBeTruthy();
    expect(pkgJson.dependencies['tailwind-merge'], 'shadcn keeps tailwind-merge').toBeTruthy();

    const apiPath = joinUnderRoot(mfeRoot, 'src', 'api', '_TestWidgetApiService.ts');
    expect(await fs.pathExists(apiPath), 'API service file renamed').toBeTruthy();

    const apiTestPath = joinUnderRoot(mfeRoot, 'src', 'api', '_TestWidgetApiService.test.ts');
    expect(await fs.pathExists(apiTestPath), 'API service test file renamed').toBeTruthy();

    const apiTestContent = await fs.readFile(
      joinUnderRoot(mfeRoot, 'src', 'api', '_TestWidgetApiService.test.ts'),
      'utf-8',
    );
    expect(apiTestContent, 'API service test should validate the public fetch contract').toContain('service.getStatus.fetch()');
    expect(apiTestContent, 'API service test should validate the public endpoint descriptor').toContain('service.getStatus.key');
    expect(apiTestContent, 'API service test should avoid mock-map implementation details').not.toContain('blankMockMap');
    expect(apiTestContent, 'API service test should avoid brittle mock-map key introspection').not.toContain('Object.entries(');

    const mocksTestContent = await fs.readFile(
      joinUnderRoot(mfeRoot, 'src', 'api', 'mocks.test.ts'),
      'utf-8',
    );
    expect(
      mocksTestContent,
      'generated mocks.test should preserve the durable mock lookup pattern',
    ).toMatch(/const\s+statusEntry\s*=\s*Object\.entries\(/);
    expect(
      mocksTestContent,
      'generated mocks.test should continue locating the status handler via key inspection',
    ).toMatch(/\.find\(\(\[key\]\)\s*=>\s*\{/);
    expect(
      mocksTestContent,
      'generated mocks.test should keep the route-agnostic status matcher',
    ).toMatch(/key\.startsWith\('GET '\)\s*&&\s*key\.endsWith\('\/status'\)/);
    expect(
      mocksTestContent,
      'generated mocks.test should still guard the missing-handler branch without pinning the human-facing message',
    ).toMatch(/if\s*\(!statusEntry\)\s*\{\s*throw new Error\(/s);
    expect(
      mocksTestContent,
      'generated mocks.test should still validate the located mock handler behavior',
    ).toMatch(/const\s*\[\s*,\s*handler\s*\]\s*=\s*statusEntry;/);

    const homeScreenTestPath = joinUnderRoot(
      mfeRoot,
      'src',
      'screens',
      'home',
      'HomeScreen.test.tsx',
    );
    const homeScreenTestContent = await fs.readFile(homeScreenTestPath, 'utf-8');
    const expectedHomeScreenTestPath = getGeneratedTemplatePath(
      path.join('src', 'screens', 'home', 'HomeScreen.test.tsx'),
      'testWidget',
    );
    const expectedHomeScreenTestContent = applyMfeReplacements(
      await readBlankMfeTemplate('src', 'screens', 'home', 'HomeScreen.test.tsx'),
      'testWidget',
      'TestWidget',
      4001,
    );
    expect(homeScreenTestPath.endsWith(expectedHomeScreenTestPath)).toBe(true);
    expect(homeScreenTestContent).toBe(expectedHomeScreenTestContent);
    expect(homeScreenTestContent, 'starter HomeScreen test should exercise the generated screen').toContain(
      'render(<HomeScreen bridge={bridge} />);',
    );

    const expectedApiTestContent = applyMfeReplacements(
      await readBlankMfeTemplate('src', 'api', '_BlankApiService.test.ts'),
      'testWidget',
      'TestWidget',
      4001,
    );
    expect(apiTestContent).toBe(expectedApiTestContent);

    const translationsHookTestPath = joinUnderRoot(
      mfeRoot,
      'src',
      'shared',
      'useScreenTranslations.test.tsx',
    );
    expect(await fs.pathExists(translationsHookTestPath), 'translation hook test copied').toBeTruthy();
    const translationsHookTestContent = await fs.readFile(translationsHookTestPath, 'utf-8');
    const expectedTranslationsHookTestContent = applyMfeReplacements(
      await readBlankMfeTemplate('src', 'shared', 'useScreenTranslations.test.tsx'),
      'testWidget',
      'TestWidget',
      4001,
    );
    expect(translationsHookTestContent).toBe(expectedTranslationsHookTestContent);

    const lifecycleContent = await fs.readFile(
      joinUnderRoot(mfeRoot, 'src', 'lifecycle.tsx'), 'utf-8',
    );
    expect(lifecycleContent).toContain('TestWidgetMfeLifecycle');
    expect(lifecycleContent).not.toContain('Blank');

    const tsconfigContent = await fs.readFile(
      joinUnderRoot(mfeRoot, 'tsconfig.json'),
      'utf-8',
    );
    expect(tsconfigContent).toMatch(/"extends": "\.\.\/\.\.\/\.\.\/tsconfig\.json"/);
    expect(tsconfigContent).not.toMatch(/packages\/cli\/template-sources\/project\/configs\/tsconfig\.json/);

    const vitestConfigContent = await fs.readFile(
      joinUnderRoot(mfeRoot, 'vitest.config.ts'),
      'utf-8',
    );
    expect(/defineMfeProject|mergeConfig/.test(vitestConfigContent)).toBeTruthy();
    expect(vitestConfigContent).toContain("../vitest.mfe.base");

    const vitestBaseContent = await fs.readFile(
      joinUnderRoot(projectRoot, 'src', 'mfe_packages', 'vitest.mfe.base.ts'),
      'utf-8',
    );
    expect(vitestBaseContent).toBe(await fs.readFile(mfeVitestBaseSourcePath, 'utf-8'));

    const buttonContent = await fs.readFile(
      joinUnderRoot(mfeRoot, 'src', 'components', 'ui', 'button.tsx'), 'utf-8',
    );
    expect(buttonContent, 'shadcn button preserved').toContain('lib/utils');

    // The CLI no longer regenerates the manifest in-process. The user runs
    // `npm run generate:mfe-manifests` (chained from `npm run dev`) in the
    // scaffolded project to refresh `public/generated-mfe-manifests.json` —
    // same script and same workflow as the monorepo host.
  });

  it('none: replaces shadcn components with plain-CSS equivalents', async () => {
    const projectRoot = await makeTempProject('none');
    const result = await generateScreenset({ name: 'dashboard', port: 4002, projectRoot });

    expect(result.mfePath).toBe(
      joinUnderRoot(projectRoot, 'src', 'mfe_packages', 'dashboard-mfe'),
    );

    const buttonContent = await fs.readFile(
      joinUnderRoot(result.mfePath, 'src', 'components', 'ui', 'button.tsx'), 'utf-8',
    );
    expect(buttonContent, 'plain-CSS button classes').toContain('frontx-btn');
    expect(buttonContent, 'CSS import present').toContain("import './components.css'");

    const cssPath = joinUnderRoot(result.mfePath, 'src', 'components', 'ui', 'components.css');
    expect(await fs.pathExists(cssPath), 'components.css created').toBeTruthy();
    const cssContent = await fs.readFile(cssPath, 'utf-8');
    expect(cssContent).toContain('.frontx-btn');
    expect(cssContent).toContain('.frontx-card');

    const utilsContent = await fs.readFile(
      joinUnderRoot(result.mfePath, 'src', 'lib', 'utils.ts'), 'utf-8',
    );
    expect(utilsContent, 'no clsx in none mode').not.toContain('clsx');
    expect(utilsContent, 'no tailwind-merge in none mode').not.toContain('twMerge');
    expect(utilsContent, 'local cn implementation').toContain('inputs.filter(Boolean).join');

    const pkgJson = await fs.readJSON(joinUnderRoot(result.mfePath, 'package.json'));
    expect(pkgJson.dependencies.clsx, 'clsx stripped').toBe(undefined);
    expect(pkgJson.dependencies.tailwindcss, 'tailwindcss stripped').toBe(undefined);
    expect(pkgJson.dependencies['tailwind-merge'], 'tailwind-merge stripped').toBe(undefined);
    expect(pkgJson.dependencies['class-variance-authority'], 'cva stripped').toBe(undefined);
    expect(pkgJson.dependencies['@radix-ui/react-slot'], 'radix-slot stripped').toBe(undefined);
  });

  it('third-party: replaces components with barrel re-export', async () => {
    const projectRoot = await makeTempProject('@acme/design-system');
    const result = await generateScreenset({ name: 'settings', port: 4003, projectRoot });

    const barrelPath = joinUnderRoot(result.mfePath, 'src', 'components', 'ui', 'index.ts');
    expect(await fs.pathExists(barrelPath), 'barrel file created').toBeTruthy();
    const barrelContent = await fs.readFile(barrelPath, 'utf-8');
    expect(barrelContent.trim()).toBe("export * from '@acme/design-system';");

    const buttonPath = joinUnderRoot(result.mfePath, 'src', 'components', 'ui', 'button.tsx');
    expect(!(await fs.pathExists(buttonPath)), 'shadcn button.tsx dropped').toBeTruthy();

    const cardPath = joinUnderRoot(result.mfePath, 'src', 'components', 'ui', 'card.tsx');
    expect(!(await fs.pathExists(cardPath)), 'shadcn card.tsx dropped').toBeTruthy();

    const utilsPath = joinUnderRoot(result.mfePath, 'src', 'lib', 'utils.ts');
    expect(await fs.pathExists(utilsPath), 'cn utility preserved for screen imports').toBeTruthy();
    const utilsContent = await fs.readFile(utilsPath, 'utf-8');
    expect(utilsContent, 'dependency-free cn implementation').toContain('inputs.filter(Boolean).join');
    expect(utilsContent, 'custom uikit utils removes clsx').not.toContain('clsx');
    expect(utilsContent, 'custom uikit utils removes tailwind-merge').not.toContain('twMerge');

    const screenContent = await fs.readFile(
      joinUnderRoot(result.mfePath, 'src', 'screens', 'home', 'HomeScreen.tsx'), 'utf-8',
    );
    expect(screenContent, 'imports rewritten to barrel').toContain('components/ui');
    expect(screenContent, 'no individual card import').not.toContain('components/ui/card');
    expect(screenContent, 'no individual skeleton import').not.toContain('components/ui/skeleton');

    const pkgJson = await fs.readJSON(joinUnderRoot(result.mfePath, 'package.json'));
    expect(pkgJson.dependencies.tailwindcss, 'tailwindcss stripped').toBe(undefined);
    expect(pkgJson.dependencies['class-variance-authority'], 'cva stripped').toBe(undefined);
  });

  // Manifest regeneration was removed from the CLI screenset generator —
  // scaffolded projects ship `scripts/generate-mfe-manifests.ts` (the same
  // generator that powers the monorepo host) and the user runs
  // `npm run generate:mfe-manifests` (chained from `npm run dev`) to pick up
  // new MFEs. The generator's own coverage lives in the monorepo (it's the
  // same file shipped to scaffolded projects); the CLI is no longer the
  // entity that produces manifest content.
});
