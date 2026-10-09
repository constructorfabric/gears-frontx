import type { ComponentType } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';

export interface LayoutSlotBase<Name extends string> {
  id: string;
  name: Name;
  component: ComponentType;
  order: number;
}

export interface MainLayoutSlot extends LayoutSlotBase<'main'> {
  icon?: ComponentType;
}

export type LayoutSlot =
  | MainLayoutSlot
  | LayoutSlotBase<'bottom'>
  | LayoutSlotBase<'top'>
  | LayoutSlotBase<'top-start'>
  | LayoutSlotBase<'top-end'>
  | LayoutSlotBase<'empty'>;

/**
 * Layout slot names for the data grid.
 *
 * - `'top-start'` - Top left area (secondary filters, tags)
 * - `'top'` - Top center area (primary filters, search)
 * - `'top-end'` - Top right area (actions, buttons)
 * - `'main'` - Primary content area (table, cards, list)
 * - `'bottom'` - Footer area (pagination, totals)
 * - `'empty'` - Replaces the built-in empty state when the grid has no records
 */
export type LayoutSlotName = LayoutSlot['name'];

export interface LayoutSlotOption {
  id?: string;
  component: ComponentType;
  order?: number;
}

export interface MainLayoutSlotOption extends LayoutSlotOption {
  icon?: ComponentType;
  active?: boolean;
}

export interface TopLayoutSlotOption extends LayoutSlotOption {
  active?: boolean;
}

export interface LayoutSlotOptions {
  main: MainLayoutSlotOption;
  bottom: LayoutSlotOption;
  top: TopLayoutSlotOption;
  'top-start': LayoutSlotOption;
  'top-end': LayoutSlotOption;
  empty: LayoutSlotOption;
}

export interface LayoutPublicApi {
  /**
   * Register a component in a layout slot.
   *
   * @param name - The slot name to register the component in
   * @param options - Configuration for the slot component
   */
  registerSlot: <T extends LayoutSlotName>(name: T, options: LayoutSlotOptions[T]) => void;

  /**
   * Set the active component for a slot.
   *
   * @param name - The slot name
   * @param id - The component ID to activate
   */
  setActiveSlotId: (name: LayoutSlotName, id: string) => void;

  /**
   * Read the active component id for a slot.
   *
   * @param name - The slot name
   * @returns The active component ID, or `undefined` if none is active
   */
  getActiveSlotId: (name: LayoutSlotName) => string | undefined;
}

export interface LayoutStore {
  slots: Map<LayoutSlotName, LayoutSlot[]>;
  activeSlotIds: Map<LayoutSlotName, string>;
}

export interface LayoutService extends LayoutPublicApi {
  useLayoutStore: UseBoundStore<StoreApi<LayoutStore>>;
}
