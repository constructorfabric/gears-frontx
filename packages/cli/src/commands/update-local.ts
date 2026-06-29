// @cpt-flow:cpt-frontx-flow-template-resolution-update-local:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-bounded-local-update:p1
import type { FetchFn } from '../resolver/types.js';
import { TemplateInventory } from '../inventory/TemplateInventory.js';

export interface UpdateLocalResult {
  ok: boolean;
  message: string;
}

export async function updateLocalCommand(
  name: string,
  spec: string,
  inventory: TemplateInventory,
  fetchFn: FetchFn,
): Promise<UpdateLocalResult> {
  const result = await inventory.updateLocal(name, spec, fetchFn);
  if (!result.ok) {
    return { ok: false, message: result.error.message };
  }
  return {
    ok: true,
    message: `Updated ${result.value.name} to ${result.value.ref}`,
  };
}
