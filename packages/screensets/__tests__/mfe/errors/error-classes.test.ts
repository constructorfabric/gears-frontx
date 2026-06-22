/**
 * Error Classes Tests
 *
 * Tests for all 11 MFE error classes covering instantiation,
 * properties, and message formatting.
 *
 * Complements error-handling.test.ts which covers error handling integration.
 */

import { describe, it, expect } from 'vitest';
import {
  MfeError,
  MfeLoadError,
  ExtensionTypeError,
  ChainExecutionError,
  MfeTypeConformanceError,
  UnsupportedDomainActionError,
  UnsupportedLifecycleStageError,
} from '../../../src/mfe/errors';
import type { Action, ActionsChain } from '../../../src/mfe/types';

describe('MFE Error Classes', () => {
  describe('16.3.3 Error class instantiation and properties', () => {
    describe('MfeError (base class)', () => {
      it('should instantiate with message and code', () => {
        const error = new MfeError('Test error', 'TEST_ERROR');

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('MfeError');
        expect(error.message).toBe('Test error');
        expect(error.code).toBe('TEST_ERROR');
      });
    });

    describe('MfeLoadError', () => {
      it('should instantiate with entryTypeId', () => {
        const error = new MfeLoadError(
          'Network timeout',
          'gts.frontx.mfes.mfe.entry.v1~test.entry.v1'
        );

        expect(error).toBeInstanceOf(MfeError);
        expect(error.name).toBe('MfeLoadError');
        expect(error.code).toBe('MFE_LOAD_ERROR');
        expect(error.entryTypeId).toBe('gts.frontx.mfes.mfe.entry.v1~test.entry.v1');
        expect(error.message).toContain('Network timeout');
        expect(error.cause).toBeUndefined();
      });

      it('should instantiate with cause', () => {
        const cause = new Error('Connection refused');
        const error = new MfeLoadError(
          'Load failed',
          'entry-id',
          cause
        );

        expect(error.cause).toBe(cause);
      });
    });

    describe('ExtensionTypeError', () => {
      it('should instantiate with extension and base type IDs', () => {
        const error = new ExtensionTypeError(
          'gts.frontx.mfes.ext.extension.v1~test.extension.v1',
          'gts.frontx.mfes.ext.extension.v1~test.base.v1'
        );

        expect(error).toBeInstanceOf(MfeError);
        expect(error.name).toBe('ExtensionTypeError');
        expect(error.code).toBe('EXTENSION_TYPE_ERROR');
        expect(error.extensionTypeId).toBe('gts.frontx.mfes.ext.extension.v1~test.extension.v1');
        expect(error.requiredBaseTypeId).toBe('gts.frontx.mfes.ext.extension.v1~test.base.v1');
        expect(error.message).toContain('does not derive from');
      });
    });

    describe('ChainExecutionError', () => {
      it('should instantiate with chain execution context', () => {
        const failedAction: Action = {
          type: 'gts.frontx.mfes.comm.action.v1~test.action.v1',
          target: 'test-domain',
        };

        const chain: ActionsChain = {
          action: failedAction,
        };

        const error = new ChainExecutionError(
          'Handler threw exception',
          chain,
          failedAction,
          ['action1', 'action2'],
          new Error('Handler error')
        );

        expect(error).toBeInstanceOf(MfeError);
        expect(error.name).toBe('ChainExecutionError');
        expect(error.code).toBe('CHAIN_EXECUTION_ERROR');
        expect(error.chain).toBe(chain);
        expect(error.failedAction).toBe(failedAction);
        expect(error.executedPath).toEqual(['action1', 'action2']);
        expect(error.cause).toBeDefined();
        expect(error.message).toContain('Handler threw exception');
      });
    });

    describe('MfeTypeConformanceError', () => {
      it('should instantiate with type conformance details', () => {
        const error = new MfeTypeConformanceError(
          'gts.frontx.mfes.ext.extension.v1~test.extension.v1',
          'gts.frontx.mfes.ext.extension.v1~'
        );

        expect(error).toBeInstanceOf(MfeError);
        expect(error.name).toBe('MfeTypeConformanceError');
        expect(error.code).toBe('MFE_TYPE_CONFORMANCE_ERROR');
        expect(error.typeId).toBe('gts.frontx.mfes.ext.extension.v1~test.extension.v1');
        expect(error.expectedBaseType).toBe('gts.frontx.mfes.ext.extension.v1~');
        expect(error.message).toContain('does not conform to');
      });
    });

    describe('UnsupportedDomainActionError', () => {
      it('should instantiate with action and domain type IDs', () => {
        const error = new UnsupportedDomainActionError(
          'Action not supported by domain',
          'gts.frontx.mfes.comm.action.v1~test.action.v1',
          'gts.frontx.mfes.ext.domain.v1~test.domain.v1'
        );

        expect(error).toBeInstanceOf(MfeError);
        expect(error.name).toBe('UnsupportedDomainActionError');
        expect(error.code).toBe('UNSUPPORTED_DOMAIN_ACTION');
        expect(error.actionTypeId).toBe('gts.frontx.mfes.comm.action.v1~test.action.v1');
        expect(error.domainTypeId).toBe('gts.frontx.mfes.ext.domain.v1~test.domain.v1');
        expect(error.message).toBe('Action not supported by domain');
      });
    });

    describe('UnsupportedLifecycleStageError', () => {
      it('should instantiate with lifecycle stage details', () => {
        const supportedStages = [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
        ];

        const error = new UnsupportedLifecycleStageError(
          'Lifecycle stage not supported',
          'gts.frontx.mfes.lifecycle.stage.v1~test.custom_stage.v1',
          'entity-id',
          supportedStages
        );

        expect(error).toBeInstanceOf(MfeError);
        expect(error.name).toBe('UnsupportedLifecycleStageError');
        expect(error.code).toBe('UNSUPPORTED_LIFECYCLE_STAGE');
        expect(error.stageId).toBe('gts.frontx.mfes.lifecycle.stage.v1~test.custom_stage.v1');
        expect(error.entityId).toBe('entity-id');
        expect(error.supportedStages).toEqual(supportedStages);
        expect(error.message).toBe('Lifecycle stage not supported');
      });
    });
  });

  describe('16.3.4 Error message formatting', () => {
    it('should format MfeLoadError messages with entry context', () => {
      const error = new MfeLoadError(
        'Script load timeout',
        'gts.frontx.mfes.mfe.entry.v1~test.entry.v1'
      );

      expect(error.message).toContain("Failed to load MFE 'gts.frontx.mfes.mfe.entry.v1~test.entry.v1'");
      expect(error.message).toContain('Script load timeout');
    });

    it('should format ExtensionTypeError with type hierarchy context', () => {
      const error = new ExtensionTypeError(
        'gts.frontx.mfes.ext.extension.v1~acme.widget.v1',
        'gts.frontx.mfes.ext.extension.v1~acme.base_widget.v1'
      );

      expect(error.message).toContain('Extension type');
      expect(error.message).toContain('gts.frontx.mfes.ext.extension.v1~acme.widget.v1');
      expect(error.message).toContain('does not derive from');
      expect(error.message).toContain('gts.frontx.mfes.ext.extension.v1~acme.base_widget.v1');
    });

    it('should format ChainExecutionError with execution path', () => {
      const action: Action = {
        type: 'gts.frontx.mfes.comm.action.v1~test.action.v1',
        target: 'test-domain',
      };

      const error = new ChainExecutionError(
        'Handler threw TypeError',
        { action },
        action,
        ['action1', 'action2', 'action3']
      );

      expect(error.message).toContain('Actions chain execution failed');
      expect(error.message).toContain('gts.frontx.mfes.comm.action.v1~test.action.v1');
      expect(error.message).toContain('Handler threw TypeError');
    });

    it('should inherit Error stack trace', () => {
      const error = new MfeLoadError('Test', 'entry-id');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('MfeLoadError');
    });

    it('should be catchable as Error', () => {
      const error = new MfeLoadError('Test', 'entry-id');

      expect(() => {
        throw error;
      }).toThrow(Error);
    });

    it('should be catchable as MfeError', () => {
      const error = new MfeLoadError('Test', 'entry-id');

      expect(() => {
        throw error;
      }).toThrow(MfeError);
    });
  });
});
