# Theming contract

## Style ownership

`@gears-frontx/calendar-kit` owns its `@gears-frontx/ui-kit` runtime dependency. Consumers should import only calendar-kit styles — `theme.css`, the optional `reset.css`, and any calendar-kit preset — and must not import `@gears-frontx/ui-kit/theme.css` directly. The kit's component imports bring the ui-kit-derived component CSS with them, so that CSS arrives through the calendar-kit package and stays within the calendar mount.

`theme.css` does not hard-code the calendar's appearance. It maps the kit's internal `--cal-*` properties from **upstream seam names** — `--surface`, `--foreground`, `--primary`, `--border`, `--font-sans`, and so on — each with a kit fallback:

```css
--cal-color-surface: var(--surface, #ffffff);
```

**If you set none of these seams, every fallback wins and the calendar renders in kit defaults — a violet-accented neutral palette that will not match your design system.** That is the contract working as designed, not a bug: the kit has no way to guess your tokens. You must either import a preset or define the seams yourself.

## Option 1 — import the OneCloud preset

```ts
import "@gears-frontx/calendar-kit/theme.css";
import "@gears-frontx/calendar-kit/themes/onecloud.css";
```

`themes/onecloud.css` defines every seam with OneCloud design-system values (light and dark) as literals. It stands alone — it does not require your own token sheet to be loaded, and load order relative to `theme.css` does not matter, because custom properties cascade independently of the rule that consumes them.

## Option 2 — map the seams onto your own tokens

Define the seams anywhere that is an ancestor of the calendar mount — the document root, or the shadow host when the calendar is embedded.

```css
:root {
  --surface: var(--my-ds-background);
  --foreground: var(--my-ds-text);
  --primary: var(--my-ds-brand);
  --border: var(--my-ds-divider);
  /* ...the remaining seams... */
}
```

Partial adoption is legal: any seam you leave undefined keeps the kit default. The package's automated tests guarantee the seam list below stays in step with `theme.css`.

## Seam reference

Defaults shown are the light-mode fallbacks written into `theme.css`. Seams marked **dark** also carry a distinct dark-mode default there and in the preset.

### Surfaces and text

| Seam | Meaning | Kit default | OneCloud preset |
| --- | --- | --- | --- |
| `--surface` | Calendar canvas background · **dark** | `#ffffff` | `#ffffff` / `#111827` |
| `--surface-elevated` | Raised rows and sticky chrome · **dark** | `#ffffff` | `#f7f7f8` / `#1f2937` |
| `--foreground` | Primary text · **dark** | `#0f172a` | `#111111` / `#f8fafc` |
| `--muted-foreground` | Secondary text, gutter labels, read-only state · **dark** | `#64748b` | `#6a6a6a` / `#c2ccdc` |
| `--subtle-foreground` | Tertiary text · **dark** | `#5f6f88` | `#777777` / `#a7b2c4` |
| `--placeholder-foreground` | Placeholders, disabled glyphs, field icons · **dark** | `#bbbbbb` | `#bbbbbb` / `#777777` |
| `--divider` | Hairline dividers and panel edges · **dark** | `rgb(0 0 0 / 0.09)` | `rgb(0 0 0 / 0.09)` / `#282b32` |

### Lines and focus

| Seam | Meaning | Kit default | OneCloud preset |
| --- | --- | --- | --- |
| `--border` | Grid lines and event borders | `#64748b` | `#00000021` / `#ffffff2b` |
| `--border-strong` | Emphasised grid lines, conflict borders · **dark** | `#475569` | `#00000021` / `#ffffff3d` |
| `--ring` | Focus ring and focus state | `#8b5cf6` | `#315efb` / `#8db5ef` |
| `--primary-ring` | Strong focus ring, dragging ring · **dark** | `#6d28d9` | `#315efb` / `#8db5ef` |

### Brand action

| Seam | Meaning | Kit default | OneCloud preset |
| --- | --- | --- | --- |
| `--primary` | Primary action, active state | `#8257e6` | `#19213a` |
| `--now` | Current-time line. Falls back to `--primary` so existing consumers are unaffected | `var(--primary)` | `#ff7065` |
| `--now-label` | Current-time gutter label. Falls back to `--primary-foreground` | `var(--primary-foreground)` | `#d40834` / `#ff8fa3` |
| `--primary-foreground` | Text on a primary fill | `#ffffff` | `#ffffff` |

