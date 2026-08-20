import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DateRange } from 'react-day-picker';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatePicker } from './date-picker';

afterEach(cleanup);

// Wednesday — deterministic enough for the assertions below, which only
// care about the formatted label and which day cell got clicked, not about
// week-row layout the way calendar.test.tsx's Monday pin does.
const JAN_15_2024 = new Date(2024, 0, 15);

function openTrigger(name: RegExp | string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('DatePicker (button variant, single mode)', () => {
  it('shows the placeholder when nothing is selected, and opens a calendar on click', () => {
    const onSelect = vi.fn();
    render(<DatePicker selected={undefined} onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'Pick a date' })).toBeTruthy();
    openTrigger('Pick a date');
    expect(screen.getByRole('grid')).toBeTruthy();
  });

  it('formats the selected date onto the trigger', () => {
    render(<DatePicker selected={JAN_15_2024} onSelect={vi.fn()} />);
    // date-fns 'PPP' — "January 15th, 2024".
    expect(screen.getByRole('button', { name: /January 15th, 2024/ })).toBeTruthy();
  });

  it('picking a day calls onSelect and closes the popover', async () => {
    const onSelect = vi.fn();
    render(<DatePicker selected={undefined} onSelect={onSelect} />);
    openTrigger('Pick a date');
    // Popover content portals to document.body by default (see popover.tsx)
    // — outside `container`, so day cells are found by role, not container.
    const dayCell = screen.getByRole('grid').querySelector('[data-day]');
    expect(dayCell).not.toBeNull();
    const dayButton = dayCell?.querySelector('button');
    fireEvent.click(dayButton as HTMLButtonElement);
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull());
  });

  it('keeps the popover open across a selection when closeOnSelect is false', () => {
    const onSelect = vi.fn();
    render(<DatePicker selected={undefined} onSelect={onSelect} closeOnSelect={false} />);
    openTrigger('Pick a date');
    const dayButton = screen.getByRole('grid').querySelector('[data-day] button');
    fireEvent.click(dayButton as HTMLButtonElement);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('grid')).toBeTruthy();
  });
});

describe('DatePicker (range mode)', () => {
  it('shows the placeholder, then both endpoints once a range is selected', () => {
    const { rerender } = render(<DatePicker mode="range" selected={undefined} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Pick a date' })).toBeTruthy();

    const range: DateRange = { from: new Date(2024, 0, 10), to: new Date(2024, 0, 12) };
    rerender(<DatePicker mode="range" selected={range} onSelect={vi.fn()} />);
    // date-fns 'LLL dd, y' on both ends, joined with " - ".
    expect(screen.getByRole('button', { name: /Jan 10, 2024 - Jan 12, 2024/ })).toBeTruthy();
  });

  it('opens two months by default (numberOfMonths=2)', () => {
    render(<DatePicker mode="range" selected={undefined} onSelect={vi.fn()} />);
    openTrigger('Pick a date');
    expect(screen.getAllByRole('grid').length).toBe(2);
  });
});

describe('DatePicker (input variant)', () => {
  it('renders a typed field and commits a parseable date on change', () => {
    const onSelect = vi.fn();
    render(<DatePicker variant="input" selected={undefined} onSelect={onSelect} placeholder="June 01, 2025" />);
    const input = screen.getByPlaceholderText('June 01, 2025');
    fireEvent.change(input, { target: { value: 'June 1, 2025' } });
    expect(onSelect).toHaveBeenCalledTimes(1);
    const committed = onSelect.mock.calls[0]?.[0] as Date;
    expect(committed.getFullYear()).toBe(2025);
    expect(committed.getMonth()).toBe(5);
    expect(committed.getDate()).toBe(1);
  });

  it('does not commit while the typed value is not yet a valid date', () => {
    const onSelect = vi.fn();
    render(<DatePicker variant="input" selected={undefined} onSelect={onSelect} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'June' } });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clears the selection when the field is emptied', () => {
    const onSelect = vi.fn();
    render(<DatePicker variant="input" selected={JAN_15_2024} onSelect={onSelect} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it('opens the calendar from the trailing icon button', () => {
    render(<DatePicker variant="input" selected={undefined} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    expect(screen.getByRole('grid')).toBeTruthy();
  });
});

describe('DatePicker captionLayout passthrough', () => {
  it('renders dropdown month/year navigation when captionLayout="dropdown"', () => {
    render(<DatePicker selected={undefined} onSelect={vi.fn()} captionLayout="dropdown" />);
    openTrigger('Pick a date');
    // Portaled to document.body (see popover.tsx) — outside `container`.
    expect(document.querySelectorAll('select').length).toBe(2);
  });
});
