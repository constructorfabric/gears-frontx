// Fixture for extract.test.ts: Omit key sets the walk has to read. `AliasKeys`
// names its keys through a type alias, which the checker lists; `ViaQuery`
// reaches an Omit instantiated inside a generic factory through a type query.
import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
const baseVariants = cva('base', { variants: { variant: { a: 'a', b: 'b' } }, defaultVariants: { variant: 'a' } });
export interface BaseProps extends VariantProps<typeof baseVariants> { label?: string }
type Keys = 'variant';
export function AliasKeys({ label }: Omit<BaseProps, Keys>) {
  return <span className={baseVariants()}>{label}</span>;
}
const make =
  <K extends keyof BaseProps>() =>
  (props: Omit<BaseProps, K>) => <span data-count={Object.keys(props).length} />;
export const Inner = make<'label'>();
export function ViaQuery({ variant }: ComponentProps<typeof Inner>) {
  return <span className={baseVariants({ variant })} />;
}

// Key sets that resolve to `never` remove nothing: `Omit<X, never>` and
// `Omit<X, keyof {}>` keep every axis.
export interface OmitNeverProps extends Omit<VariantProps<typeof baseVariants>, never> {
  label?: string;
}

export function OmitNever({ variant, label }: OmitNeverProps) {
  return <button className={baseVariants({ variant })}>{label}</button>;
}

type Empty = Record<never, never>;

export interface OmitKeyofEmptyProps extends Omit<VariantProps<typeof baseVariants>, keyof Empty> {
  label?: string;
}

export function OmitKeyofEmpty({ variant, label }: OmitKeyofEmptyProps) {
  return <button className={baseVariants({ variant })}>{label}</button>;
}
