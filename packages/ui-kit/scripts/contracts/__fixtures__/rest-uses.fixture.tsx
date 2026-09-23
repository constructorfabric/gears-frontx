// Fixture for extract.test.ts: bodies that use the rest or whole props object
// beyond its spread, next to the other shapes a literal attribute before the
// spread is weighed against. Each export is named for its case; extract.test.ts
// states what each reads as.
import type { ComponentProps, ReactElement } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const baseVariants = cva('base', {
  variants: { variant: { default: 'v-default', ghost: 'v-ghost', solid: 'v-solid' } },
  defaultVariants: { variant: 'default' },
});
export interface BaseProps extends VariantProps<typeof baseVariants> {
  label?: string;
  size?: number;
  tone?: string;
}
export function Base({ variant, label, size }: BaseProps) {
  return <button className={baseVariants({ variant })} data-size={size}>{label}</button>;
}

// 1. whole props, raw read of props.variant elsewhere
export function WholeRawRead(props: BaseProps) {
  const icon = props.variant === 'ghost' ? 'x' : 'y';
  return <Base variant="ghost" data-icon={icon} {...props} />;
}
// 2. rest, raw read rest.variant elsewhere
export function RestRawRead({ label, ...rest }: BaseProps) {
  const icon = rest.variant === 'ghost' ? label : 'y';
  return <Base variant="ghost" data-icon={icon} {...rest} />;
}
// 3. coalesced on a forwarded attribute (className)
export function CoalescedForwarded({ className, ...rest }: BaseProps & ComponentProps<'div'>) {
  return <div className={className ?? 'k'} {...rest} />;
}
// 4. coalesced literal, but the binding is only used as a data attribute; prop tone otherwise unused
export function CoalescedTone({ tone, ...rest }: BaseProps) {
  return <Base data-tone={tone ?? 'warm'} {...rest} />;
}
// 5. reassigned but no ?? read
export function ReassignedOnly({ size, ...rest }: BaseProps) {
  if (size === undefined) size = 2;
  return <Base size={size} {...rest} />;
}
// 6. switch return in a nested block with an element inside a labelled try/finally
export function TryFinally(props: BaseProps) {
  try {
    return <Base variant="ghost" {...props} />;
  } finally {
    // nothing
  }
}
// 7. element returned via satisfies
export function Satisfies(props: BaseProps) {
  return (<Base variant="ghost" {...props} />) satisfies ReactElement;
}
// 8. rest spread twice on the one returned element
export function RestTwice(props: BaseProps) {
  return <Base variant="ghost" {...props} size={1} {...props} />;
}
// 9. rest spread inside a conditional spread expression {...(cond ? props : {})}
export function CondSpread(props: BaseProps & { off?: boolean }) {
  return <Base variant="ghost" {...(props.off ? {} : props)} />;
}
// 10. object spread in JSX attr computed
export function ComputedSpread(props: BaseProps) {
  const p = { ...props };
  return <Base variant="ghost" {...p} />;
}
// 11. coalesced with a template literal without substitution
export function Tmpl({ tone, ...rest }: BaseProps) {
  return <Base data-tone={tone ?? `warm`} {...rest} />;
}
// 12. coalesced read under a different binding shadowing in inner scope
export function Shadow({ tone, ...rest }: BaseProps) {
  const f = (tone: string | undefined) => tone;
  return <Base data-tone={(tone ?? 'warm') + f('x')} {...rest} />;
}
// 13. delete/ mutate rest before spread
export function MutateRest({ label, ...rest }: BaseProps) {
  rest.variant = rest.variant ?? 'solid';
  return <Base variant="ghost" data-l={label} {...rest} />;
}
// 14. Object.assign on rest
export function AssignRest({ label, ...rest }: BaseProps) {
  Object.assign(rest, { variant: 'solid' });
  return <Base variant="ghost" data-l={label} {...rest} />;
}

export function RestReassigned({ label, ...rest }: BaseProps) {
  rest = { ...rest, variant: rest.variant ?? 'solid' };
  return <Base variant="ghost" data-l={label} {...rest} />;
}
export function WholeNullishAssign(props: BaseProps) {
  props.variant ??= 'solid';
  return <Base variant="ghost" {...props} />;
}
