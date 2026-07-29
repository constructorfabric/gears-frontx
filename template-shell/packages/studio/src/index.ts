/**
 * FrontX Studio Package
 * Development tools overlay for FrontX applications
 *
 * This package should ONLY be imported in development mode
 * Use conditional imports to ensure it's tree-shaken in production
 *
 * Translations are registered automatically when StudioProvider is imported
 */
// @cpt-dod:cpt-frontx-dod-studio-devtools-conditional-loading:p1

export { StudioOverlay } from './StudioOverlay';
export { StudioProvider, useStudioContext } from './StudioProvider';
export type { Position, Size, StudioState } from './types';
