import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { declarationMap, declaredIn, extractRules } from '../../__test-utils__/css-rules';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from './item';
import styles from './item.module.css';

afterEach(cleanup);

function renderItem() {
  return render(
    <Item data-testid="item">
      <ItemMedia variant="icon">
        <svg data-testid="icon" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Invoice #1024</ItemTitle>
        <ItemDescription>Paid on Jan 4</ItemDescription>
      </ItemContent>
      <ItemActions>
        <button type="button">Download</button>
      </ItemActions>
    </Item>,
  );
}

describe('Item', () => {
  it('renders a div by default, with the base + default variant + default size classes', () => {
    renderItem();
    const item = screen.getByTestId('item');
    expect(item).toHaveProperty('tagName', 'DIV');
    expect(item.className).toContain(styles.item);
    expect(item.className).toContain(styles.variantDefault);
    expect(item.className).toContain(styles.sizeDefault);
  });

  it('applies the outline/muted variant classes and the sm/xs size classes', () => {
    const { rerender } = render(<Item data-testid="item" variant="outline" size="sm" />);
    let item = screen.getByTestId('item');
    expect(item.className).toContain(styles.variantOutline);
    expect(item.className).toContain(styles.sizeSm);

    rerender(<Item data-testid="item" variant="muted" size="xs" />);
    item = screen.getByTestId('item');
    expect(item.className).toContain(styles.variantMuted);
    expect(item.className).toContain(styles.sizeXs);
  });

  it('renders every part with its kit class', () => {
    renderItem();
    expect(screen.getByText('Invoice #1024').parentElement?.className).toContain(styles.itemTitle);
    expect(screen.getByText('Paid on Jan 4').className).toContain(styles.itemDescription);
    expect(screen.getByRole('button', { name: 'Download' }).parentElement?.className).toContain(
      styles.itemActions,
    );
  });

  it('supports the render prop for polymorphism, e.g. rendering as an anchor', () => {
    render(<Item render={<a href="/invoices/1024" />}>Invoice #1024</Item>);
    const link = screen.getByRole('link', { name: 'Invoice #1024' });
    expect(link.className).toContain(styles.item);
    expect(link).toHaveProperty('href', expect.stringContaining('/invoices/1024'));
  });

  it('does not reflect variant/size as data attributes, per the kit-wide no-data-slot convention', () => {
    render(<Item data-testid="item" variant="outline" size="sm" />);
    const item = screen.getByTestId('item');
    expect(item.hasAttribute('data-variant')).toBe(false);
    expect(item.hasAttribute('data-size')).toBe(false);
    expect(item.hasAttribute('data-slot')).toBe(false);
  });

  it('merges a consumer className without dropping the kit class', () => {
    render(<Item data-testid="item" className="consumer" />);
    const item = screen.getByTestId('item');
    expect(item.className).toContain(styles.item);
    expect(item.className).toContain('consumer');
  });

  it('forwards native props such as onClick', () => {
    const onClick = vi.fn();
    render(<Item onClick={onClick}>content</Item>);
    fireEvent.click(screen.getByText('content'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Item inside ItemGroup', () => {
  it('is a list item of the group, and has no role outside one', () => {
    render(
      <>
        <ItemGroup>
          <Item data-testid="grouped">Grouped</Item>
        </ItemGroup>
        <Item data-testid="alone">Alone</Item>
      </>,
    );
    expect(screen.getByRole('list').children[0]).toBe(screen.getByRole('listitem'));
    expect(screen.getByTestId('grouped').getAttribute('role')).toBe('listitem');
    expect(screen.getByTestId('alone').hasAttribute('role')).toBe(false);
  });

  it('keeps the role of a link row and a role the caller passes', () => {
    render(
      <ItemGroup>
        <Item render={<a href="/files/1" />}>Linked</Item>
        <Item role="presentation" data-testid="own">
          Own
        </Item>
      </ItemGroup>,
    );
    const link = screen.getByRole('link', { name: 'Linked' });
    expect(link.parentElement?.getAttribute('role')).toBe('listitem');
    expect(link.parentElement?.className).toBe(styles.itemListItem);
    expect(screen.getByTestId('own').getAttribute('role')).toBe('presentation');
    expect(screen.getByTestId('own').parentElement?.getAttribute('role')).toBe('list');
  });

  it('adds no wrapper when the Item or the rendered element brings its own role', () => {
    render(
      <ItemGroup>
        <Item role="presentation" render={<button type="button" />}>
          Own role on the Item
        </Item>
        <Item render={<li />}>An li row</Item>
      </ItemGroup>,
    );
    const listitems = screen.queryAllByRole('listitem');
    expect(listitems).toHaveLength(1);
    expect(listitems[0]?.tagName).toBe('LI');
    expect(listitems[0]?.parentElement?.getAttribute('role')).toBe('list');
  });

  it('still wraps a row whose element has another role', () => {
    render(
      <ItemGroup>
        <Item render={<button type="button" role="menuitem" />}>Menu row</Item>
      </ItemGroup>,
    );
    expect(screen.getByRole('menuitem').parentElement?.getAttribute('role')).toBe('listitem');
  });

  it('wraps a button row in a list item, and nothing outside a group', () => {
    render(
      <>
        <ItemGroup>
          <Item render={<button type="button" aria-pressed="true" />}>Pressed row</Item>
        </ItemGroup>
        <Item render={<button type="button" />}>Alone</Item>
      </>,
    );
    const pressed = screen.getByRole('button', { name: 'Pressed row' });
    expect(pressed.parentElement?.getAttribute('role')).toBe('listitem');
    expect(screen.getByRole('button', { name: 'Alone' }).parentElement?.hasAttribute('role')).toBe(
      false,
    );
  });

  it('gives no role to an Item nested in a row, or in a group with another role', () => {
    render(
      <>
        <ItemGroup>
          <Item data-testid="row">
            <ItemContent>
              <Item data-testid="nested">Nested</Item>
            </ItemContent>
          </Item>
        </ItemGroup>
        <ItemGroup role="none">
          <Item data-testid="unlisted">Row</Item>
        </ItemGroup>
      </>,
    );
    expect(screen.getByTestId('row').getAttribute('role')).toBe('listitem');
    expect(screen.getByTestId('nested').hasAttribute('role')).toBe(false);
    expect(screen.getByTestId('unlisted').hasAttribute('role')).toBe(false);
  });

  it('keeps the separator out of the accessibility tree', () => {
    render(
      <ItemGroup>
        <Item>One</Item>
        <ItemSeparator />
        <Item>Two</Item>
      </ItemGroup>,
    );
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('ItemTitle truncation', () => {
  it('puts a run of adjacent text children into one ellipsis span', () => {
    const name = 'report';
    render(<ItemTitle data-testid="title">Q3 {name}.pdf</ItemTitle>);
    const title = screen.getByTestId('title');
    expect(title.children).toHaveLength(1);
    const text = title.children[0] as HTMLElement;
    expect(text.tagName).toBe('SPAN');
    expect(text.className).toBe(styles.itemTitleText);
    expect(text.textContent).toBe('Q3 report.pdf');
  });

  it('wraps text passed through a fragment and drops a whitespace-only run between elements', () => {
    const first = 'Jane';
    render(
      <ItemTitle data-testid="title">
        <svg data-testid="icon" /> <svg data-testid="badge" />
        <>
          {first} Doe
        </>
      </ItemTitle>,
    );
    const title = screen.getByTestId('title');
    expect(title.children).toHaveLength(3);
    expect(title.children[0]).toBe(screen.getByTestId('icon'));
    expect(title.children[1]).toBe(screen.getByTestId('badge'));
    expect(title.children[2]?.className).toBe(styles.itemTitleText);
    expect(title.children[2]?.textContent).toBe('Jane Doe');
  });

  it('renders element children as they are, beside the text span', () => {
    render(
      <ItemTitle data-testid="title">
        <svg data-testid="icon" />
        Q3 report.pdf
      </ItemTitle>,
    );
    const title = screen.getByTestId('title');
    expect(title.children[0]).toBe(screen.getByTestId('icon'));
    expect((title.children[1] as HTMLElement).className).toBe(styles.itemTitleText);
  });
});

/*
 * jsdom does no layout, so the declarations the truncation and the link
 * form depend on are read from the module source.
 */
describe('Item drawn rules', () => {
  const declared = declaredIn(import.meta.url, 'item.module.css');
  // The rule bodies of every selector that mentions `needle`, for the
  // multi-line selector lists a single-selector lookup cannot name.
  const rules = (needle: string) =>
    extractRules(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'item.module.css'), 'utf8'),
    )
      .filter((rule) => rule.selector.includes(needle))
      .map((rule) => rule.body);

  it('draws the icon chips on their token pairs', () => {
    expect(declared('.itemMediaVariantChip', 'background-color')).toBe('var(--accent)');
    expect(declared('.itemMediaVariantChip', 'color')).toBe('var(--accent-foreground)');
    expect(declared('.itemMediaVariantChip', 'border-radius')).toBe('var(--radius-md)');
    expect(declared('.itemMediaVariantChipRound', 'background-color')).toBe('var(--secondary)');
    expect(declared('.itemMediaVariantChipRound', 'color')).toBe('var(--primary)');
    expect(declared('.itemMediaVariantChipRound', 'border-radius')).toBe('var(--radius-full)');
  });

  it('caps the title at its column and lets the text span draw the ellipsis', () => {
    expect(declared('.itemTitle', 'max-width')).toBe('100%');
    expect(declared('.itemTitle', 'min-width')).toBe('0');
    expect(declared('.itemTitleText', 'min-width')).toBe('0');
    expect(declared('.itemTitleText', 'overflow')).toBe('hidden');
    expect(declared('.itemTitleText', 'text-overflow')).toBe('ellipsis');
  });

  it('paints list selection with the secondary pair and the current page with the accent pair', () => {
    const selection = rules("[aria-pressed='true']");
    expect(selection.some((rule) => rule.includes('background-color: var(--secondary)'))).toBe(true);
    expect(selection.some((rule) => rule.includes('color: var(--secondary-foreground)'))).toBe(true);
    const current = rules("[aria-current='page']").map((body) => declarationMap(body));
    expect(
      current.some(
        (map) =>
          map.get('background-color') === 'var(--accent)' &&
          map.get('color') === 'var(--accent-foreground)',
      ),
    ).toBe(true);
  });

  it('keeps an anchor root in the text colour, without an underline, with the hover fill', () => {
    expect(declared('.item', 'color')).toBe('inherit');
    expect(declared('.item', 'text-decoration')).toBe('none');
    expect(declared('.item:is(a[href]):hover', 'background-color')).toBe('var(--muted)');
  });
});

describe('ItemDescription lineClamp', () => {
  it('writes no inline style and no unclamp class by default or for an explicit 2, so the default markup is unchanged', () => {
    const { rerender } = render(<ItemDescription>Paid on Jan 4</ItemDescription>);
    for (const lineClamp of [undefined, 2]) {
      rerender(<ItemDescription lineClamp={lineClamp}>Paid on Jan 4</ItemDescription>);
      const description = screen.getByText('Paid on Jan 4');
      expect(description.hasAttribute('style'), String(lineClamp)).toBe(false);
      expect(description.className, String(lineClamp)).toBe(styles.itemDescription);
    }
  });

  it('sets the private line-count property for a count other than 2 and keeps a caller style', () => {
    render(
      <ItemDescription lineClamp={3} style={{ color: 'red' }}>
        Paid on Jan 4
      </ItemDescription>,
    );
    const description = screen.getByText('Paid on Jan 4');
    expect(description.style.getPropertyValue('--_item-line-clamp')).toBe('3');
    expect(description.style.color).toBe('red');
    expect(description.className).not.toContain(styles.itemDescriptionUnclamped);
  });

  it('drops the clamp with a class for "none" and for a count below 1 or not finite, writing no line count', () => {
    const { rerender } = render(<ItemDescription lineClamp="none">Paid on Jan 4</ItemDescription>);
    let description = screen.getByText('Paid on Jan 4');
    expect(description.className).toContain(styles.itemDescription);
    expect(description.className).toContain(styles.itemDescriptionUnclamped);
    expect(description.style.getPropertyValue('--_item-line-clamp')).toBe('');

    for (const lineClamp of [0, Number.POSITIVE_INFINITY]) {
      rerender(<ItemDescription lineClamp={lineClamp}>Paid on Jan 4</ItemDescription>);
      description = screen.getByText('Paid on Jan 4');
      expect(description.className, String(lineClamp)).toContain(styles.itemDescriptionUnclamped);
      expect(description.style.getPropertyValue('--_item-line-clamp'), String(lineClamp)).toBe('');
    }
  });

  it('rounds a fractional count down to whole lines, down to the one-line minimum', () => {
    const { rerender } = render(<ItemDescription lineClamp={3.7}>Paid on Jan 4</ItemDescription>);
    expect(screen.getByText('Paid on Jan 4').style.getPropertyValue('--_item-line-clamp')).toBe('3');
    rerender(<ItemDescription lineClamp={1}>Paid on Jan 4</ItemDescription>);
    expect(screen.getByText('Paid on Jan 4').style.getPropertyValue('--_item-line-clamp')).toBe('1');
  });
});

describe('ItemMedia', () => {
  it('defaults to the default variant and switches to icon/image', () => {
    const { rerender } = render(<ItemMedia data-testid="media" />);
    expect(screen.getByTestId('media').className).toContain(styles.itemMediaVariantDefault);
    rerender(<ItemMedia data-testid="media" variant="icon" />);
    expect(screen.getByTestId('media').className).toContain(styles.itemMediaVariantIcon);
    rerender(<ItemMedia data-testid="media" variant="image" />);
    expect(screen.getByTestId('media').className).toContain(styles.itemMediaVariantImage);
  });
});

describe('ItemGroup', () => {
  it('renders role="list" wrapping its Items', () => {
    render(
      <ItemGroup data-testid="group">
        <Item>One</Item>
        <ItemSeparator />
        <Item>Two</Item>
      </ItemGroup>,
    );
    const group = screen.getByRole('list');
    expect(group).toBe(screen.getByTestId('group'));
    expect(group.className).toContain(styles.itemGroup);
  });
});

describe('ItemHeader / ItemFooter', () => {
  it('render with their own kit classes', () => {
    render(
      <>
        <ItemHeader data-testid="header" />
        <ItemFooter data-testid="footer" />
      </>,
    );
    expect(screen.getByTestId('header').className).toContain(styles.itemHeader);
    expect(screen.getByTestId('footer').className).toContain(styles.itemFooter);
  });
});
