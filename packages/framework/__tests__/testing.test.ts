/**
 * Unit tests for the @cyberfabric/framework/testing subpath.
 *
 * Scope: pure-unit coverage for utilities that live at L2 and do not cross
 * package boundaries.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { TestContainerProvider } from '../src/testing/TestContainerProvider';

describe('TestContainerProvider (factory adapter)', () => {
  it('exposes a mockContainer Element when document is available', () => {
    const provider = new TestContainerProvider();
    expect(provider.mockContainer instanceof HTMLElement).toBe(true);
  });

  it('accepts an explicit container in the constructor', () => {
    const container = document.createElement('section');
    const provider = new TestContainerProvider(container);
    expect(provider.mockContainer).toBe(container);
  });

  it('prepareForDomain returns the factory instance for chaining', () => {
    const provider = new TestContainerProvider();
    const declaration = {
      id: 'gts.hai3.mfes.ext.domain.v1~test.app.domain.v1',
      sharedProperties: [],
      actions: [],
      extensionsActions: [],
      defaultActionTimeout: 5000,
      lifecycleStages: [],
      extensionsLifecycleStages: [],
    };
    expect(provider.prepareForDomain(declaration)).toBe(provider);
  });
});
