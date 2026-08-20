import { cx } from 'class-variance-authority';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { DateRange } from 'react-day-picker';

import { Button } from '../button/button';
import { Calendar, type CalendarProps } from '../calendar/calendar';
import { Input } from '../input/input';
import { Popover, PopoverContent, PopoverTrigger } from '../popover/popover';

import styles from './date-picker.module.css';

interface DatePickerBaseProps {
  /** Shown in the trigger/input when nothing is selected. */
  placeholder?: string;
  /** Forwarded to the popover's `Calendar` — see calendar.md's caption-layout axis. */
  captionLayout?: CalendarProps['captionLayout'];
  disabled?: CalendarProps['disabled'];
  className?: string;
  id?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Where to portal the calendar popup — see PopoverContent's own doc. */
  container?: Parameters<typeof PopoverContent>[0]['container'];
  'aria-label'?: string;
}

export interface DatePickerSingleProps extends DatePickerBaseProps {
  mode?: 'single';
  /**
   * `button` (default) renders a Button trigger showing the formatted date
   * — upstream's date-picker-demo/-basic/-dob recipes. `input` renders a
   * free-typed field with a calendar-icon button in its `end` slot —
   * upstream's date-picker-input recipe. `range` mode has no `input`
   * variant (see date-picker.md's Deviations).
   */
  variant?: 'button' | 'input';
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  /** Close the popover once a day is picked. @default true */
  closeOnSelect?: boolean;
}

export interface DatePickerRangeProps extends DatePickerBaseProps {
  mode: 'range';
  selected: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
  /** @default 2 */
  numberOfMonths?: number;
  /** Close the popover once a day is picked. @default false — a range needs two clicks. */
  closeOnSelect?: boolean;
}

/**
 * `mode` discriminates `selected`/`onSelect`'s type the same way
 * `Calendar`'s underlying `DayPicker` does — see calendar.tsx.
 */
export type DatePickerProps = DatePickerSingleProps | DatePickerRangeProps;

function formatInputValue(date: Date | undefined) {
  if (!date) {
    return '';
  }
  // Matches upstream's date-picker-input recipe exactly (day/month/year,
  // long month name) — a format `parseTypedDate` below is written to
  // round-trip through `new Date(string)`.
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
}

