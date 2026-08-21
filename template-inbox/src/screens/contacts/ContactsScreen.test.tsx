import { describe, expect, it, vi } from 'vitest';
import { endpointTags, mutationResult, queryResultFor } from '../../__test-utils__/apiMocks';
import { renderScreen } from '../../__test-utils__/renderScreen';

vi.mock('../../api/registry', () => ({ getInboxApi: () => endpointTags }));
vi.mock('../../api/queries', () => ({
  useApiQuery: queryResultFor,
  useApiMutation: mutationResult,
}));

const { ContactsScreen } = await import('./ContactsScreen');

const t = (key: string) => key;

describe('ContactsScreen', () => {
  it('pages the seeded contacts and counts every filter from the same collection', () => {
    const screen = renderScreen(<ContactsScreen openContactId={null} t={t} />);

    // The five filter counts the reference shows: 29 all, 19 users, 10 leads,
    // 26 active, 8 new.
    for (const count of ['29', '19', '10', '26', '8']) {
      expect(screen.getAllByText(count).length).toBeGreaterThan(0);
    }

    // 25 rows per page, so the first row is on screen and the 26th is not.
    expect(screen.getByText('Grace Park')).toBeTruthy();
    expect(screen.queryByText('Amara Nwosu')).toBeNull();

    screen.unmount();
  });

  it('opens the contact the route names, even one off the first page', () => {
    const screen = renderScreen(<ContactsScreen openContactId="r-26" t={t} />);

    // The detail pane, not the table: Amara is on page two of the list, and
    // the qualification card only exists on a contact's own page.
    expect(screen.getAllByText('Amara Nwosu').length).toBeGreaterThan(0);
    expect(screen.getByText('qualification')).toBeTruthy();

    screen.unmount();
  });

  it('gives the whole pane to a contact page by dropping the directory filters', () => {
    const list = renderScreen(<ContactsScreen openContactId={null} t={t} />);
    expect(list.getByLabelText('contact_filters')).toBeTruthy();
    list.unmount();

    const detail = renderScreen(<ContactsScreen openContactId="r-1" t={t} />);
    expect(detail.queryByLabelText('contact_filters')).toBeNull();
    detail.unmount();
  });
});
