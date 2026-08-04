// @cpt-flow:cpt-frontx-flow-template-resolution-list:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-list-inventory:p1
import { readManifestFromContent } from '../manifest/validate-contract';
import { TemplateInventory } from '../inventory/TemplateInventory';

export interface ListEntry {
  name: string;
  ref: string;
  source: string;
  // The description the entry's own manifest declares, absent when the manifest
  // declares none. Absent rather than empty on purpose: the machine-readable
  // form is what a calling program selects a template by, and a placeholder
  // there is a declaration the template never made
  // (cpt-frontx-flow-template-resolution-list inst-list-format-machine).
  description?: string;
}

export async function listCommand(
  inventory: TemplateInventory,
): Promise<ListEntry[]> {
  const entries = await inventory.list();
  // @cpt-begin:cpt-frontx-flow-template-resolution-list:p1:inst-list-format-machine
  return entries.map((e) => {
    const description = declaredDescription(e.content);
    return {
      name: e.name,
      ref: e.ref,
      source: e.source,
      ...(description === undefined ? {} : { description }),
    };
  });
  // @cpt-end:cpt-frontx-flow-template-resolution-list:p1:inst-list-format-machine
}

// The description declared by the manifest an inventory entry recorded at
// install time, read through the same single manifest read path every other
// consumer uses (cpt-frontx-dod-template-manifest-single-description) so the
// listing cannot diverge from what validation accepted.
//
// An entry whose stored manifest no longer reads is listed without a
// description rather than failing the listing: `list` reports the inventory,
// and refusing the whole enumeration over one unreadable record would hide
// every other installed template from a caller that came to enumerate them.
function declaredDescription(content: string): string | undefined {
  const result = readManifestFromContent(content);
  if (!result.ok) return undefined;
  return result.manifest.description;
}
