// @cpt-FEATURE:cpt-frontx-feature-composed-provenance:p1
// @cpt-dod:cpt-frontx-dod-composed-provenance-registration:p1
//
// `unregister <name>` — cpt-frontx-algo-composed-provenance-unregister.
// Reads and writes the single project state document this feature owns
// (`../project-state/io.ts`) through the injected `ReadProjectStateFn`/
// `WriteProjectStateFn` seams; no direct filesystem access here.
import { readProjectState, mutateProjectState } from '../project-state/io';
import type { ReadProjectStateFn, WriteProjectStateFn } from '../project-state/types';
import type { ErrorCode } from '../envelope';

export type UnregisterOutcome =
  | { ok: true; name: string }
  | { ok: false; code: ErrorCode; message: string; details?: Record<string, unknown> };

/**
 * cpt-frontx-algo-composed-provenance-unregister — removes `templates[name]`
 * when its `targets` array is empty; refuses otherwise, naming every
 * dependent target, and preserves the entry.
 */
export async function unregisterTemplate(
  name: string,
  repoRoot: string,
  readProjectStateFn: ReadProjectStateFn,
  writeProjectStateFn: WriteProjectStateFn,
): Promise<UnregisterOutcome> {
  // @cpt-begin:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-accept
  // `name` is accepted as this function's own parameter.
  // @cpt-end:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-accept

  // @cpt-begin:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-read-state
  const stateResult = await readProjectState(repoRoot, readProjectStateFn);
  // @cpt-end:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-read-state
  if (!stateResult.ok) {
    return { ok: false, code: 'PROJECT_INVALID', message: stateResult.message };
  }

  const entry = stateResult.document.templates[name];

  // @cpt-begin:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-if-absent
  if (entry === undefined) {
    // @cpt-begin:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-return-not-registered
    return { ok: false, code: 'TEMPLATE_NOT_REGISTERED', message: `Template "${name}" is not registered.` };
    // @cpt-end:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-return-not-registered
  }
  // @cpt-end:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-if-absent

  // @cpt-begin:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-if-targets
  if (entry.targets.length > 0) {
    // @cpt-begin:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-return-targets
    // @cpt-begin:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-applied-unregister-refused
    return {
      ok: false,
      code: 'TARGETS_EXIST',
      message:
        `Template "${name}" still has applied targets; unregister refused. ` +
        `Run "delete" on each target first: ${entry.targets.join(', ')}.`,
      details: { name, targets: entry.targets },
    };
    // @cpt-end:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-applied-unregister-refused
    // @cpt-end:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-return-targets
  }
  // @cpt-end:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-if-targets

  // @cpt-begin:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-else
  // @cpt-begin:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-write-removed
  const written = await mutateProjectState(repoRoot, { kind: 'remove-template', name }, readProjectStateFn, writeProjectStateFn);
  // @cpt-end:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-write-removed
  if (!written.ok) return { ok: false, code: 'PROJECT_INVALID', message: written.message };
  // @cpt-begin:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-return-success
  // @cpt-begin:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-empty-to-unreg
  return { ok: true, name };
  // @cpt-end:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-empty-to-unreg
  // @cpt-end:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-return-success
  // @cpt-end:cpt-frontx-algo-composed-provenance-unregister:p1:inst-cpunreg-else
}
