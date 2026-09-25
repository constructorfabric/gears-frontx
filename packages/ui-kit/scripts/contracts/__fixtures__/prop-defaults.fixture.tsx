// Fixture for extract.test.ts and compile.test.ts: defaults a component
// writes into its own destructured props parameter.
//
//   - `Chip` writes its own defaults and has no variant declaration at all;
//   - `OutlineAction` reuses `Action`'s variant axis through Pick and writes a
//     default of its own for it, which is what a caller who passes nothing
//     gets - not the variant declaration's;
//   - `Sized` writes a default the extractor cannot evaluate;
//   - `QuietAction` removes the reused `variant` axis with Omit and declares
//     its own, and `LabelOnly` keeps only `label` with Pick: neither takes
//     the reused variant axis at all;
//   - `Renamed` binds a prop under another local name;
//   - `SubmitButton` writes a default for an attribute it forwards, which the
//     contract has no property for;
//   - `ResetAction` writes `null` for a variant axis, which the variant types
//     admit and the axis's enum does not;
//   - `OmitAliased` is an alias of a callable typed through Omit, the form
//     read from the instantiated type rather than from a node.
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, FC } from 'react';

const actionVariants = cva('action', {
  variants: { variant: { default: 'v-default', outline: 'v-outline' } },
  defaultVariants: { variant: 'default' },
});

export interface ActionProps extends VariantProps<typeof actionVariants> {
  label: string;
}

export function Action({ variant, label }: ActionProps) {
  return <button className={actionVariants({ variant })}>{label}</button>;
}

export interface ChipProps {
  tone?: 'info' | 'warning';
  count?: number;
  dense?: boolean;
  hint?: string | null;
  offset?: number;
}

export function Chip({ tone = 'info', count = 3, dense = false, hint = null, offset = -1 }: ChipProps) {
  return <span data-tone={tone} data-count={count} data-dense={dense} data-offset={offset}>{hint}</span>;
}

export type OutlineActionProps = Pick<ActionProps, 'variant' | 'label'>;

export function OutlineAction({ variant = 'outline', label }: OutlineActionProps) {
  return <Action variant={variant} label={label} />;
}

const DEFAULT_SIZE = 'md';

export interface SizedProps {
  size?: string;
}

export function Sized({ size = DEFAULT_SIZE }: SizedProps) {
  return <span data-size={size} />;
}

export interface QuietActionProps extends Omit<ActionProps, 'variant'> {
  variant?: 'quiet' | 'loud';
}

export function QuietAction({ variant = 'quiet', label }: QuietActionProps) {
  return <span data-variant={variant}>{label}</span>;
}

export type LabelOnlyProps = Pick<ActionProps, 'label'>;

export function LabelOnly({ label }: LabelOnlyProps) {
  return <span>{label}</span>;
}

export function Renamed({ tone: t = 'info' }: ChipProps) {
  return <span data-tone={t} />;
}

export function SubmitButton({ type = 'submit', ...props }: ComponentProps<'button'>) {
  return <button type={type} {...props} />;
}

export function ResetAction({ variant = null, label }: ActionProps) {
  return <Action variant={variant} label={label} />;
}

declare const OmitCallable: FC<Omit<ActionProps, 'variant'>>;

export const OmitAliased = OmitCallable;
