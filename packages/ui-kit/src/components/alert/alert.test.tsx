import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { declaredIn } from '../../__test-utils__/css-rules';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './alert';
import styles from './alert.module.css';

afterEach(cleanup);

function renderAlert() {
  return render(
    <Alert data-testid="alert">
      <AlertTitle>Update available</AlertTitle>
      <AlertDescription>A new version is ready to install.</AlertDescription>
      <AlertAction>
        <button type="button">Install</button>
      </AlertAction>
    </Alert>,
  );
}

describe('Alert', () => {
  it('renders with role="alert" and the base + default variant class', () => {
    renderAlert();
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain(styles.alert);
    expect(alert.className).toContain(styles.variantDefault);
  });

  it('applies the destructive variant class', () => {
    render(<Alert variant="destructive">Failed</Alert>);
    expect(screen.getByRole('alert').className).toContain(styles.variantDestructive);
  });

  it('renders every part with its kit class', () => {
    renderAlert();
    expect(screen.getByText('Update available').className).toContain(styles.alertTitle);
    expect(screen.getByText('A new version is ready to install.').className).toContain(
      styles.alertDescription,
    );
    expect(screen.getByRole('button', { name: 'Install' }).parentElement?.className).toContain(
      styles.alertAction,
    );
  });

  it('merges a consumer className without dropping the kit class', () => {
    render(<Alert className="consumer">content</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain(styles.alert);
    expect(alert.className).toContain('consumer');
  });

  it('does not leak the variant prop to the DOM as an attribute', () => {
    render(<Alert variant="destructive">content</Alert>);
    expect(screen.getByRole('alert').hasAttribute('variant')).toBe(false);
  });

  it.each([
    ['AlertTitle', AlertTitle, styles.alertTitle],
    ['AlertDescription', AlertDescription, styles.alertDescription],
    ['AlertAction', AlertAction, styles.alertAction],
  ] as const)('merges a consumer className on %s without dropping the kit class', (_name, Part, kitClass) => {
    render(<Part data-testid="part" className="consumer" />);
    const part = screen.getByTestId('part');
    expect(part.className).toContain(kitClass);
    expect(part.className).toContain('consumer');
  });

  it('forwards native div props such as onClick to any part', () => {
    const onClick = vi.fn();
    render(
      <Alert>
        <AlertAction onClick={onClick}>dismiss</AlertAction>
      </Alert>,
    );
    fireEvent.click(screen.getByText('dismiss'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('AlertTitle render', () => {
  it('renders the same div with the same class and no extra attributes without render', () => {
    render(<AlertTitle data-testid="title">Title</AlertTitle>);
    const title = screen.getByTestId('title');
    expect(title.tagName).toBe('DIV');
    expect(title.className).toBe(styles.alertTitle);
    expect(title.getAttributeNames().sort()).toEqual(['class', 'data-testid']);
  });

  it('renders a heading that keeps the title class', () => {
    render(
      <AlertTitle render={<h3 />}>Title</AlertTitle>
    );
    const heading = screen.getByRole('heading', { level: 3, name: 'Title' });
    expect(heading.className).toContain(styles.alertTitle);
    expect(heading.className).toContain(styles.renderedTitle);
  });

  it('resets a rendered title to the look of the div at zero specificity', () => {
    const declaredRule = declaredIn(import.meta.url, 'alert.module.css');
    expect(declaredRule(':where(.renderedTitle)', 'margin')).toBe('0');
    expect(declaredRule(':where(.renderedTitle)', 'font-size')).toBe('inherit');
  });
});
