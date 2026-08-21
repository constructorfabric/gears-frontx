/**
 * The host chrome contract: the actions a microfrontend may dispatch upward to
 * change the shell around it.
 *
 * A microfrontend runs in its own module graph (per-load blob instantiation,
 * ADR-0011), so it has no handle on the host app and no shared event bus to
 * emit on. The actions chain is the one declared upward channel, and it carries
 * a payload. These two action types are what this shell chooses to expose over
 * it; the handlers live in `bootstrap.ts` and call the public `app.actions`
 * surface.
 *
 * Both are app-layer, not framework: `screenDomain` in
 * `@gears-frontx/framework` ships to every template, and a host that does not
 * want its chrome driven from a microfrontend simply does not spread these into
 * its own screen-domain declaration.
 */

import type { JSONSchema } from '@gears-frontx/react';

/** Applies a registered theme by id - the payload carries `themeId`. */
export const CHROME_SET_THEME =
  'gts.frontx.mfes.comm.action.v1~frontx.screensets.chrome.set_theme.v1~';

/** Collapses or expands the shell's main menu - the payload carries `collapsed`. */
export const CHROME_SET_MENU_COLLAPSED =
  'gts.frontx.mfes.comm.action.v1~frontx.screensets.chrome.set_menu_collapsed.v1~';

/**
 * Modelled on the shipped `mount_ext.v1.json`: a domain-targeted action, so
 * `target` refs the domain type rather than an extension, and the payload is
 * closed around the single field each action needs.
 *
 * These must reach the type system before `registerDomain`, because the
 * mediator resolves an action's schema from its `type` at dispatch time and
 * rejects an action it cannot validate.
 */
export const CHROME_ACTION_SCHEMAS: JSONSchema[] = [
  {
    $id: `gts://${CHROME_SET_THEME}`,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      type: { 'x-gts-ref': '/$id' },
      target: { 'x-gts-ref': 'gts.frontx.mfes.ext.domain.v1~*' },
      payload: {
        type: 'object',
        properties: { themeId: { type: 'string' } },
        required: ['themeId'],
      },
      timeout: { type: 'number', minimum: 1 },
    },
    required: ['type', 'target', 'payload'],
  },
  {
    $id: `gts://${CHROME_SET_MENU_COLLAPSED}`,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      type: { 'x-gts-ref': '/$id' },
      target: { 'x-gts-ref': 'gts.frontx.mfes.ext.domain.v1~*' },
      payload: {
        type: 'object',
        properties: { collapsed: { type: 'boolean' } },
        required: ['collapsed'],
      },
      timeout: { type: 'number', minimum: 1 },
    },
    required: ['type', 'target', 'payload'],
  },
];
