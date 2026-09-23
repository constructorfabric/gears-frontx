// Fixture for extract.test.ts: components whose props type is a union of
// object types, the shape of a picker that takes one date, a range or a week.
// `clearable` is declared by the single branch alone and `numberOfMonths` by
// the range and week branches, typed differently by each; `anchor` is
// required on the range branch, and still optional for the picker, which may
// be on another branch. `OptionalPicker` takes the same union as an optional
// parameter, which adds `undefined` to it and changes nothing about which
// props every branch declares.
export interface SinglePickerProps {
  mode: 'single';
  label: string;
  clearable?: boolean;
}

export interface RangePickerProps {
  mode: 'range';
  label: string;
  anchor: string;
  numberOfMonths?: number;
}

export interface WeekPickerProps {
  mode: 'week';
  label: string;
  numberOfMonths?: 'one' | 'two';
}

export type PickerProps = SinglePickerProps | RangePickerProps | WeekPickerProps;

export function Picker(props: PickerProps) {
  return <span>{props.label}</span>;
}

export function OptionalPicker(props?: PickerProps) {
  return <span>{props?.label}</span>;
}
