// @cpt-algo:cpt-frontx-algo-composed-provenance-provenance-write:p1
// @cpt-dod:cpt-frontx-dod-composed-provenance-provenance-at-scaffold:p1
import fs from 'node:fs';
import path from 'node:path';
import { provenancePath } from '../provenance/contract';
import type { ProvenanceRecord, ProvenanceWriteFn } from '../provenance/types';

// Real filesystem read+write for the provenance store
// (`cpt-frontx-contract-project-provenance`) — the single file
// `.frontx/provenance.json` at the repository root holding the SET of
// records, one per applied template, with no single whole-repository origin
// record, per the composed-provenance FEATURE's exact schema. Pure-logic core
// (`provenance/write.ts`) already defines `writeProvenance`'s iteration and
// the `ProvenanceWriteFn`/`ProvenanceRecord` seam shapes
// (`packages/cli/src/provenance/types.ts`); this file is the IO-only
// realization plugged in behind those seams — it invents no new shape or
// filename beyond `PROVENANCE_RELATIVE_PATH` (`provenance/contract.ts`).

// @cpt-begin:cpt-frontx-algo-composed-provenance-provenance-write:p1:inst-write-record
/**
 * Real fs-backed `ProvenanceWriteFn` — the durable, human-readable write
 * target `writeProvenance` (`cpt-frontx-algo-composed-provenance-provenance-write`
 * inst-write-record) invokes for every re-written provenance set. Creates the
 * `.frontx/` directory on first write.
 */
export function createFsProvenanceWriteFn(): ProvenanceWriteFn {
  return async function writeProvenanceFile(filePath: string, content: string): Promise<void> {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  };
}
// @cpt-end:cpt-frontx-algo-composed-provenance-provenance-write:p1:inst-write-record

// A malformed provenance file must fail loudly and locally, naming the file
// and what was actually found, rather than returning a value typed as
// `ProvenanceRecord[]` that silently isn't one — every caller of
// `readProvenanceRecords` (e.g. `occupiedBoundariesFromProvenance`,
// `scaffold/materialize.ts`) trusts that type and iterates the result
// directly; an unchecked cast here surfaces as an unrelated, unhelpful
// "is not iterable" TypeError deep inside that unrelated caller instead.
function isRecordShaped(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describeNonArrayPayload(value: unknown): string {
  if (value === null) return 'null';
  if (!isRecordShaped(value)) return `a ${typeof value}`;
  const identity = value.templateIdentity;
  return typeof identity === 'string'
    ? `a single object (templateIdentity: "${identity}") instead of an array`
    : 'a single object instead of an array';
}

// @cpt-begin:cpt-frontx-algo-composed-provenance-provenance-write:p1:inst-determine-storage-location
/**
 * Reads the full provenance SET back from the single file
 * `.frontx/provenance.json` at the repository root — the read-side
 * counterpart to `createFsProvenanceWriteFn`, at the same storage location
 * `provenancePath` (`provenance/contract.ts`) determines. Returns an empty
 * set (never throws) when no provenance file exists yet — e.g. before the
 * first scaffold — since an absent file is not itself a provenance-write
 * error. Throws a diagnosable error (naming the file path and what shape was
 * found) when the file's content is not the JSON array the SET schema
 * requires — e.g. a single object left behind by a pre-fix `frontx upgrade`
 * (issue #488) — rather than returning it uncast and letting a caller's
 * `for...of` fail with an unrelated "is not iterable" TypeError.
 */
export async function readProvenanceRecords(repoRoot: string): Promise<ProvenanceRecord[]> {
  const location = provenancePath(repoRoot);
  if (!fs.existsSync(location)) return [];
  const raw = fs.readFileSync(location, 'utf-8');
  if (raw.trim() === '') return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Provenance file at "${location}" must contain a JSON array of records (one per applied ` +
        `template), but found ${describeNonArrayPayload(parsed)}. Restore it from version control, or ` +
        're-seed/re-add the affected template(s), before retrying.',
    );
  }
  return parsed as ProvenanceRecord[];
}
// @cpt-end:cpt-frontx-algo-composed-provenance-provenance-write:p1:inst-determine-storage-location

/**
 * Bridges the SET-shaped read above onto the single-record `ReadProvenanceFn`
 * seam the upgrade change-set engine depends on
 * (`packages/cli/src/upgrade/types.ts`) — the upgrade engine currently
 * resolves a baseline from exactly one provenance record per project.
 * Returns the first record in the set, or `null` when the set is empty.
 *
 * Full per-template upgrade-target selection (letting a caller choose WHICH
 * applied template's record to upgrade) is a separate, not-yet-made design
 * decision — out of scope here. Until that lands, this bridge always picks
 * the first record; when more than one record exists, it says so on stderr
 * so the choice is diagnosable rather than a silent, unexplained "why did it
 * upgrade the shell and not the mfe" surprise.
 */
export function createFsReadSingleProvenanceFn(): (repoRoot: string) => Promise<ProvenanceRecord | null> {
  return async function readSingleProvenance(repoRoot: string): Promise<ProvenanceRecord | null> {
    const records = await readProvenanceRecords(repoRoot);
    const selected = records[0] ?? null;
    if (selected !== null && records.length > 1) {
      const others = records
        .slice(1)
        .map((record) => record.templateIdentity)
        .join(', ');
      process.stderr.write(
        `[frontx] Multiple provenance records found; this repository has more than one applied ` +
          `template. Upgrade targets the first-applied one ("${selected.templateIdentity}") — ` +
          `per-template target selection is not yet supported, so the other applied template(s) ` +
          `(${others}) cannot be selected for this upgrade.\n`,
      );
    }
    return selected;
  };
}
