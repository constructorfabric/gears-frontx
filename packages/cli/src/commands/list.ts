// @cpt-flow:cpt-frontx-flow-template-resolution-list:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-list-inventory:p1
import { readManifestFromContent } from '../manifest/validate-contract';
import { TemplateInventory } from '../inventory/TemplateInventory';

export interface ListEntry {
  name: string;
  ref: string;
  source: string;
  // The description the entry's own manifest declares, absent when it declares
  // none. Absent rather than empty on purpose: the machine-readable form is what
  // a calling program selects a template by, and a placeholder there is a
  // declaration the template never made
  // (cpt-frontx-flow-template-resolution-list inst-list-format-machine).
  description?: string;
  // Present, and only ever `true`, when the entry's stored manifest did not
  // satisfy the manifest contract, so no description could be read from it.
  //
  // This is what keeps `description`'s absence honest. Without it a consumer
  // reads one absence as two different facts — "this template declares no
  // description" and "this template's manifest is broken" — and reports the
  // first for both. The failure mode that makes it worth a field: a future
  // tightening of the manifest contract would invalidate stored manifests
  // wholesale, and every template would be reported as declaring no description
  // rather than as needing reinstallation.
  //
  // Absent (not `false`) in the ordinary case, matching `description`'s own
  // convention, so a conforming entry carries no key for a problem it does not
  // have.
  manifestUnreadable?: true;
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

export interface ListCommandOptions {
  /**
   * Whether to resolve each entry's declared description. Only the
   * machine-readable form carries descriptions, and resolving one runs the full
   * manifest contract validation per entry — work the human form parses and
   * then discards. Defaults to `false` so the cheap path stays cheap.
   */
  withDescriptions?: boolean;
}

export async function listCommand(
  inventory: TemplateInventory,
  options: ListCommandOptions = {},
): Promise<ListEntry[]> {
  const entries = await inventory.list();
  return entries.map((e) => {
    // Identity, pinned reference and source address are common to both output
    // forms (inst-list-format), so they sit outside the marked region below.
    const base: ListEntry = { name: e.name, ref: e.ref, source: e.source };
    if (!options.withDescriptions) return base;

    // @cpt-begin:cpt-frontx-flow-template-resolution-list:p1:inst-list-format-machine
    const stored = storedDescription(e.content);
    if (!stored.ok) return { ...base, manifestUnreadable: true };
    return stored.description === undefined ? base : { ...base, description: stored.description };
    // @cpt-end:cpt-frontx-flow-template-resolution-list:p1:inst-list-format-machine
  });
}

type StoredDescriptionResult =
  | { ok: true; description?: string }
  | { ok: false; reason: 'manifest-unreadable' };

// The description declared by the manifest an inventory entry recorded at
// install time, read through the same single manifest read path every other
// consumer uses (cpt-frontx-dod-template-manifest-single-description) so the
// listing cannot diverge from what validation accepted.
//
// `readManifestFromContent` rejects on ANY manifest-contract violation, not
// only on unparseable JSON, so an entry whose stored manifest has since drifted
// out of contract — a malformed ownership boundary, a missing version — reaches
// the `ok: false` branch. That case is reported as its own outcome rather than
// folded into "no description": a caller told a template declares nothing looks
// for a template that describes itself, whereas a caller told the manifest is
// unreadable knows to reinstall it. Collapsing the two costs a developer that
// distinction at exactly the moment they need it.
//
// Enumerating rather than refusing is the deliberate choice: `list` reports the
// inventory, and failing the whole enumeration over one bad record would hide
// every other installed template from a caller that came to enumerate them.
function storedDescription(content: string): StoredDescriptionResult {
  const result = readManifestFromContent(content);
  if (!result.ok) return { ok: false, reason: 'manifest-unreadable' };
  return { ok: true, description: result.manifest.description };
}
