/**
 * FrontX MFE Infrastructure Action Constants
 *
 * Infrastructure lifecycle action type IDs wired by the MFE runtime.
 * These are NOT solution-specific — they are the canonical action IDs
 * for load/mount/unmount operations used across the admission and
 * contract-matching paths (MFES-2 safe, no shared-property identity).
 *
 * @packageDocumentation
 */

export const FRONTX_ACTION_LOAD_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~';
export const FRONTX_ACTION_MOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~';
export const FRONTX_ACTION_UNMOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~';
