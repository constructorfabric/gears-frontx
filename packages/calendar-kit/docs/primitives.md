# Internal primitives

`src/ui/primitives/` holds the private building blocks the public components are made of. None has a `public.ts` or a build entry, so hosts cannot import them. The props interfaces in each `.tsx` are the API reference.

Rules every primitive follows:

- CSS Modules read `--cal-*` tokens and use logical properties. The app's `--calendar-*` tokens and `data-*` styling hooks became tokens and modifier classes.
- Visible text (labels, messages, empty and loading content) comes from the caller, or from the kit translator for the few built-in labels.
- Overlays take an optional `container` (`Element` or `DocumentFragment`) and portal into it, so they stay inside a shadow root.

## Built on `@gears-frontx/ui-kit`

| Primitive | ui-kit part | What the wrapper adds or keeps |
| --- | --- | --- |
| `Button` | `Button` | The app's `variant` and `size` scale plus the aliases `default`, `destructive`, `outline`, `sm`, `lg`. `focusableWhenDisabled` keeps a disabled action focusable with `aria-disabled` and swallows its clicks. `buttonClassName` styles non-button markup as a button |
| `Checkbox` | `Checkbox` | A native-style `onChange` translated from `onCheckedChange`. The ref and an explicit `id` go to ui-kit's hidden `<input>`, so a sibling `<label htmlFor>` still works. The visible control is a `role="checkbox"` span with `data-checked`, which `calendar-list` accent styles read |
| `Combobox` | `Combobox*`, `useComboboxAnchor` | The app's flat controlled API (`options`, `selectedValues`, removable `tags`, `embedded`, `anchorRef`). `controlClassName` targets the field control. `data-calendar-combobox-*` attributes are stable inspection hooks the create-event tests use |
| `DateField` | `Calendar` (react-day-picker) | See below |
| `Field` family | `Field`, `FieldLabel`, `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldDescription` | `FieldLabel` `required` and `FieldError`, which renders nothing when empty. The caller wires `htmlFor` and `aria-describedby` |
| `Input` | `Input` | The shell owns ids, label, required marker, affixes, message and `aria-describedby`. `iconLeft` is ui-kit's leading icon; `leadingAction` and `action` sit outside the label, so pressing one never activates it, and adding or removing one never remounts the control. `className` goes on both the shell and the native input. Native `onChange` passes through unchanged and `onValueChange(value)` fires after it for the same change |
| `RadioGroup`, `Radio` | `RadioGroup`, `RadioGroupItem` | Three label layouts, required marker and message. `onValueChange` receives only the value. The ref reaches the hidden input through `inputRef`. An unknown controlled value falls back to the first enabled radio, and a direction bridge restores RTL arrows inside a shadow root. A standalone `Radio` stays native because ui-kit items need a group |
| `Select` | `Select*` | The app's flat API: `options` with `icon` and `dividerAfter`, `iconLeft`, `showSelectedCheck` |
| `Textarea` | `Textarea` | The same shell as `Input`. `rows` defaults to 3 and is always passed, so ui-kit's `--rows` minimum height survives a caller `style` |
| `Toggle` | `Switch` | Controlled `checked`, three label layouts, sizes `m` and `s`. Space toggles, Enter does not. The hidden input stays part of the form |

### DateField

A typed date input with a calendar popover. The mask is the locale's own date (`09/23/2026` in `en-US`, `23.09.2026` in `de-DE`), derived by `core/date-input.ts` from `Intl.DateTimeFormat` with the Gregorian calendar and Latin digits.

- Digits fill the segment under the caret and move on once no further digit fits (`1`, `3` in a month is `03`). `ArrowLeft`/`ArrowRight` move between segments, `ArrowUp`/`ArrowDown` step them (month and day wrap, the year clamps), `Backspace` empties one, a paste spreads its digits, `Alt+ArrowDown` opens the calendar. `Tab` and `Enter` stay with the form.
- The value commits as soon as the mask parses; an impossible day clamps (`02/31` becomes the last day). Half-typed text stays until blur, then the field shows the committed value again.
- The kit owns everything around ui-kit's `Calendar`: the `Input` shell, the kit `Popover` (shadow-root portal, focus return), Monday-first weeks, `Intl` formatters instead of date-fns locales, and the month-navigator labels for previous and next.

## Kit-owned

| Primitive | Contract |
| --- | --- |
| `Alert` | `role="alert"`, `default` and `destructive` variants |
| `AlertDialog` | Modal `role="alertdialog"` with linked title and description. Focus starts on the first action (cancel, in the discard flow). Action and cancel run before the controlled close and can call `preventDefault()` to stay open during async work |
| `Avatar`, `AvatarStack`, `AvatarOverflow` | Initials with locale-aware casing, a surface colour seeded from `seed` or the name, an accessible overflow label |
| `Dialog` | Labelled modal `role="dialog"`. Focus moves in on open and returns on close; Tab is trapped even when the surface is empty; Escape and outside presses request a close, except while a nested listbox owns Escape |
| `Empty` | `role="status"` shell for empty states |
| `List` family | List and listbox roles, selection, nesting, row actions, tags, badges; states are modifier classes |
| `Popover` | See below |
| `ScrollRegion` | A plain `overflow: auto` div with overscroll containment and no landmark role |
| `Separator` | `<hr>` with `role="separator"` and `aria-orientation`; `decorative` hides it from assistive tech |
| `Sheet` | Edge-docked modal over a scrim on the logical `start` or `end` side; focus trap and return, Escape and outside mouse press close it. `useSheetClose` gives children the close intent; `testId` becomes the panel `id` |
| `Skeleton` | `aria-hidden` placeholder; `inheritColor` takes the parent colour |
| `Subheader` | Heading level and id, title, icon, tag, badge and action slots, optional back and close buttons (native, not ui-kit) |
| `Tag` | Sizes `s` 20px, `m` 24px, `l` 28px with the stroke inside the height. The dismiss button's label is `dismissLabel` or the `calendar.tag.remove` message |
| `TimeField` | A combobox over a listbox of times. The typed draft stays separate from the committed `LocalTime`: valid shorthand commits on Enter or blur, an invalid draft stays for repair |

### Popover

The shared floating surface. It flips above the anchor when there is no room below, clamps to the viewport, follows the nearest `dir`, traps Tab and restores focus. Escape and an outside press close it; the click that ends an outside press is swallowed, so the control underneath does not act and a trigger cannot reopen the panel it just closed. A nested listbox owns Escape.

`placement="inline"` opens beside the anchor: on its inline-end side when the panel fits, otherwise on its inline-start side, and below it when neither fits. An arrow points at the anchor's vertical middle. `computeInlinePopoverPosition` holds that geometry. `useFloatingPanel` reuses the below-or-flip calculation for listbox panels that follow an anchor ref on scroll and resize.
