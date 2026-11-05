/**
 * Typed violations returned by `UnitFormatConformance` — one object per
 * violated contract rule, naming the rule and the offending file
 * (`cpt-frontx-feature-unit-format-contract`,
 * `cpt-frontx-dod-unit-format-contract-conformance-suite`).
 *
 * @packageDocumentation
 */

/**
 * The contract rules `UnitFormatConformance` checks, named as the violation
 * taxonomy producer CI reports against:
 *
 * - `naming` — a file does not follow the fixed naming rules
 *   (`<pkg>@<version>/<unit>.<hash>.js`, `<pkg>@<version>.pack.<hash>.js`,
 *   `<pkg>@<version>.graph.<hash>.json`).
 * - `graph-format` — a graph file is not parseable JSON or is missing a
 *   field the contract requires.
 * - `hash-chain` — a content identity in the chain graph file → units/pack
 *   does not match the bytes it names (including the graph file's own name
 *   hash not matching its content).
 * - `requires-closure` — a unit's bare import is not covered by the graph
 *   file's package-level `requires`.
 * - `relative-import` — an intra-package relative import resolves to no
 *   unit in the same graph file.
 * - `byte-identity` — two output directories of the same producer and inputs
 *   disagree in file set or bytes.
 */
export type UnitFormatViolationRule =
  | 'naming'
  | 'graph-format'
  | 'hash-chain'
  | 'requires-closure'
  | 'relative-import'
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
