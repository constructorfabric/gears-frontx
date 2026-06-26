/**
 * Bootstrap Events
 * App-level events for bootstrap operations
 */

import '@gears-frontx/react';
import type { ApiUser } from '@/app/api';

/**
 * Module augmentation for type-safe event payloads
 * Define payload types for each event
 *
 * NOTE: We augment @gears-frontx/react's EventPayloadMap interface.
 * This maintains layer architecture by not importing from L1 packages directly.
 * The @gears-frontx/react package re-declares EventPayloadMap to enable this pattern.
 */
declare module '@gears-frontx/react' {
  interface EventPayloadMap {
    /** Fetch current user - no payload needed */
    'app/user/fetch': void;
    /** User data loaded - carries user payload for header update */
    'app/user/loaded': { user: ApiUser };
  }
}
