// @cpt-algo:cpt-frontx-algo-ui-libraries-choice-theme-propagation:p1
/**
 * Normalize a color value for use as a CSS variable value.
 * Strips the hsl() wrapper so shadcn components can use it as `hsl(var(--primary))`.
 */
export function hslToVar(color: string): string {
  if (color === 'transparent') return 'transparent';
  if (color.startsWith('hsl(')) return color.slice(4, -1);
  return color;
}
