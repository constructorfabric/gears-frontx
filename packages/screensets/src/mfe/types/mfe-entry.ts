/**
 * MFE Entry Type Definitions
 *
 * MfeEntry defines the communication contract of an MFE - required/optional properties
 * and bidirectional action capabilities.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-frontx-dod-mfe-registry-type-contracts:p1

/**
 * Defines an entry point with its communication contract (PURE CONTRACT - Abstract Base)
 * GTS Type: gts.frontx.mfes.mfe.entry.v1~
 */
export interface MfeEntry {
  /** The GTS type ID for this entry */
  id: string;
  /** SharedProperty type IDs that MUST be provided by domain */
  requiredProperties: string[];
  /** SharedProperty type IDs that MAY be provided by domain (optional field) */
  optionalProperties?: string[];
  /** Action type IDs this entry is capable of receiving and executing */
  actions: string[];
  /** Action type IDs the parent extension domain must support for this entry to be injectable */
  domainActions: string[];
}
