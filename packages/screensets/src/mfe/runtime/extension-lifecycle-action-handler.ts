/**
 * Extension Lifecycle Action Handlers
 *
 * Per-action-type ActionHandler subclasses for domain lifecycle operations.
 * Each class encapsulates a single lifecycle action's behavior, capturing
 * its dependencies via constructor.
 *
 * `LoadExtHandler` is registry-provided and pre-populated into every domain's
 * `DomainContext` before `ExtensionDomainImplementationFactory.build(ctx)` is
 * called. Mount and unmount handlers are supplied by domain authors through
 * their factory implementation (typically via one of the shipped strategy classes).
 *
 * @packageDocumentation
 * @internal
 */

import { ActionHandler } from '../mediator/types';
import type { OperationSerializer } from './operation-serializer';
import type { MountManager } from './mount-manager';

/**
 * Typed lifecycle action payload.
 * GTS schema validation guarantees this shape before any handler runs.
 */
export interface LifecycleActionPayload {
  subject: string;
}

/**
 * Narrows an untyped action payload to `LifecycleActionPayload`.
 *
 * GTS validates the payload structure before any handler runs, so by the time
 * `handleAction` is called `subject` is guaranteed to be a string. This guard
 * makes that invariant explicit to TypeScript without a double cast.
 */
function assertLifecyclePayload(
  payload: unknown
): asserts payload is LifecycleActionPayload {
  if (typeof (payload as Record<string, unknown> | undefined)?.['subject'] !== 'string') {
    throw new Error('LifecycleActionPayload: missing or non-string subject field');
  }
}

/**
 * Handles `load_ext` actions: serializes a load operation on the extension queue.
 *
 * Pre-populated into every domain's `DomainContext` by the registry before
 * `factory.build(ctx)` is called. Domain authors do not need to register this
 * handler manually.
 *
 * @internal
 */
export class LoadExtHandler extends ActionHandler {
  constructor(
    private readonly operationSerializer: OperationSerializer,
    private readonly mountManager: MountManager
  ) {
    super();
  }

  /**
   * Handle a `load_ext` action by serializing the load operation on the extension queue.
   *
   * @param _actionTypeId - Action type ID (unused — handler is registered per type)
   * @param payload - Action payload containing the target extension subject
   */
  async handleAction(_actionTypeId: string, payload: Record<string, unknown> | undefined): Promise<void> {
    assertLifecyclePayload(payload);
    const extensionId = payload.subject;
    await this.operationSerializer.serializeOperation(extensionId, () =>
      this.mountManager.loadExtension(extensionId)
    );
  }
}
