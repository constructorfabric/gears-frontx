import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRecordingLoad,
  lastFilters,
  renderFiltersGrid,
} from '../../../../__test-utils__/filters-grid';
import { messages } from '../../messages';
import barStyles from './components/filters-bar.module.css';
import { filterCheckboxGroup } from './entities/checkbox-group/filter-checkbox-group';
import { filterSearch } from './entities/search/filter-search';
import { filterTagGroup } from './entities/tag-group/filter-tag-group';
import { filterToggle } from './entities/toggle/filter-toggle';

const statusOptions = [
  { label: 'Published', value: 'published' },
  { label: 'Draft', value: 'draft' },
  { label: 'Archived', value: 'archived' },
];

// The search chip applies after one second of no typing; the wait is real time, because Testing
// Library's async wrapper only knows Jest's fake timers and hangs user-event under Vitest's.
const afterSearchDebounce = { timeout: 3000 };

function chip(name: string) {
  return screen.getByRole('button', { name: new RegExp(`^${name}`) });
}

beforeEach(() => {
  localStorage.clear();
});

describe('toggle filter', () => {
  it('turns the filter on and off with its chip, loading each time', async () => {
    const { user, load } = await renderFiltersGrid({
      entities: [filterToggle({ id: 'onlyActive', label: 'Only active' })],
    });
    expect(lastFilters(load)).toBeUndefined();

    await user.click(chip('Only active'));
    await waitFor(() => expect(lastFilters(load)).toEqual({ onlyActive: { value: true } }));
    expect(chip('Only active').className).toContain('active');

    await user.click(chip('Only active'));
    await waitFor(() => expect(lastFilters(load)).toBeUndefined());
    expect(chip('Only active').className).not.toContain('active');
  });
});

