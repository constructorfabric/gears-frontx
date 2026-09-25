// Fixture for extract.test.ts and compile.test.ts: which components have a
// body of the kit's own. Each bodied one here renders an element on some path
// - after an early `return null`, inside a fragment, on one arm of a ternary -
// so none may state that nothing renders its forwarded attributes; only the
// alias of a callable declared elsewhere has no body to read.
import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import type { DOMAttributes } from 'react';

export type HandlersProps = DOMAttributes<HTMLDivElement> & { open?: boolean; inline?: boolean };

export function NullFirst({ open, ...props }: HandlersProps) {
  if (!open) return null;
  return <div {...props} />;
}

export function InFragment(props: HandlersProps) {
  return (
    <>
      <div {...props} />
    </>
  );
}

export function EitherTag({ inline, ...props }: HandlersProps) {
  return inline ? <span {...props} /> : <div {...props} />;
}

export const Aliased = AccordionPrimitive.Root;
