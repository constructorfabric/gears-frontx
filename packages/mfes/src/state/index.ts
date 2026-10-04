/**
 * MFE State Container
 *
 * Framework-agnostic state container for MFE instances.
 * DefaultMfeStateContainer is used internally by DefaultMountManager for bridge construction.
 *
 * Key Principles:
 * - Framework-agnostic (no store slice, no React assumptions)
 * - Instance-level isolation (each MFE gets its own store)
 * - Proper disposal on unmount
 *
 * @packageDocumentation
 */

export { MfeStateContainer } from './MfeStateContainer';
export { DefaultMfeStateContainer, type MfeStateContainerConfig } from './DefaultMfeStateContainer';
