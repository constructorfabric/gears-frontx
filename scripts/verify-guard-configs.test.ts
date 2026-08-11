import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { verifyMemberRegistrationInRegistry } from './verify-guard-configs.ts';

describe('verifyMemberRegistrationInRegistry', () => {
  const cleanupDirs: string[] = [];
  const members = ['@gears-frontx/ui-kit'] as const;
  const packageDirs = { '@gears-frontx/ui-kit': 'packages/ui-kit' } as const;

  afterEach(async () => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  async function makeRegistry(ignoreBlock: string): Promise<string> {
    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'verify-guard-configs-'));
    cleanupDirs.push(fixtureDir);

    const registryPath = path.join(fixtureDir, 'artifacts.toml');
    const sourcePath = path.join(
      process.cwd(),
      '.cf-studio',
      'config',
      'artifacts.toml',
    );
    const source = await readFile(sourcePath, 'utf8');
    const registry = source.replace(
      /\[\[ignore\]\]\s*reason = "UI Kit package[\s\S]*?patterns = \["packages\/ui-kit\/\*\*"\]\s*/m,
      `${ignoreBlock}\n\n`,
    );
    await writeFile(registryPath, registry);

    return registryPath;
  }

  it('accepts the current ui-kit debt reason', async () => {
    const registryPath = await makeRegistry(`[[ignore]]
reason = "UI Kit package has no backing CDSL artifact yet. Removal criterion per the member artifact chain (cpt-frontx-constraint-member-artifact-chain, root DESIGN section 2.2): ui-kit is registered as its own child system owning a PRD, a DESIGN, and at least one FEATURE (never a DECOMPOSITION), per the member artifact chain's 3-layer rule. NOT satisfied by adding a requirement to the root PRD or a component to the root DESIGN - that is the centralized shape the layer partition replaced."
patterns = ["packages/ui-kit/**"]`);

    expect(
      verifyMemberRegistrationInRegistry(registryPath, members, packageDirs),
    ).toEqual([
      expect.objectContaining({
        name: 'Member @gears-frontx/ui-kit: Artifact chain registered for enforcement',
        passed: true,
      }),
    ]);
  });

  it('rejects a matching ignore with only a temporary reason', async () => {
    const registryPath = await makeRegistry(`[[ignore]]
reason = "temporary"
patterns = ["packages/ui-kit/**"]`);

    expect(
      verifyMemberRegistrationInRegistry(registryPath, members, packageDirs),
    ).toEqual([
      expect.objectContaining({
        passed: false,
        message: expect.stringContaining(
          'missing current artifact-chain debt and objective removal criterion',
        ),
      }),
    ]);
  });

  it('fails closed when a matching ignore has no reason', async () => {
    const registryPath = await makeRegistry(`[[ignore]]
patterns = ["packages/ui-kit/**"]`);

    expect(
      verifyMemberRegistrationInRegistry(registryPath, members, packageDirs),
    ).toEqual([
      expect.objectContaining({
        name: 'Member registration: Registry readable',
        passed: false,
        message: expect.stringContaining('an [[ignore]] table with no reason key'),
      }),
    ]);
  });

  it('fails when no matching ignore exists and no child registration remains', async () => {
    const registryPath = await makeRegistry(`[[ignore]]
reason = "Build artifacts and dependencies"
patterns = ["*/dist/*"]`);

    expect(
      verifyMemberRegistrationInRegistry(registryPath, members, packageDirs),
    ).toEqual([
      expect.objectContaining({
        passed: false,
        message: expect.stringContaining('no [[ignore]] recording the debt'),
      }),
    ]);
  });
});
