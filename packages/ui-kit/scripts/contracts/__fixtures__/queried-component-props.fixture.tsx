// Fixture for extract.test.ts: props helpers whose element argument names a
// component with `typeof` instead of a tag. The tag is written in that
// component's own props type, so the walk has to continue there:
//
//   - `QueriesLocal` asks for a kit-style component declared in this file,
//     whose parameter is annotated with a named props type;
//   - `QueriesPrimitive` asks for a Base UI part, declared as a
//     `ForwardRefExoticComponent` whose parameter only the instantiated type
//     describes;
//   - `QueriesByParameters` reaches the same local component through
//     `Parameters<typeof X>[0]`, the other spelling of its props type;
//   - `QueriesOverloaded` asks for an overloaded component, whose props
//     TypeScript infers from the last overload.
import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import type { ComponentProps, ComponentPropsWithRef, JSX } from 'react';

type LocalProps = ComponentProps<'section'>;

function Local(props: LocalProps) {
  return <section {...props} />;
}

export type QueriesLocalProps = ComponentProps<typeof Local>;

export function QueriesLocal(props: QueriesLocalProps) {
  return <Local {...props} />;
}

export interface QueriesPrimitiveProps
  extends Omit<ComponentPropsWithRef<typeof AccordionPrimitive.Trigger>, 'className'> {
  className?: string;
}

export function QueriesPrimitive(props: QueriesPrimitiveProps) {
  return <AccordionPrimitive.Trigger {...props} />;
}

export type QueriesByParametersProps = Parameters<typeof Local>[0];

export function QueriesByParameters(props: QueriesByParametersProps) {
  return <Local {...props} />;
}

// Two overloads, each taking a props parameter: TypeScript infers
// `ComponentProps<typeof Overloaded>` from the last, and the walk follows it
// and says the others were passed over.
function Overloaded(props: ComponentProps<'article'>): JSX.Element;
function Overloaded(props: ComponentProps<'aside'>): JSX.Element;
function Overloaded(props: ComponentProps<'article'> | ComponentProps<'aside'>) {
  return <aside {...(props as ComponentProps<'aside'>)} />;
}

export type QueriesOverloadedProps = ComponentProps<typeof Overloaded>;

export function QueriesOverloaded(props: QueriesOverloadedProps) {
  return <Overloaded {...props} />;
}
