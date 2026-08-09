// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
//
// Contract test for the `PointerEvent` shim installed by the shared
// `vitest.setup.ts`, which every jsdom suite in this template and in every
// scaffolded project loads (host app, packages, and each MFE package through
// `src-app/vitest.mfe.base.ts`). The suite lives here rather than beside the
// setup file because the template root Vitest project runs under `node`, where
// there is no DOM to shim and nothing to prove.
//
// Without the shim, jsdom exposes no `PointerEvent` constructor and the first
// component that constructs one off its owner window, the way Base UI's
// checkbox, radio and switch roots forward a click onto their hidden native
// input, dies with `TypeError: ownerWindow(...).PointerEvent is not a
// constructor` before rendering anything.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

interface PointerReading {
  readonly pointerType: string;
  readonly isPrimary: boolean;
}

describe('shared Vitest setup', () => {
  it('delivers a pointer event constructed off the element owner window to its React handler', () => {
    const readings: PointerReading[] = [];

    render(
      <button
        type="button"
        onPointerDown={(event) => {
          readings.push({
            pointerType: event.pointerType,
            isPrimary: event.isPrimary,
          });
        }}
      >
        toggle
      </button>,
    );

    const target = screen.getByRole('button', { name: 'toggle' });
    const ownerWindow = target.ownerDocument.defaultView;
    if (!ownerWindow) {
      throw new Error('rendered element has no owner window; jsdom environment is missing');
    }

    fireEvent(
      target,
      new ownerWindow.PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'mouse',
        isPrimary: true,
      }),
    );

    expect(readings).toEqual([{ pointerType: 'mouse', isPrimary: true }]);
  });
});
