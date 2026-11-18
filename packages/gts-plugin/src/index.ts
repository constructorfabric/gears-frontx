// @cpt-dod:cpt-frontx-dod-gts-type-provider-public-surface:p1
export type { JSONSchema } from './types';
export { GtsPlugin, gtsPlugin } from './plugin';
export { loadLifecycleStages } from './loader';
export {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from './constants';