function parseTypedDate(value: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatRangeLabel(range: DateRange | undefined) {
  if (!range?.from) {
    return undefined;
  }
  if (!range.to) {
    return format(range.from, 'LLL dd, y');
  }
  return `${format(range.from, 'LLL dd, y')} - ${format(range.to, 'LLL dd, y')}`;
}

/**
 * Popover + Calendar + Button/Input composed into a real kit component.
 * Upstream ships this as a doc recipe (apps/v4/content/docs/components/
 * base/date-picker.mdx), not a registry item — "there is no `DatePicker`
 * root component" per that doc's own Composition section. This is the
 * kit's deviation: the recipe's prop surface (`selected`/`onSelect`,
 * `mode`, `captionLayout`) is kept, but wrapped as one component so a
 * consumer doesn't hand-assemble Popover/Calendar/Button per usage — see
 * date-picker.md's Deviations for the full rationale.
 */
export function DatePicker(props: DatePickerProps) {
  const {
    placeholder = 'Pick a date',
    captionLayout = 'label',
    disabled,
    className,
    id,
    open: openProp,
    defaultOpen,
    onOpenChange,
    container,
  } = props;
  const ariaLabel = props['aria-label'];

  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  // Seeds the visible month from whichever endpoint the active mode cares
  // about; DayPicker's own month navigation drives it from here on (passed
  // through as `month`/`onMonthChange` below), so a range picker opened on
  // an existing selection lands on its start month rather than "today".
  const [month, setMonth] = useState<Date | undefined>(
    props.mode === 'range' ? props.selected?.from : props.selected,
  );

  // The typed buffer for the `input` variant only. Kept separate from
  // `selected` because a value mid-typing ("June 0") is not yet a valid
  // Date and must not clobber the last committed selection — the same
  // problem upstream's date-picker-input recipe solves the same way with
  // its own `value` state. Resynced during render (react.dev's "adjusting
  // state when a prop changes" pattern), not via a `useEffect`, so a
  // consumer resetting `selected` from outside (e.g. a "clear" action
  // elsewhere) is reflected in the same commit instead of one render late
  // — pass a stable `Date` reference from the consumer side, the standard
  // caveat for any state derived this way.
  const singleSelected = props.mode === 'range' ? undefined : props.selected;
  const [typedValue, setTypedValue] = useState(() => formatInputValue(singleSelected));
  const [syncedSelected, setSyncedSelected] = useState(singleSelected);
  if (singleSelected !== syncedSelected) {
    setSyncedSelected(singleSelected);
    setTypedValue(formatInputValue(singleSelected));
  }

  if (props.mode === 'range') {
    const { selected, onSelect, numberOfMonths = 2, closeOnSelect = false } = props;
    const label = formatRangeLabel(selected);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              id={id}
              className={cx(styles.trigger, className)}
              data-empty={!selected?.from || undefined}
              aria-label={ariaLabel}
              // Button's own `icon` slot, not a raw child — see the single-mode
              // trigger below for why (same fix, same reason).
              icon={<CalendarIcon />}
            />
          }
        >
          {label ?? <span>{placeholder}</span>}
        </PopoverTrigger>
        <PopoverContent className={styles.content} align="start" container={container}>
          <Calendar
            mode="range"
            selected={selected}
            onSelect={(value) => {
              onSelect(value);
              if (closeOnSelect) {
                setOpen(false);
              }
            }}
            month={month}
            onMonthChange={setMonth}
            numberOfMonths={numberOfMonths}
            captionLayout={captionLayout}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>
    );
  }

  const { selected, onSelect, variant = 'button', closeOnSelect = true } = props;

  const handleCalendarSelect = (date: Date | undefined) => {
    onSelect(date);
    setMonth(date);
    setTypedValue(formatInputValue(date));
    if (closeOnSelect) {
      setOpen(false);
    }
  };

  if (variant === 'input') {
    return (
      <Input
        id={id}
        value={typedValue}
        placeholder={placeholder}
        className={className}
        aria-label={ariaLabel}
        onChange={(event) => {
          const { value } = event.target;
          setTypedValue(value);
          const parsed = parseTypedDate(value);
          if (parsed) {
            onSelect(parsed);
            setMonth(parsed);
          } else if (!value) {
            onSelect(undefined);
          }
        }}
        onKeyDown={(event) => {
          // Matches upstream's date-picker-input recipe: ArrowDown opens
          // the calendar from the field without needing to reach for the
          // trailing button.
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        end={
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              render={
                <Button variant="ghost" size="sm" icon={<CalendarIcon />} aria-label={ariaLabel ?? 'Open calendar'} />
              }
            />
            <PopoverContent className={styles.content} align="end" sideOffset={8} container={container}>
              <Calendar
                mode="single"
                selected={selected}
                onSelect={handleCalendarSelect}
                month={month}
                onMonthChange={setMonth}
                captionLayout={captionLayout}
                disabled={disabled}
              />
            </PopoverContent>
          </Popover>
        }
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            id={id}
            className={cx(styles.trigger, className)}
            data-empty={!selected || undefined}
            aria-label={ariaLabel}
            // Button's `icon` slot (never a raw child, per button.tsx's own
            // doc comment): a child mixed in with the label text lands in
            // Button's plain-block `.label` span instead of its flex
            // `.icon`+`.label` row, which silently drops the gap and
            // vertical centering Button would otherwise give it for free.
            icon={<CalendarIcon />}
          />
        }
      >
        {selected ? format(selected, 'PPP') : <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className={styles.content} align="start" container={container}>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleCalendarSelect}
          month={month}
          onMonthChange={setMonth}
          captionLayout={captionLayout}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
}
