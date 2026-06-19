/**
 * MFE Bootstrap (standalone project template)
 *
 * Registers MFE domains and shared properties. No mfe_packages or extensions
 * are registered — add your own MFE configs and call registerExtension as needed.
 * This file is imported in main.tsx via MfeScreenContainer.
 */

import type { HAI3App } from '@gears-frontx/react';
import {
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  RefContainerProvider,
} from '@gears-frontx/react';

/**
 * DetachedContainerProvider for domains without a visible host element.
 */
class DetachedContainerProvider extends RefContainerProvider {
  constructor() {
    const detachedElement = document.createElement('div');
    super({ current: detachedElement });
  }
}

/**
 * Bootstrap MFE system for the host application.
 * Registers the four extension domains. Add your own manifest/extension
 * registration and mounting logic after this.
 *
 * @param app - HAI3 application instance
 * @param screenContainerRef - React ref for the screen domain container element
 */
export async function bootstrapMFE(
  app: HAI3App,
  screenContainerRef: React.RefObject<HTMLDivElement>
): Promise<void> {
  const { screensetsRegistry } = app;

  if (!screensetsRegistry) {
    throw new Error('[MFE Bootstrap] screensetsRegistry is not available on app instance');
  }

  // Register all 4 extension domains
  const screenContainerProvider = new RefContainerProvider(screenContainerRef);
  screensetsRegistry.registerDomain(screenDomain, screenContainerProvider);

  const sidebarContainerProvider = new DetachedContainerProvider();
  screensetsRegistry.registerDomain(sidebarDomain, sidebarContainerProvider);

  const popupContainerProvider = new DetachedContainerProvider();
  screensetsRegistry.registerDomain(popupDomain, popupContainerProvider);

  const overlayContainerProvider = new DetachedContainerProvider();
  screensetsRegistry.registerDomain(overlayDomain, overlayContainerProvider);

  // Initialize shared properties (theme and language)
  const currentThemeId = app.themeRegistry?.getCurrent()?.id ?? 'default';
  screensetsRegistry.updateSharedProperty(FRONTX_SHARED_PROPERTY_THEME, currentThemeId);
  screensetsRegistry.updateSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'en');

  // Standalone: no mfe.json or extensions registered here.
  // Register your MFE manifests and extensions, then mount as needed.
}
