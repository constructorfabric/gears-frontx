// Fixture for extract.test.ts: components whose props come from a library
// the kit wraps rather than from the primitive library it builds on.
//
//   - `SecondTitle` reuses a part of the second primitive library, whose props
//     helper names its element the way the render hook's does;
//   - `PopoverHeading` reuses a primitive title typed to admit h1 to h6, whose
//     own declaration documents the one it renders;
//   - `Panel` reuses a third-party panel whose props extend React's
//     `HTMLAttributes<HTMLDivElement>`, naming its element by DOM interface;
//   - `Region` and `Cell` name theirs by interface directly, one that stands for
//     a single tag and one (`HTMLElement`) that stands for many;
//   - `Handlers` takes React's event handlers through a type that names no
//     element at all, the way a library's own adapted handler types do.
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Questionnaire as SecondPrimitive } from '@shadcn/react/questionnaire';
import type { ComponentProps, DOMAttributes, HTMLAttributes } from 'react';
import * as PanelPrimitive from 'react-resizable-panels';

export type SecondTitleProps = ComponentProps<typeof SecondPrimitive.Title>;

export function SecondTitle(props: SecondTitleProps) {
  return <SecondPrimitive.Title {...props} />;
}

export type PopoverHeadingProps = PopoverPrimitive.Title.Props;

export function PopoverHeading(props: PopoverHeadingProps) {
  return <PopoverPrimitive.Title {...props} />;
}

export type PanelProps = PanelPrimitive.PanelProps;

export function Panel(props: PanelProps) {
  return <PanelPrimitive.Panel {...props} />;
}

export type RegionProps = HTMLAttributes<HTMLDivElement> & { label: string };

export function Region({ label, ...props }: RegionProps) {
  return <div aria-label={label} {...props} />;
}

export type CellProps = HTMLAttributes<HTMLElement>;

export function Cell(props: CellProps) {
  return <section {...props} />;
}

export type HandlersProps = DOMAttributes<HTMLDivElement>;

export function Handlers(props: HandlersProps) {
  return <div {...props} />;
}
