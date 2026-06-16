/**
 * GTS Layout Domain Loader (Framework L2)
 *
 * Loads layout domain instances from JSON files.
 * These are FrontX's base extension domains for UI layout.
 *
 * @packageDocumentation
 */

import type { ExtensionDomain } from '@gears-frontx/screensets';

// Import layout domain instances
import sidebarDomainInstance from './hai3.screensets/instances/domains/sidebar.v1.json';
import popupDomainInstance from './hai3.screensets/instances/domains/popup.v1.json';
import screenDomainInstance from './hai3.screensets/instances/domains/screen.v1.json';
import overlayDomainInstance from './hai3.screensets/instances/domains/overlay.v1.json';

/**
 * Load layout domain instances from hai3.screensets package.
 * These are the 4 base layout domains: sidebar, popup, screen, overlay.
 *
 * @returns Array of layout domain instances
 */
export function loadLayoutDomains(): ExtensionDomain[] {
  return [sidebarDomainInstance, popupDomainInstance, screenDomainInstance, overlayDomainInstance] as ExtensionDomain[];
}
