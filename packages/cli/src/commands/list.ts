// @cpt-flow:cpt-frontx-flow-template-resolution-list:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-list-inventory:p1
import { readManifestFromContent } from '../manifest/validate-contract';
import { TemplateInventory } from '../inventory/TemplateInventory';

export interface ListEntry {
  name: string;
  ref: string;
  source: string;
  // The description the entry's own manifest declares. Absent when the manifest
  // declares none AND when the stored manifest no longer satisfies the manifest
  // contract at all — see `declaredDescription` below, which cannot distinguish
  // the two and does not try. Absent rather than empty on purpose: the
  // machine-readable form is what a calling program selects a template by, and a
  // placeholder there is a declaration the template never made
  // (cpt-frontx-flow-template-resolution-list inst-list-format-machine).
  description?: string;
}

// The `--json` response envelope, owned by this feature's §1.5 because it is a
// CROSS-BOUNDARY contract: the AI Tooling Framework's kit reads the selectable
// set over this command surface without linking the CLI (DESIGN §3.4), so it
// cannot discover the shape from these types and depends on the key names
// themselves. Renaming `templates` is a breaking change no compile-time edge
// would report — `__tests__/cli.test.ts` asserts the keys for that reason.
// `ok` is always true here; it exists so a consumer can tell a result line from
// any other output on the stream, and so a failure form can be added later
// without disturbing the success shape.
export interface ListJsonEnvelope {
  ok: true;
  templates: ListEntry[];
}

/** Wraps the enumerated entries in the declared machine-readable envelope. */
export function listJsonEnvelope(entries: ListEntry[]): ListJsonEnvelope {
  return { ok: true, templates: entries };
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
// `readManifestFromContent` rejects on ANY manifest-contract violation, not
// only on unparseable JSON, so an entry whose stored manifest has since drifted
// out of contract — a malformed ownership boundary, a missing version — is
// listed without a description exactly as one that declares none is. The two
// are deliberately not distinguished: either way there is no description a
// caller may select on, which is the only question this function answers.
//
// Enumerating rather than refusing is the deliberate choice: `list` reports the
// inventory, and failing the whole enumeration over one bad record would hide
// every other installed template from a caller that came to enumerate them.
function declaredDescription(content: string): string | undefined {
  const result = readManifestFromContent(content);
  if (!result.ok) return undefined;
  return result.manifest.description;
}
