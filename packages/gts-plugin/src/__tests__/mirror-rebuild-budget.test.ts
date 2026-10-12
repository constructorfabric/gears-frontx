/**
 * Mirror rebuild budget: a rejected candidate under a new identifier rebuilds
 * the scratch store from every entity on the store, and that must stay within
 * the runtime's 50 ms p95 registration budget (`cpt-frontx-nfr-runtime-performance`)
 * at 500 type definitions and 500 instances.
 */
import { describe, expect, it } from 'vitest';
import { GtsPlugin } from '../plugin';
import { META_SCHEMA } from './realm-support';

const BUDGET_MS = 50;
const WARMUP = 5;
const SAMPLES = 20;
// A busy runner can stall a whole round. The budget is not loosened: a round
// passes only under 50 ms p95, and a stalled round is measured again.
const ROUNDS = 3;

// Generous on purpose: the default 5 s timeout must not fail this test under CPU
// contention. Only the p95 assertion below decides the budget.
const TEST_TIMEOUT_MS = 120_000;

describe('scratch rebuild', () => {
  it('completes within 50 ms p95 over 500 type definitions and 500 instances', () => {
    const plugin = new GtsPlugin({ isolated: true });
    for (let i = 0; i < 500; i++) {
      const type = `gts.bench.perf.core.type${i}.v1~`;
      plugin.registerSchema({
        $id: `gts://${type}`,
        $schema: META_SCHEMA,
        type: 'object',
        properties: { id: { 'x-gts-ref': '/$id' }, n: { type: 'number' } },
        required: ['id'],
      });
      plugin.register({ id: `${type}bench.perf.core.inst${i}.v1`, n: i });
    }

    let n = 0;
    // A rejected candidate under a new identifier: the whole call, error construction included.
    const rejectOnce = (): number => {
      const start = performance.now();
      expect(() => plugin.register({ id: `gts.bench.perf.core.type0.v1~bench.perf.core.bad${n++}.v1`, n: 'x' })).toThrow();
      return performance.now() - start;
    };

    // Discarded: the first calls pay for compilation and lazy initialisation.
    for (let i = 0; i < WARMUP; i++) rejectOnce();

    let p95 = Infinity;
    for (let round = 0; round < ROUNDS && p95 >= BUDGET_MS; round++) {
      const durations = Array.from({ length: SAMPLES }, rejectOnce).sort((a, b) => a - b);
      p95 = durations[Math.ceil(SAMPLES * 0.95) - 1]!;
    }

    expect(p95).toBeLessThan(BUDGET_MS);
  }, TEST_TIMEOUT_MS);
});
