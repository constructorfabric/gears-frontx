/**
 * GTS Package Extraction Utility
 *
 * Provides utilities for extracting GTS package identifiers from entity IDs.
 *
 * A GTS package is the first two dot-segments of an entity's instance portion.
 * For example, in the entity ID:
 *   'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.helloworld.v1'
 *
 * The instance portion is the last tilde-delimited segment:
 *   'frontx.demo.screens.helloworld.v1'
 *
 * The GTS package is the first two dot-segments:
 *   'frontx.demo'
 *
 * @packageDocumentation
 */
// @cpt-algo:cpt-frontx-algo-mfe-registry-gts-package-discovery:p1

/**
 * Extract the GTS package identifier from a GTS entity ID.
 *
 * A GTS package groups related entities by their shared two-segment prefix.
 * This function extracts that prefix from the instance-specific portion of
 * a GTS entity ID.
 *
 * Algorithm:
 * 1. Split the entity ID on '~' to get tilde-delimited segments
 * 2. Take the last segment (the instance-specific portion)
 * 3. Split that segment on '.' to get dot-segments
 * 4. Return the first two dot-segments joined by '.'
 *
 * @param entityId - A GTS entity ID (instance ID, not schema type ID)
 * @returns The GTS package string (e.g., 'frontx.demo')
 *
 * @throws {Error} if the entity ID has fewer than 2 dot-segments in its instance portion
 * @throws {Error} if the entity ID contains no '~' delimiter (not a valid GTS ID)
 * @throws {Error} if the entity ID is a schema type ID (ends with '~')
 *
 * @example
 * ```typescript
 * // Extension with derived type (3 tilde-segments)
 * extractGtsPackage('gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.helloworld.v1')
 * // Returns: 'frontx.demo'
 *
 * // Manifest with base type (2 tilde-segments)
 * extractGtsPackage('gts.frontx.mfes.mfe.mf_manifest.v1~frontx.demo.mfe.manifest.v1')
 * // Returns: 'frontx.demo'
 *
 * // Entry with derived type (3 tilde-segments)
 * extractGtsPackage('gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.demo.mfe.helloworld.v1')
 * // Returns: 'frontx.demo'
 * ```
 */
// @cpt-begin:cpt-frontx-algo-mfe-registry-gts-package-discovery:p1:inst-1
export function extractGtsPackage(entityId: string): string {
  // Validation 1: Entity ID must contain at least one '~' delimiter
  if (!entityId.includes('~')) {
    throw new Error(
      `extractGtsPackage: Entity ID does not contain '~' delimiter. ` +
      `Expected a valid GTS instance ID, got: '${entityId}'. ` +
      `Valid GTS IDs have the format 'type~instance' or 'type~derivedType~instance'.`
    );
  }

  // Validation 2: Entity ID must not be a schema type ID (ending with '~')
  if (entityId.endsWith('~')) {
    throw new Error(
      `extractGtsPackage: Entity ID is a schema type ID (ends with '~'). ` +
      `This function requires an instance ID, not a type ID. ` +
      `Got: '${entityId}'. ` +
      `Schema type IDs define types, not instances.`
    );
  }

  // Step 1: Split on '~' and take the last segment (instance portion)
  const segments = entityId.split('~');
  const instancePortion = segments[segments.length - 1];

  // Step 2: Split instance portion on '.' to get dot-segments
  const dotSegments = instancePortion.split('.');

  // Validation 3: Instance portion must have at least 2 dot-segments to form a package
  if (dotSegments.length < 2) {
    throw new Error(
      `extractGtsPackage: Entity ID has fewer than 2 dot-segments in its instance portion. ` +
      `Expected format 'vendor.package.rest.v1', got instance portion: '${instancePortion}' ` +
      `from entity ID: '${entityId}'. ` +
      `A valid GTS package requires at least two dot-segments (e.g., 'frontx.demo').`
    );
  }

  // Step 3: Return the first two dot-segments joined by '.'
  return `${dotSegments[0]}.${dotSegments[1]}`;
}
// @cpt-end:cpt-frontx-algo-mfe-registry-gts-package-discovery:p1:inst-1
