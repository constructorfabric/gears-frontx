// Fixture for extract.test.ts: key sets an Omit or Pick names in ways the
// checker resolves, and props types whose index keys admit names they do not
// list - including a StringMapping key such as `Uncapitalize<string>`, and a
// type parameter, alone or in an intersection.
import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
const v = cva('b', { variants: { variant: { a: 'a', b: 'b' }, size: { s: 's', m: 'm' } } });

// union: only one branch takes handlers
type Handlers = { onClick?: () => void };
export type UProps = ({ kind: 'a' } & Handlers) | { kind: 'b' };
export function UnionHandlers(props: UProps) {
  return <button type="button" data-k={props.kind} />;
}
// Uncapitalize<string> index
export type IdxProps = { label?: string; [k: Uncapitalize<string>]: unknown };
export function MappedIdx(props: IdxProps) {
  return <button type="button" data-l={String(props.label)} />;
}
// Pick never keeps nothing
export interface PNProps extends Pick<VariantProps<typeof v>, never> { x?: string }
export function PickNever({ x }: PNProps) {
  return <div className={v()} data-x={x} />;
}
// Omit via alias of never
type None = keyof Record<never, never>;
export interface ONProps extends Omit<VariantProps<typeof v>, None> { x?: string }
export function OmitNone({ x, variant }: ONProps) {
  return <div className={v({ variant })} data-x={x} />;
}
// Exclude to never
export interface EXProps extends Omit<VariantProps<typeof v>, Exclude<'size', 'size'>> { x?: string }
export function OmitExclude({ x, size }: EXProps) {
  return <div className={v({ size })} data-x={x} />;
}
// Omit via key alias
type K = 'size';
export interface KAProps extends Omit<VariantProps<typeof v>, K> { x?: string }
export function OmitAlias({ x, variant }: KAProps) {
  return <div className={v({ variant })} data-x={x} />;
}
// Omit keyof other
type Other = { size?: unknown };
export interface KOProps extends Omit<VariantProps<typeof v>, keyof Other> { x?: string }
export function OmitKeyofOther({ x, variant }: KOProps) {
  return <div className={v({ variant })} data-x={x} />;
}
// props intersect ComponentProps<'button'> minus handlers via Omit of template literal keys
type NoHandlers = Omit<ComponentProps<'button'>, `on${string}`>;
export function NoHandlerButton(props: NoHandlers) {
  return <button type="button" {...props} />;
}

export function MappedOverButton(props: NoHandlers & { [k: Uncapitalize<string>]: unknown }) {
  return <button type="button" {...props} />;
}
export function TemplateOverButton(props: NoHandlers & { [k: `on${string}`]: unknown }) {
  return <button type="button" {...props} />;
}
// A type parameter may be instantiated with any subtype, handlers included,
// alone or met in an intersection.
export function Generic<P extends NoHandlers>(props: P) {
  return <button type="button" {...props} />;
}
export function GenericIntersection<P extends object>(props: NoHandlers & P) {
  return <button type="button" {...props} />;
}
