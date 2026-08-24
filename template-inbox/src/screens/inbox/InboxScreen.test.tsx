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
  it('lists the seeded channels and conversations, and opens the first conversation of the default channel automatically', () => {
    const screen = renderScreen(<InboxScreen t={t} />);

    // "General" is both the channel row and the open pane's own heading.
    expect(screen.getAllByText('General').length).toBe(2);
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Sales')).toBeTruthy();
    // "Design feedback on dashboard" appears twice - the list row and the
    // open thread's own subject line - because it is General's most
    // recently active conversation, auto-selected below.
    expect(screen.getAllByText('Design feedback on dashboard').length).toBe(2);
    // The list opens on General, so a Support-channel subject is not in the pane.
    expect(screen.queryByText('Dark mode toggle not persisting')).toBeNull();
    // General's most recently active conversation opens on its own: no click
    // needed, the empty state is gone, and the composer is ready.
    expect(screen.queryByText('empty_title')).toBeNull();
    expect(screen.getByPlaceholderText('reply_placeholder')).toBeTruthy();

    screen.unmount();
  });

  it('auto-selects the first conversation again on a channel switch, without disturbing a selection made while staying in one', () => {
    const screen = renderScreen(<InboxScreen t={t} />);

    act(() => {
      screen.getByText('Support').click();
    });
    // Support's most recently active conversation, picked automatically -
    // it offers suggested replies, unlike the spam thread selected next.
    expect(screen.queryByText('empty_title')).toBeNull();
    expect(screen.getByLabelText('suggested_replies')).toBeTruthy();

    // A conversation the agent picks by hand must stick while the channel
    // does not change.
    act(() => {
      screen.getByText('Suspicious attachment').click();
    });
    expect(screen.queryByLabelText('suggested_replies')).toBeNull();

    // An unrelated re-render while staying in the same channel (toggling the
    // details panel) must not reset the hand-picked selection back to the
    // channel's auto-picked conversation.
    act(() => {
      screen.getByLabelText('toggle_details').click();
    });
    expect(screen.queryByLabelText('suggested_replies')).toBeNull();

    // Leaving for Sales and coming straight back to Support re-arms the
    // auto-pick: re-entering the channel opens its first conversation again
    // rather than restoring the hand-picked one - the documented, acceptable
    // shape of "auto-select on entering a channel".
    act(() => {
      screen.getByText('Sales').click();
    });
    act(() => {
      screen.getByText('Support').click();
    });
    expect(screen.queryByText('empty_title')).toBeNull();
    expect(screen.getByPlaceholderText('reply_placeholder')).toBeTruthy();

    screen.unmount();
  });

  it('offers the thread its suggested replies and drafts the one that is clicked', () => {
    const screen = renderScreen(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
    // Support's most recently active conversation is "Dark mode toggle not
    // persisting", so it is already auto-selected and its subject is
    // already on the page twice (list row plus thread header) - the list
    // row is the first match. The click is a no-op re-selection, kept so
    // the test still exercises the click path.
    act(() => {
      screen.getAllByText('Dark mode toggle not persisting')[0].click();
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
    // Support's most recently active conversation is "Dark mode toggle not
    // persisting", so it is already auto-selected and its subject is
    // already on the page twice (list row plus thread header) - the list
    // row is the first match. The click is a no-op re-selection, kept so
    // the test still exercises the click path.
    act(() => {
      screen.getAllByText('Dark mode toggle not persisting')[0].click();
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
