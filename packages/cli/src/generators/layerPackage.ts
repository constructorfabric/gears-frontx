// @cpt-flow:cpt-frontx-flow-cli-tooling-scaffold-layout:p1
import path from 'path';
import fs from 'fs-extra';
import type { GeneratedFile, LayerType, PackageManager } from '../core/types.js';
import {
  DEFAULT_PACKAGE_MANAGER,
  getAddPackagesCommand,
  getRunScriptCommand,
  packageManagerFieldValue,
  transformPackageManagerText,
} from '../core/packageManager.js';
import { getTemplatesDir } from '../core/templates.js';
import { isTargetApplicableToLayer, selectCommandVariant } from '../core/layers.js';
import { getLocalPackageRef } from '../utils/project.js';

/**
 * Input for layer package generation
 */
export interface LayerPackageInput {
  /** Package name (npm package name format) */
  packageName: string;
  /** SDK layer */
  layer: LayerType;
  /** Package manager to configure package for */
  packageManager?: PackageManager;
  /** Use local monorepo packages via file: (for linked CLI development) */
  useLocalPackages?: boolean;
  /** Monorepo root path when useLocalPackages is true */
  monorepoRoot?: string;
  /** Absolute path where the project will be written (for file: relative paths) */
  projectPath?: string;
}

/**
 * Get dependencies for a layer
 */
function getLayerDependencies(layer: LayerType): {
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  // Common ESLint dev dependencies for self-contained configs
  const eslintDevDeps: Record<string, string> = {
    '@eslint/js': '^9.0.0',
    'typescript-eslint': '^8.0.0',
    'eslint-plugin-unused-imports': '^4.0.0',
    globals: '^15.0.0',
    eslint: '^9.0.0',
  };

  switch (layer) {
    case 'sdk':
      // SDK layer has no FrontX dependencies
      return {
        dependencies: {},
        peerDependencies: {},
        devDependencies: {
          ...eslintDevDeps,
          typescript: '^5.4.0',
          tsup: '^8.0.0',
        },
      };

    case 'framework':
      // Framework layer depends only on SDK packages
      return {
        dependencies: {},
        peerDependencies: {
          '@gears-frontx/state': 'alpha',
          '@gears-frontx/screensets': 'alpha',
          '@gears-frontx/api': 'alpha',
          '@gears-frontx/i18n': 'alpha',
        },
        devDependencies: {
          ...eslintDevDeps,
          '@gears-frontx/state': 'alpha',
          '@gears-frontx/screensets': 'alpha',
          '@gears-frontx/api': 'alpha',
          '@gears-frontx/i18n': 'alpha',
          typescript: '^5.4.0',
          tsup: '^8.0.0',
        },
      };

    case 'react':
      // React layer depends on Framework and React
      return {
        dependencies: {},
        peerDependencies: {
          '@gears-frontx/framework': 'alpha',
          react: '^19.2.4',
          'react-dom': '^19.2.4',
        },
        devDependencies: {
          ...eslintDevDeps,
          'eslint-plugin-react-hooks': '^5.0.0',
          '@gears-frontx/framework': 'alpha',
          '@types/react': '^19.0.0',
          '@types/react-dom': '^19.0.0',
          react: '^19.2.4',
          'react-dom': '^19.2.4',
          typescript: '^5.4.0',
          tsup: '^8.0.0',
        },
      };

    default:
      return {
        dependencies: {},
        peerDependencies: {},
        devDependencies: {},
      };
  }
}

/**
 * Get ESLint config content for a layer
 * Generates self-contained configs that don't depend on @gears-frontx/eslint-config
 */
function getEslintConfig(layer: LayerType): string {
  const baseConfig = `import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global ignores
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.*'],
  },

  // Base JS config
  js.configs.recommended,

  // TypeScript config
  ...tseslint.configs.recommended,

  // Main configuration
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.node,
      },
    },
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-const': 'error',
    },
  },
`;

  if (layer === 'sdk') {
    // SDK layer: base config with no-react restriction
    return `${baseConfig}
  // SDK layer: No React imports allowed
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'SDK layer cannot import React. This is a framework-agnostic layer.',
            },
          ],
        },
      ],
    },
  },
];
`;
  }

  if (layer === 'framework') {
    // Framework layer: base config with no-react restriction
    return `${baseConfig}
  // Framework layer: No React imports allowed
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'Framework layer cannot import React directly. Use @gears-frontx/react for React bindings.',
            },
          ],
        },
      ],
    },
  },
];
`;
  }

  if (layer === 'react') {
    // React layer: base config + react-hooks
    return `import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global ignores
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.*'],
  },

  // Base JS config
  js.configs.recommended,

  // TypeScript config
  ...tseslint.configs.recommended,

  // Main configuration
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.node,
      },
    },
    plugins: {
      'unused-imports': unusedImports,
      'react-hooks': reactHooks,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-const': 'error',
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];
`;
  }

  // Default fallback
  return `${baseConfig}];
`;
}

