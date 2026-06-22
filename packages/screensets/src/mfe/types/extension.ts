/**
 * Extension Type Definitions
 *
 * Extension binds an MFE entry to an extension domain, creating a concrete MFE instance.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-frontx-dod-mfe-registry-type-contracts:p1

import type { LifecycleHook } from './lifecycle';

/**
 * Presentation metadata for extensions.
 * Used by the host to build navigation menus and other UI elements.
 */
export interface ExtensionPresentation {
  /** Human-readable label for the extension */
  label: string;
  /** Optional icon identifier (e.g., "user", "settings") */
  icon?: string;
  /** Route path for navigation (e.g., "/profile", "/settings") */
  route: string;
  /** Optional sort order for menu items (lower numbers first) */
  order?: number;
}

/**
 * Binds an MFE entry to an extension domain
 * GTS Type: gts.frontx.mfes.ext.extension.v1~
 *
 * Domain-specific fields are defined in derived Extension types.
 * If domain.extensionsTypeId is specified, extension must use a type deriving from it.
 */
export interface Extension {
  /** The GTS type ID for this extension */
  id: string;
  /** ExtensionDomain type ID to mount into */
  domain: string;
  /** MfeEntry type ID to mount */
  entry: string;
  /** Optional lifecycle hooks - explicitly declared actions for each stage */
  lifecycle?: LifecycleHook[];
  // Domain-specific fields are added via derived types, not defined here
}

/**
 * Screen Extension (derived from Extension)
 * GTS Type: gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~
 *
 * Extends the base Extension type with presentation metadata required for screen domain.
 * Screen domain sets extensionsTypeId to reference this derived type, so all screen
 * extensions must include presentation metadata.
 */
export interface ScreenExtension extends Extension {
  /** Presentation metadata for screen domain extensions (required) */
  presentation: ExtensionPresentation;
}