describe('search filter', () => {
  it('applies what was typed once typing stops, and not on every key', async () => {
    const { user, load } = await renderFiltersGrid({
      entities: [filterSearch({ id: 'query', label: 'Query' })],
    });
    const loadsAtStart = load.mock.calls.length;

    await user.click(chip('Query'));
    await user.type(await screen.findByRole('textbox'), 'ali');

    expect(screen.getByRole('textbox')).toHaveValue('ali');
    expect(load).toHaveBeenCalledTimes(loadsAtStart);

    await waitFor(
      () => expect(lastFilters(load)).toEqual({ query: { value: 'ali' } }),
      afterSearchDebounce,
    );
    expect(load).toHaveBeenCalledTimes(loadsAtStart + 1);
  });

  it('removes the filter, and what is stored for it, when the box is emptied', async () => {
    const { user, load, storageKey } = await renderFiltersGrid({
      entities: [filterSearch({ id: 'query', label: 'Query' })],
    });
    await user.click(chip('Query'));
    await user.type(await screen.findByRole('textbox'), 'a');
    await waitFor(
      () => expect(lastFilters(load)).toEqual({ query: { value: 'a' } }),
      afterSearchDebounce,
    );

    await user.clear(screen.getByRole('textbox'));

    await waitFor(() => expect(lastFilters(load)).toBeUndefined(), afterSearchDebounce);
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('drops a pending search when the grid goes away', async () => {
    const { user, load, unmount, storageKey } = await renderFiltersGrid({
      entities: [filterSearch({ id: 'query', label: 'Query' })],
    });
    await user.click(chip('Query'));
    await user.type(await screen.findByRole('textbox'), 'ali');
    const loads = load.mock.calls.length;

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 1300));

    expect(load).toHaveBeenCalledTimes(loads);
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('fills the box from a stored search, and follows a reset', async () => {
    const entities = [filterSearch({ id: 'query', label: 'Query' })];
    const first = await renderFiltersGrid({ entities, name: 'search_stored' });
    await first.user.click(chip('Query'));
    await first.user.type(await screen.findByRole('textbox'), 'bob');
    await waitFor(
      () => expect(lastFilters(first.load)).toEqual({ query: { value: 'bob' } }),
      afterSearchDebounce,
    );
    first.unmount();

    const second = await renderFiltersGrid({ entities, name: 'search_stored' });
    expect(lastFilters(second.load)).toEqual({ query: { value: 'bob' } });
    await second.user.click(chip('Query'));
    expect(await screen.findByRole('textbox')).toHaveValue('bob');

    await second.user.click(screen.getByRole('button', { name: messages.filters.reset }));

    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    expect(lastFilters(second.load)).toBeUndefined();
  });

  it('stays reset when Reset is pressed while an edit waits to apply', async () => {
    const { user, load } = await renderFiltersGrid({
      entities: [filterSearch({ id: 'query', label: 'Query' })],
    });
    await user.click(chip('Query'));
    await user.type(await screen.findByRole('textbox'), 'bob');
    await waitFor(
      () => expect(lastFilters(load)).toEqual({ query: { value: 'bob' } }),
      afterSearchDebounce,
    );

    await user.type(screen.getByRole('textbox'), 'by');
    await user.click(screen.getByRole('button', { name: messages.filters.reset }));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));

    // Past the debounce, the edit made before the reset doesn't come back.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(lastFilters(load)).toBeUndefined();
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('still applies an edit made after a search was applied', async () => {
    const { user, load } = await renderFiltersGrid({
      entities: [filterSearch({ id: 'query', label: 'Query' })],
    });
    await user.click(chip('Query'));
    await user.type(await screen.findByRole('textbox'), 'bob');
    await waitFor(
      () => expect(lastFilters(load)).toEqual({ query: { value: 'bob' } }),
      afterSearchDebounce,
    );

    await user.type(screen.getByRole('textbox'), 'by');

    await waitFor(
      () => expect(lastFilters(load)).toEqual({ query: { value: 'bobby' } }),
      afterSearchDebounce,
    );
    expect(screen.getByRole('textbox')).toHaveValue('bobby');
  });
});

describe('checkbox group filter', () => {
  const entity = () => [
    filterCheckboxGroup({ id: 'status', label: 'Status', options: statusOptions }),
  ];

  it('applies each choice at once, shows how many are chosen and resets them', async () => {
    const { user, load, storageKey } = await renderFiltersGrid({ entities: entity() });

    await user.click(chip('Status'));
    await user.click(await screen.findByRole('checkbox', { name: 'Published' }));
    await waitFor(() => expect(lastFilters(load)).toEqual({ status: { value: ['published'] } }));

    await user.click(screen.getByRole('checkbox', { name: 'Archived' }));
    await waitFor(() =>
      expect(lastFilters(load)).toEqual({ status: { value: ['published', 'archived'] } }),
    );
    expect(chip('Status')).toHaveTextContent('2');
    expect(JSON.parse(localStorage.getItem(storageKey) ?? 'null')).toEqual({
      status: { value: ['published', 'archived'] },
    });

    await user.click(screen.getByRole('checkbox', { name: 'Published' }));
    await waitFor(() => expect(lastFilters(load)).toEqual({ status: { value: ['archived'] } }));

    await user.click(screen.getByRole('button', { name: messages.filters.reset }));
    await waitFor(() => expect(lastFilters(load)).toBeUndefined());
    expect(chip('Status')).not.toHaveTextContent('1');
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('keeps Reset disabled while nothing is chosen', async () => {
    const { user } = await renderFiltersGrid({ entities: entity() });

    await user.click(chip('Status'));

    expect(await screen.findByRole('button', { name: messages.filters.reset })).toBeDisabled();
  });

  it('shows the search box above five options, and narrows the list by label without regard to case', async () => {
    const many = Array.from({ length: 6 }, (_, index) => ({
      label: `Option ${index + 1}`,
      value: index + 1,
    }));
    const { user } = await renderFiltersGrid({
      entities: [filterCheckboxGroup({ id: 'many', label: 'Many', options: many })],
    });

    await user.click(chip('Many'));
    await user.type(
      await screen.findByPlaceholderText(messages.filters.searchPlaceholder),
      'OPTION 4',
    );

    expect(
      screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-checked')),
    ).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Option 4' })).toBeInTheDocument();
  });

  it('has no search box for five options or fewer, unless asked for', async () => {
    const first = await renderFiltersGrid({ entities: entity() });
    await first.user.click(chip('Status'));
    await screen.findByRole('checkbox', { name: 'Published' });
    expect(screen.queryByPlaceholderText(messages.filters.searchPlaceholder)).toBeNull();
    first.unmount();

    const second = await renderFiltersGrid({
      entities: [
        filterCheckboxGroup({
          id: 'status',
          label: 'Status',
          options: statusOptions,
          search: true,
        }),
      ],
    });
    await second.user.click(chip('Status'));
    expect(
      await screen.findByPlaceholderText(messages.filters.searchPlaceholder),
    ).toBeInTheDocument();
  });

  it('searches a label that is a number, and passes over one that is not text', async () => {
    const { user } = await renderFiltersGrid({
      entities: [
        filterCheckboxGroup({
          id: 'ranks',
          label: 'Ranks',
          options: [
            { label: 1, value: 1 },
            { label: 12, value: 12 },
            { label: 30, value: 30 },
            { label: 4, value: 4 },
            { label: 5, value: 5 },
            { label: <b>twelve</b>, value: 'twelve' },
          ],
        }),
      ],
    });
    await user.click(chip('Ranks'));

    await user.type(await screen.findByPlaceholderText(messages.filters.searchPlaceholder), '12');

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: '12' })).toBeInTheDocument();
  });

  it('draws an option from its own component when it has one', async () => {
    const { user } = await renderFiltersGrid({
      entities: [
        filterCheckboxGroup({
          id: 'status',
          label: 'Status',
          options: [
            {
              label: 'Published',
              value: 'published',
              component: ({ option }) => <b>{`custom ${option.value}`}</b>,
            },
          ],
        }),
      ],
    });

    await user.click(chip('Status'));

    expect(await screen.findByText('custom published')).toBeInTheDocument();
  });

  describe('with options from a resolver', () => {
    function resolverOf(roles: string[]) {
      return vi.fn(async (query: string) =>
        roles
          .filter((role) => role.toLowerCase().includes(query.toLowerCase()))
          .map((role) => ({ label: role, value: role })),
      );
    }

    it('asks for the first page when opened, and applies a choice from it', async () => {
      const resolver = resolverOf(['Administrator', 'Learner']);
      const { user, load } = await renderFiltersGrid({
        entities: [
          filterCheckboxGroup({ id: 'role', label: 'Role', options: resolver, searchDebounce: 0 }),
        ],
      });
      expect(resolver).not.toHaveBeenCalled();

      await user.click(chip('Role'));
      await user.click(await screen.findByRole('checkbox', { name: 'Administrator' }));

      expect(resolver).toHaveBeenCalledWith('');
      await waitFor(() =>
        expect(lastFilters(load)).toEqual({ role: { value: ['Administrator'] } }),
      );
    });

    it('shows a spinner until the first page comes', async () => {
      const never = vi.fn(() => new Promise<never>(() => undefined));
      const { user } = await renderFiltersGrid({
        entities: [
          filterCheckboxGroup({ id: 'role', label: 'Role', options: never, searchDebounce: 0 }),
        ],
      });

      await user.click(chip('Role'));

      expect(await screen.findByRole('status')).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('searches through the resolver with the trimmed term, always showing the box', async () => {
      const resolver = resolverOf(['Administrator', 'Learner', 'Instructor']);
      const { user } = await renderFiltersGrid({
        entities: [
          filterCheckboxGroup({ id: 'role', label: 'Role', options: resolver, searchDebounce: 0 }),
        ],
      });
      await user.click(chip('Role'));
      await screen.findByRole('checkbox', { name: 'Learner' });

      await user.type(screen.getByPlaceholderText(messages.filters.searchPlaceholder), ' lear ');

      await waitFor(() => expect(resolver).toHaveBeenLastCalledWith('lear'));
      await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(1));
      expect(screen.getByRole('checkbox', { name: 'Learner' })).toBeInTheDocument();
    });

    it('says there are no options when the resolver finds none, or fails', async () => {
      const failing = vi.fn(() => Promise.reject(new Error('down')));
      const { user } = await renderFiltersGrid({
        entities: [
          filterCheckboxGroup({ id: 'role', label: 'Role', options: failing, searchDebounce: 0 }),
        ],
      });

      await user.click(chip('Role'));

      expect(await screen.findByText(messages.filters.noOptionsFound)).toBeInTheDocument();
    });
  });
});

describe('tag group filter', () => {
  it('lets several tags be chosen, each applied at once', async () => {
    const { user, load } = await renderFiltersGrid({
      entities: [filterTagGroup({ id: 'tags', label: 'Tags', options: statusOptions })],
    });

    await user.click(chip('Tags'));
    await user.click(await screen.findByRole('checkbox', { name: 'Published' }));
    await user.click(screen.getByRole('checkbox', { name: 'Draft' }));

    await waitFor(() =>
      expect(lastFilters(load)).toEqual({ tags: { value: ['published', 'draft'] } }),
    );
    expect(chip('Tags')).toHaveTextContent('2');

    await user.click(screen.getByRole('checkbox', { name: 'Published' }));
    await waitFor(() => expect(lastFilters(load)).toEqual({ tags: { value: ['draft'] } }));
  });

  it('lets one tag be chosen in radio mode, a new choice replacing the old', async () => {
    const { user, load } = await renderFiltersGrid({
      entities: [
        filterTagGroup({ id: 'tags', label: 'Tags', options: statusOptions, mode: 'radio' }),
      ],
    });

    await user.click(chip('Tags'));
    await user.click(await screen.findByRole('radio', { name: 'Published' }));
    await waitFor(() => expect(lastFilters(load)).toEqual({ tags: { value: ['published'] } }));

    await user.click(screen.getByRole('radio', { name: 'Draft' }));

    await waitFor(() => expect(lastFilters(load)).toEqual({ tags: { value: ['draft'] } }));
    expect(screen.getByRole('radio', { name: 'Published' })).not.toBeChecked();
  });

  it('shows the search box above ten tags', async () => {
    const options = Array.from({ length: 11 }, (_, index) => ({
      label: `Tag ${index}`,
      value: index,
    }));
    const { user } = await renderFiltersGrid({
      entities: [filterTagGroup({ id: 'tags', label: 'Tags', options })],
    });

    await user.click(chip('Tags'));
    await user.type(
      await screen.findByPlaceholderText(messages.filters.searchPlaceholder),
      'tag 10',
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });
});

describe('the filters bar', () => {
  it('names a chip from its column when the filter has no label of its own', async () => {
    await renderFiltersGrid({ entities: [filterToggle({ id: 'name' })] });

    expect(chip('Name')).toBeInTheDocument();
  });

  it('finds that column inside a column group too', async () => {
    await renderFiltersGrid({
      entities: [filterToggle({ id: 'owner' })],
      columns: [
        { id: 'name', label: 'Name' },
        { id: 'people', label: 'People', columns: [{ id: 'owner', label: 'Owner' }] },
      ],
    });

    expect(chip('Owner')).toBeInTheDocument();
  });

  it('refuses a filter that has neither a label nor a column of its id', async () => {
    // The refusal is an error thrown while the bar renders, so it is reported to the window and the
    // grid never gets as far as its table.
    const reported: string[] = [];
    const onError = (event: ErrorEvent) => {
      reported.push(event.message);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await renderFiltersGrid({ entities: [filterToggle({ id: 'nowhere' })] }).catch(
        () => undefined,
      );
    } finally {
      window.removeEventListener('error', onError);
      error.mockRestore();
    }

    expect(reported.join()).toMatch(/Label for "nowhere" is not defined/);
  });

  it('shows the All filters chip only for filters that have a panel section', async () => {
    const withoutPanel = await renderFiltersGrid({
      entities: [
        filterToggle({ id: 'flag', label: 'Flag' }),
        filterSearch({ id: 'query', label: 'Query' }),
      ],
    });
    expect(screen.queryByRole('button', { name: messages.filters.allFilters })).toBeNull();
    withoutPanel.unmount();

    const withPanel = await renderFiltersGrid({
      entities: [filterCheckboxGroup({ id: 'status', label: 'Status', options: statusOptions })],
    });
    expect(screen.getByRole('button', { name: messages.filters.allFilters })).toBeInTheDocument();
    // The chip travels with the last quick filter, as one group (rules in filters-bar.module.css.test.ts).
    const allFilters = screen.getByRole('button', { name: messages.filters.allFilters });
    expect(allFilters.parentElement).toHaveClass(barStyles.tail);
    expect(allFilters.previousElementSibling).toBe(chip('Status'));
    withPanel.unmount();

    await renderFiltersGrid({
      entities: [filterCheckboxGroup({ id: 'status', label: 'Status', options: statusOptions })],
      isAllFiltersOptionVisible: false,
    });
    expect(screen.queryByRole('button', { name: messages.filters.allFilters })).toBeNull();
  });

  it('keeps the last quick filter open while a filter is added after it and taken away', async () => {
    const status = filterCheckboxGroup({ id: 'status', label: 'Status', options: statusOptions });
    const { user, setEntities } = await renderFiltersGrid({ entities: [status] });
    await user.click(chip('Status'));
    const draft = await screen.findByRole('checkbox', { name: 'Draft' });

    setEntities([status, filterToggle({ id: 'flag', label: 'Flag' })]);
    expect(screen.getByRole('checkbox', { name: 'Draft' })).toBe(draft);

    setEntities([status]);
    expect(screen.getByRole('checkbox', { name: 'Draft' })).toBe(draft);
  });
});

describe('persistence', () => {
  it('keeps the filters under one key, and drops the key when none is left', async () => {
    const { user, storageKey } = await renderFiltersGrid({
      entities: [
        filterToggle({ id: 'flag', label: 'Flag' }),
        filterCheckboxGroup({ id: 'status', label: 'Status', options: statusOptions }),
      ],
    });
    expect(localStorage.getItem(storageKey)).toBeNull();

    await user.click(chip('Flag'));
    await user.click(chip('Status'));
    await user.click(await screen.findByRole('checkbox', { name: 'Draft' }));

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(storageKey) ?? 'null')).toEqual({
        flag: { value: true },
        status: { value: ['draft'] },
      }),
    );

    // Clicking the toggle closed the popover; the other filter is cleared from a fresh one.
    await user.click(chip('Flag'));
    await user.click(chip('Status'));
    await user.click(await screen.findByRole('button', { name: messages.filters.reset }));
    await waitFor(() => expect(localStorage.getItem(storageKey)).toBeNull());
  });

  it('reads the filters back from the storage the grid is set to use', async () => {
    sessionStorage.setItem(
      'dataGrid:session_grid:filters',
      JSON.stringify({ flag: { value: true } }),
    );
    const load = createRecordingLoad();

    await renderFiltersGrid({
      entities: [filterToggle({ id: 'flag', label: 'Flag' })],
      name: 'session_grid',
      persistent: 'sessionStorage',
      load,
    });

    expect(lastFilters(load)).toEqual({ flag: { value: true } });
    expect(within(screen.getByRole('table')).getByText('Alice')).toBeInTheDocument();
    sessionStorage.clear();
  });
});
