// Fixture for compile.test.ts: a component declaring its own `type` over the
// <button> it renders. The element surface states `type` as the enum a
// <button> takes, written in the order the attribute is documented; the
// extractor states it sorted. `Action` declares the same three values and so
// agrees with the surface whatever order either side lists them in;
// `NarrowAction` drops one, which no ordering can reconcile.
import type { ComponentProps } from 'react';

export interface ActionProps extends Omit<ComponentProps<'button'>, 'type'> {
  type?: 'button' | 'submit' | 'reset';
}

export function Action({ type = 'button', ...props }: ActionProps) {
  return <button type={type} {...props} />;
}

export interface NarrowActionProps extends Omit<ComponentProps<'button'>, 'type'> {
  type?: 'button' | 'submit';
}

export function NarrowAction({ type = 'button', ...props }: NarrowActionProps) {
  return <button type={type} {...props} />;
}
