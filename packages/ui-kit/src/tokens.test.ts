import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Guards the theme seam: every CSS variable a component module consumes must
// be defined by theme.css (the single branding surface), except the vars the
// Base UI positioner provides at runtime.

const srcDir = dirname(fileURLToPath(import.meta.url));
const themeCss = readFileSync(join(srcDir, 'styles', 'theme.css'), 'utf8');

const BASE_UI_RUNTIME_VARS = new Set([
  '--anchor-width',
  '--anchor-height',
  '--available-width',
  '--available-height',
  '--transform-origin',
]);

const definedTokens = new Set(
  Array.from(themeCss.matchAll(/(--[a-z0-9-]+)\s*:/g), (match) => match[1]),
);

const componentsDir = join(srcDir, 'components');
const moduleFiles = readdirSync(componentsDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.module.css'))
  .map((file) => join(componentsDir, file));

describe('theme tokens', () => {
  it('defines the radius scale derived from --radius', () => {
    for (const token of ['--radius', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl']) {
      expect(definedTokens.has(token), `${token} is missing from theme.css`).toBe(true);
    }
  });

  it.each(moduleFiles)('%s consumes only theme-defined variables', (file) => {
    const css = readFileSync(file, 'utf8');
    const used = Array.from(css.matchAll(/var\((--[a-z0-9-]+)/g), (match) => match[1] ?? '');
    expect(used.length).toBeGreaterThan(0);
    for (const token of Array.from(new Set(used))) {
      if (BASE_UI_RUNTIME_VARS.has(token)) {
        continue;
      }
      expect(definedTokens.has(token), `${token} is not defined in theme.css`).toBe(true);
    }
  });

  it('keeps raw colors out of component modules', () => {
    for (const file of moduleFiles) {
      const css = readFileSync(file, 'utf8');
      const raw = css.match(/#[0-9a-f]{3,8}\b|rgb\(|rgba\(|hsl\(|oklch\(/i);
      expect(raw, `raw color "${raw?.[0]}" in ${file}`).toBeNull();
    }
  });
});
