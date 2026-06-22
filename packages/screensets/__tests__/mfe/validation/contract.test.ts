/**
 * Contract Validation Tests
 *
 * Tests for contract matching validation between entries and domains.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import type { MfeEntry } from '../../../src/mfe/types/mfe-entry';
import type { ExtensionDomain } from '../../../src/mfe/types/extension-domain';
import { validateContract, formatContractErrors } from '../../../src/mfe/validation/contract';
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';

describe('Contract Matching Validation', () => {
  describe('validateContract', () => {
    it('should validate a valid contract matching scenario', () => {
      const entry: MfeEntry = {
        id: 'gts.acme.mfe.widget.v1~',
        requiredProperties: ['user', 'theme'],
        optionalProperties: ['locale'],
        // Entry can receive the actions the domain requires (plus any extras it opts into)
        actions: ['update_data', 'request_navigation', 'log_event'],
        // Entry requires only a subset of the actions the domain supports
        domainActions: ['load_ext', 'unload_ext'],
      };

      const domain: ExtensionDomain = {
        id: 'gts.frontx.screensets.ext.domain.v1~frontx.layout.sidebar.v1~',
        sharedProperties: ['user', 'theme', 'locale', 'timezone'],
        actions: ['load_ext', 'unload_ext', 'refresh'],
        extensionsActions: ['update_data', 'request_navigation'],
        extensionsTypeId: 'gts.frontx.mfes.ext.extension.v1~acme.test.ext.custom_extension.v1~',
        defaultActionTimeout: 5000,
        lifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
        extensionsLifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
      };

      const result = validateContract(entry, domain);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when entry requires a property not provided by domain', () => {
      const entry: MfeEntry = {
        id: 'gts.acme.mfe.widget.v1~',
        requiredProperties: ['user', 'theme', 'permissions'],
        actions: ['update_data'],
        domainActions: ['load_ext'],
      };

      const domain: ExtensionDomain = {
        id: 'gts.frontx.screensets.ext.domain.v1~frontx.layout.sidebar.v1~',
        sharedProperties: ['user', 'theme'],
        actions: ['load_ext'],
        extensionsActions: ['update_data'],
        defaultActionTimeout: 5000,
        lifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
        extensionsLifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
      };

      const result = validateContract(entry, domain);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('missing_property');
      expect(result.errors[0].details).toContain('permissions');
      expect(result.errors[0].details).toContain('not provided by domain');
    });

    it('should fail when domain requires an action the entry does not support', () => {
      const entry: MfeEntry = {
        id: 'gts.acme.mfe.widget.v1~',
        requiredProperties: ['user'],
        actions: ['update_data'],
        domainActions: ['load_ext'],
      };

      const domain: ExtensionDomain = {
        id: 'gts.frontx.screensets.ext.domain.v1~frontx.layout.sidebar.v1~',
        sharedProperties: ['user'],
        actions: ['load_ext'],
        // Domain requires two action types from entries, but entry only supports one
        extensionsActions: ['update_data', 'delete_data'],
        defaultActionTimeout: 5000,
        lifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
        extensionsLifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
      };

      const result = validateContract(entry, domain);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('unsupported_action');
      expect(result.errors[0].details).toContain('delete_data');
      expect(result.errors[0].details).toContain('entry does not support');
    });

    it('should fail when entry requires a domain action the domain does not support', () => {
      const entry: MfeEntry = {
        id: 'gts.acme.mfe.widget.v1~',
        requiredProperties: ['user'],
        actions: ['update_data'],
        // Entry requires three domain actions; domain only supports one
        domainActions: ['load_ext', 'refresh', 'configure'],
      };

      const domain: ExtensionDomain = {
        id: 'gts.frontx.screensets.ext.domain.v1~frontx.layout.sidebar.v1~',
        sharedProperties: ['user'],
        actions: ['load_ext'],
        extensionsActions: ['update_data'],
        defaultActionTimeout: 5000,
        lifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
        extensionsLifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
      };

      const result = validateContract(entry, domain);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].type).toBe('unhandled_domain_action');
      expect(result.errors[0].details).toContain('refresh');
      expect(result.errors[1].type).toBe('unhandled_domain_action');
      expect(result.errors[1].details).toContain('configure');
    });

    it('should succeed when entry has optional properties not in domain', () => {
      const entry: MfeEntry = {
        id: 'gts.acme.mfe.widget.v1~',
        requiredProperties: ['user'],
        optionalProperties: ['theme', 'locale', 'timezone'],
        actions: ['update_data'],
        domainActions: ['load_ext'],
      };

      const domain: ExtensionDomain = {
        id: 'gts.frontx.screensets.ext.domain.v1~frontx.layout.sidebar.v1~',
        sharedProperties: ['user', 'theme'],
        actions: ['load_ext'],
        extensionsActions: ['update_data'],
        defaultActionTimeout: 5000,
        lifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
        extensionsLifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
      };

      const result = validateContract(entry, domain);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect multiple errors when multiple rules are violated', () => {
      const entry: MfeEntry = {
        id: 'gts.acme.mfe.widget.v1~',
        // Entry requires 'permissions' which domain does not provide (rule 1 violation)
        requiredProperties: ['user', 'permissions'],
        // Entry supports 'update_data' but not 'delete_data' required by domain (rule 2 violation)
        actions: ['update_data'],
        // Entry requires 'refresh' which domain does not support (rule 3 violation)
        domainActions: ['load_ext', 'refresh'],
      };

      const domain: ExtensionDomain = {
        id: 'gts.frontx.screensets.ext.domain.v1~frontx.layout.sidebar.v1~',
        sharedProperties: ['user'],
        actions: ['load_ext'],
        extensionsActions: ['update_data', 'delete_data'],
        defaultActionTimeout: 5000,
        lifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
        extensionsLifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
      };

      const result = validateContract(entry, domain);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);

      const errorTypes = result.errors.map((e) => e.type);
      expect(errorTypes).toContain('missing_property');
      expect(errorTypes).toContain('unsupported_action');
      expect(errorTypes).toContain('unhandled_domain_action');
    });

    it('should handle empty property and action arrays', () => {
      const entry: MfeEntry = {
        id: 'gts.acme.mfe.widget.v1~',
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      const domain: ExtensionDomain = {
        id: 'gts.frontx.screensets.ext.domain.v1~frontx.layout.sidebar.v1~',
        sharedProperties: [],
        actions: [],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
        extensionsLifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
      };

      const result = validateContract(entry, domain);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass validation when domain has infrastructure-only actions and entry has empty domainActions', () => {
      const entry: MfeEntry = {
        id: 'gts.acme.mfe.widget.v1~',
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      const domain: ExtensionDomain = {
        id: 'gts.frontx.screensets.ext.domain.v1~frontx.layout.screen.v1~',
        sharedProperties: [],
        actions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
        extensionsLifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
      };

      const result = validateContract(entry, domain);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when entry requires a custom domain action the domain does not support', () => {
      const entry: MfeEntry = {
        id: 'gts.acme.mfe.widget.v1~',
        requiredProperties: [],
        actions: [],
        // Entry requires 'custom_action_id' from domain, but domain does not support it
        domainActions: ['custom_action_id'],
      };

      const domain: ExtensionDomain = {
        id: 'gts.frontx.screensets.ext.domain.v1~frontx.layout.screen.v1~',
        sharedProperties: [],
        actions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
        extensionsLifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
      };

      const result = validateContract(entry, domain);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('unhandled_domain_action');
      expect(result.errors[0].details).toContain('custom_action_id');
    });

    it('should pass validation when entry requires a custom domain action the domain supports', () => {
      const entry: MfeEntry = {
        id: 'gts.acme.mfe.widget.v1~',
        requiredProperties: [],
        actions: [],
        domainActions: ['custom_action_id'],
      };

      const domain: ExtensionDomain = {
        id: 'gts.frontx.screensets.ext.domain.v1~frontx.layout.screen.v1~',
        sharedProperties: [],
        actions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT, 'custom_action_id'],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
        extensionsLifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
      };

      const result = validateContract(entry, domain);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should defensively exempt infrastructure actions (load_ext, mount_ext, unmount_ext) from rule 3 even if entry.domainActions contains them', () => {
      // entry.domainActions should never contain infrastructure actions (they are
      // framework-wired onto domains, not entry-declared). The exemption in the
      // rule 3 loop keeps validation stable even if they leak in.
      const entry: MfeEntry = {
        id: 'gts.acme.mfe.widget.v1~',
        requiredProperties: [],
        actions: [],
        domainActions: [FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT, FRONTX_ACTION_UNMOUNT_EXT],
      };

      const domain: ExtensionDomain = {
        id: 'gts.frontx.screensets.ext.domain.v1~frontx.layout.screen.v1~',
        sharedProperties: [],
        actions: [],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
        extensionsLifecycleStages: ['init', 'activated', 'deactivated', 'destroyed'],
      };

      const result = validateContract(entry, domain);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('formatContractErrors', () => {
    it('should format valid contract result', () => {
      const result = {
        valid: true,
        errors: [],
      };

      const message = formatContractErrors(result);

      expect(message).toBe('Contract is valid');
    });

    it('should format single error', () => {
      const result = {
        valid: false,
        errors: [
          {
            type: 'missing_property' as const,
            details: "Entry requires property 'permissions' not provided by domain",
          },
        ],
      };

      const message = formatContractErrors(result);

      expect(message).toContain('Contract validation failed');
      expect(message).toContain('[missing_property]');
      expect(message).toContain('permissions');
    });

    it('should format multiple errors', () => {
      const result = {
        valid: false,
        errors: [
          {
            type: 'missing_property' as const,
            details: "Entry requires property 'permissions' not provided by domain",
          },
          {
            type: 'unsupported_action' as const,
            details: "Domain requires action 'delete_data' but entry does not support it",
          },
          {
            type: 'unhandled_domain_action' as const,
            details: "Entry requires domain action 'refresh' but domain does not support it",
          },
        ],
      };

      const message = formatContractErrors(result);

      expect(message).toContain('Contract validation failed');
      expect(message).toContain('[missing_property]');
      expect(message).toContain('permissions');
      expect(message).toContain('[unsupported_action]');
      expect(message).toContain('delete_data');
      expect(message).toContain('[unhandled_domain_action]');
      expect(message).toContain('refresh');
    });
  });
});
