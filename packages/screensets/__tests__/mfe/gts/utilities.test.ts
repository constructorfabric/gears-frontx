/**
 * GTS Utilities Tests
 *
 * Tests for HAI3 constants.
 */

import { describe, it, expect } from 'vitest';
import {
  FRONTX_MFE_ENTRY,
  FRONTX_MFE_ENTRY_MF,
  FRONTX_MF_MANIFEST,
  FRONTX_EXT_DOMAIN,
  FRONTX_EXT_EXTENSION,
  FRONTX_EXT_ACTION,
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';

describe('HAI3 constants values', () => {
  describe('schema type IDs', () => {
    it('should have correct MFE schema type IDs', () => {
      expect(FRONTX_MFE_ENTRY).toBe('gts.frontx.mfes.mfe.entry.v1~');
      expect(FRONTX_MFE_ENTRY_MF).toBe('gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~');
      expect(FRONTX_MF_MANIFEST).toBe('gts.frontx.mfes.mfe.mf_manifest.v1~');
    });

    it('should have correct extension schema type IDs', () => {
      expect(FRONTX_EXT_DOMAIN).toBe('gts.frontx.mfes.ext.domain.v1~');
      expect(FRONTX_EXT_EXTENSION).toBe('gts.frontx.mfes.ext.extension.v1~');
      expect(FRONTX_EXT_ACTION).toBe('gts.frontx.mfes.comm.action.v1~');
    });

    it('should confirm schema IDs end with ~', () => {
      expect(FRONTX_MFE_ENTRY.endsWith('~')).toBe(true);
      expect(FRONTX_MFE_ENTRY_MF.endsWith('~')).toBe(true);
      expect(FRONTX_MF_MANIFEST.endsWith('~')).toBe(true);
      expect(FRONTX_EXT_DOMAIN.endsWith('~')).toBe(true);
      expect(FRONTX_EXT_EXTENSION.endsWith('~')).toBe(true);
      expect(FRONTX_EXT_ACTION.endsWith('~')).toBe(true);
    });
  });

  describe('action instance IDs', () => {
    it('should have correct action instance IDs', () => {
      expect(FRONTX_ACTION_LOAD_EXT).toBe(
        'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1'
      );
      expect(FRONTX_ACTION_MOUNT_EXT).toBe(
        'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1'
      );
      expect(FRONTX_ACTION_UNMOUNT_EXT).toBe(
        'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1'
      );
    });

    it('should confirm action IDs do not end with ~', () => {
      expect(FRONTX_ACTION_LOAD_EXT.endsWith('~')).toBe(false);
      expect(FRONTX_ACTION_MOUNT_EXT.endsWith('~')).toBe(false);
      expect(FRONTX_ACTION_UNMOUNT_EXT.endsWith('~')).toBe(false);
    });
  });
});
