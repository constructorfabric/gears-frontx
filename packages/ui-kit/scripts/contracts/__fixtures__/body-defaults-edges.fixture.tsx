// Fixture for extract.test.ts: the shapes around a body-written default that
// must not be read as one, and the ones that must. Each export is named for
// the case it holds; extract.test.ts states what each reads as.
import { forwardRef, memo, cloneElement, type ReactElement } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const baseVariants = cva('base', {
  variants: { variant: { default: 'v-default', ghost: 'v-ghost', solid: 'v-solid' } },
  defaultVariants: { variant: 'default' },
});

export interface BaseProps extends VariantProps<typeof baseVariants> {
  label?: string;
  size?: number;
  disabled?: boolean;
  inline?: boolean;
  child?: ReactElement;
}

export function Base({ variant, label, size, disabled }: BaseProps) {
  return (
    <button className={baseVariants({ variant })} data-size={size} disabled={disabled}>
      {label}
    </button>
  );
}

// shorthand raw read
export function ShorthandRaw({ variant, ...props }: BaseProps) {
  const cls = baseVariants({ variant });
  return <Base variant={variant ?? 'ghost'} data-cls={cls} {...props} />;
}

// ternary return
export function Ternary(props: BaseProps) {
  return props.inline ? <Base {...props} /> : <Base variant="ghost" {...props} />;
}

// fragment return path
export function FragmentPath(props: BaseProps) {
  if (props.inline) return <><Base {...props} /></>;
  return <Base variant="ghost" {...props} />;
}

// call return path
export function CallPath(props: BaseProps) {
  if (props.child) return cloneElement(props.child, props);
  return <Base variant="ghost" {...props} />;
}

// later other spread
// Optional in its type, so the compiler does not flag the attribute before
// it as always overwritten; the walk cannot know which it carries either way.
const overrides: Partial<BaseProps> = { variant: 'solid' };
export function LaterSpread(props: BaseProps) {
  return <Base variant="ghost" {...props} {...overrides} />;
}

// || instead of ??
export function OrDefault({ variant, ...props }: BaseProps) {
  return <Base variant={variant || 'ghost'} {...props} />;
}

// reassigned
export function Reassigned({ variant, ...props }: BaseProps) {
  if (props.inline) variant = 'solid';
  return <Base variant={variant ?? 'ghost'} {...props} />;
}

// forwardRef / memo
export const Forwarded = forwardRef<HTMLButtonElement, BaseProps>(({ variant, ...props }, _ref) => (
  <Base variant={variant ?? 'ghost'} {...props} />
));
export const Memoed = memo(function Memoed(props: BaseProps) {
  return <Base size={3} {...props} />;
});

// nested spreads, root not
export function NestedSpread(props: BaseProps) {
  return (
    <div>
      <Base variant="ghost" {...props} />
    </div>
  );
}

// coalesced in a closure only
export function ClosureOnly({ size, ...props }: BaseProps) {
  const read = () => size ?? 5;
  return <Base data-x={read()} {...props} />;
}

// an early `null` return beside the one returned element
export function NullPath(props: BaseProps) {
  if (props.inline) return null;
  return <Base variant="ghost" {...props} />;
}

// coalesced but result not used as the prop
export function CoalescedElsewhere({ size, ...props }: BaseProps) {
  return <Base data-size={size ?? 4} size={1} {...props} />;
}

// coalesced only on one branch of a condition: an inline caller who passes
// nothing gets 1, not 2
export function CoalescedUnderCondition({ size, inline, ...props }: BaseProps) {
  return <Base size={inline ? 1 : (size ?? 2)} inline={inline} {...props} />;
}

// another spread between the literal and the rest spread may carry the name
const ctx: { itemProps: Pick<BaseProps, 'variant'> } = { itemProps: { variant: 'solid' } };
export function SpreadBetween({ label, ...rest }: BaseProps) {
  return <Base variant="ghost" {...ctx.itemProps} {...rest} label={label} />;
}

// ??= assignment
export function NullishAssign({ variant, ...props }: BaseProps) {
  variant ??= 'solid';
  return <Base variant={variant} {...props} />;
}

// spread of destructured rest re-bound
export function Rebound({ label, ...rest }: BaseProps) {
  const other = rest;
  return <Base variant="ghost" {...other} label={label} />;
}

// the element returned through an `as` expression
export function AsExpr(props: BaseProps) {
  return (<Base variant="ghost" {...props} />) as ReactElement;
}

// the only element sits in an object method or a getter that is never
// rendered - its return is the method's, not the component's
export function MethodReturn(props: BaseProps) {
  const unused = {
    render() {
      return <Base variant="ghost" {...props} />;
    },
  };
  void unused;
  return null;
}

export function GetterReturn(props: BaseProps) {
  const unused = {
    get el() {
      return <Base variant="ghost" {...props} />;
    },
  };
  void unused;
  return null;
}
