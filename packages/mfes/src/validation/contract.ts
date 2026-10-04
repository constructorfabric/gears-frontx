/**
 * Contract Matching Validation
 *
 * Validates that MFE entries are compatible with extension domains before mounting.
 *
 * @packageDocumentation
 */
// @cpt-algo:cpt-frontx-algo-extension-domain-governance-contract-matching:p1
// @cpt-dod:cpt-frontx-dod-extension-domain-governance-contract-enforcement:p1
// @cpt-dod:cpt-frontx-dod-extension-domain-governance-default-deny:p1

import type { MfeEntry } from '../types';
import type { ExtensionDomain } from '../types';
import { isInfrastructureLifecycleAction, type TypeSystemPlugin } from '../type-substrate';

export type ContractErrorType =
  | 'missing_property'
  | 'unsupported_action'
  | 'unhandled_domain_action';

export interface ContractError {
  type: ContractErrorType;
  details: string;
}

export interface ContractValidationResult {
  valid: boolean;
  errors: ContractError[];
}

/**
 * Validate that an MFE entry is compatible with an extension domain.
 *
 * Rules:
 * 1. entry.requiredProperties ⊆ domain.sharedProperties
 * 2. domain.extensionsActions ⊆ entry.actions
 * 3. entry.domainActions \ {infrastructure lifecycle actions} ⊆ domain.actions
 *
 * @param typeSystem - Injected plugin used to resolve rule 3's
 * infrastructure-action exemption (load_ext/mount_ext/unmount_ext) — never a
 * literal comparison.
 */
export function validateContract(
  entry: MfeEntry,
  domain: ExtensionDomain,
  typeSystem: TypeSystemPlugin
): ContractValidationResult {
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-init
  const errors: ContractError[] = [];
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-init

  // Rule 1: Required properties subset check
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule1-loop
  for (const prop of entry.requiredProperties) {
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule1-check
    if (!domain.sharedProperties.includes(prop)) {
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule1-check
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule1-error
      errors.push({
        type: 'missing_property',
        details: `Entry requires property '${prop}' not provided by domain`,
      });
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule1-error
    }
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule1-loop

  // Rule 2: Domain-required actions subset check
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule2-loop
  for (const action of domain.extensionsActions) {
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule2-check
    if (!entry.actions.includes(action)) {
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule2-check
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule2-error
      errors.push({
        type: 'unsupported_action',
        details: `Domain requires action '${action}' but entry does not support it`,
      });
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule2-error
    }
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule2-loop

  // Rule 3: Entry-required domain actions subset check (infrastructure actions exempted)
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule3-loop
  for (const action of entry.domainActions) {
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule3-exempt
    if (isInfrastructureLifecycleAction(action, typeSystem)) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule3-skip
      continue;
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule3-skip
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule3-exempt

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule3-check
    if (!domain.actions.includes(action)) {
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule3-check
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule3-error
      errors.push({
        type: 'unhandled_domain_action',
        details: `Entry requires domain action '${action}' but domain does not support it`,
      });
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule3-error
    }
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-rule3-loop

  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-invalid-check
  if (errors.length > 0) {
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-invalid-check
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-invalid-return
    return { valid: false, errors };
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-invalid-return
  }

  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-valid-return
  return { valid: true, errors: [] };
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-contract-matching:p1:inst-cm-valid-return
}

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
