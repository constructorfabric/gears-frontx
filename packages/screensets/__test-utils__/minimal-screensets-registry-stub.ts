import { vi } from 'vitest';
import { MfeRegistry } from '@gears-frontx/mfes';
import type {
  Extension,
  ExtensionDomain,
  ActionsChain,
} from '../src/mfe/types';
import type { ParentMfeBridge } from '../src/mfe/handler/types';
import type { ExtensionDomainImplementationFactory } from '../src/mfe/runtime/ExtensionDomainImplementationFactory';
import type { ExtensionMounter } from '../src/mfe/runtime/ExtensionMounter';
import { createMockTypeSystemPlugin } from './mock-type-system-plugin';

// @cpt-dod:cpt-frontx-dod-mfe-registry-handler-injection:p1

export function createMinimalMfeRegistryStub(): MfeRegistry {
  return new MinimalMfeRegistryStub();
}

class MinimalMfeRegistryStub extends MfeRegistry {
  readonly typeSystem = createMockTypeSystemPlugin();

  registerDomain = vi.fn(
    (_declaration: ExtensionDomain, _factory: ExtensionDomainImplementationFactory) => undefined
  );
  unregisterDomain = vi.fn(async (_domainId: string) => undefined);
  registerExtension = vi.fn(async (_extension: Extension) => undefined);
  unregisterExtension = vi.fn(async (_extensionId: string) => undefined);
  updateSharedProperty = vi.fn((_propertyId: string, _value: unknown) => undefined);
  getDomainProperty = vi.fn((_domainId: string, _propertyTypeId: string) => undefined);
  executeActionsChain = vi.fn(async (_chain: ActionsChain) => undefined);
  getExtension = vi.fn((_extensionId: string) => undefined);
  getDomain = vi.fn((_domainId: string) => undefined);
  getExtensionsForDomain = vi.fn((_domainId: string) => [] as Extension[]);
  getMountedExtensions = vi.fn((_domainId: string) => [] as readonly string[]);
  getMounter = vi.fn((_domainId: string): ExtensionMounter => {
    throw new Error(`MinimalMfeRegistryStub: no mounter for domain ${_domainId}`);
  });
  getRegisteredPackages = vi.fn(() => [] as string[]);
  getExtensionsForPackage = vi.fn((_packageId: string) => [] as Extension[]);
  getParentBridge = vi.fn((_extensionId: string) => null as ParentMfeBridge | null);
  setTheme = vi.fn((_cssVars: Record<string, string>) => undefined);
  dispose = vi.fn(() => undefined);
}
