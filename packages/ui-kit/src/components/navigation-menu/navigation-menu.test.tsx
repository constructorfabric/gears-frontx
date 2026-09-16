import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from './navigation-menu';
import styles from './navigation-menu.module.css';

afterEach(cleanup);

function renderMenu() {
  return render(
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Products</NavigationMenuTrigger>
          <NavigationMenuContent>
            <NavigationMenuLink href="#product-a">Product A</NavigationMenuLink>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Solutions</NavigationMenuTrigger>
          <NavigationMenuContent>
            <NavigationMenuLink href="#solution-a">Solution A</NavigationMenuLink>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="#pricing">Pricing</NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>,
  );
}

describe('NavigationMenu', () => {
  it('renders a list of triggers and a plain link, with no content mounted until opened', () => {
    renderMenu();
    expect(screen.getByRole('button', { name: 'Products' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Solutions' })).toBeTruthy();
    // A plain NavigationMenuLink beside the triggers never opens a popup —
    // it renders as a real <a>, not a button, and nothing gets portaled.
    const pricing = screen.getByRole('link', { name: 'Pricing' });
    expect(pricing.className).toContain(styles.link);
    expect(screen.queryByText('Product A')).toBeNull();
  });

  it('opens a trigger and portals its content into the shared viewport', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));
    const link = await waitFor(() => screen.getByRole('link', { name: 'Product A' }));
    expect(link.className).toContain(styles.link);
  });

  // The distinctive mechanic under test: ONE shared Viewport morphs between
  // items rather than each trigger owning its own independently-sized popup
  // (see navigation-menu.module.css's header comment) — switching triggers
  // must swap what's portaled into it, not stack both.
  it('swaps the viewport content when switching to a different trigger', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));
    await waitFor(() => screen.getByRole('link', { name: 'Product A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solutions' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Product A' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Solution A' })).toBeTruthy();
  });

  it('marks the open trigger with data-popup-open', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Products' });
    expect(trigger.getAttribute('data-popup-open')).toBeNull();
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute('data-popup-open')).not.toBeNull());
  });

  it('closes on Escape', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));
    await waitFor(() => screen.getByRole('link', { name: 'Product A' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Products' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Product A' })).toBeNull());
  });

  // Base UI's List wires its outside-press dismissal with
  // outsidePressEvent: 'intentional' (see NavigationMenuList.mjs) — unlike
  // DropdownMenu's default 'sloppy' behavior, 'intentional' ignores a bare
  // pointerdown/mousedown pair and only reacts to a real 'click' event.
  it('closes on an outside click', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));
    await waitFor(() => screen.getByRole('link', { name: 'Product A' }));
    fireEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Product A' })).toBeNull());
  });

  it('closes when a link inside the open content is clicked, given closeOnClick', async () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="#product-a" closeOnClick>
                Product A
              </NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));
    const link = await waitFor(() => screen.getByRole('link', { name: 'Product A' }));
    fireEvent.click(link);
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Product A' })).toBeNull());
  });
});

/*
 * The drawn link steps. jsdom computes no layout, so the step, the inset
 * that lands it and the two paints are asserted on the declarations.
 */
describe('NavigationMenuLink size axis', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'navigation-menu.module.css'), 'utf8'),
  );

  // Selector lists keep their source whitespace, so they are matched with
  // it collapsed.
  function declared(selector: string, prop: string) {
    const rule = rules.find(
      (candidate) => candidate.selector.replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').trim() === selector,
    );
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('renders size="default" and an omitted size as the same class list', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink href="#a">Omitted</NavigationMenuLink>
            <NavigationMenuLink href="#b" size="default">
              Explicit
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );
    expect(screen.getByText('Omitted').className).toBe(screen.getByText('Explicit').className);
  });

  it('moves only the step and the block inset between the two', () => {
    expect(declared('.link.sizeDefault', 'min-height')).toBe('var(--control-height-md)');
    expect(declared('.link.sizeDefault', 'padding-block')).toBe('var(--space-2)');
    expect(declared('.link.sizeCompact', 'min-height')).toBe('var(--control-height-xs)');
    expect(declared('.link.sizeCompact', 'padding-block')).toBe('var(--space-1)');
    // Shared by both steps, so they live on the base rule.
    expect(declared('.link', 'padding-inline')).toBe('var(--space-3)');
    expect(declared('.link', 'border-radius')).toBe('var(--radius-md)');
    expect(declared('.link', 'font-size')).toBe('var(--text-body-size)');
    // A floor needs border-box, or the inset would add on top of it.
    expect(declared('.link', 'box-sizing')).toBe('border-box');
  });

  it('separates the hover fill from the current-page one', () => {
    expect(declared('.link:hover,.link:focus', 'background-color')).toBe('var(--muted)');
    expect(declared('.link[data-active]', 'background-color')).toBe('var(--secondary)');
    expect(declared('.link[data-active]', 'box-shadow')).toBe(
      'inset 0 0 0 var(--border-width) var(--border)',
    );
  });
});
