/**
 * 0.2.0 Migration: SDK Architecture
 *
 * This migration updates FrontX projects from the legacy package structure
 * to the new SDK architecture:
 *
 * - @gears-frontx/uicore -> @gears-frontx/react
 * - @gears-frontx/uikit-contracts -> @gears-frontx/react
 * - Module augmentations updated
 */

import type { Migration } from '../types.js';
import { uicoreToReactTransform } from './01-uicore-to-react.js';
import { uikitContractsToUikitTransform } from './02-uikit-contracts-to-uikit.js';
import { moduleAugmentationTransform } from './03-module-augmentation.js';

export const migration020: Migration = {
  id: '0.2.0-sdk-architecture',
  version: '0.2.0',
  name: 'SDK Architecture Migration',
  description:
    'Updates HAI3 projects from legacy package structure to SDK architecture. ' +
    'Transforms @gears-frontx/uicore to @gears-frontx/react, @gears-frontx/uikit-contracts to @gears-frontx/react, ' +
    'and updates module augmentation targets.',
  transforms: [
    uicoreToReactTransform,
    uikitContractsToUikitTransform,
    moduleAugmentationTransform,
  ],
};
