import os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { createStagedInventory } from '../commands/staged-inventory';
import { UnindexedSlotResidueError } from '../adapters/fs-content-store';
import { TemplateInventory } from '../inventory/TemplateInventory';
import { BUNDLE_MARKER } from '../bundle/envelope';
import type { FetchFn } from '../resolver/types';

// In-memory inventory only: no filesystem, nothing to clean up.
const manifest = JSON.stringify({ name: 'demo', version: '1.0.0', excludedSubtrees: [], description: 'Fixture.' });
const content = JSON.stringify({ [BUNDLE_MARKER]: { 'frontx-template.json': manifest, 'src/a.ts': 'export const a = 1;' } });

describe('staged batch auto-install (plan-ai-recovery r9 §4/§203)', () => {
  it('serves a staged candidate to the checks without installing it, then installs exactly it on commit', async () => {
    const real = new TemplateInventory();
    const fetchFn = vi.fn(async () => content) as unknown as FetchFn;
    const staged = createStagedInventory(real, (name) => `/inv/${name}`);
    const installed = await staged.inventory.install('github:acme/demo@v1.0.0', fetchFn);
    expect(installed).toMatchObject({ ok: true, value: { name: 'demo' } });
    expect(real.lookup('demo')).toBeUndefined(); // nothing adopted yet
    expect(staged.inventory.lookup('demo')).toMatchObject({ name: 'demo' });
    const base = vi.fn(async () => []);
    const items = await staged.readInstalledContent(base)('/inv/demo');
    expect(items.map((i) => i.path).sort()).toEqual(['frontx-template.json', 'src/a.ts']);
    expect(base).not.toHaveBeenCalled();

    expect(await staged.commit()).toEqual({ ok: true });
    expect(real.lookup('demo')).toMatchObject({ name: 'demo' });
  });

  it('refuses the commit when the installed slot does not hold the checked candidate', async () => {
    let installedContent: string | undefined;
    const real = {
      lookup: (name: string) => (installedContent === undefined ? undefined : { name, source: 'github:acme/demo@v1.0.0', ref: 'v1.0.0', status: 'INSTALLED', content: installedContent }),
      install: async () => {
        installedContent = JSON.stringify({ [BUNDLE_MARKER]: { 'frontx-template.json': manifest, 'src/a.ts': 'different bytes' } });
        return { ok: true as const, value: { name: 'demo', ref: 'v1.0.0' } };
      },
      readInstalled: () => installedContent,
    } as unknown as TemplateInventory;
    const staged = createStagedInventory(real, (name) => `/inv/${name}`);
    await staged.inventory.install('github:acme/demo@v1.0.0', (async () => content) as FetchFn);
    expect(await staged.commit()).toMatchObject({ ok: false, code: 'CONTENT_CONFLICT' });
  });

  function twoItems(second: 'refuses' | 'throws' | 'readback-throws') {
    const slots = new Map<string, string>();
    const manifestOf = (name: string) => JSON.stringify({ name, version: '1.0.0', excludedSubtrees: [], description: 'Fixture.' });
    const contentOf = (name: string) => JSON.stringify({ [BUNDLE_MARKER]: { 'frontx-template.json': manifestOf(name) } });
    const real = {
      lookup: (name: string) => (slots.has(name) ? { name, source: `github:acme/${name}@v1.0.0`, ref: 'v1.0.0', status: 'INSTALLED', content: slots.get(name)! } : undefined),
      install: async (spec: string) => {
        const name = spec.includes('/b@') ? 'b' : 'a';
        if (name === 'b' && second === 'refuses') return { ok: false as const, error: { code: 'REGISTRATION_CONFLICT' as const, message: 'overlaps another entry' } };
        if (name === 'b' && second === 'throws') throw new Error('disk full');
        slots.set(name, contentOf(name));
        return { ok: true as const, value: { name, ref: 'v1.0.0' } };
      },
      readInstalled: (name: string) => {
        if (name === 'b' && second === 'readback-throws') throw new Error('EIO');
        return slots.get(name);
      },
    } as unknown as TemplateInventory;
    const staged = createStagedInventory(real, (name) => `/inv/${name}`);
    const fetchFn = (async (url: string) => contentOf(url.includes('/b/') ? 'b' : 'a')) as FetchFn;
    return { staged, fetchFn, slots };
  }

  it.each([
    ['refuses', 'REGISTRATION_CONFLICT', 'not-installed'],
    ['throws', 'INTERNAL', 'unknown'],
    ['readback-throws', 'CONTENT_CONFLICT', 'unverified'],
  ] as const)('a second item that %s yields an honest report naming the slot already installed', async (second, code, slot) => {
    const { staged, fetchFn, slots } = twoItems(second);
    await staged.inventory.install('github:acme/a@v1.0.0', fetchFn);
    await staged.inventory.install('github:acme/b@v1.0.0', fetchFn);
    const result = await staged.commit();
    expect(result).toMatchObject({ ok: false, code, details: { failed: 'b', slot, installedInventorySlots: ['a'] } });
    if (!result.ok) expect(result.message).toContain('Installed and verified by this command, left in place: a');
    expect(result).toMatchObject({ details: { contentPath: '/inv/b' } });
    expect([...slots.keys()]).toEqual(second === 'readback-throws' ? ['a', 'b'] : ['a']);
  });

  it('refuses the whole commit before installing anything when a slot path is already occupied without an index entry', async () => {
    const install = vi.fn();
    const real = { lookup: () => undefined, install, readInstalled: () => undefined } as unknown as TemplateInventory;
    // An existing directory stands in for unindexed residue (nothing is created or removed here).
    const staged = createStagedInventory(real, () => os.tmpdir());
    await staged.inventory.install('github:acme/demo@v1.0.0', (async () => content) as FetchFn);
    expect(await staged.commit()).toMatchObject({ ok: false, code: 'CONTENT_CONFLICT', details: { slot: 'residue', installedInventorySlots: [] } });
    expect(install).not.toHaveBeenCalled();
  });

  it('classifies the store\'s typed residue refusal as residue, and an unreadable index as unknown', async () => {
    const make = (error: Error, lookupThrows: boolean) => {
      let calls = 0;
      const real = {
        lookup: () => {
          if (lookupThrows && calls++ > 0) throw new Error('index unreadable');
          return undefined;
        },
        install: async () => { throw error; },
        readInstalled: () => undefined,
      } as unknown as TemplateInventory;
      return createStagedInventory(real, (name) => `/inv/${name}`);
    };
    const residue = make(new UnindexedSlotResidueError('/inv/demo'), false);
    await residue.inventory.install('github:acme/demo@v1.0.0', (async () => content) as FetchFn);
    expect(await residue.commit()).toMatchObject({ ok: false, code: 'CONTENT_CONFLICT', details: { slot: 'residue', contentPath: '/inv/demo' } });
    const unknown = make(new Error('disk full'), true);
    await unknown.inventory.install('github:acme/demo@v1.0.0', (async () => content) as FetchFn);
    expect(await unknown.commit()).toMatchObject({ ok: false, code: 'INTERNAL', details: { slot: 'unknown', indexed: 'unknown' } });
  });
});
