/**
 * Typed violations returned by `UnitFormatConformance` — one object per
 * violated contract rule, naming the rule and the offending file
 * (`cpt-frontx-feature-unit-format-contract`,
 * `cpt-frontx-dod-unit-format-contract-conformance-suite-v2`).
 *
 * @packageDocumentation
 */

/**
 * The contract rules `UnitFormatConformance` checks, named as the violation
 * taxonomy producer CI reports against:
 *
 * - `naming` — a file does not follow the fixed naming rules
 *   (`<pkg>@<version>/<path>.<hash>.js`,
 *   `<pkg>@<version>/<entry>.list.<hash>.json`,
 *   `<pkg>@<version>/pattern/<name>.<hash>.<ext>`).
 * - `list-format` — a fetch-list document or the manifest's `entryLists`
 *   reference is not parseable JSON or is missing a field the contract
 *   requires.
 * - `hash-chain` — a content identity in the chain list document →
 *   items (or manifest → list document) does not match the bytes it
 *   names (including a file's own name hash not matching its content).
 * - `list-completeness` — a list-closure violation on a fetch list: a
 *   specifier or `{ item }` edge with no answering item on the entry's
 *   combined lists, a specifier answered by more than one item across
 *   the combined lists, or a lazy/pattern document carrying a chunk a
 *   parent chain's lists already carry (the delta property).
 * - `consumer-independence` — the same `package@version` emitted by two
 *   builds carrying different consumer subsets disagrees in file set or
 *   bytes under that package's directory.
 * - `byte-identity` — two output directories of the same producer and inputs
 *   disagree in file set or bytes.
 */
export type UnitFormatViolationRule =
  | 'naming'
  | 'list-format'
  | 'hash-chain'
  | 'list-completeness'
  | 'consumer-independence'
  | 'byte-identity';

/**
 * One contract violation: the rule that was violated, the offending file
 * (a path relative to the output directory, or the output directory itself
 * for cross-build disagreements), and a human-readable detail.
 */
export interface UnitFormatViolation {
  /** The contract rule that was violated. */
  rule: UnitFormatViolationRule;
  /**
   * The offending file — a path relative to the output directory it was
   * found in, prefixed by the output directory argument when two output
   * directories are compared.
   */
  file: string;
  /** Human-readable description of the violation. */
  detail: string;
}
