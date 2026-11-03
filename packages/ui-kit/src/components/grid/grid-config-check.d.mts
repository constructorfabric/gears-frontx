// Hand-written declarations for grid-config-check.mjs, the dependency-free
// validator the CSS command imports from dist: the module carries no types the
// compiler can read, so they are stated here and resolve for both the kit's
// own sources and the emitted command.
import type { GridConfig, GridSizeClass } from './grid-config.js';

export declare const SIZE_CLASSES: readonly GridSizeClass[];

export declare function validateGridConfig(config: GridConfig, options?: { allowDefaultName?: boolean }): void;
