// @cpt-algo:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-aliased-owned-root
//
// The disk-aware half of the one recorded-path judgement. The state store
// (`./io.ts`) judges the SPELLING of every recorded path and is pure; it cannot
// know that `link/src` is, on this disk, the very directory `app/src`. Every
// ownership predicate in the package compares segments of the string it is
// handed, so a recorded `projectOwnedRoots` entry that reaches its ground
// through a symlink protects nothing under the name the engines judge by: an
// upgrade REPLACEs, and a delete removes, the project's own files inside it.
//
// The engines that act on ownership geometry (`apply`, `delete`, `upgrade`,
// `validate --project`) therefore ask this check right after they load the
// state, with the same canonicaliser they already hold, and refuse a root that
// is not its own canonical location. `ownership add` records the canonical
// spelling, so a state the CLI wrote passes; one that fails was hand-edited or
// had a symlink appear over a recorded root since. The commands that FIX such a
// state — `ownership remove`, `unregister`, `register` — deliberately do not ask
// it: they must stay able to load a state the others refuse.
import path from 'node:path';
import { foldForIdentity } from '../paths/volume-case';
import { FRONTX_NAMESPACE_ROOT } from '../manifest/types';
import type { ProjectStateDocument } from './types';

// A path as one shell word, so the command the refusal prints can be pasted as
// it stands: left bare when it has nothing the shell would split or expand.
function shellQuote(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The clause naming the first `projectOwnedRoots` entry that is not its own
 * canonical location, or `undefined` when every one is. Case is compared as the
 * project volume compares it, so an APFS spelling of the same directory is not
 * an alias.
 */
// @cpt-begin:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-aliased-owned-root
export function aliasedOwnedRootViolation(
  document: ProjectStateDocument,
  canonicalizeFn: (raw: string) => string | null,
): { clause: string; root: string } | undefined {
  for (const root of document.projectOwnedRoots) {
    const canonical = canonicalizeFn(root);
    if (canonical === null) {
      return {
        root,
        clause: `projectOwnedRoots entry ${JSON.stringify(root)} cannot be proven to stay inside the project root`,
      };
    }
    if (foldForIdentity(canonical) !== foldForIdentity(root)) {
      return {
        root,
        clause:
          `projectOwnedRoots entry ${JSON.stringify(root)} reaches its ground through a symlink: it is ` +
          `${JSON.stringify(canonical)} on disk, so the ownership it declares would not protect that ground under ` +
          `the name the engines compare by. Run \`frontx ownership remove ${shellQuote(root)}\` and, if still wanted, ` +
          `\`frontx ownership add ${shellQuote(canonical)}\``,
      };
    }
  }
  return undefined;
}

// @cpt-end:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-aliased-owned-root

/** The same message wrapped as every other refusal of the state document spells it. */
export function aliasedOwnedRootMessage(
  document: ProjectStateDocument,
  canonicalizeFn: (raw: string) => string | null,
): string | undefined {
  const violation = aliasedOwnedRootViolation(document, canonicalizeFn);
  if (violation === undefined) return undefined;
  const location = path.join(FRONTX_NAMESPACE_ROOT, 'project.json');
  return `Project state document at "${location}" is not valid: ${violation.clause}.`;
}

/**
 * The refusal an engine answers with when an ownership root is aliased: the
 * message plus the offending `{ path }` detail `validate --project` reports, so
 * the structured error does not depend on which command noticed.
 */
export function aliasedOwnedRootRefusal(
  document: ProjectStateDocument,
  canonicalizeFn: (raw: string) => string | null,
): { message: string; details: { path: string } } | undefined {
  const violation = aliasedOwnedRootViolation(document, canonicalizeFn);
  const message = aliasedOwnedRootMessage(document, canonicalizeFn);
  return violation === undefined || message === undefined ? undefined : { message, details: { path: violation.root } };
}
