import { act } from 'react';
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

  it('offers the thread its suggested replies and drafts the one that is clicked', () => {
    const { bridge } = createBridgeFixture();

    const screen = renderScreen(<InboxScreen bridge={bridge} />);
    act(() => {
      screen.getByText('Dark mode toggle not persisting').click();
    });

    const chip = screen.getByText('Could you share your browser?');
    expect(screen.getByText('Can you try clearing local storage?')).toBeTruthy();

    // The chip drafts, it does not send: the text lands in the reply box.
    // Found by its placeholder, because the tab and its panel answer to the
    // "reply" label too.
    const draft = screen.getByPlaceholderText('reply_placeholder');
    expect(draft instanceof HTMLTextAreaElement).toBe(true);
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error('composer is not a textarea');
    expect(draft.value).toBe('');
    act(() => {
      chip.click();
    });
    expect(draft.value).toBe('Could you share your browser?');

    screen.unmount();
  });

  it('offers no suggested reply on a spam thread', () => {
    const { bridge } = createBridgeFixture();

    const screen = renderScreen(<InboxScreen bridge={bridge} />);
    act(() => {
      screen.getByText('Spam').click();
    });
    act(() => {
      screen.getByText('Suspicious attachment').click();
    });

    // The composer is there to reply with; the assistant just has nothing
    // worth suggesting, so the row itself is absent.
    expect(screen.getByPlaceholderText('reply_placeholder')).toBeTruthy();
    expect(screen.queryByLabelText('suggested_replies')).toBeNull();

    screen.unmount();
  });
});
