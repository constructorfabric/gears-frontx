/**
 * The one wording rule for quoting a refused directory's contents back to a
 * developer: a few names, then a count of the rest.
 *
 * Shared by the seed flow's empty-target refusal
 * (cpt-frontx-dod-cli-scaffolding-seed-empty-target, over entry names) and the
 * add flow's occupied-ground refusal
 * (cpt-frontx-dod-cli-scaffolding-add-undeclared-content, over repository-relative
 * paths). Two copies would let one refusal quote everything while the other
 * samples, and a developer comparing the two would read the difference as the
 * two guards having found different KINDS of thing rather than the same kind
 * with different wording.
 *
 * @packageDocumentation
 */

// How many names a refusal quotes before summarizing the rest. A developer
// needs enough to recognize their own directory, not an inventory of it — and a
// repository with thousands of files would otherwise produce a message no
// terminal can show.
const REFUSAL_ENTRY_SAMPLE = 5;

/**
 * Quotes the first few names and counts the rest, so a refusal carries enough
 * evidence for a developer to recognize what was found without listing it all.
 *
 * Sorted first: filesystem listing order is platform-dependent, and a refusal
 * whose wording shifts between runs on one unchanged directory reads as
 * instability in the tool rather than as a fixed property of the directory.
 */
export function summarizeEntries(entries: string[]): string {
  const sorted = [...entries].sort();
  const shown = sorted.slice(0, REFUSAL_ENTRY_SAMPLE).join(', ');
  // `slice` already caps at the array length, so the remainder cannot go
  // negative and needs no clamping.
  const remaining = sorted.length - REFUSAL_ENTRY_SAMPLE;
  return remaining <= 0 ? shown : `${shown}, and ${remaining} more`;
}
