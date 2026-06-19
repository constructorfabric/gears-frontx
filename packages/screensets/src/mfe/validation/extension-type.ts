/**
 * Domain-Specific Extension Validation via Derived Types
 *
 * Validates that an Extension's type conforms to its domain's extensionsTypeId requirement.
 * This enables domain-specific fields without separate uiMeta entities or custom Ajv validation.
 *
 * Implementation follows Decision 9 in design/type-system.md:
 * - Domain has optional extensionsTypeId field (reference to derived Extension type)
 * - Extension must use a type that derives from domain.extensionsTypeId
 * - Validate using GTS-native approach: plugin.register() then plugin.validateInstance()
 * - Type hierarchy check uses plugin.isTypeOf()
 *
 * GTS-Native Validation Flow:
 * 1. Register the extension instance: plugin.register(extension)
 * 2. Validate by instance ID: plugin.validateInstance(extension.id)
 * 3. Check type hierarchy: plugin.isTypeOf(extension.id, domain.extensionsTypeId)
 *
 * @packageDocumentation
 */
// @cpt-algo:cpt-hai3-algo-screenset-registry-extension-type-validation:p1

import type { TypeSystemPlugin, ValidationResult } from '../plugins/types';
import type { Extension } from '../types/extension';
import type { ExtensionDomain } from '../types/extension-domain';

/**
 * Validate an Extension's type against its domain's extensionsTypeId requirement.
 *
 * This function uses the GTS-native validation approach:
 * 1. Register the extension instance with the plugin (required before validation)
 * 2. Validate the registered instance by its instance ID
 * 3. Check type hierarchy if domain specifies extensionsTypeId
 *
 * Implementation follows Decision 9 type hierarchy validation pattern:
 * - If domain doesn't specify extensionsTypeId, skip type hierarchy check
 * - Check that extension.id derives from domain.extensionsTypeId using plugin.isTypeOf()
 * - Return error if type hierarchy check fails
 *
 * Note: This function performs complete validation including:
 * - All extension fields (base + domain-specific) via gts-ts
 * - Type hierarchy verification if domain requires it
 *
 * @param plugin - Type System plugin instance
 * @param domain - Extension domain (contains optional extensionsTypeId)
 * @param extension - Extension to validate
 * @returns Validation result with errors if validation fails
 */
// @cpt-begin:cpt-hai3-algo-screenset-registry-extension-type-validation:p1:inst-1
export function validateExtensionType(
  plugin: TypeSystemPlugin,
  domain: ExtensionDomain,
  extension: Extension
): ValidationResult {
  try {
    // 1. Register the extension instance (required for GTS-native validation)
    plugin.register(extension);

    // 2. Validate the registered instance by its instance ID
    // gts-ts extracts the schema ID from the instance ID automatically:
    // - Instance ID: gts.frontx.mfes.ext.extension.v1~acme.widget.v1
    // - Schema ID:   gts.frontx.mfes.ext.extension.v1~ (extracted automatically)
    const validationResult = plugin.validateInstance(extension.id);
    if (!validationResult.valid) {
      return validationResult;
    }

    // 3. If domain doesn't specify extensionsTypeId, skip type hierarchy check
    if (!domain.extensionsTypeId) {
      return { valid: true, errors: [] };
    }

    // 4. Validate type hierarchy using plugin.isTypeOf()
    if (!plugin.isTypeOf(extension.id, domain.extensionsTypeId)) {
      return {
        valid: false,
        errors: [
          {
            path: 'id',
            message: `Extension type '${extension.id}' must derive from '${domain.extensionsTypeId}'`,
            keyword: 'x-gts-ref',
          },
        ],
      };
    }

    // 5. All validation passed
    return { valid: true, errors: [] };
  } catch (error) {
    // 6. Handle case where derived Extension type is not registered
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if it's a "type not found" or "schema not found" error
    if (errorMessage.includes('not found') || errorMessage.includes('not registered')) {
      return {
        valid: false,
        errors: [
          {
            path: 'id',
            message: `Type '${domain.extensionsTypeId}' may not be registered. Ensure the derived Extension type schema is registered with the plugin.`,
            keyword: 'type-not-found',
          },
        ],
      };
    }

    return {
      valid: false,
      errors: [
        {
          path: 'id',
          message: `Extension type validation error: ${errorMessage}`,
          keyword: 'validation-error',
        },
      ],
    };
  }
}
// @cpt-end:cpt-hai3-algo-screenset-registry-extension-type-validation:p1:inst-1
