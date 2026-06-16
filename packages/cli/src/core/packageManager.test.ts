import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_PACKAGE_MANAGER,
  getAddPackagesCommand,
  getCiInstallCommand,
  getExecCommand,
  getGlobalInstallCommand,
  getInstallCommand,
  getManagerWorkspaceFiles,
  getPackageManagerEngineRange,
  getPackageManagerEngines,
  getRunScriptCommand,
  getWorkspaceRunScriptCommand,
  isSupportedPackageManager,
  packageManagerFieldValue,
  parsePackageManagerField,
  resolveFrontxUnitTestConvention,
  detectPackageManager,
  transformPackageManagerText,
} from './packageManager.js';

describe('packageManager helpers', () => {
  it('recognizes supported package managers only', () => {
    expect(isSupportedPackageManager('npm')).toBe(true);
    expect(isSupportedPackageManager('pnpm')).toBe(true);
    expect(isSupportedPackageManager('yarn')).toBe(true);
    expect(isSupportedPackageManager('bun')).toBe(false);
    expect(isSupportedPackageManager(null)).toBe(false);
  });

  it('parses and formats packageManager fields', () => {
    expect(parsePackageManagerField(undefined)).toBeNull();
    expect(parsePackageManagerField('bun@1.1.0')).toBeNull();
    expect(parsePackageManagerField('pnpm@9.12.3')).toEqual({
      manager: 'pnpm',
      version: '9.12.3',
    });
    expect(parsePackageManagerField('yarn')).toEqual({
      manager: 'yarn',
      version: undefined,
    });

    expect(packageManagerFieldValue('npm')).toBe('npm@11.0.0');
    expect(packageManagerFieldValue('yarn', '4.2.1')).toBe('yarn@4.2.1');
  });

  it('returns engine policies per package manager', () => {
    expect(getPackageManagerEngineRange('npm')).toBe('>=10.0.0');
    expect(getPackageManagerEngineRange('pnpm')).toBe('>=10.0.0');
    expect(getPackageManagerEngineRange('yarn')).toBe('>=4.0.0');
    expect(getPackageManagerEngines('pnpm', '>=20')).toEqual({
      node: '>=20',
      pnpm: '>=10.0.0',
    });
  });

  it('builds install, run, exec, add, global install, and workspace commands', () => {
    expect(getInstallCommand('npm')).toBe('npm install');
    expect(getInstallCommand('yarn')).toBe('yarn install');

    expect(getCiInstallCommand('npm')).toBe('npm ci');
    expect(getCiInstallCommand('pnpm')).toBe('pnpm install --frozen-lockfile');
    expect(getCiInstallCommand('yarn')).toBe('yarn install --immutable');

    expect(getRunScriptCommand('npm', 'build')).toBe('npm run build');
    expect(getRunScriptCommand('yarn', 'build')).toBe('yarn build');

    expect(getWorkspaceRunScriptCommand('npm', '@gears-frontx/cli', 'test:unit')).toBe(
      'npm run test:unit --workspace=@gears-frontx/cli'
    );
    expect(getWorkspaceRunScriptCommand('pnpm', '@gears-frontx/cli', 'test:unit')).toBe(
      'pnpm --filter @gears-frontx/cli run test:unit'
    );
    expect(getWorkspaceRunScriptCommand('yarn', '@gears-frontx/cli', 'test:unit')).toBe(
      'yarn workspace @gears-frontx/cli run test:unit'
    );

    expect(getExecCommand('npm', 'vitest')).toBe('npm exec -- vitest');
    expect(getExecCommand('pnpm', 'vitest')).toBe('pnpm exec vitest');

    expect(getAddPackagesCommand('npm', ['vitest'], { dev: true })).toBe('npm install -D vitest');
    expect(getAddPackagesCommand('pnpm', ['vitest', 'tsx'])).toBe('pnpm add vitest tsx');
    expect(getAddPackagesCommand('yarn', ['vitest'], { dev: true })).toBe('yarn add -D vitest');

    expect(getGlobalInstallCommand('npm', 'frontx')).toBe('npm install -g frontx');
    expect(getGlobalInstallCommand('pnpm', 'frontx')).toBe('pnpm add -g frontx');
    expect(getGlobalInstallCommand('yarn', 'frontx')).toBeNull();
  });

  it('returns manager-specific workspace helper files', () => {
    expect(getManagerWorkspaceFiles('npm')).toEqual([]);
    expect(getManagerWorkspaceFiles('pnpm')).toEqual([
      {
        path: 'pnpm-workspace.yaml',
        content: 'packages:\n  - eslint-plugin-local\n  - src/mfe_packages/*\n',
      },
    ]);
    expect(getManagerWorkspaceFiles('yarn')).toEqual([
      {
        path: '.yarnrc.yml',
        content: 'nodeLinker: node-modules\n',
      },
    ]);
  });

  it('transforms npm command snippets for pnpm and yarn', () => {
    const content = [
      'npm run build',
      'npm run test:unit --workspace=@gears-frontx/cli',
      'npm ci',
      'npm install',
      "  cache: 'npm'",
      '  cache: npm',
    ].join('\n');

    expect(transformPackageManagerText(content, 'npm')).toBe(content);
    expect(transformPackageManagerText(content, 'pnpm')).toContain(
      'pnpm --filter @gears-frontx/cli run test:unit'
    );
    expect(transformPackageManagerText(content, 'pnpm')).toContain('pnpm run build');
    expect(transformPackageManagerText(content, 'pnpm')).toContain('pnpm install --frozen-lockfile');
    expect(transformPackageManagerText(content, 'pnpm')).toContain("cache: 'pnpm'");
    expect(transformPackageManagerText(content, 'pnpm')).toContain('cache: pnpm');

    const yarnText = transformPackageManagerText(content, 'yarn');
    expect(yarnText).toContain('yarn workspace @gears-frontx/cli run test:unit');
    expect(yarnText).toContain('yarn build');
    expect(yarnText).toContain('yarn install --immutable');
    expect(yarnText).toContain("cache: 'yarn'");
    expect(yarnText).toContain('cache: yarn');
  });
});

