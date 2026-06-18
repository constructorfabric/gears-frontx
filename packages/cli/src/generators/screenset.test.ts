/**
 * Unit and integration tests for screenset generator
 *
 * Run with: node --import tsx --test src/generators/screenset.test.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import type { GeneratedFile } from '../core/types.js';
import {
  applyMfeReplacements,
  applyMfeFileRename,
  buildMfeManifestsContent,
  adaptMfeForCustomUikit,
  generateScreenset,
} from './screenset.js';
import { getTemplatesDir } from '../core/templates.js';

describe('applyMfeReplacements', () => {
  it('should replace class names', () => {
    const result = applyMfeReplacements('class BlankMfeLifecycle', 'contacts', 'Contacts', 3001);
    assert.equal(result, 'class ContactsMfeLifecycle');
  });

  it('should replace API service class names', () => {
    const result = applyMfeReplacements('new _BlankApiService()', 'contacts', 'Contacts', 3001);
    assert.equal(result, 'new _ContactsApiService()');
  });

  it('should replace mock map references', () => {
    const result = applyMfeReplacements('blankMockMap', 'contacts', 'Contacts', 3001);
    assert.equal(result, 'contactsMockMap');
  });

  it('should replace slice name patterns', () => {
    const result = applyMfeReplacements("'_blank/home'", 'contacts', 'Contacts', 3001);
    assert.equal(result, "'contacts/home'");
  });

  it('should replace API routes', () => {
    const result = applyMfeReplacements('/api/blank', 'myContacts', 'MyContacts', 3001);
    assert.equal(result, '/api/my-contacts');
  });

  it('should replace federation names', () => {
    const result = applyMfeReplacements('blankMfe', 'contacts', 'Contacts', 3001);
    assert.equal(result, 'contactsMfe');
  });

  it('should replace package scoped names', () => {
    const result = applyMfeReplacements('@gears-frontx/blank-mfe', 'contacts', 'Contacts', 3001);
    assert.equal(result, '@gears-frontx/contacts-mfe');
  });

  it('should replace port numbers', () => {
    const result = applyMfeReplacements('localhost:3099', 'contacts', 'Contacts', 3005);
    assert.equal(result, 'localhost:3005');
  });

  it('should replace --port flag values', () => {
    const result = applyMfeReplacements('--port 3099', 'contacts', 'Contacts', 3005);
    assert.equal(result, '--port 3005');
  });

  it('should replace route paths (kebab-case)', () => {
    const result = applyMfeReplacements('/blank-home', 'myContacts', 'MyContacts', 3001);
    assert.equal(result, '/my-contacts');
  });

  it('should replace label strings', () => {
    const result = applyMfeReplacements('"Blank Home"', 'contacts', 'Contacts', 3001);
    assert.equal(result, '"Contacts"');
  });

  it('should replace monorepo file: refs with alpha', () => {
    const input = '"file:../../../packages/react"';
    const result = applyMfeReplacements(input, 'contacts', 'Contacts', 3001);
    assert.equal(result, '"alpha"');
  });

  it('should handle multiple replacements in a single string', () => {
    const input = `import { BlankMfeLifecycle } from './BlankMfeLifecycle';
const service = new _BlankApiService();
export { blankMfe };`;

    const result = applyMfeReplacements(input, 'contacts', 'Contacts', 3001);
    assert.ok(result.includes('ContactsMfeLifecycle'));
    assert.ok(result.includes('_ContactsApiService'));
    assert.ok(result.includes('contactsMfe'));
    assert.ok(!result.includes('Blank'));
    assert.ok(!result.includes('blank'));
  });
});

describe('applyMfeFileRename', () => {
  it('should rename files containing _BlankApiService', () => {
    const result = applyMfeFileRename('_BlankApiService.ts', 'contacts');
    assert.equal(result, '_ContactsApiService.ts');
  });

  it('should leave files without blank placeholders unchanged', () => {
    const result = applyMfeFileRename('index.ts', 'contacts');
    assert.equal(result, 'index.ts');
  });

  it('should handle nested path segments', () => {
    const result = applyMfeFileRename('_BlankApiService.test.ts', 'contacts');
    assert.equal(result, '_ContactsApiService.test.ts');
  });
});

describe('buildMfeManifestsContent', () => {
  it('should generate valid content with no MFE packages', () => {
    const result = buildMfeManifestsContent([]);
    assert.ok(result.includes('AUTO-GENERATED FILE'));
    assert.ok(result.includes('MFE_MANIFESTS: MfeManifestConfig[] = ['));
    assert.ok(result.includes('getMfeManifests'));
    assert.ok(!result.includes('import mfe'));
  });

  it('should generate imports and registry entries for one package', () => {
    const result = buildMfeManifestsContent(['contacts-mfe']);
    assert.ok(result.includes("import mfe0 from '@/mfe_packages/contacts-mfe/mfe.json';"));
    assert.ok(result.includes('  mfe0,'));
  });

  it('should generate imports and registry entries for multiple packages', () => {
    const result = buildMfeManifestsContent(['contacts-mfe', 'dashboard-mfe', 'settings-mfe']);
    assert.ok(result.includes("import mfe0 from '@/mfe_packages/contacts-mfe/mfe.json';"));
    assert.ok(result.includes("import mfe1 from '@/mfe_packages/dashboard-mfe/mfe.json';"));
    assert.ok(result.includes("import mfe2 from '@/mfe_packages/settings-mfe/mfe.json';"));
    assert.ok(result.includes('  mfe0,'));
    assert.ok(result.includes('  mfe1,'));
    assert.ok(result.includes('  mfe2,'));
  });

  it('should include type imports', () => {
    const result = buildMfeManifestsContent([]);
    assert.ok(result.includes("import type { Extension, JSONSchema, MfeEntry } from '@gears-frontx/react';"));
  });

  it('should export the MfeManifestConfig interface', () => {
    const result = buildMfeManifestsContent([]);
    assert.ok(result.includes('export interface MfeManifestConfig'));
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
    assert.ok(barrel, 'barrel file must be present');
    assert.equal(barrel!.content, "export * from '@acme/design-system';\n");
  });

  it('should drop shadcn files under src/components/ui/', () => {
    const files = makeFiles([
      [uiPrefix + 'button.tsx', 'shadcn button'],
      [uiPrefix + 'card.tsx', 'shadcn card'],
      [path.join('src', 'screens', 'Home.tsx'), "import { Button } from '../components/ui/button';"],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const paths = result.map((f) => f.path);
    assert.ok(!paths.includes(uiPrefix + 'button.tsx'), 'button.tsx should be dropped');
    assert.ok(!paths.includes(uiPrefix + 'card.tsx'), 'card.tsx should be dropped');
  });

  it('should replace src/lib/utils.ts with a dependency-free cn helper', () => {
    const files = makeFiles([
      [path.join('src', 'lib', 'utils.ts'), "import { clsx } from 'clsx';\nexport function cn() {}"],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const utils = result.find((f) => f.path === path.join('src', 'lib', 'utils.ts'));
    assert.ok(utils);
    assert.ok(utils!.content.includes('inputs.filter(Boolean).join'));
    assert.ok(!utils!.content.includes('clsx'));
  });

  it('should rewrite relative component/ui imports in .tsx files', () => {
    const files = makeFiles([
      [path.join('src', 'screens', 'Home.tsx'), "import { Button } from '../components/ui/button';"],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const home = result.find((f) => f.path.endsWith('Home.tsx'));
    assert.ok(home);
    assert.equal(home!.content, "import { Button } from '../components/ui';");
  });

  it('should rewrite relative component/ui imports in .ts files', () => {
    const files = makeFiles([
      [path.join('src', 'hooks', 'useButton.ts'), "import { Button } from '../components/ui/button';"],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const hook = result.find((f) => f.path.endsWith('useButton.ts'));
    assert.ok(hook);
    assert.equal(hook!.content, "import { Button } from '../components/ui';");
  });

  it('should rewrite deeply nested relative imports', () => {
    const files = makeFiles([
      [path.join('src', 'a', 'b', 'Deep.tsx'), "import { Skeleton } from '../../components/ui/skeleton';"],
    ]);
    const result = adaptMfeForCustomUikit(files, 'my-lib');
    const deep = result.find((f) => f.path.endsWith('Deep.tsx'));
    assert.ok(deep);
    assert.equal(deep!.content, "import { Skeleton } from '../../components/ui';");
  });

  it('should rewrite aliased component/ui imports', () => {
    const files = makeFiles([
      [path.join('src', 'screens', 'Home.tsx'), "import { Button } from '@/components/ui/button';"],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const home = result.find((f) => f.path.endsWith('Home.tsx'));
    assert.ok(home);
    assert.equal(home!.content, "import { Button } from '@/components/ui';");
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
    assert.ok(home);
    assert.ok(!home!.content.includes('/button'));
    assert.ok(!home!.content.includes('/card'));
    assert.ok(!home!.content.includes('/skeleton'));
    assert.equal(home!.content.split("from '../components/ui'").length, 4);
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
    assert.equal(json!.content, '{ "name": "test" }');
    assert.equal(css!.content, ':root { --bg: white; }');
    assert.equal(md!.content, '# Hello');
  });

  it('should leave .tsx content without component/ui imports unchanged', () => {
    const content = "import React from 'react';\nexport const App = () => <div />;";
    const files = makeFiles([[path.join('src', 'App.tsx'), content]]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const app = result.find((f) => f.path.endsWith('App.tsx'));
    assert.equal(app!.content, content);
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
    assert.ok(utils, 'screen cn() imports need utils.ts to remain available');
    assert.ok(home);
    assert.equal(home!.content, content);
  });

  it('should throw for an invalid uikit name', () => {
    assert.throws(
      () => adaptMfeForCustomUikit([], '../../etc/passwd'),
      /not a valid npm package name/
    );
  });

  it('should handle scoped package names in barrel content', () => {
    const result = adaptMfeForCustomUikit([], '@myorg/design-tokens');
    const barrel = result.find((f) => f.path === path.join('src', 'components', 'ui', 'index.ts'));
    assert.equal(barrel!.content, "export * from '@myorg/design-tokens';\n");
  });

  it('should handle double-quoted imports', () => {
    const files = makeFiles([
      [path.join('src', 'screens', 'Home.tsx'), 'import { Button } from "../components/ui/button";'],
    ]);
    const result = adaptMfeForCustomUikit(files, '@acme/ui');
    const home = result.find((f) => f.path.endsWith('Home.tsx'));
    assert.ok(home);
    assert.equal(home!.content, 'import { Button } from "../components/ui";');
    assert.ok(!home!.content.includes('/button'));
  });
});

/* ---------- Integration tests for generateScreenset() ---------- */

