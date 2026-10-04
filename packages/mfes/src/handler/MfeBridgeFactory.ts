import type { ChildMfeBridge } from './ChildMfeBridge';

/**
 * Abstract factory for creating bridge instances.
 * Different handlers can provide different bridge implementations.
 */
export abstract class MfeBridgeFactory<TBridge extends ChildMfeBridge = ChildMfeBridge> {
  /**
   * Create a bridge instance for an MFE.
   *
   * @param domainId - ID of the domain the MFE is mounted in
   * @param entryTypeId - Type ID of the MFE entry
   * @param instanceId - The extension's own GTS identifier (per
   *   `ChildMfeBridgeImpl`'s `(extDomainId, extensionId)` constructor), not a
   *   separately-minted instance id
   * @returns Bridge instance
   */
  abstract create(
    domainId: string,
    entryTypeId: string,
    instanceId: string
  ): TBridge;

  /**
   * Dispose a bridge and clean up resources.
   *
   * @param bridge - Bridge instance to dispose
   */
  abstract dispose(bridge: TBridge): void;
}
