import { act, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '../../../__test-utils__/render-with-user';
import { messages } from '../messages';
import { useDataGridTreeStructure } from '../tree-structure/tree-structure';
import type { DataGridTreeItem } from '../tree-structure/tree-structure-types';
import { createTreePlugin } from './services/plugins/plugins-helpers';
import type { TreePluginContext } from './services/plugins/plugins-types';
import type { TreeSettings } from './services/settings/settings-types';
import { Tree } from './tree';

interface Dept extends DataGridTreeItem {
  id: string;
  parent_id: string | null;
  name: string;
}

// eng
// ├── web
// └── api
// ops
const departments: Dept[] = [
  { id: 'eng', parent_id: null, name: 'Engineering' },
  { id: 'web', parent_id: 'eng', name: 'Web' },
  { id: 'api', parent_id: 'eng', name: 'API' },
  { id: 'ops', parent_id: null, name: 'Operations' },
];

const leafIds = new Set(['web', 'api', 'ops']);

type TestTreeProps = Partial<Omit<TreeSettings<Dept>, 'treeStructure'>> & {
  items?: Dept[];
  children?: ReactNode;
};

function TestTree({ items = departments, children, ...settings }: TestTreeProps) {
  const treeStructure = useDataGridTreeStructure<Dept>({
    items,
    parentKey: 'parent_id',
    isLeaf: (item) => leafIds.has(item.id),
  });

  return (
    <Tree name="test" treeStructure={treeStructure} label="name" {...settings}>
      {children}
    </Tree>
  );
}

// A plugin made of whatever a test wants to register on the tree.
function pluginOf(setup: (context: TreePluginContext<Dept>) => void, name = 'test') {
  return createTreePlugin<Dept, string>(name, (context) => {
    setup(context);
    return {};
  });
}

function item(name: string) {
  return screen.getByRole('treeitem', { name });
}

function visibleNames() {
  return screen.getAllByRole('treeitem').map((row) => row.textContent);
}

describe('Tree', () => {
  it('lists the top level, with each item told where it stands among its siblings', () => {
    render(<TestTree ariaLabel="Departments" />);

    expect(screen.getByRole('tree', { name: 'Departments' })).toBeInTheDocument();
    expect(visibleNames()).toEqual(['Engineering', 'Operations']);
    expect(item('Engineering')).toHaveAttribute('aria-level', '1');
    expect(item('Engineering')).toHaveAttribute('aria-setsize', '2');
    expect(item('Operations')).toHaveAttribute('aria-posinset', '2');
  });

  it('marks only a directory as expandable, and expands it from its button', async () => {
    const { user } = render(<TestTree />);

    expect(item('Engineering')).toHaveAttribute('aria-expanded', 'false');
    expect(item('Operations')).not.toHaveAttribute('aria-expanded');
    expect(within(item('Operations')).queryByRole('button')).toBeNull();

    await user.click(
      within(item('Engineering')).getByRole('button', { name: messages.tree.expand }),
    );

    expect(visibleNames()).toEqual(['Engineering', 'Web', 'API', 'Operations']);
    expect(item('Engineering')).toHaveAttribute('aria-expanded', 'true');
    expect(item('Web')).toHaveAttribute('aria-level', '2');
    expect(item('API')).toHaveAttribute('aria-posinset', '2');

    await user.click(
      within(item('Engineering')).getByRole('button', { name: messages.tree.collapse }),
    );

    expect(visibleNames()).toEqual(['Engineering', 'Operations']);
  });

  it('labels an item from a property or from a function', () => {
    const { unmount } = render(<TestTree label="id" />);
    expect(visibleNames()).toEqual(['eng', 'ops']);
    unmount();

    render(<TestTree label={(department) => department.name.toUpperCase()} />);
    expect(visibleNames()).toEqual(['ENGINEERING', 'OPERATIONS']);
  });

  it('calls click for a click on the row, but not for one on the expand button', async () => {
    const click = vi.fn();
    const { user } = render(<TestTree click={click} />);

    await user.click(within(item('Engineering')).getByRole('button'));
    expect(click).not.toHaveBeenCalled();

    await user.click(item('Operations'));
    expect(click).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledWith({ id: 'ops', item: departments[3] });
  });

  it('shows only the items the filter keeps, and follows a new filter', () => {
    const { rerender } = render(<TestTree filter={(department) => department.id !== 'ops'} />);
    expect(visibleNames()).toEqual(['Engineering']);

    rerender(<TestTree filter={() => true} />);
    expect(visibleNames()).toEqual(['Engineering', 'Operations']);
  });

  describe('placeholder', () => {
    it('stands in for an empty tree and for a directory without children', async () => {
      const { unmount } = render(<TestTree items={[]} />);
      expect(screen.getByText(messages.tree.noItems)).toBeInTheDocument();
      expect(screen.queryAllByRole('treeitem')).toHaveLength(0);
      unmount();

      // Nothing marks `solo` as a leaf, so it is a directory with nothing in it.
      const { user } = render(<TestTree items={[{ id: 'solo', parent_id: null, name: 'Solo' }]} />);
      expect(screen.queryByText(messages.tree.noItems)).toBeNull();

      await user.click(screen.getByRole('button', { name: messages.tree.expand }));

      expect(screen.getByText(messages.tree.noItems)).toBeInTheDocument();
    });

    it('is replaced by the text of a placeholder slot, given the parent it stands under', () => {
      const Custom = pluginOf((context) =>
        context.registerSlot('placeholder', {
          component: ({ parent }) => <>{parent ? `Empty ${parent.name}` : 'Nothing here'}</>,
        }),
      );

      render(
        <TestTree items={[]}>
          <Custom />
        </TestTree>,
      );

      expect(screen.getByText('Nothing here')).toBeInTheDocument();
      expect(screen.queryByText(messages.tree.noItems)).toBeNull();
    });
  });

  describe('keyboard', () => {
    it('keeps one tab stop, on the first item until something else is focused', async () => {
      const { user } = render(<TestTree />);

      expect(item('Engineering')).toHaveAttribute('tabindex', '0');
      expect(item('Operations')).toHaveAttribute('tabindex', '-1');

      await user.tab();
      expect(item('Engineering')).toHaveFocus();

      await user.keyboard('{ArrowDown}');
      expect(item('Operations')).toHaveFocus();
      expect(item('Operations')).toHaveAttribute('tabindex', '0');
      expect(item('Engineering')).toHaveAttribute('tabindex', '-1');
    });

    it('starts the tab stop on the item named by initialFocusedNodeId', () => {
      render(<TestTree initialFocusedNodeId="ops" />);

      expect(item('Operations')).toHaveAttribute('tabindex', '0');
      expect(item('Engineering')).toHaveAttribute('tabindex', '-1');
    });

    it('moves through the visible items with the arrows, Home and End', async () => {
      const { user } = render(<TestTree />);
      await user.tab();
      await user.keyboard('{ArrowRight}');
      expect(item('Engineering')).toHaveFocus();

      await user.keyboard('{ArrowDown}');
      expect(item('Web')).toHaveFocus();
      await user.keyboard('{ArrowDown}{ArrowDown}');
      expect(item('Operations')).toHaveFocus();

      // At the ends the focus stays where it is.
      await user.keyboard('{ArrowDown}');
      expect(item('Operations')).toHaveFocus();

      await user.keyboard('{ArrowUp}');
      expect(item('API')).toHaveFocus();

      await user.keyboard('{Home}');
      expect(item('Engineering')).toHaveFocus();
      await user.keyboard('{ArrowUp}');
      expect(item('Engineering')).toHaveFocus();

      await user.keyboard('{End}');
      expect(item('Operations')).toHaveFocus();
    });

    it('opens a directory with the right arrow, then steps into it, and closes it with the left', async () => {
      const { user } = render(<TestTree />);
      await user.tab();

      await user.keyboard('{ArrowRight}');
      expect(item('Engineering')).toHaveAttribute('aria-expanded', 'true');
      expect(item('Engineering')).toHaveFocus();

      await user.keyboard('{ArrowRight}');
      expect(item('Web')).toHaveFocus();

      // A leaf has nothing to open, and the left arrow goes up to its parent.
      await user.keyboard('{ArrowRight}');
      expect(item('Web')).toHaveFocus();
      await user.keyboard('{ArrowLeft}');
      expect(item('Engineering')).toHaveFocus();

      await user.keyboard('{ArrowLeft}');
      expect(item('Engineering')).toHaveAttribute('aria-expanded', 'false');
      expect(visibleNames()).toEqual(['Engineering', 'Operations']);
    });

    it('toggles a directory with Enter', async () => {
      const { user } = render(<TestTree />);
      await user.tab();

      await user.keyboard('{Enter}');
      expect(item('Engineering')).toHaveAttribute('aria-expanded', 'true');
      await user.keyboard('{Enter}');
      expect(item('Engineering')).toHaveAttribute('aria-expanded', 'false');
    });

    it('calls click on Enter, instead of toggling, when the tree has one', async () => {
      const click = vi.fn();
      const { user } = render(<TestTree click={click} />);
      await user.tab();

      await user.keyboard('{Enter}');

      expect(click).toHaveBeenCalledWith({ id: 'eng', item: departments[0] });
      expect(item('Engineering')).toHaveAttribute('aria-expanded', 'false');
    });

    it('moves the focus to a node a plugin asks for', () => {
      let focusNode: TreePluginContext<Dept>['focusNode'] | undefined;
      const Probe = pluginOf((context) => {
        focusNode = context.focusNode;
      });
      render(
        <TestTree>
          <Probe />
        </TestTree>,
      );

      act(() => focusNode?.('ops'));

      expect(item('Operations')).toHaveFocus();
    });

    // The id 0 is falsy, and a check for "nothing focused" must not read it as no id (#748).
    describe('on an item whose id is 0', () => {
      interface Row extends DataGridTreeItem {
        id: number;
        parent_id: number | null;
        name: string;
      }

      function NumericTree({ items }: { items: Row[] }) {
        const treeStructure = useDataGridTreeStructure<Row>({
          items,
          parentKey: 'parent_id',
          isLeaf: (row) => !items.some((other) => other.parent_id === row.id),
        });
        return <Tree name="numeric" treeStructure={treeStructure} label="name" />;
      }

      const flatRows: Row[] = [
        { id: 0, parent_id: null, name: 'Zero' },
        { id: 1, parent_id: null, name: 'One' },
        { id: 2, parent_id: null, name: 'Two' },
      ];

      // One
      // Zero
      // └── Three
      // Two
      const nestedRows: Row[] = [
        { id: 1, parent_id: null, name: 'One' },
        { id: 0, parent_id: null, name: 'Zero' },
        { id: 3, parent_id: 0, name: 'Three' },
        { id: 2, parent_id: null, name: 'Two' },
      ];

      it('moves down from it', async () => {
        const { user } = render(<NumericTree items={flatRows} />);
        await user.tab();
        expect(item('Zero')).toHaveFocus();

        await user.keyboard('{ArrowDown}');
        expect(item('One')).toHaveFocus();
      });

      it('moves up from it, and to the ends with Home and End', async () => {
        const { user } = render(<NumericTree items={nestedRows} />);
        await user.tab();
        await user.keyboard('{ArrowDown}');
        expect(item('Zero')).toHaveFocus();

        await user.keyboard('{ArrowUp}');
        expect(item('One')).toHaveFocus();

        await user.keyboard('{ArrowDown}{End}');
        expect(item('Two')).toHaveFocus();

        await user.keyboard('{ArrowUp}{Home}');
        expect(item('One')).toHaveFocus();
      });

      it('opens it, steps into it and closes it with the arrows, and toggles it with Enter', async () => {
        const { user } = render(<NumericTree items={nestedRows} />);
        await user.tab();
        await user.keyboard('{ArrowDown}');

        await user.keyboard('{ArrowRight}');
        expect(item('Zero')).toHaveAttribute('aria-expanded', 'true');
        await user.keyboard('{ArrowRight}');
        expect(item('Three')).toHaveFocus();

        await user.keyboard('{ArrowLeft}');
        expect(item('Zero')).toHaveFocus();
        await user.keyboard('{ArrowLeft}');
        expect(item('Zero')).toHaveAttribute('aria-expanded', 'false');

        await user.keyboard('{Enter}');
        expect(item('Zero')).toHaveAttribute('aria-expanded', 'true');
      });
    });
  });

  describe('slots and settings a plugin can use', () => {
    it('puts the left slot on leaves by default, on directories, or where a function says', () => {
      const Left = pluginOf((context) =>
        context.registerSlot('left', {
          component: ({ item: department }) => <i>{`left ${department.id}`}</i>,
        }),
      );
      const names = () => screen.queryAllByText(/^left /).map((node) => node.textContent);

      const byDefault = render(
        <TestTree>
          <Left />
        </TestTree>,
      );
      expect(names()).toEqual(['left ops']);
      byDefault.unmount();

      const forDirectories = render(
        <TestTree showInlineStart="directory">
          <Left />
        </TestTree>,
      );
      expect(names()).toEqual(['left eng']);
      forDirectories.unmount();

      render(
        <TestTree showInlineStart={(department) => department.id !== 'eng'}>
          <Left />
        </TestTree>,
      );
      expect(names()).toEqual(['left ops']);
    });

    it('replaces the expand chevron with an icon slot told whether the directory is open', async () => {
      const Icon = pluginOf((context) =>
        context.registerSlot('icon', {
          component: ({ expanded }) => <b>{expanded ? 'open' : 'closed'}</b>,
        }),
      );
      const { user } = render(
        <TestTree>
          <Icon />
        </TestTree>,
      );
      expect(screen.getByText('closed')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: messages.tree.expand }));

      expect(screen.getByText('open')).toBeInTheDocument();
    });

    it('hands the label slot the item and its label', () => {
      const Label = pluginOf((context) =>
        context.registerSlot('label', {
          component: ({ item: department, label }) => <u>{`${label} (${department.id})`}</u>,
        }),
      );

      render(
        <TestTree>
          <Label />
        </TestTree>,
      );

      expect(visibleNames()).toEqual(['Engineering (eng)', 'Operations (ops)']);
    });

    it('shows the actions slot on every row, unless showActions says otherwise', () => {
      const Actions = pluginOf((context) =>
        context.registerSlot('actions', {
          component: ({ item: department }) => (
            <button type="button">{`act ${department.id}`}</button>
          ),
        }),
      );

      const actions = () =>
        screen.queryAllByRole('button', { name: /^act / }).map((button) => button.textContent);

      const byDefault = render(
        <TestTree>
          <Actions />
        </TestTree>,
      );
      expect(actions()).toEqual(['act eng', 'act ops']);
      byDefault.unmount();

      const some = render(
        <TestTree showActions={(department) => department.id === 'ops'}>
          <Actions />
        </TestTree>,
      );
      expect(actions()).toEqual(['act ops']);
      some.unmount();

      render(
        <TestTree showActions={() => false}>
          <Actions />
        </TestTree>,
      );
      expect(actions()).toEqual([]);
    });

    it('renders the bottom slot once, and the directory-bottom slot as showDirectoryBottom says', async () => {
      const Bottoms = pluginOf((context) => {
        context.registerSlot('bottom', { component: () => <footer>tree bottom</footer> });
        context.registerSlot('directory-bottom', {
          component: ({ node }) => <small>{`under ${node.id}`}</small>,
        });
      });

      const byDefault = render(
        <TestTree>
          <Bottoms />
        </TestTree>,
      );
      expect(screen.getAllByText('tree bottom')).toHaveLength(1);
      expect(screen.getByText('under eng')).toBeInTheDocument();
      byDefault.unmount();

      const whenExpanded = render(
        <TestTree showDirectoryBottom={() => 'when_expanded'}>
          <Bottoms />
        </TestTree>,
      );
      expect(screen.queryByText('under eng')).toBeNull();
      await whenExpanded.user.click(screen.getByRole('button', { name: messages.tree.expand }));
      expect(screen.getByText('under eng')).toBeInTheDocument();
      whenExpanded.unmount();

      render(
        <TestTree showDirectoryBottom={() => false}>
          <Bottoms />
        </TestTree>,
      );
      expect(screen.queryByText('under eng')).toBeNull();
    });

    it('takes a slot away again when the plugin calls the function registering it returned', () => {
      let unregister: (() => void) | undefined;
      const Footer = pluginOf((context) => {
        unregister = context.registerSlot('bottom', {
          component: () => <footer>tree bottom</footer>,
        });
      });
      render(
        <TestTree>
          <Footer />
        </TestTree>,
      );
      expect(screen.getByText('tree bottom')).toBeInTheDocument();

      act(() => unregister?.());

      expect(screen.queryByText('tree bottom')).toBeNull();
    });

    it('marks the items a plugin made active, and clears them', () => {
      let context: TreePluginContext<Dept> | undefined;
      const Probe = pluginOf((pluginContext) => {
        context = pluginContext;
      });
      render(
        <TestTree>
          <Probe />
        </TestTree>,
      );
      expect(item('Operations')).toHaveAttribute('aria-selected', 'false');

      act(() => context?.toggleActive('ops'));
      expect(item('Operations')).toHaveAttribute('aria-selected', 'true');
      // The tab stop follows the first active item.
      expect(item('Operations')).toHaveAttribute('tabindex', '0');

      act(() => context?.toggleActive('ops', false));
      expect(item('Operations')).toHaveAttribute('aria-selected', 'false');

      act(() => context?.toggleActive('eng'));
      act(() => context?.clearActive());
      expect(item('Engineering')).toHaveAttribute('aria-selected', 'false');
    });

    it('wraps the row in the components a plugin registers, the newest outermost', () => {
      const wrapping = (label: string) =>
        pluginOf(
          (context) =>
            context.registerComponent('leaf', ({ children }: { children?: ReactNode }) => (
              <div data-wrapper={label}>{children}</div>
            )),
          label,
        );
      const First = wrapping('first');
      const Second = wrapping('second');

      render(
        <TestTree>
          <First />
          <Second />
        </TestTree>,
      );

      const inner = item('Operations').closest('[data-wrapper]');
      expect(inner).toHaveAttribute('data-wrapper', 'first');
      expect(inner?.parentElement?.closest('[data-wrapper]')).toHaveAttribute(
        'data-wrapper',
        'second',
      );
      // A directory is not a leaf, so it is not wrapped.
      expect(item('Engineering').closest('[data-wrapper]')).toBeNull();
    });
  });
});
