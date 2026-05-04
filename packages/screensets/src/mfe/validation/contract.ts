/**
 * Contract Matching Validation
 *
 * Validates that MFE entries are compatible with extension domains before mounting.
 *
 * @packageDocumentation
 */
// @cpt-algo:cpt-frontx-algo-mfe-registry-contract-matching:p1

import type { MfeEntry } from '../types/mfe-entry';
import type { ExtensionDomain } from '../types/extension-domain';
import {
  HAI3_ACTION_LOAD_EXT,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
} from '../constants';

/**
 * Error types for contract validation failures
 */
export type ContractErrorType =
  | 'missing_property'
  | 'unsupported_action'
  | 'unhandled_domain_action';

/**
 * Contract validation error details
 */
export interface ContractError {
  /** Error type */
  type: ContractErrorType;
  /** Human-readable error details */
  details: string;
}

/**
 * Result of contract validation
 */
export interface ContractValidationResult {
  /** Whether the contract is valid */
  valid: boolean;
  /** Array of validation errors (empty if valid) */
  errors: ContractError[];
}

/**
 * Infrastructure lifecycle actions wired by the registry (load_ext) and the
 * domain implementation's mount strategy (mount_ext, unmount_ext). These actions
 * target domains and are excluded from rule 3 (entry.domainActions ⊆ domain.actions)
 * validation — entry.domainActions should not contain these actions in the first
 * place — and from mediator-level extension contract enforcement.
 */
export const INFRASTRUCTURE_LIFECYCLE_ACTIONS = new Set<string>([
  HAI3_ACTION_LOAD_EXT,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
]);

/**
 * Validate that an MFE entry is compatible with an extension domain.
 *
 * Field semantics:
 * - entry.actions: action types the entry is capable of receiving and executing.
 * - entry.domainActions: action types the parent domain must support for this
 *   entry to be injectable.
 * - domain.actions: action types the domain is capable of receiving and executing.
 * - domain.extensionsActions: action types an extension's entry must support to be
 *   injectable into this domain.
 *
 * Contract matching rules (all must be satisfied):
 * 1. entry.requiredProperties ⊆ domain.sharedProperties
 *    (domain provides all properties required by entry)
 * 2. domain.extensionsActions ⊆ entry.actions
 *    (the domain requires certain action types from entries; the entry must be
 *    capable of receiving all of them)
 * 3. entry.domainActions \ INFRASTRUCTURE_LIFECYCLE_ACTIONS ⊆ domain.actions
 *    (the entry requires certain action types from the domain; the domain must
 *    be capable of receiving all of them)
 *
 * Note: Infrastructure lifecycle actions (load_ext, mount_ext, unmount_ext) are
 * wired by the framework onto domains and should never appear in entry.domainActions.
 * The rule 3 loop defensively skips them if they do appear.
 *
 * @param entry - The MFE entry to validate
 * @param domain - The extension domain to validate against
 * @returns Validation result with errors if invalid
 */
// @cpt-begin:cpt-frontx-algo-mfe-registry-contract-matching:p1:inst-1
export function validateContract(
  entry: MfeEntry,
  domain: ExtensionDomain
): ContractValidationResult {
  const errors: ContractError[] = [];

  // Rule 1: Required properties subset check
  // entry.requiredProperties must be a subset of domain.sharedProperties
  for (const prop of entry.requiredProperties) {
    if (!domain.sharedProperties.includes(prop)) {
      errors.push({
        type: 'missing_property',
        details: `Entry requires property '${prop}' not provided by domain`,
      });
    }
  }

  // Rule 2: Domain-required actions subset check
  // domain.extensionsActions must be a subset of entry.actions
  // (domain requires entries to support these actions; entry must be capable of receiving all of them)
  for (const action of domain.extensionsActions) {
    if (!entry.actions.includes(action)) {
      errors.push({
        type: 'unsupported_action',
        details: `Domain requires action '${action}' but entry does not support it`,
      });
    }
  }

  // Rule 3: Entry-required domain actions subset check (infrastructure actions exempted)
  // entry.domainActions must be a subset of domain.actions
  // (entry requires domain to support these actions; domain must be capable of receiving all of them)
  // Infrastructure lifecycle actions should never appear in entry.domainActions;
  // the exemption is kept as defensive safety.
  for (const action of entry.domainActions) {
    if (INFRASTRUCTURE_LIFECYCLE_ACTIONS.has(action)) {
      continue;
    }

    if (!domain.actions.includes(action)) {
      errors.push({
        type: 'unhandled_domain_action',
        details: `Entry requires domain action '${action}' but domain does not support it`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
// @cpt-end:cpt-frontx-algo-mfe-registry-contract-matching:p1:inst-1

/**
 * Format contract validation errors into a human-readable message.
 *
 * @param result - The contract validation result
 * @returns Formatted error message
 */
export function formatContractErrors(result: ContractValidationResult): string {
  if (result.valid) {
    return 'Contract is valid';
  }

  const lines = ['Contract validation failed:'];

  for (const error of result.errors) {
    lines.push(`  - [${error.type}] ${error.details}`);
  }

  return lines.join('\n');
}
