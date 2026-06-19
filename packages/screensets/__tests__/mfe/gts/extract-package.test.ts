/**
 * extractGtsPackage Tests - Phase 39.6
 *
 * Tests for GTS package extraction utility.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import { extractGtsPackage } from '../../../src/mfe/gts/extract-package';

describe('extractGtsPackage - Phase 39.6', () => {
  describe('Valid GTS entity IDs', () => {
    it('39.6.1 should extract package from extension with derived type (3 tilde-segments)', () => {
      const extensionId = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.helloworld.v1';
      const result = extractGtsPackage(extensionId);
      expect(result).toBe('frontx.demo');
    });

    it('39.6.2 should extract package from manifest with base type (2 tilde-segments, single ~)', () => {
      const manifestId = 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.demo.mfe.manifest.v1';
      const result = extractGtsPackage(manifestId);
      expect(result).toBe('frontx.demo');
    });

    it('39.6.3 should extract package from entry with derived type', () => {
      const entryId = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.demo.mfe.helloworld.v1';
      const result = extractGtsPackage(entryId);
      expect(result).toBe('frontx.demo');
    });
  });

  describe('Malformed GTS entity IDs', () => {
    it('39.6.4 should throw for entity ID with fewer than 2 dot-segments in instance portion', () => {
      const malformedId = 'gts.frontx.mfes.ext.extension.v1~hai3';
      expect(() => extractGtsPackage(malformedId)).toThrow(
        /fewer than 2 dot-segments in its instance portion/
      );
    });

    it('39.6.4b should throw for entity ID with no ~ delimiter', () => {
      const noDelimiterId = 'gts.frontx.mfes.ext.extension.v1';
      expect(() => extractGtsPackage(noDelimiterId)).toThrow(
        /does not contain '~' delimiter/
      );
    });

    it('39.6.4c should throw for schema type ID ending with ~', () => {
      const schemaTypeId = 'gts.frontx.mfes.ext.extension.v1~';
      expect(() => extractGtsPackage(schemaTypeId)).toThrow(
        /schema type ID.*ends with '~'/
      );
    });
  });
});