### Status

| Seam | Meaning | Kit default | OneCloud preset |
| --- | --- | --- | --- |
| `--danger` | Conflict indication · **dark** | `#e11d48` | `#d40834` / `#ff7065` |
| `--destructive` | Error state | `#e11d48` | `#d63c28` / `#db4f3d` |
| `--destructive-foreground` | Text on an error fill | `#ffffff` | `#ffffff` |
| `--success` | Success state | `#059669` | `#228665` / `#0fbd83` |

### Overlays

| Seam | Meaning | Kit default | OneCloud preset |
| --- | --- | --- | --- |
| `--popover` | Popover and panel surface | `#ffffff` | `#ffffff` / `#171717` |
| `--popover-border` | Popover and panel border · **dark** | `color-mix(in oklab, var(--foreground, #0f172a) 10%, transparent)` | `#00000021` / `#4b4b4b` |
| `--popover-shadow` | Overlay, panel, and drag elevation | `0 4px 6px -1px …, 0 2px 4px -2px …` | `4px 4px 20px rgb(25 33 58 / 0.08)` / `0 0 20px rgb(0 0 0 / 0.32)` |
| `--overlay` | Modal scrim | `oklch(0 0 0 / 50%)` | `#0a0a0a52` / `#00000099` |

### Inputs and inert state

| Seam | Meaning | Kit default | OneCloud preset |
| --- | --- | --- | --- |
| `--input` | Input border | `#cbd5e1` | `#00000021` / `#4b4b4b` |
| `--muted` | Disabled, loading, and unavailable fills | `#f1f5f9` | `#f1f1f1` / `#32353f` |
| `--card-hover` | Hover state · **dark** | `#f8fafc` | `#e8eced` / `#212633` |
| `--selection-subtle` | Selected slot fill · **dark** | `#dce7f2` | `#e7ecf1` / `#273449` |

### Event-category families

| Seam | Meaning | Kit default | OneCloud preset |
| --- | --- | --- | --- |
| `--info` | Info status; turquoise category foreground, border, accent, pattern | `#0284c7` | `#266068` / `#dbdcd3` |
| `--info-soft` | Turquoise category background · **dark** | `#eaf6ff` | `#e0f3f6` / `#414e5c` |
| `--warning` | Warning status; orange category foreground, border, accent, pattern | `#d97706` | `#9a3316` / `#e6dac7` |
| `--warning-soft` | Orange category background · **dark** | `#fdf3e2` | `#ffeadb` / `#51485a` |
| `--accent` | Purple category background; dragging state | `#f3e8ff` | `#f8eaff` / `#484b5e` |
| `--accent-foreground` | Purple category foreground, border, accent; dragging text | `#6d28d9` | `#841dba` / `#f3d7bf` |

### Typography

| Seam | Meaning | Kit default | OneCloud preset |
| --- | --- | --- | --- |
| `--font-sans` | Calendar font family | `'Inter', sans-serif` | `"Inter Variable", Inter, sans-serif` |
| `--text-heading-1-size` | Screen and section heading size | `1.125rem` | `18px` |
| `--text-heading-1-line-height` | Heading line height | `1.5rem` | `24px` |
| `--text-heading-1-weight` | Heading weight | `600` | `600` |
| `--text-heading-1-tracking` | Heading letter spacing | `-0.1px` | `0px` |
| `--text-label-size` | Control label size: buttons, segmented options, field labels | `0.875rem` | `14px` |
| `--text-label-line-height` | Control label line height | `1.25rem` | `20px` |
| `--text-label-weight` | Control label weight | `500` | `500` |
| `--text-label-tracking` | Control label letter spacing | `0px` | `0px` |
| `--text-heading-2-size` | Title size | `1rem` | `12px` |
| `--text-heading-2-line-height` | Title line height | `1.5rem` | `16px` |
| `--text-heading-2-weight` | Title weight | `600` | `600` |
| `--text-heading-2-tracking` | Title letter spacing | `-0.1px` | _(gap — kit default)_ |
| `--text-meta-size` | Metadata size | `0.75rem` | `12px` |
| `--text-meta-line-height` | Metadata line height | `1rem` | `16px` |
| `--text-meta-weight` | Metadata weight | `400` | `400` |
| `--text-meta-tracking` | Metadata letter spacing | `0.1px` | _(gap — kit default)_ |
| `--text-caption-size` | Caption size: agenda end times, relative day hints | `0.625rem` | `10px` |
| `--text-caption-line-height` | Caption line height | `0.75rem` | `12px` |
| `--text-caption-weight` | Caption weight | `500` | `500` |
| `--text-caption-tracking` | Caption letter spacing | `0px` | `0px` |
| `--text-body-size` | Grid and day-number size | `0.9375rem` | `14px` |
| `--text-body-line-height` | Grid and day-number line height | `1.25rem` | `20px` |
| `--text-body-weight` | Grid and day-number weight | `400` | `400` |
| `--text-body-tracking` | Grid and day-number letter spacing | `0px` | _(gap — kit default)_ |

