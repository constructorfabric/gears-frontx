// Fixture for compile.test.ts: a component whose own props include handlers
// that all state one fact, so one statement group covers them.
export interface HandlersProps {
  label: string;
  onAbort?: () => void;
  onBlur?: () => void;
}

export function Handlers({ label }: HandlersProps) {
  return <span>{label}</span>;
}

// A props type with a string index signature admits names it does not list,
// so it may take any handler whatever its listed props are.
export interface IndexedProps {
  label: string;
  [name: string]: unknown;
}

export function Indexed({ label }: IndexedProps) {
  return <span>{label}</span>;
}

// A template-literal key admits every name it spells, here every handler.
export interface TemplateIndexedProps {
  label: string;
  [name: `on${string}`]: (() => void) | string;
}

export function TemplateIndexed({ label }: TemplateIndexedProps) {
  return <span>{label}</span>;
}

// An index signature on one member of an intersection admits unlisted names
// for the whole type.
export type IntersectionIndexedProps = { label: string } & { [name: string]: unknown };

export function IntersectionIndexed({ label }: IntersectionIndexedProps) {
  return <span>{String(label)}</span>;
}

// A number index admits no attribute name.
export interface NumberIndexedProps {
  label?: string;
  [index: number]: string;
}

export function NumberIndexed({ label }: NumberIndexedProps) {
  return <span>{label}</span>;
}
