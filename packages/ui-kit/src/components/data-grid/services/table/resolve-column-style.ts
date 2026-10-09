import type { CSSProperties } from 'react';
import type { DataGridItem } from '../../data-grid-types';
import type { DataGridTableColumn, DataGridTableLayout } from './table-types';

/**
 * Internal CSS var carrying the `tableLayout="auto"` `maxWidth` cap into the per-row content-cap
 * wrapper (`DataGridCell`'s `.content` span). Not documented as public API.
 */
export const DATA_GRID_COLUMN_MAX_WIDTH_VAR = '--_data-grid-col-max';

export interface ResolvedColumnStyle {
  /**
   * `width`/`minWidth`/`maxWidth` mapped to CSS for the header `<th>`. Body cells intentionally
   * receive no box sizing from this — width lives on the header only, since the table already
   * shares one track per column.
   */
  headerStyle: CSSProperties;
  /**
   * Content-cap CSS var(s) needed by the per-row overflow wrapper. Applied on both header and
   * body cells: a CSS custom property set via inline style on one row's `<td>` does not reach a
   * sibling row's `<td>` for the same column, so each row needs its own copy.
   */
  contentVars: CSSProperties;
  /**
   * Whether `maxWidth` is a real, active cap (`tableLayout="auto"` with `maxWidth` set) that the
   * content wrapper's CSS must enforce regardless of overflow mode — `nowrap` reads the cap var
   * directly (mode-agnostic), `wrap` needs this flag to also force word-breaking, so the column
   * never grows past the cap. Always `false` under `tableLayout="fixed"`, where `maxWidth`
   * aliases into the shared track instead.
   */
  isCapped: boolean;
}

type ColumnWidthProps<TItem extends DataGridItem> = Pick<
  DataGridTableColumn<TItem>,
  'width' | 'minWidth' | 'maxWidth'
>;

function isPercent(value: number | string): value is string {
  return typeof value === 'string' && value.trim().endsWith('%');
}

function toLength(value: number | string): string {
  if (typeof value === 'number') return `${value}px`;
  return /^-?\d+(\.\d+)?$/.test(value.trim()) ? `${value}px` : value;
}

/**
 * Single source of CSS for column `width`/`minWidth`/`maxWidth`, branching on `tableLayout`.
 *
 * - `fixed`: the three props collapse to one shared track. `width` wins when present; a lone
 *   `minWidth`/`maxWidth` aliases to the track. (Detecting the contradictory combination — width
 *   set alongside `minWidth`/`maxWidth` — is a DEV-only warning emitted separately at column
 *   ingestion; this function stays pure and has no side effects.) `width: 'min-content'` opts the
 *   column into the same measurement pipeline as under `auto` (see below) -- once
 *   `DataGridHeaderCell`'s ResizeObserver has measured it, the pixel value becomes this column's
 *   track, same as a literal numeric `width`.
 * - `auto`: the three are independent constraints — `width` sets a preferred size and, absent an
 *   explicit `minWidth`, an implicit floor at that same size; `minWidth` is the floor; `maxWidth`
 *   is a real cap. A `maxWidth`-without-`width` column also gets its header `width` set to the
 *   cap so it stops absorbing container slack under `inline-size: 100%` fill, and `maxWidth`
 *   always drives the content-cap CSS var read by the per-row wrapper. `width: 'min-content'` is
 *   special-cased: the literal CSS keyword isn't honored by the browser's auto table-layout
 *   algorithm as a hint to hold this column narrow against a widthless sibling, so
 *   `minContentWidth` (a measured pixel value from `DataGridHeaderCell`'s ResizeObserver, via
 *   `table-min-content-width.ts`) stands in for it once measurement has landed.
 *
 * Before the first measurement lands: under `auto`, the raw `'min-content'` keyword still flows
 * through as an inert one-frame fallback (harmless -- the browser ignores it as a `width`/
 * `min-inline-size` value and the column renders under ordinary layout sizing until the
 * ResizeObserver's first callback fires); under `fixed`, the width is simply unset instead
 * (falls to a lone `minWidth`/`maxWidth` alias, or no track at all).
 *
 * `%` strings map to `inline-size`; any other value maps to `width` + `min-inline-size`.
 */
