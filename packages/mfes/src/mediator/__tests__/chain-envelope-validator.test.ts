import { describe, it, expect } from 'vitest';
import {
  validateChainEnvelope,
  MAX_DECLARED_TIMEOUT_MS,
} from '../chain-envelope-validator';
import { ActionsChainRefusalError } from '../../errors';
import type { ActionsChain } from '../../types';

function baseChain(overrides: Partial<ActionsChain> = {}): ActionsChain {
  return {
    action: { type: 'mock.action.v1~do_thing.v1~', target: 'mock.ext.v1~' },
    ...overrides,
  };
}

function refusalClassOf(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ActionsChainRefusalError);
    return (error as ActionsChainRefusalError).refusalClass;
  }
  throw new Error('Expected validateChainEnvelope to throw an ActionsChainRefusalError');
}

describe('validateChainEnvelope', () => {
  it('accepts a well-formed single-node chain', () => {
    expect(() => validateChainEnvelope(baseChain())).not.toThrow();
  });

  it('accepts a well-formed chain with next and fallback branches', () => {
    const chain = baseChain({
      next: baseChain(),
      fallback: baseChain(),
    });
    expect(() => validateChainEnvelope(chain)).not.toThrow();
  });

  it('accepts a declared per-action timeout within range', () => {
    const chain = baseChain({
      action: { type: 'mock.action.v1~do_thing.v1~', target: 'mock.ext.v1~', timeout: 250 },
    });
    expect(() => validateChainEnvelope(chain)).not.toThrow();
  });

  // ---------------------------------------------------------------------
  // Malformed action / target
  // ---------------------------------------------------------------------

  it('refuses a chain whose root is not an object', () => {
    expect(refusalClassOf(() => validateChainEnvelope(null))).toBe('malformed_continuation');
    expect(refusalClassOf(() => validateChainEnvelope('not-a-chain'))).toBe(
      'malformed_continuation'
    );
  });

  it('refuses a chain with a missing action', () => {
    const chain = { } as unknown as ActionsChain;
    expect(refusalClassOf(() => validateChainEnvelope(chain))).toBe('malformed_action');
  });

  it('refuses a chain whose action is not an object', () => {
    const chain = { action: 'nope' } as unknown as ActionsChain;
    expect(refusalClassOf(() => validateChainEnvelope(chain))).toBe('malformed_action');
  });

  it('refuses a chain whose action.target is missing', () => {
    const chain = { action: { type: 'x' } } as unknown as ActionsChain;
    expect(refusalClassOf(() => validateChainEnvelope(chain))).toBe('malformed_action');
  });

  it('refuses a chain whose action.target is not a string', () => {
    const chain = { action: { type: 'x', target: 42 } } as unknown as ActionsChain;
    expect(refusalClassOf(() => validateChainEnvelope(chain))).toBe('malformed_action');
  });

  // ---------------------------------------------------------------------
  // Malformed next / fallback
  // ---------------------------------------------------------------------

  it('refuses a chain whose next is present but not a conforming chain object', () => {
    const chain = { ...baseChain(), next: 'not-a-node' } as unknown as ActionsChain;
    expect(refusalClassOf(() => validateChainEnvelope(chain))).toBe('malformed_continuation');
  });

  it('refuses a chain whose fallback is present but not a conforming chain object', () => {
    const chain = { ...baseChain(), fallback: 123 } as unknown as ActionsChain;
    expect(refusalClassOf(() => validateChainEnvelope(chain))).toBe('malformed_continuation');
  });

  it('refuses a chain whose next node is itself malformed', () => {
    const chain = baseChain({ next: { action: { type: 'x' } } as unknown as ActionsChain });
    expect(refusalClassOf(() => validateChainEnvelope(chain))).toBe('malformed_action');
  });

  // ---------------------------------------------------------------------
  // Cycle detection (active-path set, not a global seen-set)
  // ---------------------------------------------------------------------

  it('refuses a chain whose next points back to an ancestor (direct self-cycle)', () => {
    const node: ActionsChain = baseChain();
    (node as ActionsChain).next = node;
    expect(refusalClassOf(() => validateChainEnvelope(node))).toBe('cyclic_chain');
  });

  it('refuses a chain with a cycle formed across next and fallback', () => {
    const a: ActionsChain = baseChain();
    const b: ActionsChain = baseChain();
    a.next = b;
    b.fallback = a; // cycle: a -> next -> b -> fallback -> a
    expect(refusalClassOf(() => validateChainEnvelope(a))).toBe('cyclic_chain');
  });

  it('does NOT report a shared (non-cyclic) continuation object reused by two branches as a cycle', () => {
    // The same finite continuation object is legitimately reachable as both
    // the `next` of one branch and the `fallback` of another (e.g. a shared
    // cleanup step) — this is a DAG, not a cycle, and must validate cleanly.
    const shared: ActionsChain = baseChain();
    const root = baseChain({
      next: baseChain({ next: shared }),
      fallback: baseChain({ fallback: shared }),
    });
    expect(() => validateChainEnvelope(root)).not.toThrow();
  });

  it('does NOT report the same object shared as both next and fallback of one node as a cycle', () => {
    const shared: ActionsChain = baseChain();
    const root = baseChain({ next: shared, fallback: shared });
    expect(() => validateChainEnvelope(root)).not.toThrow();
  });

  // ---------------------------------------------------------------------
  // Action.timeout value validation (same numeric rule)
  // ---------------------------------------------------------------------

  it.each([0, -1, 1.5, NaN, Infinity, MAX_DECLARED_TIMEOUT_MS + 1])(
    'refuses an invalid declared Action.timeout: %p',
    (value) => {
      const chain = baseChain({
        action: { type: 'x', target: 'y', timeout: value },
      });
      expect(refusalClassOf(() => validateChainEnvelope(chain))).toBe('invalid_action_timeout');
    }
  );

  it('accepts the maximum permitted declared Action.timeout value', () => {
    const chain = baseChain({
      action: { type: 'x', target: 'y', timeout: MAX_DECLARED_TIMEOUT_MS },
    });
    expect(() => validateChainEnvelope(chain)).not.toThrow();
  });

  // ---------------------------------------------------------------------
  // Depth safety: iterative traversal must not overflow the call stack
  // ---------------------------------------------------------------------

  it('validates a very deep but acyclic chain without overflowing the stack', () => {
    const depth = 200_000;
    let head: ActionsChain = baseChain();
    for (let i = 0; i < depth; i++) {
      head = baseChain({ next: head });
    }
    expect(() => validateChainEnvelope(head)).not.toThrow();
  });

  it('refuses a malformed node found deep inside a large chain', () => {
    const depth = 50_000;
    let head: ActionsChain = { action: { type: 'x' } } as unknown as ActionsChain; // malformed leaf
    for (let i = 0; i < depth; i++) {
      head = baseChain({ next: head });
    }
    expect(refusalClassOf(() => validateChainEnvelope(head))).toBe('malformed_action');
  });
});
