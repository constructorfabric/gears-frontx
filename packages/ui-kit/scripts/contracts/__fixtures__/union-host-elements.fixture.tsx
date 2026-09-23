// Fixture for extract.test.ts: a union of props types whose branches render
// different host elements. The contract can name one surface, so the first
// branch's element is kept and the disagreement is noted rather than hidden.
import type { ComponentProps } from 'react';

export type LinkOrButtonProps = (ComponentProps<'a'> & { as: 'link' }) | (ComponentProps<'button'> & { as: 'button' }) | undefined;

export function LinkOrButton(props: LinkOrButtonProps) {
  return <span>{props?.as}</span>;
}
