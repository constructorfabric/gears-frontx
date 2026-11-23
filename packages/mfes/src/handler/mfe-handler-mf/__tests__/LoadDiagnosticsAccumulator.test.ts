/**
 * The per-load diagnostic states the realm cache's figures, or that they
 * are unavailable when the adopted cache has no `getDiagnostics` operation
 * (`cpt-frontx-flow-mfe-isolation-load`, `inst-emit-load-diagnostic`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ByteBudgetLruCache } from '../ByteBudgetLruCache';
import { LoadDiagnosticsAccumulator } from '../LoadDiagnosticsAccumulator';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LoadDiagnosticsAccumulator.summarize', () => {
  it('writes the bytes the load fetched and the cache figures it reports, naming the manifest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cache = new ByteBudgetLruCache(1000);
    new LoadDiagnosticsAccumulator().summarize('manifest-a', 12, cache);

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("'manifest-a'");
    expect(message).toContain('fetched 12 bytes');
    expect(message).toContain('realm cache holds 0 bytes in 0 entries (budget 1000, evictions 0)');
  });

  it('states that the figures are unavailable when the adopted cache has no getDiagnostics', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A cache another copy published: only the operations the loading path needs.
    const adopted = new Map<string, Promise<string>>();
    new LoadDiagnosticsAccumulator().summarize('manifest-b', 7, adopted);

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("'manifest-b'");
    expect(message).toContain('fetched 7 bytes');
    expect(message).toContain('unavailable');
    expect(message).not.toContain('holds 0 bytes');
  });
});