const TEMPLATE_PKG_JSON = JSON.stringify({
  name: '@gears-frontx/blank-mfe',
  scripts: { dev: 'vite --port 3099' },
  dependencies: {
    'react': '^19.0.0',
    'clsx': '^2.1.1',
    'tailwindcss': '3.4.1',
    'tailwind-merge': '^2.0.0',
    'class-variance-authority': '^0.7.0',
    '@radix-ui/react-slot': '^1.0.0',
  },
}, null, 2);

const TEMPLATE_FILES: Record<string, string> = {
  'package.json': TEMPLATE_PKG_JSON,
  'mfe.json': JSON.stringify({ name: 'blank', entries: [], extensions: [] }),
  'index.html': '<html><body>localhost:3099</body></html>',
  [path.join('src', 'lifecycle.tsx')]:
    'class BlankMfeLifecycle {}\nexport default BlankMfeLifecycle;',
  [path.join('src', 'init.ts')]:
    "import { blankMfe } from './lifecycle';",
  [path.join('src', 'api', '_BlankApiService.ts')]:
    'export class _BlankApiService {}',
  [path.join('src', 'slices', 'homeSlice.ts')]:
    "const name = '_blank/home';",
  [path.join('src', 'components', 'ui', 'button.tsx')]:
    "import { cn } from '../../lib/utils';\nexport function Button() { return <button />; }",
  [path.join('src', 'components', 'ui', 'card.tsx')]:
    "import { cn } from '../../lib/utils';\nexport function Card() { return <div />; }",
  [path.join('src', 'components', 'ui', 'skeleton.tsx')]:
    "import { cn } from '../../lib/utils';\nexport function Skeleton() { return <div />; }",
  [path.join('src', 'lib', 'utils.ts')]:
    "import { clsx } from 'clsx';\nimport { twMerge } from 'tailwind-merge';\nexport function cn(...inputs: string[]) { return twMerge(clsx(inputs)); }",
  [path.join('src', 'screens', 'home', 'HomeScreen.tsx')]:
    "import { cn } from '../../lib/utils';\nimport { Button } from '../../components/ui/button';\nimport { Card } from '../../components/ui/card';\nexport function HomeScreen() { return <div className={cn('p-4')}><Button /><Card /></div>; }",
};

