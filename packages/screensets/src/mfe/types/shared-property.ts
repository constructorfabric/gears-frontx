/**
 * Shared Property Type Definitions
 *
 * SharedProperty represents a typed value passed from the host to its mounted MFEs.
 *
 * @packageDocumentation
 */

/**
 * Defines a shared property instance passed from host to MFE
 * GTS Type: gts.frontx.mfes.comm.shared_property.v1~
 */
export interface SharedProperty {
  /** The GTS type ID for this shared property */
  id: string;
  /** The shared property value */
  value: unknown;
}
