/**
 * MFE Error Class Hierarchy
 *
 * Error classes for MFE system failures.
 *
 * @packageDocumentation
 */

export type { ContractError } from './ContractError';
export { MfeError } from './MfeError';
export { DomainValidationError } from './DomainValidationError';
export { MfeLoadError } from './MfeLoadError';
export { ExtensionTypeError } from './ExtensionTypeError';
export { ChainExecutionError } from './ChainExecutionError';
export { MfeTypeConformanceError } from './MfeTypeConformanceError';
export { UnsupportedDomainActionError } from './UnsupportedDomainActionError';
export { UnsupportedLifecycleStageError } from './UnsupportedLifecycleStageError';
export { EntryTypeNotHandledError } from './EntryTypeNotHandledError';
export { DomainUnregisteringError } from './DomainUnregisteringError';
