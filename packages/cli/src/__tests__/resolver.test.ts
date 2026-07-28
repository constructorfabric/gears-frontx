// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
import { describe, it, expect, vi } from 'vitest';
import { resolveToInventory } from '../resolver/resolve';
import type { StructuredRef } from '../spec-parser/types';
import type { FetchFn } from '../resolver/types';
import type { TemplateManifest } from '../manifest/types';

const validRef: StructuredRef = {
  host: 'github',
  owner: 'acme',
  repo: 'my-template',
  ref: 'v1.2.0',
};

// A contract-valid manifest, serialized to the string a `FetchFn` returns.
// The identity ("widget-kit") is deliberately different from `validRef.repo`
// ("my-template") so a test asserting on it proves identity is read from the
// manifest rather than inherited from the repository segment.
function manifestContent(name: string, version = '1.0.0'): string {
  const manifest: TemplateManifest = {
    name,
    version,
    ownershipBoundaries: { exclusiveSubtrees: [], sharedFiles: [] },
  };
  return JSON.stringify(manifest);
}

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
  it('successful fetch returns inventory-ready record identified by the manifest, not the repository', async () => {
    const content = manifestContent('widget-kit');
    const fetchFn: FetchFn = vi.fn().mockResolvedValue(content);
    const result = await resolveToInventory(validRef, fetchFn);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('widget-kit');
    expect(result.value.ref).toBe('v1.2.0');
    expect(result.value.content).toBe(content);
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
