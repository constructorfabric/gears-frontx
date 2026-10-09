import { screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '../../../__test-utils__/render-with-user';
import { ToggleGroupItem } from '../../toggle-group/public.js';
import { Segment } from './segment';

describe('Segment', () => {
  it('shows the chosen value as the pressed item', () => {
    render(
      <Segment value="b" aria-label="Size">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
      </Segment>,
    );

    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the pressed item as a single value, and undefined when it is pressed again', async () => {
    const onValueChange = vi.fn();
    function Host() {
      const [value, setValue] = useState<string | undefined>('a');
      return (
        <Segment
          value={value}
          onValueChange={(next) => {
            onValueChange(next);
            setValue(next);
          }}
          aria-label="Size"
        >
          <ToggleGroupItem value="a">A</ToggleGroupItem>
          <ToggleGroupItem value="b">B</ToggleGroupItem>
        </Segment>
      );
    }
    const { user } = render(<Host />);

    await user.click(screen.getByRole('button', { name: 'B' }));
    expect(onValueChange).toHaveBeenLastCalledWith('b');

    await user.click(screen.getByRole('button', { name: 'B' }));
    expect(onValueChange).toHaveBeenLastCalledWith(undefined);
  });

  it('keeps its own state when it is given no value', async () => {
    const { user } = render(
      <Segment aria-label="Size">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
      </Segment>,
    );

    await user.click(screen.getByRole('button', { name: 'A' }));

    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
  });
});
