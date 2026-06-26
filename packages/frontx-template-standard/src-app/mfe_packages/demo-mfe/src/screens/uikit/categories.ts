/**
 * UIKit Elements Categories
 *
 * Defines the 9 element categories and their element mappings.
 */

export const CATEGORIES = {
  layout: 'layout',
  navigation: 'navigation',
  forms: 'forms',
  actions: 'actions',
  feedback: 'feedback',
  dataDisplay: 'data_display',
  overlays: 'overlays',
  media: 'media',
  disclosure: 'disclosure',
} as const;

export type Category = typeof CATEGORIES[keyof typeof CATEGORIES];

/**
 * Mapping of categories to their elements.
 * Each element maps to an ID used in translation keys and DOM element IDs.
 */
export const CATEGORY_ELEMENTS: Record<Category, string[]> = {
  [CATEGORIES.layout]: [
    'grid',
    'separator',
    'divider',
    'card',
    'sidebar',
    'footer',
    'header',
    'scroll_area',
  ],
  [CATEGORIES.navigation]: [
    'breadcrumb',
    'nav',
    'tab',
    'pagination',
    'link',
    'menu',
  ],
  [CATEGORIES.forms]: [
    'input',
    'textarea',
    'select',
    'checkbox',
    'radio',
    'switch',
    'date_picker',
    'file_upload',
    'slider',
    'rating',
  ],
  [CATEGORIES.actions]: [
    'button',
    'toggle',
    'dropdown',
    'chip',
  ],
  [CATEGORIES.feedback]: [
    'alert',
    'notification',
    'toast',
    'progress',
    'spinner',
    'skeleton',
    'loader',
    'status_badge',
    'empty_state',
  ],
  [CATEGORIES.dataDisplay]: [
    'data_table',
    'table',
    'list',
    'badge',
    'tag',
    'typography',
    'icon',
    'image',
    'timeline',
    'tooltip',
  ],
  [CATEGORIES.overlays]: [
    'dialog',
    'modal',
    'drawer',
    'popover',
  ],
  [CATEGORIES.media]: [
    'image',
    'chart',
    'calendar',
  ],
  [CATEGORIES.disclosure]: [
    'accordion',
    'tree_view',
  ],
};
