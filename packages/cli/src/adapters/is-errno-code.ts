/**
 * The one place this package decides whether a rejected filesystem call carries
 * a given errno.
 *
 * Shared by every adapter that turns an fs rejection into a reported state
 * instead of a throw (`fs-target-dir.ts`, `fs-target-path.ts`). Each such
 * adapter partitions rejections the same way — the codes that describe what
 * stands at a path are answers, everything else is rethrown so a guard never
 * reads an unreadable path as free ground — and a second copy of the narrowing
 * would let one adapter's idea of "carries a code" drift from the other's.
 *
 * @packageDocumentation
 */

/**
 * Whether a rejected value is an fs error carrying `code`. Narrowed through a
 * predicate rather than a cast: Node's fs rejections type as `unknown`, and
 * asserting a shape here would trade a compile-time check for a runtime
 * assumption at exactly the boundary that cannot verify it.
 */
export function isErrnoCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
