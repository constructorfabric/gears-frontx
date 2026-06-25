/**
 * Mount Manager
 *
 * Abstract mount manager interface and callback type definitions.
 * Extracted from @gears-frontx/screensets in Phase 7 (extension-domain governance).
 *
 * @packageDocumentation
 * @internal
 */

import type { ParentMfeBridge } from '../handler/types';

export type ActionChainExecutor = (
  chain: import('../types').ActionsChain,
  options?: import('../mediator/types').ChainExecutionOptions
) => Promise<void>;

export type LifecycleTrigger = (extensionId: string, stageId: string) => Promise<void>;

export abstract class MountManager {
  abstract loadExtension(extensionId: string): Promise<void>;
  abstract preloadExtension(extensionId: string): Promise<void>;
  abstract mountExtension(extensionId: string, container: Element): Promise<ParentMfeBridge>;
  abstract unmountExtension(extensionId: string): Promise<void>;
  abstract setTheme(cssVars: Record<string, string>): void;
}
