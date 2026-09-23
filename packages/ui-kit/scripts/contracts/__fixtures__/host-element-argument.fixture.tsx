// Fixture for extract.test.ts: a props helper the walk recognises whose
// element argument is not a tag it can read. `ComponentProps<'h1' | 'h2'>`
// is React's own helper, so the walk stops there as it should, but a union
// of two tags names no single host element. The walk used to return from
// that branch with nothing said, which left the component forwarding a whole
// DOM surface with no element to name it and no note of why; the fixture
// holds it to recording what it could not read.
import type { ComponentProps } from 'react';

export type HeadingProps = ComponentProps<'h1' | 'h2'> & {
  level?: 1 | 2;
};

export function Heading({ level = 1, ...props }: HeadingProps) {
  return level === 1 ? <h1 {...props} /> : <h2 {...props} />;
}