describe('generateScreenset() integration', () => {
  let mfeTemplateDir: string;
  let templatesDir: string;
  let templateDirExistedBefore: boolean;
  const tempRoots: string[] = [];

  before(async () => {
    templatesDir = getTemplatesDir();
    mfeTemplateDir = path.join(templatesDir, 'mfe-template');
    templateDirExistedBefore = await fs.pathExists(mfeTemplateDir);

    if (!templateDirExistedBefore) {
      for (const [filePath, content] of Object.entries(TEMPLATE_FILES)) {
        const fullPath = path.join(mfeTemplateDir, filePath);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, content, 'utf-8');
      }
    }
  });

  after(async () => {
    if (!templateDirExistedBefore && await fs.pathExists(mfeTemplateDir)) {
      await fs.remove(mfeTemplateDir);
    }
    for (const root of tempRoots) {
      await fs.remove(root).catch(() => {});
    }
  });

  async function makeTempProject(uikit?: string): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hai3-ss-'));
    tempRoots.push(root);
    const config: Record<string, unknown> = { hai3: true };
    if (uikit !== undefined) config.uikit = uikit;
    await fs.writeJSON(path.join(root, 'frontx.config.json'), config);
    return root;
  }

  it('shadcn: writes MFE with replacements and preserves shadcn components', async () => {
    const projectRoot = await makeTempProject('shadcn');
    const result = await generateScreenset({ name: 'testWidget', port: 4001, projectRoot });

    assert.equal(
      result.mfePath,
      path.join(projectRoot, 'src', 'mfe_packages', 'test-widget-mfe'),
    );
    assert.ok(result.files.length > 0);

    const pkgJson = await fs.readJSON(path.join(result.mfePath, 'package.json'));
    assert.equal(pkgJson.name, '@gears-frontx/test-widget-mfe');
    assert.match(pkgJson.scripts.dev, /--port 4001/);
    assert.ok(pkgJson.dependencies.tailwindcss, 'shadcn keeps tailwindcss');
    assert.ok(pkgJson.dependencies['tailwind-merge'], 'shadcn keeps tailwind-merge');

    const apiPath = path.join(result.mfePath, 'src', 'api', '_TestWidgetApiService.ts');
    assert.ok(await fs.pathExists(apiPath), 'API service file renamed');

    const lifecycleContent = await fs.readFile(
      path.join(result.mfePath, 'src', 'lifecycle.tsx'), 'utf-8',
    );
    assert.ok(lifecycleContent.includes('TestWidgetMfeLifecycle'));
    assert.ok(!lifecycleContent.includes('Blank'));

    const buttonContent = await fs.readFile(
      path.join(result.mfePath, 'src', 'components', 'ui', 'button.tsx'), 'utf-8',
    );
    assert.ok(buttonContent.includes('lib/utils'), 'shadcn button preserved');

    const manifestsPath = path.join(projectRoot, 'src', 'app', 'mfe', 'generated-mfe-manifests.ts');
    assert.ok(await fs.pathExists(manifestsPath));
    const manifestsContent = await fs.readFile(manifestsPath, 'utf-8');
    assert.ok(manifestsContent.includes('test-widget-mfe'));
  });

  it('none: replaces shadcn components with plain-CSS equivalents', async () => {
    const projectRoot = await makeTempProject('none');
    const result = await generateScreenset({ name: 'dashboard', port: 4002, projectRoot });

    assert.equal(
      result.mfePath,
      path.join(projectRoot, 'src', 'mfe_packages', 'dashboard-mfe'),
    );

    const buttonContent = await fs.readFile(
      path.join(result.mfePath, 'src', 'components', 'ui', 'button.tsx'), 'utf-8',
    );
    assert.ok(buttonContent.includes('hai3-btn'), 'plain-CSS button classes');
    assert.ok(buttonContent.includes("import './components.css'"), 'CSS import present');

    const cssPath = path.join(result.mfePath, 'src', 'components', 'ui', 'components.css');
    assert.ok(await fs.pathExists(cssPath), 'components.css created');
    const cssContent = await fs.readFile(cssPath, 'utf-8');
    assert.ok(cssContent.includes('.hai3-btn'));
    assert.ok(cssContent.includes('.hai3-card'));

    const utilsContent = await fs.readFile(
      path.join(result.mfePath, 'src', 'lib', 'utils.ts'), 'utf-8',
    );
    assert.ok(!utilsContent.includes('clsx'), 'no clsx in none mode');
    assert.ok(!utilsContent.includes('twMerge'), 'no tailwind-merge in none mode');
    assert.ok(utilsContent.includes('inputs.filter(Boolean).join'), 'local cn implementation');

    const pkgJson = await fs.readJSON(path.join(result.mfePath, 'package.json'));
    assert.equal(pkgJson.dependencies.clsx, undefined, 'clsx stripped');
    assert.equal(pkgJson.dependencies.tailwindcss, undefined, 'tailwindcss stripped');
    assert.equal(pkgJson.dependencies['tailwind-merge'], undefined, 'tailwind-merge stripped');
    assert.equal(pkgJson.dependencies['class-variance-authority'], undefined, 'cva stripped');
    assert.equal(pkgJson.dependencies['@radix-ui/react-slot'], undefined, 'radix-slot stripped');
  });

  it('third-party: replaces components with barrel re-export', async () => {
    const projectRoot = await makeTempProject('@acme/design-system');
    const result = await generateScreenset({ name: 'settings', port: 4003, projectRoot });

    const barrelPath = path.join(result.mfePath, 'src', 'components', 'ui', 'index.ts');
    assert.ok(await fs.pathExists(barrelPath), 'barrel file created');
    const barrelContent = await fs.readFile(barrelPath, 'utf-8');
    assert.equal(barrelContent.trim(), "export * from '@acme/design-system';");

    const buttonPath = path.join(result.mfePath, 'src', 'components', 'ui', 'button.tsx');
    assert.ok(!(await fs.pathExists(buttonPath)), 'shadcn button.tsx dropped');

    const cardPath = path.join(result.mfePath, 'src', 'components', 'ui', 'card.tsx');
    assert.ok(!(await fs.pathExists(cardPath)), 'shadcn card.tsx dropped');

    const utilsPath = path.join(result.mfePath, 'src', 'lib', 'utils.ts');
    assert.ok(await fs.pathExists(utilsPath), 'cn utility preserved for screen imports');
    const utilsContent = await fs.readFile(utilsPath, 'utf-8');
    assert.ok(utilsContent.includes('inputs.filter(Boolean).join'), 'dependency-free cn implementation');
    assert.ok(!utilsContent.includes('clsx'), 'custom uikit utils removes clsx');
    assert.ok(!utilsContent.includes('twMerge'), 'custom uikit utils removes tailwind-merge');

    const screenContent = await fs.readFile(
      path.join(result.mfePath, 'src', 'screens', 'home', 'HomeScreen.tsx'), 'utf-8',
    );
    assert.ok(screenContent.includes('components/ui'), 'imports rewritten to barrel');
    assert.ok(!screenContent.includes('components/ui/card'), 'no individual card import');
    assert.ok(!screenContent.includes('components/ui/skeleton'), 'no individual skeleton import');

    const pkgJson = await fs.readJSON(path.join(result.mfePath, 'package.json'));
    assert.equal(pkgJson.dependencies.tailwindcss, undefined, 'tailwindcss stripped');
    assert.equal(pkgJson.dependencies['class-variance-authority'], undefined, 'cva stripped');
  });

  it('regenerates manifests including pre-existing MFE packages', async () => {
    const projectRoot = await makeTempProject('shadcn');

    const existingMfePath = path.join(projectRoot, 'src', 'mfe_packages', 'existing-mfe');
    await fs.ensureDir(existingMfePath);
    await fs.writeJSON(path.join(existingMfePath, 'mfe.json'), { name: 'existing' });

    await generateScreenset({ name: 'analytics', port: 4004, projectRoot });

    const manifestsContent = await fs.readFile(
      path.join(projectRoot, 'src', 'app', 'mfe', 'generated-mfe-manifests.ts'), 'utf-8',
    );
    assert.ok(manifestsContent.includes('analytics-mfe'), 'new MFE in manifests');
    assert.ok(manifestsContent.includes('existing-mfe'), 'pre-existing MFE in manifests');
    assert.ok(!manifestsContent.includes('_blank-mfe'), '_blank-mfe excluded');
  });
});
