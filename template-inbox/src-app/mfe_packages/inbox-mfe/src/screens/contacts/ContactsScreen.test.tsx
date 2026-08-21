import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { endpointTags, mutationResult, queryResultFor } from '../../__test-utils__/apiMocks';
import { setPendingContact } from '../../shared/contactSelection';
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

const { ContactsScreen } = await import('./ContactsScreen');

describe('ContactsScreen', () => {
  it('pages the seeded contacts and counts every filter from the same collection', () => {
    const { bridge } = createBridgeFixture();

    const screen = renderScreen(<ContactsScreen bridge={bridge} />);

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

  it('opens the contact a chained open_contact action names, even off the first page', () => {
    const { bridge } = createBridgeFixture();

    const screen = renderScreen(<ContactsScreen bridge={bridge} />);
    // What the contacts lifecycle's action handler does when the second step
    // of a jump from a thread arrives after this screen has already rendered.
    act(() => setPendingContact('r-26'));

    // The detail pane, not the table: Amara is on page two of the list, and
    // the qualification card only exists on a contact's own page.
    expect(screen.getAllByText('Amara Nwosu').length).toBeGreaterThan(0);
    expect(screen.getByText('qualification')).toBeTruthy();

    screen.unmount();
  });

  it('gives the whole pane to a contact page by dropping the directory filters', () => {
    const { bridge } = createBridgeFixture();

    const screen = renderScreen(<ContactsScreen bridge={bridge} />);
    expect(screen.getByLabelText('contact_filters')).toBeTruthy();

    act(() => setPendingContact('r-1'));
    expect(screen.queryByLabelText('contact_filters')).toBeNull();

    screen.unmount();
  });
});
