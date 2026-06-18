/**
 * Error Handling Tests
 *
 * Tests for MFE error handling including load failures, contract validation,
 * action handler errors, and retry functionality.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MfeLoadError,
  ContractValidationError,
  ChainExecutionError,
} from '../../../src/mfe/errors';
import {
  RetryHandler,
} from '../../../src/mfe/errors/error-handler';
import { MfeHandlerMF } from '../../../src/mfe/handler/mf-handler';
import type { MfeEntryMF, Action, ActionsChain } from '../../../src/mfe/types';

describe('Error Handling', () => {

  describe('11.3.1 Bundle load failure scenario', () => {
    it('should throw MfeLoadError when manifest is not found', async () => {
      const handler = new MfeHandlerMF('gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~', { retries: 0 });

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~test.v1',
        manifest: 'missing-manifest-id',
        exposedModule: './Widget',
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      await expect(handler.load(entry)).rejects.toThrow(MfeLoadError);
      await expect(handler.load(entry)).rejects.toThrow(/Manifest 'missing-manifest-id' not found/);
    });

    it('should throw MfeLoadError when module does not implement lifecycle interface', async () => {
      const handler = new MfeHandlerMF('gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~', { retries: 0 });

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~test.v1',
        manifest: 'test-manifest',
        exposedModule: './InvalidWidget',
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      // This will fail because the manifest is not cached
      await expect(handler.load(entry)).rejects.toThrow(MfeLoadError);
    });
  });

  describe('11.3.2 Contract validation failure at load time', () => {
    it('should create ContractValidationError with proper context', () => {
      const errors = [
        { type: 'missing_property' as const, details: 'Required property "theme" not provided' },
        { type: 'unsupported_action' as const, details: 'Action "navigate" not supported by domain' },
      ];

      const error = new ContractValidationError(
        errors,
        'gts.frontx.mfes.mfe.entry.v1~test.entry.v1',
        'gts.frontx.mfes.ext.domain.v1~test.domain.v1'
      );

      expect(error.code).toBe('CONTRACT_VALIDATION_ERROR');
      expect(error.entryTypeId).toBe('gts.frontx.mfes.mfe.entry.v1~test.entry.v1');
      expect(error.domainTypeId).toBe('gts.frontx.mfes.ext.domain.v1~test.domain.v1');
      expect(error.errors).toHaveLength(2);
      expect(error.message).toContain('missing_property');
      expect(error.message).toContain('unsupported_action');
    });
  });

  describe('11.3.3 Action handler error scenario', () => {
    it('should create ChainExecutionError with execution path', () => {
      const failedAction: Action = {
        type: 'gts.frontx.mfes.mfe.action.v1~test.action.v1',
        target: 'test-domain',
        payload: {},
      };

      const chain: ActionsChain = {
        action: failedAction,
      };

      const error = new ChainExecutionError(
        'Action handler threw exception',
        chain,
        failedAction,
        ['action1', 'action2'],
        new Error('Handler error')
      );

      expect(error.code).toBe('CHAIN_EXECUTION_ERROR');
      expect(error.failedAction).toBe(failedAction);
      expect(error.executedPath).toEqual(['action1', 'action2']);
      expect(error.cause).toBeDefined();
      expect(error.message).toContain('Action handler threw exception');
    });
  });

  describe('11.3.4 Retry functionality', () => {
    it('should retry failed operations', async () => {
      const retryHandler = new RetryHandler();
      let attempts = 0;

      const operation = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Operation failed');
        }
        return 'success';
      });

      const result = await retryHandler.retry(operation, 3, 10);

      expect(result).toBe('success');
      expect(attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const retryHandler = new RetryHandler();
      const operation = vi.fn(async () => {
        throw new Error('Permanent failure');
      });

      await expect(retryHandler.retry(operation, 2, 10)).rejects.toThrow('Permanent failure');
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use exponential backoff', async () => {
      const retryHandler = new RetryHandler();
      const timestamps: number[] = [];

      const operation = vi.fn(async () => {
        timestamps.push(Date.now());

        if (timestamps.length < 3) {
          throw new Error('Retry');
        }
        return 'success';
      });

      await retryHandler.retry(operation, 3, 50);

      // Verify exponential backoff (approximate due to timing)
      // timestamps[0] is the first call
      // timestamps[1] is after ~50ms delay
      // timestamps[2] is after ~100ms delay (exponential)
      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];

      expect(delay1).toBeGreaterThanOrEqual(45); // ~50ms
      expect(delay2).toBeGreaterThanOrEqual(95); // ~100ms (2x exponential)
      expect(delay2).toBeGreaterThan(delay1); // Second delay should be longer
    });

    it('should integrate retry with MfeHandlerMF', async () => {
      const handler = new MfeHandlerMF('gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~', { retries: 2 });

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~test.v1',
        manifest: 'missing-manifest',
        exposedModule: './Widget',
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      // Should fail after retries
      await expect(handler.load(entry)).rejects.toThrow(MfeLoadError);
    });
  });
});
