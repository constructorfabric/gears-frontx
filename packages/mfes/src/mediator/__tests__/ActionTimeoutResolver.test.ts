import { describe, it, expect } from 'vitest';
import { ActionTimeoutResolver } from '../ActionTimeoutResolver';

const resolver = new ActionTimeoutResolver();

describe('ActionTimeoutResolver.resolve', () => {
  it('returns a declared timeout as-is even when a domain is given', () => {
    const domain = { id: 'domain-1', defaultActionTimeout: 5000 };

    expect(resolver.resolve(1000, domain, 'target-1')).toBe(1000);
  });

  it('returns the domain defaultActionTimeout when no declared timeout is present', () => {
    const domain = { id: 'domain-1', defaultActionTimeout: 5000 };

    expect(resolver.resolve(undefined, domain, 'target-1')).toBe(5000);
  });

  it('throws an Error containing "Cannot resolve timeout" and the target id when no domain and no declared timeout', () => {
    expect(() => resolver.resolve(undefined, undefined, 'target-123')).toThrow(
      /Cannot resolve timeout.*target-123/
    );
  });
});
