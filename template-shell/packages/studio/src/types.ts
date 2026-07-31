// @cpt-dod:cpt-frontx-dod-studio-devtools-panel-overlay:p1
// @cpt-dod:cpt-frontx-dod-studio-devtools-persistence:p1
// @cpt-dod:cpt-frontx-dod-studio-devtools-viewport-clamping:p1
/**
 * Position coordinates for the Studio panel
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Size dimensions for the Studio panel
 */
export interface Size {
  width: number;
  height: number;
}

/**
 * Studio panel state
 */
export interface StudioState {
  collapsed: boolean;
  position: Position;
  size: Size;
}

/**
 * Constants for panel constraints
 */
export const PANEL_CONSTRAINTS = {
  MIN_WIDTH: 320,
  MIN_HEIGHT: 400,
  MAX_WIDTH: 600,
  MAX_HEIGHT: 800,
  DEFAULT_WIDTH: 400,
  DEFAULT_HEIGHT: 500,
} as const;

/**
 * Collapsed button size (circular)
 */
export const BUTTON_SIZE = {
  width: 48,
  height: 48,
} as const;

/**
 * LocalStorage key prefix for Studio
 */
export const STORAGE_PREFIX = 'frontx:studio:' as const;

/**
 * LocalStorage keys (composable with shared prefix)
 */
export const STORAGE_KEYS = {
  POSITION: `${STORAGE_PREFIX}position`,
  SIZE: `${STORAGE_PREFIX}size`,
  COLLAPSED: `${STORAGE_PREFIX}collapsed`,
  BUTTON_POSITION: `${STORAGE_PREFIX}buttonPosition`,
  THEME: `${STORAGE_PREFIX}theme`,
  LANGUAGE: `${STORAGE_PREFIX}language`,
  MOCK_ENABLED: `${STORAGE_PREFIX}mockEnabled`,
} as const;
