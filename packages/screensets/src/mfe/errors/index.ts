/**
 * MFE Error Class Hierarchy
 *
 * Error classes for MFE system failures.
 *
 * @packageDocumentation
 */

import type { Action, ActionsChain } from '../types';

/**
 * Contract validation error details
 */
export interface ContractError {
  /** Error type */
  type: 'missing_property' | 'unsupported_action' | 'unhandled_domain_action';
  /** Human-readable error details */
  details: string;
}

/**
 * Base error class for all MFE errors
 */
export class MfeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MfeError';
  }
}

/**
 * Error thrown when domain registration fails GTS schema validation
 */
export class DomainValidationError extends MfeError {
  constructor(
    public readonly domainId: string,
    public readonly cause?: Error
  ) {
    const detail = cause?.message ?? 'validation failed';
    super(`Domain validation failed for '${domainId}': ${detail}`, 'DOMAIN_VALIDATION_ERROR');
    this.name = 'DomainValidationError';
  }
}

/**
 * Error thrown when MFE bundle fails to load
 */
export class MfeLoadError extends MfeError {
  constructor(
    message: string,
    public readonly entryTypeId: string,
    public readonly cause?: Error
  ) {
    super(`Failed to load MFE '${entryTypeId}': ${message}`, 'MFE_LOAD_ERROR');
    this.name = 'MfeLoadError';
  }
}

/**
 * Error thrown when extension type hierarchy validation fails
 */
export class ExtensionTypeError extends MfeError {
  constructor(
    public readonly extensionTypeId: string,
    public readonly requiredBaseTypeId: string
  ) {
    super(
      `Extension type '${extensionTypeId}' does not derive from required base type '${requiredBaseTypeId}'`,
      'EXTENSION_TYPE_ERROR'
    );
    this.name = 'ExtensionTypeError';
  }
}

/**
 * Error thrown when actions chain execution fails
 */
export class ChainExecutionError extends MfeError {
  constructor(
    message: string,
    public readonly chain: ActionsChain,
    public readonly failedAction: Action,
    public readonly executedPath: string[],
    public readonly cause?: Error
  ) {
    super(
      `Actions chain execution failed at '${failedAction.type}': ${message}`,
      'CHAIN_EXECUTION_ERROR'
    );
    this.name = 'ChainExecutionError';
  }
}

/**
 * Error thrown when type conformance check fails
 */
export class MfeTypeConformanceError extends MfeError {
  constructor(
    public readonly typeId: string,
    public readonly expectedBaseType: string
  ) {
    super(
      `Type '${typeId}' does not conform to base type '${expectedBaseType}'`,
      'MFE_TYPE_CONFORMANCE_ERROR'
    );
    this.name = 'MfeTypeConformanceError';
  }
}

/**
 * Error thrown when an action is not supported by the target domain
 */
export class UnsupportedDomainActionError extends MfeError {
  constructor(
    message: string,
    public readonly actionTypeId: string,
    public readonly domainTypeId: string
  ) {
    super(message, 'UNSUPPORTED_DOMAIN_ACTION');
    this.name = 'UnsupportedDomainActionError';
  }
}

/**
 * Error thrown when a lifecycle hook references a stage not supported by the domain
 */
export class UnsupportedLifecycleStageError extends MfeError {
  constructor(
    message: string,
    public readonly stageId: string,
    public readonly entityId: string,
    public readonly supportedStages: string[]
  ) {
    super(message, 'UNSUPPORTED_LIFECYCLE_STAGE');
    this.name = 'UnsupportedLifecycleStageError';
  }
}

// Re-exported from @gears-frontx/mfes (Phase 6 extraction)
export { NoActionsChainHandlerError } from '@gears-frontx/mfes';

/**
 * Error thrown when an extension's entry type is not handled by any registered handler
 */
export class EntryTypeNotHandledError extends MfeError {
  constructor(
    public readonly entryTypeId: string,
    public readonly registeredHandlerBaseTypeIds: string[]
  ) {
    const handlerList = registeredHandlerBaseTypeIds.length > 0
      ? registeredHandlerBaseTypeIds.join(', ')
      : '(none)';
    super(
      `No registered handler can handle entry type '${entryTypeId}'. ` +
      `Registered handler base type IDs: ${handlerList}`,
      'ENTRY_TYPE_NOT_HANDLED'
    );
    this.name = 'EntryTypeNotHandledError';
  }
}

// Re-exported from @gears-frontx/mfes (Phase 6 extraction)
export { BridgeDisposedError } from '@gears-frontx/mfes';
