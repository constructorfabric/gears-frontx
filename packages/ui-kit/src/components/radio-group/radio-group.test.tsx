import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RadioGroup, RadioGroupItem } from './radio-group';
import styles from './radio-group.module.css';

afterEach(cleanup);

function renderGroup(props: Parameters<typeof RadioGroup>[0] = {}) {
  return render(
    <RadioGroup aria-label="Tier" {...props}>
      <RadioGroupItem value="free" aria-label="Free" />
      <RadioGroupItem value="pro" aria-label="Pro" />
      <RadioGroupItem value="enterprise" aria-label="Enterprise" disabled />
    </RadioGroup>,
  );
}

describe('RadioGroup', () => {
  it('renders a radiogroup with radio items and kit classes', () => {
    renderGroup();
    const group = screen.getByRole('radiogroup', { name: 'Tier' });
    expect(group.className).toContain(styles.group);
    const items = screen.getAllByRole('radio');
    expect(items).toHaveLength(3);
    expect(items[0]?.className).toContain(styles.item);
  });

  it('selects an item on click and reports through onValueChange', () => {
    const onValueChange = vi.fn();
    renderGroup({ onValueChange });
    const pro = screen.getByRole('radio', { name: 'Pro' });
    fireEvent.click(pro);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange.mock.calls[0]?.[0]).toBe('pro');
    expect(pro.getAttribute('aria-checked')).toBe('true');
    expect(pro.hasAttribute('data-checked')).toBe(true);
  });

  it('keeps selection exclusive', () => {
    renderGroup({ defaultValue: 'free' });
    const free = screen.getByRole('radio', { name: 'Free' });
    const pro = screen.getByRole('radio', { name: 'Pro' });
    expect(free.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(pro);
    expect(free.getAttribute('aria-checked')).toBe('false');
    expect(pro.getAttribute('aria-checked')).toBe('true');
  });

  it('ignores clicks on a disabled item', () => {
    const onValueChange = vi.fn();
    renderGroup({ onValueChange });
    const disabledItem = screen.getByRole('radio', { name: 'Enterprise' });
    fireEvent.click(disabledItem);
    expect(onValueChange).not.toHaveBeenCalled();
    // The item is a <span>, so the disabled style hangs off data-disabled.
    expect(disabledItem.hasAttribute('data-disabled')).toBe(true);
  });
});
