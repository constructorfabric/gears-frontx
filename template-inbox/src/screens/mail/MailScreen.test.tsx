import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen as domScreen, within } from '@testing-library/dom';
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

// `screen` (from `renderScreen`) only ever queries inside its own mounted
// container - but the kit's Dialog portals its popup straight to
// `document.body` by default (dialog.md), a sibling of that container, not
// a descendant. `domScreen`, `@testing-library/dom`'s own document-wide
// singleton, is what reaches the compose dialog's own fields and buttons
// once it is open.

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
    // because the list opens on Inbox. "Ava Laurent" appears twice now - the
    // list row and the reading pane's own subtitle - because her mail
    // (ml-3, seeded pinned) is the one auto-selected below, ahead of
    // Priya's own more recent row.
    expect(screen.getAllByText('Ava Laurent').length).toBe(2);
    expect(screen.getAllByText('Priya Natarajan').length).toBe(1);
    expect(screen.queryByText('Tariq Haddad')).toBeNull();

    // Inbox's most recently received mail opens on its own: no click needed,
    // the empty state is gone, and the reply box is ready.
    expect(screen.queryByText('no_mail_selected_title')).toBeNull();
    expect(screen.getByPlaceholderText('reply_to_placeholder')).toBeTruthy();

    screen.unmount();
  });

  it('auto-selects the first mail again on a mailbox switch, without disturbing a hand-picked selection', () => {
    const screen = renderScreen(<MailScreen t={t} />);

    // Inbox's own pinned mail (ml-3, Ava Laurent), picked automatically
    // ahead of Priya's more recent one.
    expect(screen.queryByText('no_mail_selected_title')).toBeNull();
    expect(screen.getAllByText('Ava Laurent').length).toBe(2);

    // A mail the agent picks by hand must stick while the mailbox does not
    // change: toggling the history disclosure forces a re-render. "Priya
    // Natarajan" is findable once (the list row) before this click.
    act(() => {
      screen.getByText('Priya Natarajan').click();
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
    // Ava's mail (Inbox's own pinned, auto-selected first mail) is open by
    // default; hand-pick Priya's instead - it has no history of its own.
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

    // Unread within Inbox, so Priya's own row shows in the Unread tab's list.
    expect(screen.getByText('Priya Natarajan')).toBeTruthy();
    // Ava's mail is read, so it drops out of the Unread tab's own list -
    // but it is still the one open in the reading pane (auto-selected,
    // pinned), which a tab switch never closes.
    expect(screen.getAllByText('Ava Laurent').length).toBe(1);

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
    // The search narrows the list away from Ava's row, but her mail is
    // still the one auto-selected and open in the reading pane - the same
    // "search narrows the list without closing what is open" rule Chat
    // follows - so one mention of her name remains (the reading pane's).
    expect(screen.getAllByText('Ava Laurent').length).toBe(1);

    screen.unmount();
  });

  it('groups pinned mail under its own label, ahead of the rest, within the current tab', () => {
    const screen = renderScreen(<MailScreen t={t} />);

    // Inbox opens by default; its two pinned mails (ml-3 Ava Laurent, ml-6
    // Carlos Mendez) render under a "Pinned" label, each with its own pin
    // icon.
    expect(screen.getByText('pinned')).toBeTruthy();
    expect(screen.getAllByLabelText('pinned_mail').length).toBe(2);

    // Carlos Mendez's mail (ml-6) is Inbox's OTHER pinned row and its own
    // least recently received - it still leads Priya's and Devon's more
    // recent, unpinned ones, read off the list pane's own DOM order.
    const listText = screen.getByLabelText('Inbox').textContent ?? '';
    const carlosIndex = listText.indexOf('Carlos Mendez');
    const priyaIndex = listText.indexOf('Priya Natarajan');
    expect(carlosIndex).toBeGreaterThanOrEqual(0);
    expect(priyaIndex).toBeGreaterThan(carlosIndex);

    // Switching to the Unread tab keeps the pinned group's own filtering
    // rule: a pinned-but-read mail (Ava, Carlos) drops out of Unread same
    // as any other read mail would.
    act(() => {
      screen.getByText('unread_mail_count').click();
    });
    expect(screen.queryByText('Carlos Mendez')).toBeNull();

    screen.unmount();
  });

  it('gates Send on empty input', () => {
    const screen = renderScreen(<MailScreen t={t} />);
    // Ava's mail (Inbox's own pinned, auto-selected first mail) is open by
    // default; hand-pick Priya's instead.
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

  it('composes a mail and sends it into the Sent mailbox, gated on To plus (Subject or Body)', () => {
    const screen = renderScreen(<MailScreen t={t} />);

    act(() => {
      screen.getByLabelText('compose').click();
    });
    const toField = domScreen.getByLabelText('compose_to_label');
    const subjectField = domScreen.getByLabelText('compose_subject_label');
    if (!(toField instanceof HTMLInputElement)) throw new Error('to field is not an input');
    if (!(subjectField instanceof HTMLInputElement)) throw new Error('subject field is not an input');
    expect(document.activeElement).toBe(toField);

    // The reading pane's own reply composer has a "send" button of its own,
    // still in the document (Base UI leaves the underlying page mounted,
    // just `aria-hidden`, while a dialog is open) - `within` the dialog is
    // what keeps this query pointed at the compose dialog's Send instead of
    // colliding with that one.
    const dialog = within(domScreen.getByRole('dialog'));

    // To alone is not enough - the exact rule is To plus at least one of
    // Subject/Body.
    act(() => {
      typeInto(toField, 'devon@brightlabs.io');
    });
    expect(dialog.getByText('send').closest('button')?.disabled).toBe(true);

    act(() => {
      typeInto(subjectField, 'Follow-up on staging access');
    });
    expect(dialog.getByText('send').closest('button')?.disabled).toBe(false);

    act(() => {
      dialog.getByText('send').click();
    });

    // The dialog closed, and the new mail is a real Sent row - switching
    // there shows it, count included.
    expect(domScreen.queryByLabelText('compose_to_label')).toBeNull();
    act(() => {
      screen.getByText('Sent').click();
    });
    // The nav row's own badge, scoped to the mailbox sidebar itself - once
    // switched, the list pane's own heading also reads "Sent", and its
    // badge count can coincidentally match another mailbox's digit too.
    const sentNavButton = within(screen.getByLabelText('mail')).getByText('Sent').closest('button');
    expect(sentNavButton?.textContent).toContain('3');
    expect(screen.getByText('devon@brightlabs.io')).toBeTruthy();
    // The list row renders "{subject} - {snippet}" as one combined text
    // node - an exact-match `getByText` on the bare subject would never hit,
    // so this checks the substring instead.
    expect(screen.getAllByText(/Follow-up on staging access/).length).toBeGreaterThan(0);

    screen.unmount();
  });

  it('discards the compose draft on Cancel', () => {
    const screen = renderScreen(<MailScreen t={t} />);

    act(() => {
      screen.getByLabelText('compose').click();
    });
    const toField = domScreen.getByLabelText('compose_to_label');
    if (!(toField instanceof HTMLInputElement)) throw new Error('to field is not an input');
    act(() => {
      typeInto(toField, 'devon@brightlabs.io');
    });

    act(() => {
      domScreen.getByText('cancel').click();
    });
    expect(domScreen.queryByLabelText('compose_to_label')).toBeNull();

    act(() => {
      screen.getByText('Sent').click();
    });
    // Sent still reads 2 - nothing was appended. Scoped the same way as the
    // note above.
    const sentNavButton = within(screen.getByLabelText('mail')).getByText('Sent').closest('button');
    expect(sentNavButton?.textContent).toContain('2');
    expect(screen.queryByText('devon@brightlabs.io')).toBeNull();

    screen.unmount();
  });
});
