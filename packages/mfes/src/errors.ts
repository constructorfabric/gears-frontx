/**
 * MFE Error Class Hierarchy
 *
 * Error classes for MFE system failures.
 * Extracted from the legacy screensets package in Phase 7 (extension-domain governance).
 *
 * @packageDocumentation
 */

import type { Action, ActionsChain } from './types';

export interface ContractError {
  type: 'missing_property' | 'unsupported_action' | 'unhandled_domain_action';
  details: string;
}

export class MfeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MfeError';
  }
}

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

/**
 * Refusal classes the runtime-owned chain envelope validator can raise.
 * Each names the exact rule the chain (or one of its nodes) violated;
 * see ADR `cpt-frontx-adr-action-dispatch-and-chaining` for the rationale
 * behind treating each of these as a synchronous refusal rather than a
 * chain (node) failure.
 */
export type ActionsChainRefusalClass =
  | 'malformed_action'
  | 'malformed_continuation'
  | 'cyclic_chain'
  | 'invalid_action_timeout'
  | 'disposed_registry';

/**
 * Thrown by the runtime-owned chain envelope validator (never by the
 * injected type-system provider, which admits individual actions and never
 * the chain envelope itself) when a chain is structurally malformed or
 * declares an invalid per-action timeout. Per ADR
 * `cpt-frontx-adr-action-dispatch-and-chaining`, this is a refusal — no
 * valid execution was accepted — distinct from a chain (node) failure.
 *
 * `nodePath` names the offending node as the sequence of `next`/`fallback`
 * edges taken from the dispatched root (`[]` denotes the root itself).
 */
export class ActionsChainRefusalError extends MfeError {
  constructor(
    public readonly refusalClass: ActionsChainRefusalClass,
    public readonly nodePath: ReadonlyArray<'next' | 'fallback'>,
    message: string
  ) {
    super(message, 'ACTIONS_CHAIN_REFUSAL');
    this.name = 'ActionsChainRefusalError';
  }
}

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