/**
 * Get tsconfig content for a layer
 */
function getTsConfig(layer: LayerType): string {
  const compilerOptions: Record<string, unknown> = {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    lib: ['ES2022'],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    declaration: true,
    declarationMap: true,
    outDir: './dist',
    rootDir: './src',
  };

  if (layer === 'react') {
    compilerOptions.lib = ['ES2022', 'DOM', 'DOM.Iterable'];
    compilerOptions.jsx = 'react-jsx';
  }

  return JSON.stringify(
    {
      compilerOptions,
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist'],
    },
    null,
    2
  );
}

/**
 * Generate files for a layer package
 */
// @cpt-begin:cpt-frontx-flow-cli-tooling-scaffold-layout:p1:inst-write-layout-files
export async function generateLayerPackage(input: LayerPackageInput): Promise<GeneratedFile[]> {
  const {
    packageName,
    layer,
    packageManager = DEFAULT_PACKAGE_MANAGER,
    useLocalPackages = false,
    monorepoRoot,
    projectPath,
  } = input;
  const files: GeneratedFile[] = [];
  const deps = getLayerDependencies(layer);

  if (useLocalPackages && monorepoRoot && projectPath) {
    const toLocalRefs = (packages: Record<string, string>): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(packages)) {
        out[name] =
          name.startsWith('@gears-frontx/') ? getLocalPackageRef(name, monorepoRoot, projectPath) : value;
      }
      return out;
    };

    deps.dependencies = toLocalRefs(deps.dependencies);
    deps.peerDependencies = toLocalRefs(deps.peerDependencies);
    deps.devDependencies = toLocalRefs(deps.devDependencies);
  }

  // package.json
  const packageJson = {
    name: packageName,
    version: '0.1.0',
    type: 'module',
    packageManager: packageManagerFieldValue(packageManager),
    main: './dist/index.cjs',
    module: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        import: './dist/index.js',
        require: './dist/index.cjs',
        types: './dist/index.d.ts',
      },
    },
    files: ['dist'],
    scripts: {
      build: 'tsup',
      dev: 'tsup --watch',
      lint: 'eslint src/',
      'type-check': 'tsc --noEmit',
    },
    dependencies: deps.dependencies,
    peerDependencies: deps.peerDependencies,
    devDependencies: deps.devDependencies,
  };
  files.push({
    path: 'package.json',
    content: JSON.stringify(packageJson, null, 2) + '\n',
  });

  // tsconfig.json
  files.push({
    path: 'tsconfig.json',
    content: getTsConfig(layer) + '\n',
  });

  // eslint.config.js
  files.push({
    path: 'eslint.config.js',
    content: getEslintConfig(layer),
  });

  // tsup.config.ts
  files.push({
    path: 'tsup.config.ts',
    content: `import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
`,
  });

  // src/index.ts
  files.push({
    path: 'src/index.ts',
    content: `/**
 * ${packageName}
 *
 * A FrontX ${layer}-layer package.
 */

export const VERSION = '0.1.0';

// Add your exports here
`,
  });

  // .gitignore
  files.push({
    path: '.gitignore',
    content: `node_modules/
dist/
*.log
.DS_Store
`,
  });

  // README.md
  files.push({
    path: 'README.md',
    content: `# ${packageName}

A Gears FrontX ${layer}-layer package.

## Installation

\`\`\`bash
${getAddPackagesCommand(packageManager, [packageName])}
\`\`\`

## Usage

\`\`\`typescript
import { VERSION } from '${packageName}';

console.log(VERSION);
\`\`\`

## Development

\`\`\`bash
${getRunScriptCommand(packageManager, 'dev')}     # Watch mode
${getRunScriptCommand(packageManager, 'build')}   # Production build
${getRunScriptCommand(packageManager, 'lint')}    # ESLint
${getRunScriptCommand(packageManager, 'type-check')}  # TypeScript check
\`\`\`

## Layer: ${layer}

This package follows Gears FrontX's ${layer}-layer architecture conventions:
${layer === 'sdk' ? '- No Gears FrontX package dependencies\n- No React dependencies' : ''}${layer === 'framework' ? '- Can depend on SDK packages (@gears-frontx/state, @gears-frontx/screensets, @gears-frontx/api, @gears-frontx/i18n)\n- No React dependencies' : ''}${layer === 'react' ? '- Can depend on Framework packages (@gears-frontx/framework)\n- React peer dependency' : ''}

## License

Apache-2.0
`,
  });

  // .ai/rules/_meta.json (layer metadata for ai sync)
  files.push({
    path: '.ai/rules/_meta.json',
    content: JSON.stringify(
      {
        layer,
        version: '1.0',
      },
      null,
      2
    ) + '\n',
  });

  // frontx.config.json with layer info
  files.push({
    path: 'frontx.config.json',
    content: JSON.stringify(
      {
        frontx: true,
        layer,
        packageManager,
      },
      null,
      2
    ) + '\n',
  });

  // Copy layer-filtered AI configuration from templates
  const templatesDir = getTemplatesDir();

  // Copy .ai/targets/ with layer filtering
  const aiTargetsDir = path.join(templatesDir, '.ai/targets');
  if (await fs.pathExists(aiTargetsDir)) {
    const targetFiles = await fs.readdir(aiTargetsDir);
    for (const targetFile of targetFiles) {
      if (targetFile.endsWith('.md')) {
        if (isTargetApplicableToLayer(targetFile, layer)) {
          const content = await fs.readFile(path.join(aiTargetsDir, targetFile), 'utf-8');
          files.push({ path: `.ai/targets/${targetFile}`, content });
        }
      }
    }
  }

  // Select and copy appropriate GUIDELINES variant
  const guidelinesVariants: Record<LayerType, string> = {
    sdk: 'GUIDELINES.sdk.md',
    framework: 'GUIDELINES.framework.md',
    react: 'GUIDELINES.md',
    app: 'GUIDELINES.md',
  };
  const guidelinesVariant = guidelinesVariants[layer];
  const guidelinesPath = path.join(templatesDir, '.ai', guidelinesVariant);
  if (await fs.pathExists(guidelinesPath)) {
    const content = await fs.readFile(guidelinesPath, 'utf-8');
    files.push({ path: '.ai/GUIDELINES.md', content });
  } else {
    // Fallback to default GUIDELINES.md with warning
    console.warn(`Warning: ${guidelinesVariant} not found, using default GUIDELINES.md`);
    const fallbackPath = path.join(templatesDir, '.ai/GUIDELINES.md');
    if (await fs.pathExists(fallbackPath)) {
      const content = await fs.readFile(fallbackPath, 'utf-8');
      files.push({ path: '.ai/GUIDELINES.md', content });
    }
  }

  // Copy layer-filtered commands from commands-bundle
  const commandsBundleDir = path.join(templatesDir, 'commands-bundle');
  if (await fs.pathExists(commandsBundleDir)) {
    const bundledFiles = await fs.readdir(commandsBundleDir);

    // Group command files by base name
    const commandGroups = new Map<string, string[]>();
    for (const file of bundledFiles) {
      if (!file.endsWith('.md')) continue;

      // Extract base command name (without layer suffixes)
      const baseName = file.replace(/\.(sdk|framework|react)\.md$/, '.md');

      if (!commandGroups.has(baseName)) {
        commandGroups.set(baseName, []);
      }
      commandGroups.get(baseName)!.push(file);
    }

    // For each command group, select the most appropriate variant
    for (const [baseName, variants] of commandGroups.entries()) {
      const selectedVariant = selectCommandVariant(baseName, layer, variants);

      if (selectedVariant) {
        const content = await fs.readFile(
          path.join(commandsBundleDir, selectedVariant),
          'utf-8'
        );

        // Copy to .ai/commands/ directory
        files.push({ path: `.ai/commands/${baseName}`, content });
      }
    }
  }

  for (const file of files) {
    if (/\.(md|mdc|ts|tsx|js|cjs|mjs|yaml|yml)$/.test(file.path)) {
      file.content = transformPackageManagerText(file.content, packageManager);
    }
  }

  return files;
}
// @cpt-end:cpt-frontx-flow-cli-tooling-scaffold-layout:p1:inst-write-layout-files
