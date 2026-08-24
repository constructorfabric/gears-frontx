import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { endpointTags, mutationResult, queryResultFor } from '../../__test-utils__/apiMocks';
import { renderScreen } from '../../__test-utils__/renderScreen';

vi.mock('../../api/registry', () => ({ getMailApi: () => endpointTags }));
vi.mock('../../api/queries', () => ({
  useApiQuery: queryResultFor,
  useApiMutation: mutationResult,
}));

const { MailScreen } = await import('./MailScreen');

const t = (key: string) => key;

/**
 * React tracks a controlled input's previous value on the DOM node itself, so
 * assigning `.value` directly and dispatching a plain `input` event is a
 * no-op - React sees no change to fire `onChange` for. Going through the
 * native value setter first is what makes the dispatch register, the
 * standard workaround for typing into a controlled field under jsdom.
 */
function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('MailScreen', () => {
  it('lists the seeded mailboxes and opens on Inbox, with its first mail selected automatically', () => {
    const screen = renderScreen(<MailScreen t={t} />);

    // "Inbox" is both the mailbox nav row and the list pane's own heading.
    expect(screen.getAllByText('Inbox').length).toBe(2);
    expect(screen.getByText('Drafts')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByText('Archive')).toBeTruthy();
    expect(screen.getByText('Trash')).toBeTruthy();
    // Spam is out of the product; the sidebar must never grow a sixth row.
    expect(screen.queryByText('Spam')).toBeNull();

    // Inbox correspondents render; a Drafts-only correspondent does not,
    // because the list opens on Inbox. "Priya Natarajan" appears twice now -
    // the list row and the reading pane's own subtitle - because her mail is
    // the one auto-selected below.
    expect(screen.getAllByText('Priya Natarajan').length).toBe(2);
    expect(screen.queryByText('Tariq Haddad')).toBeNull();

    // Inbox's most recently received mail opens on its own: no click needed,
    // the empty state is gone, and the reply box is ready.
    expect(screen.queryByText('no_mail_selected_title')).toBeNull();
    expect(screen.getByPlaceholderText('reply_to_placeholder')).toBeTruthy();

    screen.unmount();
  });

  it('auto-selects the first mail again on a mailbox switch, without disturbing a hand-picked selection', () => {
    const screen = renderScreen(<MailScreen t={t} />);

    // Inbox's own first mail, picked automatically.
    expect(screen.queryByText('no_mail_selected_title')).toBeNull();

    // A mail the agent picks by hand must stick while the mailbox does not
    // change: toggling the history disclosure forces a re-render. "Priya
    // Natarajan" already appears twice (list row plus reading pane
    // subtitle) because her mail is the one auto-selected; the list row is
    // the first match.
    act(() => {
      screen.getAllByText('Priya Natarajan')[0].click();
    });
    expect(screen.getByText(/The headcount section is still rough/)).toBeTruthy();
    act(() => {
      screen.getByText('Devon Ashworth').click();
    });
    expect(screen.getByText(/Let me know if the reset link does not arrive/)).toBeTruthy();
    act(() => {
      screen.getByText('earlier_messages').click();
    });
    expect(screen.getByText(/Let me know if the reset link does not arrive/)).toBeTruthy();

    // Switching to Sent and back to Inbox re-arms the auto-pick: re-entering
    // the mailbox opens its first mail again rather than restoring the
    // hand-picked one - the documented, acceptable shape of "auto-select on
    // entering a mailbox".
    act(() => {
      screen.getByText('Sent').click();
    });
    act(() => {
      // "Inbox" is both the mailbox nav row and the list pane's own heading
      // once it is the active one again; the nav row is the first match.
      screen.getAllByText('Inbox')[0].click();
    });
    expect(screen.queryByText('no_mail_selected_title')).toBeNull();
    expect(screen.getByPlaceholderText('reply_to_placeholder')).toBeTruthy();

    screen.unmount();
  });

  it('opens a mail, and keeps its history collapsed until the toggle is used', () => {
    const screen = renderScreen(<MailScreen t={t} />);
    act(() => {
      screen.getByText('Devon Ashworth').click();
    });

    // The focused (newest) message renders flat; the two earlier ones stay
    // behind the toggle until it is clicked. The sentence checked below is
    // unique to the body - the list row's own preview line shares the
    // message's opening words but is cut short before it.
    expect(screen.getByText(/Let me know if the reset link does not arrive/)).toBeTruthy();
    expect(screen.queryByText(/Could we get staging access set up/)).toBeNull();

    // The mock `t` returns the key verbatim, so the toggle reads the raw
    // `earlier_messages` key rather than the interpolated "2 earlier
    // messages" sentence a real translation would produce.
    act(() => {
      screen.getByText('earlier_messages').click();
    });
    expect(screen.getByText(/Could we get staging access set up/)).toBeTruthy();

    screen.unmount();
  });

  it('renders no history toggle for a mail with none', () => {
    const screen = renderScreen(<MailScreen t={t} />);
    // Priya's mail is already open (Inbox's auto-selected first mail), so
    // "Priya Natarajan" is already on the page twice - the list row is the
    // first match.
    act(() => {
      screen.getAllByText('Priya Natarajan')[0].click();
    });

    // Unique to the body, not the row's own subject-plus-snippet preview.
    expect(screen.getByText(/The headcount section is still rough/)).toBeTruthy();
    expect(screen.queryByText('earlier_messages')).toBeNull();

    screen.unmount();
  });

  it('filters to unread mail within the selected mailbox', () => {
    const screen = renderScreen(<MailScreen t={t} />);

    act(() => {
      screen.getByText('unread_mail_count').click();
    });

    // Unread within Inbox, and still the mail auto-selected on mount, so
    // "Priya Natarajan" is on the page twice - the unread-tab row and the
    // still-open reading pane.
    expect(screen.getAllByText('Priya Natarajan').length).toBe(2);
    // Read within Inbox, so it drops out of the Unread tab.
    expect(screen.queryByText('Ava Laurent')).toBeNull();

    screen.unmount();
  });

  it('filters instantly by correspondent and subject as the search box is typed', () => {
    const screen = renderScreen(<MailScreen t={t} />);

    const search = screen.getByPlaceholderText('search_mail');
    if (!(search instanceof HTMLInputElement)) throw new Error('search field is not an input');

    act(() => {
      typeInto(search, 'devon');
    });

    expect(screen.getByText('Devon Ashworth')).toBeTruthy();
    // The search narrows the list away from Priya's row, but her mail is
    // still the one auto-selected and open in the reading pane - the same
    // "search narrows the list without closing what is open" rule Chat
    // follows - so one mention of her name remains (the reading pane's).
    expect(screen.getAllByText('Priya Natarajan').length).toBe(1);

    screen.unmount();
  });

  it('gates Send on empty input', () => {
    const screen = renderScreen(<MailScreen t={t} />);
    // Priya's mail is already open (Inbox's auto-selected first mail).
    act(() => {
      screen.getAllByText('Priya Natarajan')[0].click();
    });

    const send = screen.getByText('send').closest('button');
    if (send === null) throw new Error('send button not found');
    expect(send.hasAttribute('disabled') || send.getAttribute('aria-disabled') === 'true').toBe(
      true
    );

    const draft = screen.getByPlaceholderText('reply_to_placeholder');
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error('composer is not a textarea');
    act(() => {
      typeInto(draft, 'Sounds good, thanks.');
    });

    expect(send.hasAttribute('disabled') || send.getAttribute('aria-disabled') === 'true').toBe(
      false
    );

    act(() => {
      send.click();
    });
    // Sending clears the draft rather than posting anywhere or appending to
    // the thread - the owner's "keep it simple" directive for this control.
    expect(draft.value).toBe('');

    screen.unmount();
  });
});
