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
});
