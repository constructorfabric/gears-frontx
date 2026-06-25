/**
 * Lifecycle Validation
 *
 * Validation utilities for lifecycle hooks and stages.
 * Extracted from @gears-frontx/screensets in Phase 7 (extension-domain governance).
 *
 * @packageDocumentation
 */

import type { ExtensionDomain, Extension } from '../types';

export interface LifecycleValidationResult {
  valid: boolean;
  errors: Array<{
    stage: string;
    message: string;
  }>;
}

export function validateDomainLifecycleHooks(
  domain: ExtensionDomain
): LifecycleValidationResult {
  const errors: Array<{ stage: string; message: string }> = [];

  if (!domain.lifecycle || domain.lifecycle.length === 0) {
    return { valid: true, errors: [] };
  }

  for (const hook of domain.lifecycle) {
    if (!domain.lifecycleStages.includes(hook.stage)) {
      errors.push({
        stage: hook.stage,
        message: `Domain lifecycle hook references unsupported stage '${hook.stage}'. Supported stages: ${domain.lifecycleStages.join(', ')}`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateExtensionLifecycleHooks(
  extension: Extension,
  domain: ExtensionDomain
): LifecycleValidationResult {
  const errors: Array<{ stage: string; message: string }> = [];

  if (!extension.lifecycle || extension.lifecycle.length === 0) {
    return { valid: true, errors: [] };
  }

  for (const hook of extension.lifecycle) {
    if (!domain.extensionsLifecycleStages.includes(hook.stage)) {
      errors.push({
        stage: hook.stage,
        message: `Extension lifecycle hook references unsupported stage '${hook.stage}'. Domain '${domain.id}' supports: ${domain.extensionsLifecycleStages.join(', ')}`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
