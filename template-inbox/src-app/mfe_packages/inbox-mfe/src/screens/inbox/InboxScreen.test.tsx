import { describe, expect, it, vi } from 'vitest';
import { endpointTags, mutationResult, queryResultFor } from '../../__test-utils__/apiMocks';
import { createBridgeFixture } from '../../__test-utils__/bridgeFixture';
import { renderScreen } from '../../__test-utils__/renderScreen';

vi.mock('@gears-frontx/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gears-frontx/react')>();
  return {
    ...actual,
    apiRegistry: { getService: () => endpointTags },
    useApiQuery: queryResultFor,
    useApiMutation: mutationResult,
  };
});

vi.mock('../../shared/useScreenTranslations', () => ({
  useScreenTranslations: () => ({ t: (key: string) => key, loading: false }),
}));

const { InboxScreen } = await import('./InboxScreen');

describe('InboxScreen', () => {
  it('lists the seeded folders and conversations, and waits for a choice before opening a thread', () => {
    const { bridge } = createBridgeFixture();

    const screen = renderScreen(<InboxScreen bridge={bridge} />);

    // "Your inbox" is both the folder row and the open pane's own heading.
    expect(screen.getAllByText('Your inbox').length).toBe(2);
    expect(screen.getByText('Spam')).toBeTruthy();
    expect(screen.getByText('Dark mode toggle not persisting')).toBeTruthy();
    // The list opens on "Your inbox", so a spam subject is not in the pane.
    expect(screen.queryByText('You won a prize!!!')).toBeNull();
    // Nothing is selected on mount: the detail pane is the empty state, and
    // there is no composer to type into yet.
    expect(screen.getByText('empty_title')).toBeTruthy();
    expect(screen.queryByLabelText('reply')).toBeNull();

    screen.unmount();
  });
});