describe('detectPackageManager', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frontx-cli-pm-'));
  });

  afterEach(async () => {
    await fs.remove(tempRoot);
  });

  it('falls back to the default package manager when no hints exist', async () => {
    expect(await detectPackageManager(tempRoot)).toEqual({
      manager: DEFAULT_PACKAGE_MANAGER,
    });
  });

  it('reads packageManager from package.json when present', async () => {
    await fs.writeJson(path.join(tempRoot, 'package.json'), {
      packageManager: 'pnpm@9.15.0',
    });

    expect(await detectPackageManager(tempRoot)).toEqual({
      manager: 'pnpm',
      version: '9.15.0',
    });
  });

  it('prefers explicit config and preserves matching package.json version', async () => {
    await fs.writeJson(path.join(tempRoot, 'package.json'), {
      packageManager: 'yarn@4.6.0',
    });

    expect(
      await detectPackageManager(tempRoot, {
        frontx: true,
        packageManager: 'yarn',
        linkerMode: 'node-modules',
      })
    ).toEqual({
      manager: 'yarn',
      version: '4.6.0',
      linkerMode: 'node-modules',
    });
  });

  it('uses config even when package.json is invalid or disagrees', async () => {
    await fs.writeFile(path.join(tempRoot, 'package.json'), '{ invalid json');

    expect(
      await detectPackageManager(tempRoot, {
        frontx: true,
        packageManager: 'npm',
        packageManagerVersion: '11.2.0',
      })
    ).toEqual({
      manager: 'npm',
      version: '11.2.0',
      linkerMode: undefined,
    });
  });
});

describe('resolveFrontxUnitTestConvention', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frontx-cli-unit-test-'));
  });

  afterEach(async () => {
    await fs.remove(tempRoot);
  });

  it('fails when package.json is missing', async () => {
    await expect(resolveFrontxUnitTestConvention(tempRoot)).resolves.toEqual({
      ok: false,
      error: 'Missing package.json — cannot resolve the FrontX unit-test convention for this project.',
    });
  });

  it('fails when package.json cannot be read', async () => {
    await fs.writeFile(path.join(tempRoot, 'package.json'), '{ not json');

    await expect(resolveFrontxUnitTestConvention(tempRoot)).resolves.toEqual({
      ok: false,
      error: 'Unable to read package.json — cannot resolve the FrontX unit-test convention.',
    });
  });

  it('fails when scripts.test:unit is missing or empty', async () => {
    await fs.writeJson(path.join(tempRoot, 'package.json'), { scripts: {} });
    await expect(resolveFrontxUnitTestConvention(tempRoot)).resolves.toEqual({
      ok: false,
      error:
        'package.json must expose a non-empty scripts.test:unit entry for the FrontX Vitest scaffold convention.',
    });

    await fs.writeJson(path.join(tempRoot, 'package.json'), {
      scripts: { 'test:unit': '   ' },
    });
    await expect(resolveFrontxUnitTestConvention(tempRoot)).resolves.toEqual({
      ok: false,
      error:
        'package.json must expose a non-empty scripts.test:unit entry for the FrontX Vitest scaffold convention.',
    });
  });

  it('returns the normalized command based on detected package manager', async () => {
    await fs.writeJson(path.join(tempRoot, 'package.json'), {
      packageManager: 'pnpm@10.0.0',
      scripts: { 'test:unit': 'vitest --run' },
    });

    await expect(resolveFrontxUnitTestConvention(tempRoot)).resolves.toEqual({
      ok: true,
      command: 'pnpm run test:unit',
      packageManager: 'pnpm',
    });
  });

  it('uses config package manager for the resolved command', async () => {
    await fs.writeJson(path.join(tempRoot, 'package.json'), {
      packageManager: 'npm@11.0.0',
      scripts: { 'test:unit': 'vitest --run' },
    });

    await expect(
      resolveFrontxUnitTestConvention(tempRoot, {
        frontx: true,
        packageManager: 'yarn',
      })
    ).resolves.toEqual({
      ok: true,
      command: 'yarn test:unit',
      packageManager: 'yarn',
    });
  });
});
