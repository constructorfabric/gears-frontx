/**
 * Screen Routing
 *
 * Resolves the screen extension a URL path names, and owns the one mount-action
 * shape both entry points dispatch: the boot/back-forward path
 * (`MfeScreenContainer`) and the menu click (`Menu`).
 *
 * `presentation.route` is required by the screen-extension schema
 * (`src/gts/schemas/extension_screen.v1.json`, "Used by navigation") and every
 * MFE declares one; this module is what finally reads it.
 */

import { FRONTX_ACTION_MOUNT_EXT, FRONTX_SCREEN_DOMAIN } from '@gears-frontx/react';
import type { Extension, MfeRegistry, ScreenExtension } from '@gears-frontx/react';

/** Sort key for an extension that declares no order - same value `Menu.tsx` uses. */
const UNORDERED = 999;

// The registry types its per-domain lookup as the base `Extension`; only the
// screen domain's `extensionsTypeId` promises `presentation`, and that promise
// is enforced by GTS validation at registration time, not by the compiler here.
// Narrowing at runtime keeps a malformed extension out of navigation instead of
// throwing on `presentation.route` halfway through a resolve.
function isScreenExtension(extension: Extension): extension is ScreenExtension {
  if (!('presentation' in extension)) return false;
  const presentation = extension.presentation;
  if (typeof presentation !== 'object' || presentation === null) return false;
  return 'route' in presentation && typeof presentation.route === 'string';
}

// Routes and paths are compared with trailing slashes stripped, so `/tasks/`
// and `/tasks` name the same screen. The root path collapses to `/`, which an
// extension may legitimately claim as its own route.
function normalizePath(value: string): string {
  const trimmed = value.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Screen extensions in the order the menu lists them. */
function inMenuOrder(extensions: Extension[]): ScreenExtension[] {
  return extensions
    .filter(isScreenExtension)
    .sort((a, b) => (a.presentation.order ?? UNORDERED) - (b.presentation.order ?? UNORDERED));
}

/**
 * Pick the screen extension for `pathname`, falling back to the screen the menu
 * lists first (lowest `presentation.order`).
 *
 * An unknown path mounts that fallback and leaves the URL exactly as typed: no
 * rewrite (which would destroy what the user asked for and hide the typo) and
 * no not-found screen (the shell owns no screen content of its own - every
 * screen comes from an MFE, so it has nothing honest to render).
 *
 * Returns `null` only when no screen extension is registered at all.
 */
export function resolveScreenFromPath(
  pathname: string,
  extensions: Extension[],
): ScreenExtension | null {
  const screens = inMenuOrder(extensions);
  if (screens.length === 0) return null;

  const path = normalizePath(pathname);
  const matches = screens.filter((screen) => normalizePath(screen.presentation.route) === path);

  // Nothing stops two MFEs from claiming the same route - they are built and
  // shipped separately, so the collision only exists at runtime, in this host.
  if (matches.length > 1) {
    const [winner, ...shadowed] = matches;
    console.warn(
      `[Screen routing] Route "${path}" is claimed by ${matches.length} extensions: ` +
        `mounting "${winner.id}", ignoring ${shadowed.map((screen) => `"${screen.id}"`).join(', ')}.`,
    );
  }

  return matches[0] ?? screens[0];
}

/**
 * Dispatch the mount chain for a screen extension. Single definition of the
 * chain so the boot path and the menu cannot drift apart.
 */
export function mountScreenExtension(
  registry: MfeRegistry,
  extensionId: string,
): Promise<void> {
  return registry.executeActionsChain({
    action: {
      type: FRONTX_ACTION_MOUNT_EXT,
      target: FRONTX_SCREEN_DOMAIN,
      payload: { subject: extensionId },
    },
  });
}
