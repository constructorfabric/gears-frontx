/**
 * Unit tests for the @cyberfabric/framework/testing subpath.
 *
 * Scope: pure-unit coverage for utilities that live at L2 and do not cross
 * package boundaries. The contract helper below uses local fixtures so this
 * package verifies its own Vitest-only bootstrap helper without reaching into
 * downstream app packages.
 *
 * @vitest-environment jsdom
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeBootstrapMfeContract } from '../src/testing';
import { TestContainerProvider } from '../src/testing/TestContainerProvider';

function resolveFixturePath(relativePath: string): string {
  if (import.meta.url.startsWith('file:')) {
    return fileURLToPath(new URL(relativePath, import.meta.url));
  }

  const schemeStripped = import.meta.url.replace(/^[a-z][a-z0-9+.-]*:(?:\/\/)?/i, '/');
  const withoutSearch = schemeStripped.split(/[?#]/, 1)[0] ?? schemeStripped;
  return path.resolve(path.dirname(withoutSearch), relativePath);
}

describeBootstrapMfeContract({
  suiteName: 'describeBootstrapMfeContract (default resolver)',
  bootstrapModulePath: './fixtures/bootstrap-contract/bootstrap.fixture.ts',
  manifestsModulePath: './fixtures/bootstrap-contract/generated-mfe-manifests.fixture.ts',
  callerUrl: import.meta.url,
});

describeBootstrapMfeContract({
  suiteName: 'describeBootstrapMfeContract (custom resolver)',
  bootstrapModulePath: 'virtual:bootstrap-contract',
  manifestsModulePath: 'virtual:bootstrap-manifests',
  resolveModule: ({ specifier }) => {
    if (specifier === 'virtual:bootstrap-contract') {
      return resolveFixturePath('./fixtures/bootstrap-contract/bootstrap.custom-react.fixture.ts');
    }

    if (specifier === 'virtual:bootstrap-manifests') {
      return resolveFixturePath('./fixtures/bootstrap-contract/generated-mfe-manifests.fixture.ts');
    }

    throw new Error(`Unexpected test fixture specifier: ${specifier}`);
  },
});

describe('describeBootstrapMfeContract', () => {
  it('throws when callerUrl is omitted without a custom resolver', () => {
    expect(() =>
      describeBootstrapMfeContract({
        suiteName: 'missing callerUrl',
        bootstrapModulePath: './fixtures/bootstrap-contract/bootstrap.fixture.ts',
        manifestsModulePath: './fixtures/bootstrap-contract/generated-mfe-manifests.fixture.ts',
      }),
    ).toThrow(
      "describeBootstrapMfeContract: 'callerUrl' is required when no 'resolveModule' is provided",
    );
  });
});

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
