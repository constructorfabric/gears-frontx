// @cpt-flow:cpt-frontx-flow-template-resolution-list:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-list-inventory:p1
import { TemplateInventory } from '../inventory/TemplateInventory.js';

export interface ListEntry {
  name: string;
  ref: string;
  source: string;
}

export async function listCommand(
  inventory: TemplateInventory,
): Promise<ListEntry[]> {
  const entries = await inventory.list();
  return entries.map((e) => ({ name: e.name, ref: e.ref, source: e.source }));
}
