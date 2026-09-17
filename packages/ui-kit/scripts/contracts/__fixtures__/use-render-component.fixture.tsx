// Fixture for extract.test.ts: components that render through Base UI's
// `useRender` and carry no JSX node at all. This is the kit's own
// polymorphism idiom (see src/components/badge/badge.tsx) - the hook returns
// the element, so a walk that asks only "does this body contain JSX" reads
// the component as not one and drops it before any props are read.
// `AliasedTag` imports the hook under another name, so recognising it proves
// the check resolves the callee's symbol rather than matching the text at the
// call site.
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender, useRender as renderWith } from '@base-ui/react/use-render';

export interface TagProps extends useRender.ComponentProps<'span'> {
  tone?: 'info' | 'warning';
}

export function Tag({ tone, render, ...props }: TagProps) {
  return useRender({
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>({ className: tone }, props),
  });
}

export interface AliasedTagProps extends useRender.ComponentProps<'span'> {
  label: string;
}

export const AliasedTag = ({ label, render, ...props }: AliasedTagProps) =>
  renderWith({
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>({ 'aria-label': label }, props),
  });
