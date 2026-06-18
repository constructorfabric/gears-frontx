/**
 * Contract Matching Validation
 *
 * Validates that MFE entries are compatible with extension domains before mounting.
 *
 * @packageDocumentation
 */
// @cpt-algo:cpt-hai3-algo-screenset-registry-contract-matching:p1

import type { MfeEntry } from '../types/mfe-entry';
import type { ExtensionDomain } from '../types/extension-domain';
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
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
 * Infrastructure lifecycle actions handled by ExtensionLifecycleActionHandler.
 * These actions are NOT handled by MFE application code and should be excluded
 * from rule 3 (domain.actions ⊆ entry.domainActions) validation.
 */
const INFRASTRUCTURE_LIFECYCLE_ACTIONS = new Set<string>([
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
]);

/**
 * Validate that an MFE entry is compatible with an extension domain.
 *
 * Contract matching rules (all must be satisfied):
 * 1. entry.requiredProperties ⊆ domain.sharedProperties
 *    (domain provides all properties required by entry)
 * 2. entry.actions ⊆ domain.extensionsActions
 *    (domain accepts all action types the MFE may send to it)
 * 3. domain.actions \ INFRASTRUCTURE_LIFECYCLE_ACTIONS ⊆ entry.domainActions
 *    (MFE can handle all non-infrastructure action types that may target it)
 *
 * Note: Infrastructure lifecycle actions (load_ext, mount_ext, unmount_ext) are
 * handled by ExtensionLifecycleActionHandler, NOT by MFE application code, and
 * are therefore excluded from rule 3 validation.
 *
 * @param entry - The MFE entry to validate
 * @param domain - The extension domain to validate against
 * @returns Validation result with errors if invalid
 */
// @cpt-begin:cpt-hai3-algo-screenset-registry-contract-matching:p1:inst-1
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

  // Rule 2: Entry actions subset check
  // entry.actions must be a subset of domain.extensionsActions
  for (const action of entry.actions) {
    if (!domain.extensionsActions.includes(action)) {
      errors.push({
        type: 'unsupported_action',
        details: `MFE may send action '${action}' not accepted by domain`,
      });
    }
  }

  // Rule 3: Domain actions subset check (excluding infrastructure actions)
  // domain.actions \ INFRASTRUCTURE_LIFECYCLE_ACTIONS must be a subset of entry.domainActions
  for (const action of domain.actions) {
    // Skip infrastructure lifecycle actions - they're handled by the framework
    if (INFRASTRUCTURE_LIFECYCLE_ACTIONS.has(action)) {
      continue;
    }

    if (!entry.domainActions.includes(action)) {
      errors.push({
        type: 'unhandled_domain_action',
        details: `Action '${action}' may target MFE but MFE doesn't handle it`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
// @cpt-end:cpt-hai3-algo-screenset-registry-contract-matching:p1:inst-1

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
