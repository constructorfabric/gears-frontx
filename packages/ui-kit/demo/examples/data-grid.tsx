import {
  Badge,
  Button,
  createDataGridOrderOption,
  DataGrid,
  DataGridEmptyStatePlugin,
  DataGridOrderPlugin,
  DataGridPaginationPlugin,
  DataGridTextSearchPlugin,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  useDataGrid,
  type DataGridTextSearchFilterValue,
  type DataGridLoadContext,
  type DataGridLoadResult,
  type DataGridTableColumn,
} from '@gears-frontx/ui-kit';
import { UsersIcon } from 'lucide-react';

import { Section } from '../shared';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'Admin' | 'Editor' | 'Viewer';
  status: 'Active' | 'Invited' | 'Suspended';
  createdAt: string;
}

const NAMES = [
  'Aisha Rahman',
  'Morgan Lee',
  'Priya Nair',
  'Jordan Blake',
  'Sam Okafor',
  'Lena Fischer',
  'Diego Alvarez',
  'Mei Tanaka',
  'Noah Becker',
  'Zara Hussain',
];
const ROLES: User['role'][] = ['Admin', 'Editor', 'Viewer'];
const STATUSES: User['status'][] = ['Active', 'Active', 'Invited', 'Suspended'];

// 57 rows, so the last page is a short one and the page count is not a round number.
const users: User[] = Array.from({ length: 57 }, (_, index) => {
  const name = `${NAMES[index % NAMES.length]} ${Math.floor(index / NAMES.length) + 1}`;
  return {
    id: index + 1,
    name,
    email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.com`,
    role: ROLES[index % ROLES.length],
    status: STATUSES[index % STATUSES.length],
    createdAt: new Date(Date.UTC(2026, index % 12, (index % 27) + 1)).toISOString().slice(0, 10),
  };
});

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

/*
 * A server in miniature. `load` is the whole contract between the grid and its data: it gets what
 * the plugins collected (the page, the search text, the order) and the abort signal, and returns
 * one page of rows with the total. Here the "server" is a filter, a sort and a slice over an array,
 * after a short wait so the refetch overlay has something to show.
 */
async function loadUsers({
  pagination,
  filters,
  order,
  signal,
}: DataGridLoadContext): Promise<DataGridLoadResult<User>> {
  await sleep(500, signal);

  const search = (filters?.textSearch as DataGridTextSearchFilterValue | undefined)?.value
    ?.trim()
    .toLowerCase();
  let matching = search
    ? users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search))
    : [...users];

  const sort = order?.[0];
  if (sort) {
    const key = SORT_KEYS[sort.column] ?? 'name';
    const direction = sort.direction === 'asc' ? 1 : -1;
    matching = matching.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * direction);
  }

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 10;
  return {
    results: matching.slice((page - 1) * limit, page * limit),
    total: matching.length,
  };
}

// A column id is snake_case; the field it shows is `key`. Sorting asks the server for an id.
const SORT_KEYS: Record<string, keyof User> = {
  name: 'name',
  email: 'email',
  role: 'role',
  status: 'status',
  created_at: 'createdAt',
};

const STATUS_VARIANT = { Active: 'secondary', Invited: 'outline', Suspended: 'destructive' } as const;

const columns: DataGridTableColumn<User>[] = [
  { id: 'name', label: 'Name' },
  { id: 'email', label: 'Email', cellOverflow: 'nowrap' },
  { id: 'role', label: 'Role', width: 120 },
  {
    id: 'status',
    label: 'Status',
    width: 120,
    render: (user) => <Badge variant={STATUS_VARIANT[user.status]}>{user.status}</Badge>,
  },
  { id: 'created_at', key: 'createdAt', label: 'Created', width: 140 },
];

const ORDER_OPTIONS = [
  createDataGridOrderOption({ id: 'name', label: 'Name' }),
  createDataGridOrderOption({ id: 'created_at', label: 'Created', type: 'date' }),
];

// The grid's own `columns` and each plugin's props are compared by reference or by content; keeping
// the array out of the render body is what stops a re-render from being read as a change.
const EXCLUDED_FROM_ORDER = ['status'];

/** A grid with the server-style trio: search, header sorting and pagination. */
function UsersGrid() {
  return (
    <DataGrid name="demo_users" persistent="memory" load={loadUsers} columns={columns}>
      <DataGridTextSearchPlugin placeholder="Search users" />
      <DataGridOrderPlugin
        options={ORDER_OPTIONS}
        excludedColumns={EXCLUDED_FROM_ORDER}
        defaultOrder={{ id: 'name', direction: 'asc' }}
      />
      <DataGridPaginationPlugin defaultLimit={10} limits={[10, 20, 50]} />
    </DataGrid>
  );
}

function NoUsersYet() {
  const { useStore } = useDataGrid();
  const hasActiveFilters = useStore((s) => s.hasActiveFilters);

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UsersIcon />
        </EmptyMedia>
        <EmptyTitle>{hasActiveFilters ? 'No matching users' : 'No users yet'}</EmptyTitle>
        <EmptyDescription>
          {hasActiveFilters ? 'Try a different name or email.' : 'Invite the first one to get going.'}
        </EmptyDescription>
      </EmptyHeader>
      {!hasActiveFilters && <Button>Invite a user</Button>}
    </Empty>
  );
}

function loadNothing(): Promise<DataGridLoadResult<User>> {
  return Promise.resolve({ results: [], total: 0 });
}

/** Your own component in place of the built-in "No results found". */
function CustomEmptyGrid() {
  return (
    <DataGrid name="demo_users_empty" persistent="memory" load={loadNothing} columns={columns}>
      <DataGridTextSearchPlugin placeholder="Search users" />
      <DataGridEmptyStatePlugin component={NoUsersYet} />
    </DataGrid>
  );
}

const STICKY_COLUMNS: DataGridTableColumn<User>[] = [
  { id: 'name', label: 'Name', width: 220, sticky: true },
  { id: 'email', label: 'Email', width: 320 },
  { id: 'role', label: 'Role', width: 200 },
  { id: 'status', label: 'Status', width: 200 },
  { id: 'created_at', key: 'createdAt', label: 'Created', width: 200 },
];

// The grid scrolls inside whatever bounds it, so the frame has a height and lays its child out as a
// flex column (see "stickyHeader" in data-grid.md for what the chain must look like).
const STICKY_FRAME = { display: 'flex', flexDirection: 'column', height: 280 } as const;

/** A header that stays put while the rows scroll, and a pinned first column. */
function StickyGrid() {
  return (
    <div style={STICKY_FRAME}>
      <DataGrid
        name="demo_users_sticky"
        persistent="memory"
        load={loadUsers}
        columns={STICKY_COLUMNS}
        stickyHeader
      >
        <DataGridPaginationPlugin defaultLimit={20} limits={[20, 50]} />
      </DataGrid>
    </div>
  );
}

export default function DataGridExample() {
  return (
    <>
      <Section title="Search, sorting and pagination">
        <UsersGrid />
      </Section>

      <Section title="Custom empty state">
        <CustomEmptyGrid />
      </Section>

      <Section title="Sticky header and pinned column">
        <StickyGrid />
      </Section>
    </>
  );
}
