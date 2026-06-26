// @cpt-flow:cpt-frontx-flow-template-resolution-install:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-install-by-spec:p1
import type { FetchFn } from '../resolver/types.js';
import { TemplateInventory } from '../inventory/TemplateInventory.js';

export interface InstallCommandResult {
  ok: boolean;
  message: string;
}

export async function installCommand(
  spec: string,
  inventory: TemplateInventory,
  fetchFn: FetchFn,
): Promise<InstallCommandResult> {
  const result = await inventory.install(spec, fetchFn);
  if (!result.ok) {
    return { ok: false, message: result.error.message };
  }
  return {
    ok: true,
    message: `Installed ${result.value.name}@${result.value.ref}`,
  };
}
