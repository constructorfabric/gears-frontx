import type { ExtensionMounter } from '../../ExtensionMounter';
import { MfeRegistry } from '../../../registry/MfeRegistry';
import type { TypeSystemPlugin } from '../../../type-substrate';
import type { ExtensionDomain, Extension, ActionsChain } from '../../../types';
import type { ExtensionDomainImplementationFactory } from '../../ExtensionDomainImplementationFactory';
import type { ParentMfeBridge } from '../../../handler/ParentMfeBridge';

// Minimal MfeRegistry stub for strategy tests — only getMountedExtensions matters here.
export class FakeRegistry extends MfeRegistry {
  readonly typeSystem: TypeSystemPlugin = { name: 'fake', version: '0', register: () => {}, registerSchema: () => {}, getSchema: () => undefined, isTypeOf: () => false, validateInstance: () => ({ valid: true, errors: [] }), resolveLoadExtActionId: () => 'load_ext', resolveMountExtActionId: () => 'mount_ext', resolveUnmountExtActionId: () => 'unmount_ext', resolveLifecycleStageInitId: () => 'init', resolveLifecycleStageActivatedId: () => 'activated', resolveLifecycleStageDeactivatedId: () => 'deactivated', resolveLifecycleStageDestroyedId: () => 'destroyed' };
  private readonly mountedByDomain = new Map<string, string[]>();

  setMounted(domainId: string, ids: string[]): void {
    this.mountedByDomain.set(domainId, ids);
  }

  getMountedExtensions(domainId: string): readonly string[] {
    return this.mountedByDomain.get(domainId) ?? [];
  }

  registerDomain(_d: ExtensionDomain, _f: ExtensionDomainImplementationFactory): void {}
  async unregisterDomain(_id: string): Promise<void> {}
  async registerExtension(_e: Extension): Promise<void> {}
  async unregisterExtension(_id: string): Promise<void> {}
  updateSharedProperty(_p: string, _v: unknown): void {}
  getDomainProperty(_d: string, _p: string): unknown { return undefined; }
  executeActionsChain(_c: ActionsChain): void {}
  getExtension(_id: string): Extension | undefined { return undefined; }
  getDomain(_id: string): ExtensionDomain | undefined { return undefined; }
  getExtensionsForDomain(_id: string): Extension[] { return []; }
  getMounter(_id: string): ExtensionMounter { throw new Error('not implemented'); }
  getRegisteredPackages(): string[] { return []; }
  getExtensionsForPackage(_id: string): Extension[] { return []; }
  getParentBridge(_id: string): ParentMfeBridge | null { return null; }
  setTheme(_v: Record<string, string>): void {}
  dispose(): void {}
}
