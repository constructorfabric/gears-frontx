// Hand-written declarations for grid-css.mjs: the command is plain ESM, and the
// tests that generate a stylesheet in process read generateGridCss through it.
import type { GridConfig } from './grid-config.js';

export declare function generateGridCss(config: GridConfig, options?: { allowDefaultName?: boolean }): string;
