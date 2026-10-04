import type { ExtensionMounter } from './ExtensionMounter';
import type { DomainLifecycleTrigger } from './DomainLifecycleTrigger';
import type { ActionHandler } from '../mediator/ActionHandler';
import type { TypeSystemPlugin } from '../type-substrate';
import type { DomainContext } from './DomainContext';

/**
 * Concrete invalidatable implementation of `DomainContext`.
 *
 * Used by `DefaultMfeRegistry` to enforce function-handle-level
 * invalidation after `factory.build` completes. The `valid` flag is
 * consulted on every accessor and method call; once `invalidate()` is
 * called, all access throws.
 *
 * The collected handlers are retrieved via `getCollectedHandlers()` and
 * cleared atomically on rollback via `clearCollectedHandlers()`.
 *
 * @internal
 */
export class InvalidatableDomainContext implements DomainContext {
  private valid: boolean = true;
  private readonly collectedHandlers = new Map<string, ActionHandler>();
  // Action types prepopulated by the registry (e.g., LoadExtHandler) — excluded
  // from cross-validation's "no extra handlers" check since the spec restricts
  // that check to handlers registered via `ctx.registerHandler`.
  private readonly prepopulatedActionTypes = new Set<string>();

  constructor(
    private readonly _mounter: ExtensionMounter,
    private readonly _lifecycleTrigger: DomainLifecycleTrigger,
    public readonly typeSystem: TypeSystemPlugin
  ) {}

  get mounter(): ExtensionMounter {
    if (!this.valid) {
      throw new Error('DomainContext invalidated after registration');
    }
    return this._mounter;
  }

  get lifecycleTrigger(): DomainLifecycleTrigger {
    if (!this.valid) {
      throw new Error('DomainContext invalidated after registration');
    }
    return this._lifecycleTrigger;
  }

  registerHandler(actionType: string, handler: ActionHandler): void {
    if (!this.valid) {
      throw new Error('DomainContext.registerHandler called after registration');
    }
    this.collectedHandlers.set(actionType, handler);
  }

  /**
   * Pre-populate a handler in the collector without requiring context validity.
   * Used by the registry to inject the standard `LoadExtHandler` before
   * calling `factory.build(ctx)`. Prepopulated handlers are tracked separately
   * so cross-validation can exclude them from the "no extra handlers" check.
   */
  prepopulateHandler(actionType: string, handler: ActionHandler): void {
    this.collectedHandlers.set(actionType, handler);
    this.prepopulatedActionTypes.add(actionType);
  }

  /**
   * Return the set of action types that were prepopulated by the registry
   * (vs. registered by the domain factory via `registerHandler`).
   */
  getPrepopulatedActionTypes(): ReadonlySet<string> {
    return this.prepopulatedActionTypes;
  }

  /**
   * Mark the context as invalid. All subsequent accessor and method calls throw.
   * Called by the registry in the `finally` block after `factory.build`.
   */
  invalidate(): void {
    this.valid = false;
  }

  /**
   * Return the handlers collected during `factory.build(ctx)`.
   * Called by the registry to persist them to the mediator.
   */
  getCollectedHandlers(): Map<string, ActionHandler> {
    return this.collectedHandlers;
  }

  /**
   * Clear all collected handlers. Called on atomic rollback when
   * `factory.build` throws or cross-validation fails.
   */
  clearCollectedHandlers(): void {
    this.collectedHandlers.clear();
    this.prepopulatedActionTypes.clear();
  }
}
