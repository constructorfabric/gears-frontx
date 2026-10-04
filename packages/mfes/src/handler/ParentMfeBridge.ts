/**
 * Parent MFE Bridge abstract class.
 * Used by the parent runtime to manage child MFE instances.
 */
export abstract class ParentMfeBridge {
  /**
   * The GTS id of the extension this bridge belongs to; stable across every
   * mount of that extension.
   */
  abstract readonly instanceId: string;

  /**
   * Dispose the bridge and clean up resources. Permanent teardown, performed
   * only when the extension this bridge belongs to is unregistered — not on
   * an ordinary unmount.
   */
  abstract dispose(): void;
}
