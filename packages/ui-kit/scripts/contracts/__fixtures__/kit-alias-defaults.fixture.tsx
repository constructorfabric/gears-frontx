// Fixture for extract.test.ts: defaults an alias or a wrapper takes from a kit
// component's own body, found through the value the alias or the element
// names, never through its type.
//
// `Item`, `NotedItem`, `Content` and `Other` are kit components whose bodies
// write defaults; `NotedItem` and `Content` each write one default that is not
// a literal, which their own notes record.
//
// Aliases: `ItemAlias`, `ItemAliasTwice` and `NotedItemAlias` name a kit
// component through a const chain and read its body, notes included. The
// others name a value that is not one through a const chain - a library's
// callable, a conditional, a cast, a `let`, a higher-order component, memo -
// and read nothing.
//
// Wrappers: `Wrapper` renders `Content` with one spread of its rest and writes
// `align` itself, so it takes `side` and `offset` from `Content` but not
// `align`. `WrapperOfWrapper` passes everything to `Wrapper` and so takes all
// three. Each `No*` wrapper breaks one condition: for the one prop it names,
// which alone is not taken, or for the element's whole shape, which takes
// nothing.
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { type ComponentType, forwardRef, memo, type ReactElement } from 'react';

export interface ItemProps {
  indicatorSide?: 'start' | 'end';
  label?: string;
}

export function Item({ indicatorSide = 'end', label }: ItemProps) {
  return <span data-side={indicatorSide}>{label}</span>;
}

const fallbackLabel = 'Item';

export function NotedItem({ indicatorSide = 'end', label = fallbackLabel }: ItemProps) {
  return <span data-side={indicatorSide}>{label}</span>;
}

export const ItemAlias = Item;

const LocalItem = Item;
export const ItemAliasTwice = LocalItem;

export const NotedItemAlias = NotedItem;

export const LibraryAlias = DialogPrimitive.Root;

export interface ContentProps {
  side?: 'top' | 'bottom' | 'left';
  align?: 'start' | 'end';
  offset?: number;
  tone?: string;
}

const fallbackTone = 'muted';

export function Content({ side = 'bottom', align = 'start', offset = 4, tone = fallbackTone }: ContentProps) {
  return <div data-side={side} data-align={align} data-offset={offset} data-tone={tone} />;
}

export function Other({ side = 'left', align = 'end', offset = 9, tone }: ContentProps) {
  return <div data-side={side} data-align={align} data-offset={offset} data-tone={tone} />;
}

// Values whose type says `Content` while something else may render.
const Chosen = Math.random() > 0.5 ? Content : Other;
const Casted = Other as unknown as typeof Content;
function withTop<T>(component: T): T {
  const Inner = component as unknown as ComponentType<ContentProps>;
  return ((props: ContentProps) => <Inner side="top" {...props} />) as unknown as T;
}
const TopContent = withTop(Content);
const Parts = { Content: Other as typeof Content };
let Reassigned = Content;
Reassigned = Other;
const MemoContent = memo(Content);
const ForwardContent = forwardRef<HTMLDivElement, ContentProps>(function ForwardContent({ side = 'bottom' }, ref) {
  return <div ref={ref} data-side={side} />;
});

export const ChosenAlias = Chosen;
export const CastAlias = Casted;
export const HocAlias = TopContent;
export const MemoAlias = MemoContent;
export let LetAlias = Content;
LetAlias = Other;

export function Wrapper({ align = 'end', ...props }: ContentProps) {
  return <Content align={align} {...props} />;
}

export function WrapperOfWrapper(props: ContentProps) {
  return <Wrapper {...props} />;
}

// Writes `side` after the spread: the element, not the caller, decides it.
export function NoWrittenAgain(props: ContentProps) {
  return <Content {...props} side="top" />;
}

// A second spread may carry any prop.
export function NoTwoSpreads({ tone, ...props }: ContentProps) {
  const extra = { tone };
  return <Content {...props} {...extra} />;
}

// One of two returns.
export function NoTwoReturns({ tone, ...props }: ContentProps) {
  if (tone === 'hidden') return <span />;
  return <Content {...props} />;
}

// `side` is read through the rest beyond its spread.
export function NoRestRead({ ...props }: ContentProps) {
  console.log(props.side);
  return <Content {...props} />;
}

// Destructures `side` and passes it on computed.
export function NoDestructured({ side, ...props }: ContentProps) {
  return <Content side={side === 'top' ? 'top' : undefined} {...props} />;
}

// The whole props object handed to a call, which may change any prop.
export function NoWholeUse(props: ContentProps) {
  Object.assign(props, { side: 'top' });
  return <Content {...props} />;
}

// A library element and an intrinsic one.
export function NoLibrary(props: ContentProps & { className?: string }) {
  return <DialogPrimitive.Close {...props} />;
}

export function NoIntrinsic(props: ContentProps & { className?: string }) {
  return <div {...props} />;
}

// Kit components reached through memo and forwardRef.
export function NoMemo(props: ContentProps) {
  return <MemoContent {...props} />;
}

export function NoForwardRef(props: ContentProps) {
  return <ForwardContent {...props} />;
}

// Values whose type says `Content`: a conditional, a cast, a higher-order
// component, an object member and a reassigned `let`.
export function NoChosen(props: ContentProps) {
  return <Chosen {...props} />;
}

export function NoCast(props: ContentProps) {
  return <Casted {...props} />;
}

export function NoHoc(props: ContentProps) {
  return <TopContent {...props} />;
}

export function NoObjectMember(props: ContentProps) {
  return <Parts.Content {...props} />;
}

export function NoLet(props: ContentProps) {
  return <Reassigned {...props} />;
}

// Its own type for `side` does not accept the `bottom` Content writes.
export function NarrowWrapper(props: { side?: 'top' | 'left' }) {
  return <Content {...props} />;
}

// A chain of wrappers: inner components are followed four levels down, so
// `Level4` takes Content's defaults and `Level5` takes none.
export function Level1(props: ContentProps) {
  return <Content {...props} />;
}
export function Level2(props: ContentProps) {
  return <Level1 {...props} />;
}
export function Level3(props: ContentProps) {
  return <Level2 {...props} />;
}
export function Level4(props: ContentProps) {
  return <Level3 {...props} />;
}
export function Level5(props: ContentProps) {
  return <Level4 {...props} />;
}

// Two components that render each other.
export function CycleA({ side = 'top', ...props }: ContentProps): ReactElement {
  return <CycleB data-side={side} {...props} />;
}
export function CycleB(props: ContentProps): ReactElement {
  return <CycleA {...props} />;
}
