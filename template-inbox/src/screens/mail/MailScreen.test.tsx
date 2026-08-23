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
  it('lists the seeded mailboxes and opens on Inbox, without a mail selected', () => {
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
    // because the list opens on Inbox.
    expect(screen.getByText('Priya Natarajan')).toBeTruthy();
    expect(screen.queryByText('Tariq Haddad')).toBeNull();

    expect(screen.getByText('no_mail_selected_title')).toBeTruthy();
    // Nothing is selected on mount, so there is no reply box to type into yet.
    expect(screen.queryByPlaceholderText('reply_to_placeholder')).toBeNull();

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
    act(() => {
      screen.getByText('Priya Natarajan').click();
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

    // Unread within Inbox.
    expect(screen.getByText('Priya Natarajan')).toBeTruthy();
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
    expect(screen.queryByText('Priya Natarajan')).toBeNull();

    screen.unmount();
  });

  it('gates Send on empty input', () => {
    const screen = renderScreen(<MailScreen t={t} />);
    act(() => {
      screen.getByText('Priya Natarajan').click();
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
