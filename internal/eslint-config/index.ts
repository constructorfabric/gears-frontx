/**
 * FrontX ESLint Configuration Package
 *
 * Layered configuration for the FrontX SDK architecture:
 * - L0 (base): Universal rules for all code
 * - L1 (sdk): SDK packages with zero @gears-frontx dependencies
 * - L2 (framework): Framework package with only SDK deps
 * - L3 (react): React adapter with only framework dep
 * - L4 (screenset): User code with flux rules and isolation
 */

export { baseConfig } from './base';
export { sdkConfig } from './sdk';
export { frameworkConfig } from './framework';
export { reactConfig } from './react';
export { screensetConfig, createScreensetConfig } from './screenset';
