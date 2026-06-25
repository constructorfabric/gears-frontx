/**
 * Layout Domain Enum
 *
 * Defines all layout domains that can be orchestrated by the FrontX template.
 * Relocated from @gears-frontx/screensets in Phase 7 to satisfy constraint
 * `cpt-frontx-constraint-mfes-no-layout-domain-values` (MFES-3):
 * no solution-specific domain placement values in @gears-frontx/mfes.
 *
 * @packageDocumentation
 */

export enum LayoutDomain {
  Header = 'header',
  Footer = 'footer',
  Menu = 'menu',
  Sidebar = 'sidebar',
  Screen = 'screen',
  Popup = 'popup',
  Overlay = 'overlay',
}
