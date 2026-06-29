/**
 * Unit tests for ExtensionDomainSlot component.
 *
 * Uses class-based fakes for MfeRegistry and ExtensionMounter so that
 * the component can be exercised through its public API. No production code
 * is modified; all stubs live here in the test file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ExtensionDomainSlot, type ExtensionDomainSlotProps } from '../ExtensionDomainSlot';
import { ExtensionMounter } from '@gears-frontx/framework';
import { MfeRegistry } from '@gears-frontx/framework';
import type { ActionsChain, ExtensionDomain, Extension } from '@gears-frontx/framework';
import type { ExtensionDomainImplementationFactory } from '@gears-frontx/framework';
import type { ParentMfeBridge } from '@gears-frontx/framework';
import type { TypeSystemPlugin } from '@gears-frontx/framework';

// ─── FakeMounter ─────────────────────────────────────────────────────────────

class FakeMounter extends ExtensionMounter {
  readonly attachCalls: Element[] = [];
  detachCount = 0;

  attach(root: Element): void {
    this.attachCalls.push(root);
  }

  async detach(): Promise<void> {
    this.detachCount += 1;
  }

  async mount(_extensionId: string, _container: Element): Promise<void> {}
  async unmount(_extensionId: string): Promise<void> {}
}

// ─── FakeRegistry ─────────────────────────────────────────────────────────────

class FakeRegistry extends MfeRegistry {
  readonly typeSystem: TypeSystemPlugin = {
    name: 'fake',
    version: '0',
    register: () => {},
    registerSchema: () => {},
    getSchema: () => undefined,
    isTypeOf: () => false,
    validateInstance: () => ({ valid: true, errors: [] }),
  };

  private readonly mounsterByDomain = new Map<string, ExtensionMounter>();

  registerMounter(domainId: string, mounter: ExtensionMounter): void {
    this.mounsterByDomain.set(domainId, mounter);
  }

  getMounter(domainId: string): ExtensionMounter {
    const m = this.mounsterByDomain.get(domainId);
    if (!m) throw new Error(`No mounter registered for domain: ${domainId}`);
    return m;
  }

  // Remaining required abstract methods — not under test.
  registerDomain(_d: ExtensionDomain, _f: ExtensionDomainImplementationFactory): void {}
  async unregisterDomain(_id: string): Promise<void> {}
  async registerExtension(_e: Extension): Promise<void> {}
  async unregisterExtension(_id: string): Promise<void> {}
  updateSharedProperty(_p: string, _v: unknown): void {}
  getDomainProperty(_d: string, _p: string): unknown { return undefined; }
  async executeActionsChain(_c: ActionsChain): Promise<void> {}
  getExtension(_id: string): Extension | undefined { return undefined; }
  getDomain(_id: string): ExtensionDomain | undefined { return undefined; }
  getExtensionsForDomain(_id: string): Extension[] { return []; }
  getMountedExtensions(_id: string): readonly string[] { return []; }
  getRegisteredPackages(): string[] { return []; }
  getExtensionsForPackage(_id: string): Extension[] { return []; }
  getParentBridge(_id: string): ParentMfeBridge | null { return null; }
  setTheme(_v: Record<string, string>): void {}
  dispose(): void {}
}

// ─── Test setup ───────────────────────────────────────────────────────────────

const DOMAIN_ID = 'test-domain';

let registry: FakeRegistry;
let mounter: FakeMounter;

beforeEach(() => {
  registry = new FakeRegistry();
  mounter = new FakeMounter();
  registry.registerMounter(DOMAIN_ID, mounter);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ExtensionDomainSlot', () => {
  it('renders a root div with data-domain-id set to domainId', () => {
    const { container } = render(
      <ExtensionDomainSlot registry={registry} domainId={DOMAIN_ID} />
    );

    const root = container.querySelector(`[data-domain-id="${DOMAIN_ID}"]`);
    expect(root).not.toBeNull();
    expect(root!.tagName).toBe('DIV');
  });

  it('calls mounter.attach with the rendered root div on mount', async () => {
    const { container } = render(
      <ExtensionDomainSlot registry={registry} domainId={DOMAIN_ID} />
    );

    await waitFor(() => expect(mounter.attachCalls).toHaveLength(1));
    const root = container.querySelector(`[data-domain-id="${DOMAIN_ID}"]`);
    expect(mounter.attachCalls[0]).toBe(root);
  });

  it('calls mounter.detach on unmount', async () => {
    const { unmount } = render(
      <ExtensionDomainSlot registry={registry} domainId={DOMAIN_ID} />
    );

    await waitFor(() => expect(mounter.attachCalls).toHaveLength(1));
    expect(mounter.detachCount).toBe(0);

    unmount();

    expect(mounter.detachCount).toBe(1);
  });

  it('loadingComponent is removed after the attach effect fires', async () => {
    // In jsdom with @testing-library/react, useEffect fires synchronously during
    // render via act(). We verify the post-attach state: the loading placeholder
    // must be gone once the effect has run and setAttached(true) has been called.
    const { queryByText } = render(
      <ExtensionDomainSlot
        registry={registry}
        domainId={DOMAIN_ID}
        loadingComponent={<span>Loading...</span>}
      />
    );

    // The effect fires synchronously in act(); mounter.attach should have been
    // called, which sets attached=true and removes the loading placeholder.
    await waitFor(() => expect(mounter.attachCalls).toHaveLength(1));
    expect(queryByText('Loading...')).toBeNull();
  });

  it('calls onAttached with the root element once the effect fires', async () => {
    const onAttached = vi.fn();
    const { container } = render(
      <ExtensionDomainSlot
        registry={registry}
        domainId={DOMAIN_ID}
        onAttached={onAttached}
      />
    );

    await waitFor(() => expect(onAttached).toHaveBeenCalledTimes(1));

    const root = container.querySelector(`[data-domain-id="${DOMAIN_ID}"]`);
    expect(onAttached).toHaveBeenCalledWith(root);
  });

  it('calls onDetached once on unmount', async () => {
    const onDetached = vi.fn();
    const { unmount } = render(
      <ExtensionDomainSlot
        registry={registry}
        domainId={DOMAIN_ID}
        onDetached={onDetached}
      />
    );

    await waitFor(() => expect(mounter.attachCalls).toHaveLength(1));
    unmount();

    expect(onDetached).toHaveBeenCalledTimes(1);
  });

  it('mounter.attach is called with a DIV element matching the data-domain-id root', async () => {
    const { container } = render(
      <ExtensionDomainSlot registry={registry} domainId={DOMAIN_ID} />
    );

    await waitFor(() => expect(mounter.attachCalls).toHaveLength(1));

    const attached = mounter.attachCalls[0];
    expect(attached.tagName).toBe('DIV');
    expect(attached).toBe(container.querySelector(`[data-domain-id="${DOMAIN_ID}"]`));
  });

  it('type-check: ExtensionDomainSlotProps does not include extensionId', () => {
    // Compile-time check: `'extensionId' extends keyof Props` resolves to
    // `never` only if extensionId is absent from the public prop surface.
    // Assigning `true` to that conditional fails type-check if the prop
    // ever returns. This expresses the contract through documented public
    // types rather than @ts-expect-error suppression.
    type ExtensionIdAbsent =
      'extensionId' extends keyof ExtensionDomainSlotProps ? never : true;
    const propAbsent: ExtensionIdAbsent = true;
    expect(propAbsent).toBe(true);
  });
});
