/**
 * Mount Manager
 *
 * Abstract mount manager interface and callback type definitions.
 * Extracted from the legacy screensets package in Phase 7 (extension-domain governance).
 *
 * @packageDocumentation
 * @internal
 */

import type { ParentMfeBridge } from '../handler/types';

/**
 * The public, acceptance-only chain dispatcher — the registry's own
 * `executeActionsChain`, void and synchronously-refusing. Wired to the
 * child bridge's public capability, never to internal transport
 * (`cpt-frontx-adr-mfe-runtime-public-surface`).
 */
export type ActionsChainDispatcher = (chain: import('../types').ActionsChain) => void;

/**
 * Non-blocking lifecycle-stage trigger: dispatches every hook bound to the
 * stage through the acceptance-only mediator surface and returns once
 * dispatch (or its synchronous refusal) has been handled for each — never
 * awaiting any dispatched chain's own settlement
 * (`cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering`).
 */
export type LifecycleTrigger = (extensionId: string, stageId: string) => void;

export abstract class MountManager {
  abstract loadExtension(extensionId: string): Promise<void>;
  abstract preloadExtension(extensionId: string): Promise<void>;
  abstract mountExtension(extensionId: string, container: Element): Promise<ParentMfeBridge>;
  abstract unmountExtension(extensionId: string): Promise<void>;
  /**
   * Permanently release an extension's retained bridge pair and inbound
   * link, on its permanent unregistration. Distinct from `unmountExtension`,
   * which deactivates the bridge but keeps it (and its routing) in place.
   */
  abstract releaseExtension(extensionId: string): void;
  abstract setTheme(cssVars: Record<string, string>): void;
}
