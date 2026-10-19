import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declaredIn } from '../../__test-utils__/css-rules';
import {
  DescriptionListDetails,
  DescriptionListItem,
  DescriptionList,
  DescriptionListTerm,
} from './description-list';
import styles from './description-list.module.css';

afterEach(cleanup);

function Facts(props: { orientation?: 'vertical' | 'horizontal'; size?: 'default' | 'sm' }) {
  return (
    <DescriptionList data-testid="list" orientation={props.orientation} size={props.size}>
      <DescriptionListItem>
        <DescriptionListTerm>Owner</DescriptionListTerm>
        <DescriptionListDetails>Platform team</DescriptionListDetails>
      </DescriptionListItem>
      <DescriptionListItem>
        <DescriptionListTerm>Path</DescriptionListTerm>
        <DescriptionListDetails typography="mono">src/app/main.tsx</DescriptionListDetails>
      </DescriptionListItem>
    </DescriptionList>
  );
}

describe('DescriptionList', () => {
  it('renders dl > div > dt + dd', () => {
    render(<Facts />);
    const list = screen.getByTestId('list');
    expect(list.tagName).toBe('DL');
    const items = Array.from(list.children);
    expect(items.map((item) => item.tagName)).toEqual(['DIV', 'DIV']);
    expect(Array.from(items[0]?.children ?? []).map((child) => child.tagName)).toEqual([
      'DT',
      'DD',
    ]);
    expect(items[0]?.className).toContain(styles.descriptionItem);
    expect(screen.getByText('Owner').className).toContain(styles.descriptionTerm);
    expect(screen.getByText('Platform team').className).toContain(styles.descriptionDetails);
  });

  it('defaults to vertical and the default size', () => {
    render(<Facts />);
    const list = screen.getByTestId('list');
    expect(list.className).toContain(styles.orientationVertical);
    expect(list.className).toContain(styles.sizeDefault);
  });

  it.each([
    ['horizontal', 'default', styles.orientationHorizontal, styles.sizeDefault],
    ['vertical', 'sm', styles.orientationVertical, styles.sizeSm],
  ] as const)('applies %s and %s', (orientation, size, orientationClass, sizeClass) => {
    render(<Facts orientation={orientation} size={size} />);
    const list = screen.getByTestId('list');
    expect(list.className).toContain(orientationClass);
    expect(list.className).toContain(sizeClass);
  });

  it('puts a value on the mono role through its typography', () => {
    render(<Facts />);
    expect(screen.getByText('src/app/main.tsx').className).toContain(styles.typographyMono);
    expect(screen.getByText('Platform team').className).toContain(styles.typographyBody);
  });
});

// jsdom does no layout, so the grid and the roles are read from the module source.
describe('DescriptionList drawn rules', () => {
  const declared = declaredIn(import.meta.url, 'description-list.module.css');

  it('aligns horizontal terms in one column on a subgrid', () => {
    expect(declared('.orientationHorizontal', 'grid-template-columns')).toBe(
      'max-content minmax(0, 1fr)',
    );
    expect(declared('.orientationHorizontal .descriptionItem', 'grid-template-columns')).toBe(
      'subgrid',
    );
  });

  it('draws the term on the muted label role and the value on the body role', () => {
    expect(declared('.descriptionTerm', 'color')).toBe('var(--muted-foreground)');
    expect(declared('.descriptionTerm', 'font-size')).toBe('var(--text-label-size)');
    expect(declared('.descriptionDetails', 'font-size')).toBe('var(--text-body-size)');
    expect(declared('.descriptionDetails', 'margin')).toBe('0');
    expect(declared('.typographyMono', 'font-family')).toBe('var(--font-mono)');
  });
});
