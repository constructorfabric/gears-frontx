import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InputOtp, InputOtpGroup, InputOtpSeparator, InputOtpSlot } from './input-otp';
import styles from './input-otp.module.css';

afterEach(cleanup);

function renderOtp(props: Partial<ComponentProps<typeof InputOtp>> = {}) {
  return render(
    <InputOtp length={4} aria-label="Verification code" {...props}>
      <InputOtpGroup>
        <InputOtpSlot />
        <InputOtpSlot />
      </InputOtpGroup>
      <InputOtpSeparator />
      <InputOtpGroup>
        <InputOtpSlot />
        <InputOtpSlot />
      </InputOtpGroup>
    </InputOtp>,
  );
}

describe('InputOtp', () => {
  it('renders one real input per slot, in order', () => {
    renderOtp();
    const slots = document.querySelectorAll(`.${styles.slot}`);
    expect(slots).toHaveLength(4);
    for (const slot of slots) {
      expect(slot.tagName).toBe('INPUT');
    }
  });

  it('renders the separator between groups', () => {
    renderOtp();
    expect(screen.getByRole('separator')).not.toBeNull();
  });

  it('types into the first slot and auto-advances to the next', () => {
    renderOtp();
    const slots = Array.from(document.querySelectorAll(`.${styles.slot}`)) as HTMLInputElement[];
    const first = slots[0] as HTMLInputElement;
    first.focus();
    fireEvent.change(first, { target: { value: '1' } });
    // Base UI stamps boolean state as attribute presence, not a
    // "true"/"false" string (same idiom as data-pressed/data-checked
    // elsewhere in the kit).
    expect(first.hasAttribute('data-filled')).toBe(true);
    expect(document.activeElement).toBe(slots[1]);
  });

  it('reports the assembled value through onValueChange and completion through onValueComplete', () => {
    const onValueChange = vi.fn();
    const onValueComplete = vi.fn();
    renderOtp({ onValueChange, onValueComplete });
    const slots = Array.from(document.querySelectorAll(`.${styles.slot}`)) as HTMLInputElement[];
    for (const [index, slot] of slots.entries()) {
      fireEvent.change(slot, { target: { value: String(index + 1) } });
    }
    expect(onValueChange).toHaveBeenLastCalledWith('1234', expect.anything());
    expect(onValueComplete).toHaveBeenCalledWith('1234', expect.anything());
  });

  it('rejects non-numeric input under the default numeric validation', () => {
    const onValueInvalid = vi.fn();
    renderOtp({ onValueInvalid });
    const first = document.querySelector(`.${styles.slot}`) as HTMLInputElement;
    fireEvent.change(first, { target: { value: 'a' } });
    expect(onValueInvalid).toHaveBeenCalled();
    expect(first.hasAttribute('data-filled')).toBe(false);
  });

  it('disables every slot and merges a consumer className on the root', () => {
    const { container } = renderOtp({ disabled: true, className: 'consumer' });
    const root = container.querySelector(`.${styles.root}`);
    expect(root?.className).toContain('consumer');
    const slots = document.querySelectorAll(`.${styles.slot}`);
    for (const slot of slots) {
      expect((slot as HTMLInputElement).disabled).toBe(true);
    }
  });
});

describe('InputOtp slot names', () => {
  it('names every slot from the aria-label on the root', () => {
    renderOtp();
    const slots = screen.getAllByRole('textbox', { name: 'Verification code' });
    expect(slots).toHaveLength(4);
  });

  it("keeps a slot's own aria-labelledby", () => {
    render(
      <>
        <span id="own">Own name</span>
        <InputOtp length={2} aria-label="Verification code">
          <InputOtpSlot aria-labelledby="own" />
          <InputOtpSlot />
        </InputOtp>
      </>,
    );
    expect(screen.getAllByRole('textbox', { name: 'Own name' })).toHaveLength(1);
    expect(screen.getAllByRole('textbox', { name: 'Verification code' })).toHaveLength(1);
  });

  it('keeps a slot named by its own aria-label', () => {
    render(
      <InputOtp length={2} aria-label="Verification code">
        <InputOtpSlot />
        <InputOtpSlot aria-label="Digit 2 of 2" />
      </InputOtp>,
    );
    expect(screen.getByRole('textbox', { name: 'Digit 2 of 2' })).toBeDefined();
  });

  it('injects no name when the root has no aria-label, or an empty one', () => {
    const { rerender } = render(
      <InputOtp length={2}>
        <InputOtpSlot />
        <InputOtpSlot />
      </InputOtp>,
    );
    for (const slot of screen.getAllByRole('textbox')) {
      expect(slot.hasAttribute('aria-labelledby')).toBe(false);
    }
    rerender(
      <InputOtp length={2} aria-label="">
        <InputOtpSlot />
        <InputOtpSlot />
      </InputOtp>,
    );
    expect(document.querySelector('span[hidden]')).toBeNull();
    for (const slot of screen.getAllByRole('textbox')) {
      expect(slot.hasAttribute('aria-labelledby')).toBe(false);
    }
  });
});