### Spacing

| Seam        | Meaning        | Kit default | OneCloud preset |
| ----------- | -------------- | ----------- | --------------- |
| `--space-1` | Spacing step 1 | `0.25rem`   | `4px`           |
| `--space-2` | Spacing step 2 | `0.5rem`    | `8px`           |
| `--space-3` | Spacing step 3 | `0.75rem`   | `12px`          |
| `--space-4` | Spacing step 4 | `1rem`      | `16px`          |
| `--space-5` | Spacing step 5 | `1.25rem`   | `20px`          |
| `--space-6` | Spacing step 6 | `1.5rem`    | `24px`          |
| `--space-8` | Spacing step 8 | `2rem`      | `32px`          |

### Borders and radii

| Seam | Meaning | Kit default | OneCloud preset |
| --- | --- | --- | --- |
| `--border-width` | Hairline width | `1px` | `1px` |
| `--border-width-focus` | Focus outline width | `2px` | `2px` |
| `--ring-inset` | Focus ring inset | `1px` | _(gap — kit default)_ |
| `--radius-xs` | Slot radius | `4px` | `4px` |
| `--radius-sm` | Small radius | `0.375rem` | `4px` |
| `--radius-md` | Medium radius | `0.5rem` | `8px` |
| `--radius-lg` | Large radius | `0.75rem` | `12px` |

### Control and icon sizing

| Seam | Meaning | Kit default | OneCloud preset |
| --- | --- | --- | --- |
| `--control-height-sm` | Small control height | `2rem` | `32px` |
| `--control-height-md` | Medium control height | `2.25rem` | `36px` |
| `--control-height-lg` | Large control height; header cell min height | `2.5rem` | `40px` |
| `--icon-size-xs` | Extra-small icon box | `0.75rem` | `12px` |
| `--icon-size-sm` | Small icon box | `1rem` | `16px` |
| `--icon-size-md` | Medium icon box | `1.25rem` | `20px` |
| `--icon-size-lg` | Large icon box | `1.5rem` | `24px` |

## Gaps in the OneCloud preset

Four seams have no OneCloud counterpart. The preset restates the kit default rather than inventing a value, so they are explicit and greppable:

| Seam | Why | Value kept |
| --- | --- | --- |
| `--text-heading-2-tracking` | OneCloud typography defines size, line height, and weight but no letter spacing. | `-0.1px` |
| `--text-meta-tracking` | As above. | `0.1px` |
| `--text-body-tracking` | As above. | `0px` |
| `--ring-inset` | OneCloud has no focus-ring inset token; its `1px` border width is a different concept. | `1px` |

## Known fidelity limits

These are not missing values but places where the seam namespace is coarser than OneCloud's, so one seam has to serve two purposes:

- **Event-category border and accent.** OneCloud gives each category a distinct foreground, border, and accent (turquoise foreground `#266068` vs border `#0fadbf`). `theme.css` drives `--cal-color-*-foreground`, `-border`, `-accent`, and `-pattern` from a single seam, so the preset sets it to the category **foreground** and the border and accent inherit that value.
- **Generic status vs category colour.** `--info` and `--warning` serve both `--cal-color-info` / `--cal-color-warning` and the turquoise / orange category families. The preset optimises for the categories, because they are what the calendar actually renders.
- **Day number vs grid text.** `--text-body-size` drives both. OneCloud sizes the day number at `16px` and body text at `14px`; the preset uses `14px`.
- **Dragging state.** `--accent` / `--accent-foreground` serve both the purple category and the drag state, which OneCloud styles independently.

Closing any of these requires widening the seam namespace in `theme.css`, which is a contract change, not a preset change.
