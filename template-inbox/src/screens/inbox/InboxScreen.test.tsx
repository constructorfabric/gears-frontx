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
    // Support's pinned conversation (c-1, "Silver Sunshine from India") is
    // auto-selected ahead of c-9 - its own most-recently-active row - the
    // pin overriding recency even though c-1 is itself snoozed and offers
    // no suggested replies.
    expect(screen.queryByText('empty_title')).toBeNull();
    expect(screen.queryByLabelText('suggested_replies')).toBeNull();
    expect(screen.getAllByText('Silver Sunshine from India').length).toBeGreaterThan(0);

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
    // Support's auto-selected row is its pinned conversation (c-1), not
    // this one, so this click actually switches the thread rather than
    // being a no-op re-selection.
    act(() => {
      screen.getAllByText('Dark mode toggle not persisting')[0].click();
    });

    const chip = screen.getByText('Share your browser?');
    expect(screen.getByText('Clear local storage?')).toBeTruthy();

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
    expect(draft.value).toBe('Share your browser?');

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

  it('renders every rich message type in a transcript: image, file, and an inline link', () => {
    const screen = renderScreen(<InboxScreen t={t} />);

    // "Design feedback on dashboard" (c-11, General's most active thread, open
    // by default) is the showcase thread: its m-11-3 is a file-only message
    // carrying TWO attachments at once - a bare card per file, no bubble.
    // Both names also appear in the customer panel's own "Shared files" list
    // (`conversation.sharedFiles`, a separate field), hence two matches each.
    expect(screen.getAllByText('dashboard-mockup.png').length).toBe(2);
    expect(screen.getAllByText('248 KB').length).toBe(2);
    expect(screen.getAllByText('design-spec.pdf').length).toBe(2);
    expect(screen.getAllByText('92 KB').length).toBe(2);
    // Its own m-11-4 embeds an inline link too, right in the default thread.
    const showcaseLink = screen.getByText('our roadmap');
    expect(showcaseLink.tagName).toBe('A');

    act(() => {
      screen.getByText('Sales').click();
    });
    act(() => {
      screen.getAllByText('Purple Bow from United States')[0].click();
    });
    // c-7's last message (m-7-3) is an image with a caption - the <img> and
    // caption text both render, and the caption doubles as its alt text.
    const image = screen.getByAltText(
      'Here is how the license page renders on our side, for reference.'
    );
    expect(image instanceof HTMLImageElement).toBe(true);
    if (image instanceof HTMLImageElement) {
      expect(image.src).toContain('/message-assets/preview-chart.svg');
    }

    act(() => {
      screen.getByText('Support').click();
    });
    act(() => {
      screen.getAllByText('Dark mode toggle not persisting')[0].click();
    });
    // c-9's last message (m-9-9) embeds one inline link - rendered as a real
    // anchor, not markdown text, and opened in a new tab so a dead demo href
    // never hijacks the app's own hash router.
    const link = screen.getByText('our help page');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('#');
    expect(link.getAttribute('target')).toBe('_blank');

    screen.unmount();
  });

  it('groups a transcript into day dividers and drops the old under-bubble meta line', () => {
    const screen = renderScreen(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
    act(() => {
      screen.getAllByText('Dark mode toggle not persisting')[0].click();
    });

    // Every seeded message in this thread falls on "Aug 21, 2026", so exactly
    // one divider opens the transcript - not one per message.
    expect(screen.getAllByText('Aug 21').length).toBe(1);

    // The in-bubble timestamp replaces the old footer text entirely: no more
    // "8:31 AM - Seen" / "8:31 AM - Not seen" line under the bubble.
    expect(screen.queryByText(/ - (Seen|Not seen)$/)).toBeNull();
    expect(screen.getByText('8:31 AM')).toBeTruthy();

    screen.unmount();
  });

  it('groups pinned conversations under their own label, ahead of the rest', () => {
    const screen = renderScreen(<InboxScreen t={t} />);

    // General opens by default; its own pinned conversation (c-11, the
    // showcase thread) renders under a "Pinned" label, ahead of its two
    // unpinned siblings.
    expect(screen.getByText('pinned')).toBeTruthy();
    expect(screen.getByLabelText('pinned_conversation')).toBeTruthy();

    act(() => {
      screen.getByText('Sales').click();
    });
    // Sales' own pinned conversation (c-2, "Refund request...") leads its
    // list even though c-7 ("Purple Bow...") is more recently active -
    // both a rendering and an ordering check, read off the list pane's own
    // DOM order (row order is not otherwise observable through RTL's
    // query API).
    const listText = screen.getByLabelText('conversations').textContent ?? '';
    const refundIndex = listText.indexOf('Refund request');
    const purpleBowIndex = listText.indexOf('Purple Bow');
    expect(refundIndex).toBeGreaterThanOrEqual(0);
    expect(purpleBowIndex).toBeGreaterThan(refundIndex);

    screen.unmount();
  });

  it('sends a thread reader to the customer page as a link the URL can carry', () => {
    const screen = renderScreen(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
    // Support's auto-selected row is its pinned conversation (c-1), not
    // this one, so this click actually switches the thread rather than
    // being a no-op re-selection.
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
