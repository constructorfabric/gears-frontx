import type { DefaultMfeRegistry } from '../../DefaultMfeRegistry';

interface ExtensionStateView {
  readonly loadState: string;
  readonly mountState: string;
}

interface ManagerReads {
  getExtensionState(extensionId: string): ExtensionStateView | undefined;
}

/**
 * Test-only observation of an extension's load and mount state, read from
 * the runtime's internal extension manager (a private field). The
 * registry's developer-facing surface offers no such read.
 */
export function extensionStateOf(
  registry: DefaultMfeRegistry,
  extensionId: string,
): ExtensionStateView | undefined {
  const manager: ManagerReads = Reflect.get(registry, 'extensionManager');
  return manager.getExtensionState(extensionId);
}
