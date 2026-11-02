import { cx } from 'class-variance-authority';
import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

import { defaultGridConfig, type GridConfig, type HeightClass, type SizeClass } from './grid-config.js';
import { solveGridLayout, type GridItemSpec, type GridLayout } from './grid-solver.js';
import styles from './grid.module.css';
import './grid-steps.css';

/*
 * An ordered group of blocks that declare a size class and a height class,
 * never a span. Grid solves a placement for every config step during
 * render (pure, SSR safe) and hands each item its placement as custom
 * properties; the generated step CSS picks the set for the current
 * container width, so resizing runs no JavaScript. The wrapper is the
 * named `fx-grid` size container, since a container cannot query itself.
 * No hook and no effect, so Grid renders on the server as well.
 */

export interface GridItemProps extends ComponentProps<'div'> {
  // Placement identity, unique within one Grid. Separate from the HTML id.
  layoutId: string;
  size: SizeClass;
  height?: HeightClass;
}

export function GridItem({ layoutId: _layoutId, size: _size, height: _height, className, ...props }: GridItemProps) {
  return <div {...props} data-fx-grid-item="" className={cx(styles.item, className)} />;
}

export interface GridProps extends ComponentProps<'div'> {
  // Immutable; solved layouts are cached by its identity. Defaults to defaultGridConfig.
  config?: GridConfig;
  // Lets spans move inside each size class's range to fill rows. Off: preferred spans only.
  flexible?: boolean;
  children?: ReactNode;
}

// Only what Grid can read: a fragment or a wrapper hides its items, so it throws instead of dropping them.
function directItems(children: ReactNode): ReactElement<GridItemProps>[] {
  const result: ReactElement<GridItemProps>[] = [];
  const visit = (child: ReactNode): void => {
    if (child === null || child === undefined || typeof child === 'boolean') return;
    if (Array.isArray(child)) {
      child.forEach(visit);
      return;
    }
    if (!isValidElement<GridItemProps>(child) || child.type !== GridItem) {
      throw new Error('Grid accepts only direct GridItem elements, arrays, or empty conditional children');
    }
    result.push(child);
  };
  visit(children);
  return result;
}

/*
 * Solved layouts, per config object, by the mode and the ordered item
 * signature. Configs are immutable by contract, so the object is the key; a
 * re-render with new JSX for the same items reuses the layout. Bounded per
 * config.
 */
const CACHE_LIMIT = 64;
const layoutCache = new WeakMap<GridConfig, Map<string, GridLayout>>();

function cachedLayout(items: GridItemSpec[], config: GridConfig, flexible: boolean): GridLayout {
  const signature = JSON.stringify([flexible, items.map(item => [item.layoutId, item.size, item.height ?? 'low'])]);
  let layouts = layoutCache.get(config);
  if (!layouts) {
    layouts = new Map();
    layoutCache.set(config, layouts);
  }
  const hit = layouts.get(signature);
  if (hit) return hit;
  const layout = solveGridLayout(items, config, { flexible });
  if (layouts.size >= CACHE_LIMIT) layouts.delete(layouts.keys().next().value as string);
  layouts.set(signature, layout);
  return layout;
}

export function Grid({ config = defaultGridConfig, flexible = false, children, className, ...props }: GridProps) {
  // The kit's CSS owns the `default` scope; a second config under that name would read missing step variables.
  if (config.name === defaultGridConfig.name && config !== defaultGridConfig) {
    throw new Error(`Grid config name "${defaultGridConfig.name}" belongs to defaultGridConfig; give a custom config its own name`);
  }
  const elements = directItems(children);
  const layout = cachedLayout(
    elements.map(({ props: item }) => ({ layoutId: item.layoutId, size: item.size, height: item.height })),
    config,
    flexible,
  );

  const placed = elements.map(element => {
    const placement: Record<string, string> = {};
    for (const step of config.steps) {
      const item = layout.steps[step.name].placements[element.props.layoutId];
      placement[`--fx-grid-col-${step.name}`] = `${item.colStart} / span ${item.colSpan}`;
      placement[`--fx-grid-row-${step.name}`] = `${item.rowStart} / span ${item.rowSpan}`;
    }
    // Caller style stays; the placement properties win on a clash. layoutId,
    // unique within the Grid, is the key: the items are flattened into one
    // list, where caller keys from separate arrays could collide, and a
    // conditional item earlier in the list must not remount the ones after it.
    return cloneElement(element, {
      key: element.props.layoutId,
      style: { ...element.props.style, ...placement } as CSSProperties,
    });
  });

  return (
    <div {...props} className={cx(styles.root, className)}>
      <div
        className={styles.grid}
        data-fx-grid={config.name}
        data-fx-grid-flexible={flexible ? '' : undefined}
        style={{ '--fx-grid-columns': config.columns } as CSSProperties}
      >
        {placed}
      </div>
    </div>
  );
}
