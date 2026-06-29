/**
 * Local type definitions for demo-mfe components.
 * No shared UI kit dependency; types are owned by this MFE.
 */

// ============================================================================
// Text Direction
// ============================================================================

/**
 * Text Direction Type
 * Compatible with @gears-frontx/i18n TextDirection enum values.
 */
export type TextDirection = 'ltr' | 'rtl';

// ============================================================================
// Button Component Types
// ============================================================================

/**
 * Button Variant Enum
 */
export enum ButtonVariant {
  Default = 'default',
  Destructive = 'destructive',
  Outline = 'outline',
  Secondary = 'secondary',
  Ghost = 'ghost',
  Link = 'link',
}

/**
 * Button Size Enum
 */
export enum ButtonSize {
  Default = 'default',
  Sm = 'sm',
  Lg = 'lg',
  Icon = 'icon',
}

// ============================================================================
// IconButton Component Types
// ============================================================================

/**
 * IconButton Size Enum
 */
export enum IconButtonSize {
  Default = 'default',
  Small = 'sm',
  Large = 'lg',
}