export function resolveColumnStyle<TItem extends DataGridItem>(
  column: ColumnWidthProps<TItem>,
  tableLayout: DataGridTableLayout,
  minContentWidth?: number,
): ResolvedColumnStyle {
  return tableLayout === 'auto'
    ? resolveAutoStyle(column, minContentWidth)
    : resolveFixedStyle(column, minContentWidth);
}

function resolveFixedStyle<TItem extends DataGridItem>(
  column: ColumnWidthProps<TItem>,
  minContentWidth?: number,
): ResolvedColumnStyle {
  // `'min-content'` resolves from the measured pixel value once it lands (see the function-level
  // doc above) -- exactly like a literal numeric `width` from here on, including winning over
  // `minWidth`/`maxWidth` in the single-track collapse below. Before measurement, it falls back
  // to the `minWidth`/`maxWidth` alias (or no track at all).
  const width: number | string | undefined =
    column.width === 'min-content' ? minContentWidth : column.width;
  const track = width ?? column.minWidth ?? column.maxWidth;
  if (track === undefined) return { headerStyle: {}, contentVars: {}, isCapped: false };

  if (isPercent(track)) {
    return { headerStyle: { inlineSize: track }, contentVars: {}, isCapped: false };
  }

  const length = toLength(track);
  return {
    headerStyle: { width: length, minInlineSize: length },
    contentVars: {},
    isCapped: false,
  };
}

function resolveAutoStyle<TItem extends DataGridItem>(
  column: ColumnWidthProps<TItem>,
  minContentWidth?: number,
): ResolvedColumnStyle {
  const { width, minWidth, maxWidth } = column;
  const headerStyle: CSSProperties = {};

  if (width !== undefined) {
    // The literal CSS `min-content` keyword isn't honored by the browser's auto table-layout
    // algorithm as a hint to hold this column narrow against a widthless sibling -- once
    // `DataGridHeaderCell`'s ResizeObserver has measured the header content's natural width, that
    // pixel value stands in for the keyword here, exactly like an ordinary numeric `width` (same
    // width + floor pattern below). Checked ahead of `isPercent` purely so its `value is string`
    // guard doesn't narrow `width` to `number`-only in the `else` branch below (a `'min-content'`
    // check there wouldn't type-check). Before the first measurement lands, the raw keyword still
    // flows through via `toLength` as an inert fallback (harmless -- the browser ignores it and
    // the column renders under ordinary auto-layout sizing for one frame).
    if (width === 'min-content' && minContentWidth !== undefined) {
      // A `maxWidth` cap still applies to a measured min-content column -- without this, the
      // header track could exceed its own cap (the measured value is a natural content size, not
      // itself capped) while the per-row content wrapper below enforces the cap independently,
      // leaving the two out of sync.
      const cappedWidth =
        maxWidth !== undefined ? Math.min(minContentWidth, maxWidth) : minContentWidth;
      const length = `${cappedWidth}px`;
      headerStyle.width = length;
      headerStyle.minInlineSize = length;
    } else if (isPercent(width)) {
      headerStyle.inlineSize = width;
    } else {
      const length = toLength(width);
      headerStyle.width = length;
      headerStyle.minInlineSize = length; // preferred size doubles as the floor by default
    }
  }

  if (minWidth !== undefined) {
    headerStyle.minInlineSize = `${minWidth}px`; // explicit floor overrides width's implicit one
  }

  const contentVars: CSSProperties = {};
  if (maxWidth !== undefined) {
    if (width === undefined) {
      // A widthless-but-capped column still absorbs container slack under `inline-size: 100%`
      // fill — give the header a width so the cap actually holds instead of leaving dead space.
      headerStyle.width = `${maxWidth}px`;
    }
    (contentVars as Record<string, string>)[DATA_GRID_COLUMN_MAX_WIDTH_VAR] = `${maxWidth}px`;
  }

  return { headerStyle, contentVars, isCapped: maxWidth !== undefined };
}
