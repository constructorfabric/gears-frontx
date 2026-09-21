import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import styles from './tabs.module.css';

afterEach(cleanup);

function renderTabs(rootProps: Parameters<typeof Tabs>[0] = {}) {
  return render(
    <Tabs defaultValue="account" {...rootProps}>
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="billing" disabled>
          Billing
        </TabsTrigger>
      </TabsList>
      <TabsContent value="account">Account settings</TabsContent>
      <TabsContent value="password">Password settings</TabsContent>
      <TabsContent value="billing">Billing settings</TabsContent>
    </Tabs>,
  );
}

describe('Tabs', () => {
  it('renders every part with its kit class', () => {
    renderTabs();
    expect(screen.getByRole('tablist').className).toContain(styles.list);
    expect(screen.getByRole('tab', { name: 'Account' }).className).toContain(styles.trigger);
    expect(screen.getByText('Account settings').className).toContain(styles.content);
  });

  it('shows only the active panel and marks its tab active', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: 'Account' }).hasAttribute('data-active')).toBe(true);
    expect((screen.getByText('Account settings') as HTMLElement).hidden).toBe(false);
    expect(screen.queryByText('Password settings')).toBeNull();
  });

  it('switches panels on tab click and reports through onValueChange', async () => {
    const onValueChange = vi.fn();
    renderTabs({ onValueChange });
    fireEvent.click(screen.getByRole('tab', { name: 'Password' }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange.mock.calls[0]?.[0]).toBe('password');
    expect((screen.getByText('Password settings') as HTMLElement).hidden).toBe(false);
    // The outgoing panel unmounts once Base UI's close transition completes
    // (a microtask/animation-frame away, not synchronous with the click).
    await waitFor(() => expect(screen.queryByText('Account settings')).toBeNull());
  });

  it('does not activate a disabled tab', () => {
    const onValueChange = vi.fn();
    renderTabs({ onValueChange });
    const billing = screen.getByRole('tab', { name: 'Billing' });
    // Base UI keeps a disabled Tab focusable (arrow-key navigation must be
    // able to reach and skip it) rather than setting the native `disabled`
    // attribute, so it's `aria-disabled`, not `.disabled`, that reflects it.
    expect(billing.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(billing);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('keeps a disabled tab reachable by arrow-key navigation without activating it', async () => {
    const onValueChange = vi.fn();
    renderTabs({ onValueChange });
    const account = screen.getByRole('tab', { name: 'Account' });
    const password = screen.getByRole('tab', { name: 'Password' });
    const billing = screen.getByRole('tab', { name: 'Billing' });
    account.focus();
    // Base UI moves the roving-tabindex focus itself in an effect that
    // commits after the keydown handler returns, not synchronously within
    // it — hence `waitFor` rather than a bare assertion right after
    // `fireEvent`.
    fireEvent.keyDown(account, { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(password));
    // Arrow focus must still be able to land on the disabled tab — this is
    // exactly what the `[data-disabled]`-only CSS decision (no `:disabled`
    // fallback, see tabs.module.css) depends on staying true.
    fireEvent.keyDown(password, { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(billing));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('defaults TabsList to the default variant and switches to line', () => {
    const { rerender } = render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A content</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tablist').className).toContain(styles.variantDefault);
    rerender(
      <Tabs defaultValue="a">
        <TabsList variant="line">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A content</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tablist').className).toContain(styles.variantLine);
  });

  it('merges a consumer className on every part without dropping the kit class', () => {
    render(
      <Tabs defaultValue="a" className="consumer" data-testid="root">
        <TabsList className="consumer">
          <TabsTrigger value="a" className="consumer">
            A
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a" className="consumer">
          A content
        </TabsContent>
      </Tabs>,
    );
    const root = screen.getByTestId('root');
    expect(root.className).toContain(styles.tabs);
    expect(root.className).toContain('consumer');
    const list = screen.getByRole('tablist');
    expect(list.className).toContain(styles.list);
    expect(list.className).toContain('consumer');
    const tab = screen.getByRole('tab', { name: 'A' });
    expect(tab.className).toContain(styles.trigger);
    expect(tab.className).toContain('consumer');
    const panel = screen.getByText('A content');
    expect(panel.className).toContain(styles.content);
    expect(panel.className).toContain('consumer');
  });

  it('defaults TabsList to the default size and switches to sm', () => {
    const { rerender } = render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A content</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tablist').className).toContain(styles.sizeDefault);
    rerender(
      <Tabs defaultValue="a">
        <TabsList size="sm">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A content</TabsContent>
      </Tabs>,
    );
    const list = screen.getByRole('tablist');
    expect(list.className).toContain(styles.sizeSm);
    expect(list.className).not.toContain(styles.sizeDefault);
  });

  it('does not leak the variant or size props to the DOM as attributes', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList variant="line" size="sm">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A content</TabsContent>
      </Tabs>,
    );
    const list = screen.getByRole('tablist');
    expect(list.hasAttribute('variant')).toBe(false);
    expect(list.hasAttribute('size')).toBe(false);
  });

  it('stamps data-orientation on every part, defaulting to horizontal', () => {
    render(
      <Tabs defaultValue="account" data-testid="root">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>
        <TabsContent value="account">Account settings</TabsContent>
      </Tabs>,
    );
    // Root's is the load-bearing one — it's what flips .tabs between a
    // column (list above panel) and a row (list beside panel) in
    // tabs.module.css — so assert it alongside every other part, not just
    // the list and tab.
    expect(screen.getByTestId('root').getAttribute('data-orientation')).toBe('horizontal');
    expect(screen.getByRole('tablist').getAttribute('data-orientation')).toBe('horizontal');
    expect(screen.getByRole('tab', { name: 'Account' }).getAttribute('data-orientation')).toBe(
      'horizontal',
    );
    expect(screen.getByRole('tabpanel').getAttribute('data-orientation')).toBe('horizontal');
  });

  // Base UI puts the open panel in the tab order itself (`tabIndex: open ?
  // 0 : -1`, TabsPanel.js:83) — the panel is keyboard-reachable out of the
  // box, which is why tabs.module.css must pair its `outline: none` with a
  // `.content:focus-visible` ring. The ring itself is CSS and jsdom applies
  // no stylesheets; what this guards is the premise the rule rests on: the
  // open panel stays focusable (and would silently stop needing — or
  // getting — a focus style if that default ever changed or was overridden
  // away).
  it('keeps the open panel keyboard-focusable', () => {
    renderTabs();
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('tabindex')).toBe('0');
    panel.focus();
    expect(document.activeElement).toBe(panel);
  });

  it('switches every part to vertical orientation and keeps arrow-key navigation on its own axis', async () => {
    render(
      <Tabs defaultValue="account" orientation="vertical" data-testid="root">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>
        <TabsContent value="account">Account settings</TabsContent>
        <TabsContent value="password">Password settings</TabsContent>
      </Tabs>,
    );
    expect(screen.getByTestId('root').getAttribute('data-orientation')).toBe('vertical');
    expect(screen.getByRole('tablist').getAttribute('data-orientation')).toBe('vertical');
    const account = screen.getByRole('tab', { name: 'Account' });
    const password = screen.getByRole('tab', { name: 'Password' });
    expect(account.getAttribute('data-orientation')).toBe('vertical');
    expect(screen.getByRole('tabpanel').getAttribute('data-orientation')).toBe('vertical');
    // Vertical tabs navigate on the block axis (Up/Down); the source's own
    // registry drops `orientation` on the floor before it reaches
    // Tabs.Root (see base-vega's tabs.tsx), which would leave this
    // ArrowDown a no-op and ArrowRight the working key instead — this kit
    // forwards every prop through `...props`, so ArrowDown is the one that
    // must move focus here.
    account.focus();
    fireEvent.keyDown(account, { key: 'ArrowRight' });
    // A wrongly-accepted ArrowRight would move focus via the same queued
    // microtask ArrowDown uses below (`queueMicrotask` in Base UI's
    // useCompositeRoot — not a layout effect, so it survives past this
    // handler's synchronous return). Flush that same window before
    // asserting the no-op, or a real regression here would still read as
    // passing: the assertion below would just be checking `account` before
    // the (incorrect) focus move had a chance to land.
    await act(async () => {});
    expect(document.activeElement).toBe(account);
    fireEvent.keyDown(account, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(password));
  });
});

/*
 * Reads the module's own source: the drawn tab model is a set of numbers
 * that no rendered assertion can reach in jsdom, and several of them sit
 * off the spacing scale, so the literals are pinned here.
 */
describe('Tabs drawn geometry', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tabs.module.css'), 'utf8'),
  );

  // Collapses the whitespace a multi-line declaration keeps, so a value
  // written across several source lines compares as one string.
  const flatten = (value: string | undefined) => value?.replace(/\s+/g, ' ').trim();

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return flatten(rule ? declarationMap(rule.body).get(prop) : undefined);
  }

  // The same selector appears twice for the indicator: once plain and once
  // inside the reduced-motion query, so the query's copy is the last.
  function declaredLast(selector: string, prop: string) {
    const matches = rules.filter((candidate) => candidate.selector === selector);
    const rule = matches[matches.length - 1];
    return flatten(rule ? declarationMap(rule.body).get(prop) : undefined);
  }

  it('gives the filled track the drawn fill, corner, inset and height', () => {
    expect(declared('.list.variantDefault', 'background-color')).toBe('var(--muted)');
    expect(declared('.list.variantDefault', 'padding')).toBe('var(--indicator-thickness)');
    expect(declared('.list', 'border-radius')).toBe('var(--radius-lg)');
    expect(declared(".list.variantDefault[data-orientation='horizontal']", 'height')).toBe(
      'var(--control-height-sm)',
    );
  });

  it('leaves the line list trackless and reserves the indicator band', () => {
    expect(declared('.variantLine', 'background-color')).toBe('transparent');
    expect(declared('.variantLine', 'border-radius')).toBe('0');
    expect(declared('.variantLine', 'gap')).toBe('var(--space-1)');
    const band = 'calc(var(--indicator-gap) + var(--indicator-thickness))';
    expect(declared(".list.variantLine[data-orientation='horizontal']", 'padding-block-end')).toBe(
      band,
    );
    expect(declared(".list.variantLine[data-orientation='vertical']", 'padding-inline-end')).toBe(
      band,
    );
  });

  // One bar per list that travels, not one per trigger that crossfades:
  // the geometry comes from the --active-tab-* properties Base UI writes
  // at runtime, and only transform and the cross-axis size animate.
  it('drives one travelling indicator off the runtime active-tab geometry', () => {
    expect(declared('.list', '--indicator-thickness')).toBe('3px');
    expect(declared('.list', '--indicator-gap')).toBe('3px');
    expect(declared('.list .indicator', 'background-color')).toBe('var(--primary)');
    expect(declared('.list .indicator', 'transition')).toBe(
      'transform var(--duration-tab) var(--ease-standard), width var(--duration-tab) var(--ease-standard), height var(--duration-tab) var(--ease-standard)',
    );
    expect(declared(".list .indicator[data-orientation='horizontal']", 'width')).toBe(
      'var(--active-tab-width)',
    );
    expect(declared(".list .indicator[data-orientation='horizontal']", 'height')).toBe(
      'var(--indicator-thickness)',
    );
    expect(declared(".list .indicator[data-orientation='horizontal']", 'transform')).toBe(
      'translateX(var(--active-tab-left))',
    );
    expect(declared(".list .indicator[data-orientation='vertical']", 'height')).toBe(
      'var(--active-tab-height)',
    );
    expect(declared(".list .indicator[data-orientation='vertical']", 'transform')).toBe(
      'translateY(var(--active-tab-top))',
    );
  });

  // A travelling bar is motion under WCAG 2.3.3, unlike the colour
  // crossfades elsewhere in the file, so it has to collapse.
  it('collapses the indicator travel under reduced motion', () => {
    expect(declaredLast('.list .indicator', 'transition-duration')).toBe('1ms');
  });

  it('gives the trigger the drawn corner, insets and box', () => {
    expect(declared('.trigger', 'border-radius')).toBe('var(--radius-md)');
    // 2 and 6 sit off the spacing scale, which starts at 4 and steps to 8.
    expect(declared('.trigger', 'padding')).toBe('2px 6px');
    expect(declared('.trigger', 'height')).toBe('calc(100% - var(--border-width))');
    // `border: 0`, not absent: a native <button>'s UA border is 2px, and it
    // takes over the moment an author border stops covering it.
    expect(declared('.trigger', 'border')).toBe('0');
    expect(declared('.trigger:focus-visible', 'border-color')).toBeUndefined();
    expect(declared('.trigger:focus-visible', 'box-shadow')).toBe(
      'inset 0 0 0 var(--border-width-focus) var(--ring)',
    );
  });

  it('paints the idle label at the drawn transparency and the icon at one box', () => {
    expect(declared('.trigger', 'color')).toBe(
      'color-mix(in oklab, var(--foreground) 60%, transparent)',
    );
    expect(declared('.trigger:hover', 'color')).toBe('var(--foreground)');
    expect(declared('.trigger svg', 'width')).toBe('var(--icon-size-sm)');
  });

  it('moves only the label between the two size steps', () => {
    expect(declared('.sizeSm .trigger', 'font-size')).toBe('var(--text-label-size)');
    expect(declared('.sizeDefault .trigger', 'font-size')).toBe('var(--text-body-size)');
    // The weight is 500 at both drawn steps, so it stays on the shared rule.
    expect(declared('.trigger', 'font-weight')).toBe('var(--text-label-weight)');
    expect(declared('.sizeSm .trigger', 'font-weight')).toBeUndefined();
  });
});

/*
 * The panel's enter animation. Nothing here asserts that a transition ran
 * - jsdom has no compositor and Base UI owns the timing - so what is
 * checked is the seam the kit actually owns: whether the CSS applies at
 * all, and the two declarations it applies.
 */
describe('Tabs panel enter animation', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tabs.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('marks the active panel as animated by default and drops the mark on opt-out', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b" animate={false}>
          Panel B
        </TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('Panel A').hasAttribute('data-animate')).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(screen.getByText('Panel B').hasAttribute('data-animate')).toBe(false);
  });

  it('does not leak the animate prop to the DOM as an attribute', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('Panel A').hasAttribute('animate')).toBe(false);
  });

  it("fades the panel up over 4px on the list's own duration step", () => {
    // Normalised: the declaration is written over two lines in the source.
    expect(declared('.content[data-animate]', 'transition')?.replace(/\s+/g, ' ')).toBe(
      'opacity var(--duration-tab) var(--ease-standard), translate var(--duration-tab) var(--ease-standard)',
    );
    expect(declared('.content[data-animate][data-starting-style]', 'opacity')).toBe('0');
    expect(declared('.content[data-animate][data-starting-style]', 'translate')).toBe('0 4px');
  });
});
