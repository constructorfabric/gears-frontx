import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { endpointTags, mutationResult, queryResultFor } from '../../__test-utils__/apiMocks';
import { renderScreen } from '../../__test-utils__/renderScreen';

vi.mock('../../api/registry', () => ({ getInboxApi: () => endpointTags }));
vi.mock('../../api/queries', () => ({
  useApiQuery: queryResultFor,
  useApiMutation: mutationResult,
}));

const { InboxScreen } = await import('./InboxScreen');

const t = (key: string) => key;

describe('InboxScreen', () => {
  it('lists the seeded channels and conversations, and waits for a choice before opening a thread', () => {
    const screen = renderScreen(<InboxScreen t={t} />);

    // "General" is both the channel row and the open pane's own heading.
    expect(screen.getAllByText('General').length).toBe(2);
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Sales')).toBeTruthy();
    expect(screen.getByText('Design feedback on dashboard')).toBeTruthy();
    // The list opens on General, so a Support-channel subject is not in the pane.
    expect(screen.queryByText('Dark mode toggle not persisting')).toBeNull();
    // Nothing is selected on mount: the detail pane is the empty state, and
    // there is no composer to type into yet.
    expect(screen.getByText('empty_title')).toBeTruthy();
    expect(screen.queryByLabelText('reply')).toBeNull();

    screen.unmount();
  });

  it('offers the thread its suggested replies and drafts the one that is clicked', () => {
    const screen = renderScreen(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
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

  it('offers no suggested reply on a spam-tagged thread', () => {
    const screen = renderScreen(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
    act(() => {
      screen.getByText('Suspicious attachment').click();
    });

    // The composer is there to reply with; the assistant just has nothing
    // worth suggesting, so the row itself is absent. The thread sits in a
    // normal channel - spam is a tag here, not a destination.
    expect(screen.getByPlaceholderText('reply_placeholder')).toBeTruthy();
    expect(screen.queryByLabelText('suggested_replies')).toBeNull();

    screen.unmount();
  });

  it('sends a thread reader to the customer page as a link the URL can carry', () => {
    const screen = renderScreen(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
    act(() => {
      screen.getByText('Dark mode toggle not persisting').click();
    });
    act(() => {
      screen.getByText('view_contact').click();
    });

    // The jump is a route change, not screen-local state: that is what lets the
    // same address be reloaded, bookmarked and shared.
    expect(window.location.hash).toBe('#/contacts/r-3');

    screen.unmount();
  });
});
