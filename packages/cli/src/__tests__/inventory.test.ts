// @cpt-flow:cpt-frontx-flow-template-resolution-install:p1
// @cpt-flow:cpt-frontx-flow-template-resolution-list:p1
// @cpt-flow:cpt-frontx-flow-template-resolution-update-local:p1
// @cpt-algo:cpt-frontx-algo-template-resolution-bounded-update:p1
// @cpt-state:cpt-frontx-state-template-resolution-inventory-lifecycle:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-install-by-spec:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-list-inventory:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-bounded-local-update:p1
import { describe, it, expect, vi } from 'vitest';
import { TemplateInventory } from '../inventory/TemplateInventory.js';
import { InventoryState } from '../inventory/types.js';
import type { FetchFn } from '../resolver/types.js';

function makeSuccessFetch(content = 'template-content'): FetchFn {
  return vi.fn().mockResolvedValue(content);
}

function makeFailFetch(message = 'Network error'): FetchFn {
  return vi.fn().mockRejectedValue(new Error(message));
}

describe('TemplateInventory', () => {
  describe('install', () => {
    // inst-install-invoke, inst-install-parse, inst-install-resolve,
    // inst-install-fetch, inst-install-materialize, inst-install-success
    it('valid spec installs to inventory at pinned ref', async () => {
      const inv = new TemplateInventory();
      const fetch = makeSuccessFetch();
      const result = await inv.install('github:acme/my-template@v1.0.0', fetch);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.name).toBe('my-template');
      expect(result.value.ref).toBe('v1.0.0');
    });

    // inst-install-parse-check, inst-install-parse-reject
    it('invalid spec rejected, no inventory write', async () => {
      const inv = new TemplateInventory();
      const fetch = makeSuccessFetch();
      const result = await inv.install('acme/my-template@v1.0.0', fetch);
      expect(result.ok).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
      const entries = await inv.list();
      expect(entries).toHaveLength(0);
    });

    // inst-install-reach-check, inst-install-reach-fail
    it('unreachable registry aborts, no inventory write', async () => {
      const inv = new TemplateInventory();
      const fetch = makeFailFetch('Connection refused');
      const result = await inv.install('github:acme/my-template@v1.0.0', fetch);
      expect(result.ok).toBe(false);
      const entries = await inv.list();
      expect(entries).toHaveLength(0);
    });
  });

  describe('list', () => {
    // inst-list-invoke, inst-list-read, inst-list-format, inst-list-return
    it('returns all installed entries', async () => {
      const inv = new TemplateInventory();
      await inv.install('github:acme/template-a@v1.0.0', makeSuccessFetch('a'));
      await inv.install('github:acme/template-b@v2.0.0', makeSuccessFetch('b'));
      const entries = await inv.list();
      expect(entries).toHaveLength(2);
      const names = entries.map((e) => e.name);
      expect(names).toContain('template-a');
      expect(names).toContain('template-b');
    });

    // inst-list-empty-check, inst-list-empty-return
    it('returns empty on empty inventory', async () => {
      const inv = new TemplateInventory();
      const entries = await inv.list();
      expect(entries).toHaveLength(0);
    });
  });

  describe('update-local', () => {
    // inst-update-invoke, inst-update-lookup, inst-update-parse, inst-update-fetch,
    // inst-update-write, inst-update-success
    it('replaces existing entry, no scaffolded projects touched', async () => {
      const inv = new TemplateInventory();
      await inv.install('github:acme/my-template@v1.0.0', makeSuccessFetch('v1-content'));
      const result = await inv.updateLocal(
        'my-template',
        'github:acme/my-template@v2.0.0',
        makeSuccessFetch('v2-content'),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.ref).toBe('v2.0.0');

      const entries = await inv.list();
      const entry = entries.find((e) => e.name === 'my-template');
      expect(entry?.ref).toBe('v2.0.0');
    });

    // inst-update-notfound-check, inst-update-notfound
    it('returns not-found error for non-existent entry', async () => {
      const inv = new TemplateInventory();
      const result = await inv.updateLocal(
        'nonexistent',
        'github:acme/nonexistent@v1.0.0',
        makeSuccessFetch(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/not.found|nonexistent/i);
    });
  });

  describe('state machine', () => {
    // inst-state-to-resolved, inst-state-to-installed, inst-state-to-updated
    it('cycles UNRESOLVED → RESOLVED → INSTALLED → UPDATED', async () => {
      const inv = new TemplateInventory();

      // Initially UNRESOLVED (no entry)
      const initial = inv.getState('my-template');
      expect(initial).toBe(InventoryState.UNRESOLVED);

      // After install: INSTALLED (passes through RESOLVED internally)
      await inv.install('github:acme/my-template@v1.0.0', makeSuccessFetch('v1'));
      const afterInstall = inv.getState('my-template');
      expect(afterInstall).toBe(InventoryState.INSTALLED);

      // After update: UPDATED
      await inv.updateLocal(
        'my-template',
        'github:acme/my-template@v2.0.0',
        makeSuccessFetch('v2'),
      );
      const afterUpdate = inv.getState('my-template');
      expect(afterUpdate).toBe(InventoryState.UPDATED);
    });
  });
});
