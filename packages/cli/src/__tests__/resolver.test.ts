// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
import { describe, it, expect, vi } from 'vitest';
import { resolveToInventory } from '../resolver/resolve.js';
import type { StructuredRef } from '../spec-parser/types.js';
import type { FetchFn } from '../resolver/types.js';

const validRef: StructuredRef = {
  host: 'github',
  owner: 'acme',
  repo: 'my-template',
  ref: 'v1.2.0',
};

describe('resolveToInventory', () => {
  // inst-resolve-fetch-fail-check, inst-resolve-fetch-fail
  it('unreachable registry aborts before inventory write', async () => {
    const fetchFn: FetchFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const result = await resolveToInventory(validRef, fetchFn);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/fetch|network|unreachable/i);
  });

  // inst-resolve-name, inst-resolve-addr, inst-resolve-fetch,
  // inst-resolve-write, inst-resolve-index, inst-resolve-return
  it('successful fetch returns inventory-ready record', async () => {
    const fetchFn: FetchFn = vi.fn().mockResolvedValue('template-content');
    const result = await resolveToInventory(validRef, fetchFn);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('my-template');
    expect(result.value.ref).toBe('v1.2.0');
    expect(result.value.content).toBe('template-content');
  });

  // inst-resolve-fetch-fail — no partial state on failure
  it('fetch failure returns resolution error (no partial state)', async () => {
    const fetchFn: FetchFn = vi.fn().mockRejectedValue(new Error('503 Service Unavailable'));
    const result = await resolveToInventory(validRef, fetchFn);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // No partial record fields
    expect((result as { value?: unknown }).value).toBeUndefined();
  });
});
