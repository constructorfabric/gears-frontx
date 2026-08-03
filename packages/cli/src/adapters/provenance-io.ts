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

// The SET shape (`Array.isArray`, above) was checked but individual elements
// were not (review #500 round 2, P2-1) — an unchecked cast let a malformed
// element (e.g. `[null]`, or an object missing `templateIdentity`) reach
// every caller of `readProvenanceRecords` uncast, surfacing as the same
// unrelated, unhelpful TypeError the non-array guard above already exists to
// avoid. The fields checked are exactly the `ProvenanceRecord` contract's own
// required ones (provenance/types.ts) — `occupiedOwnershipBoundary` is the
// one field declared optional there, so it is not checked here.
const REQUIRED_PROVENANCE_RECORD_FIELDS = ['templateIdentity', 'scaffoldedFromVersion', 'sourceSpec'] as const;

function isValidProvenanceRecord(value: unknown): value is ProvenanceRecord {
  return (
    isRecordShaped(value) &&
    REQUIRED_PROVENANCE_RECORD_FIELDS.every((field) => typeof value[field] === 'string')
  );
}

function describeInvalidRecord(value: unknown): string {
  if (!isRecordShaped(value)) {
    return value === null ? 'is null, not an object' : `is a ${typeof value}, not an object`;
  }
  const invalidFields = REQUIRED_PROVENANCE_RECORD_FIELDS.filter((field) => typeof value[field] !== 'string');
  return `is missing or has a non-string ${invalidFields.map((field) => `"${field}"`).join(', ')}`;
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
 * `for...of` fail with an unrelated "is not iterable" TypeError. Throws the
 * same diagnosable shape (naming the file path, the element's index, and
 * which required field is missing or non-string) when the array itself is
 * well-formed but one of its ELEMENTS is not a valid `ProvenanceRecord` —
 * e.g. `[null]` — rather than returning it uncast and letting a caller that
 * dereferences a field on it (e.g. `occupiedBoundariesFromProvenance`) hit an
 * unrelated TypeError instead (review #500 round 2, P2-1).
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
  const records: ProvenanceRecord[] = [];
  for (const [index, item] of parsed.entries()) {
    if (!isValidProvenanceRecord(item)) {
      throw new Error(
        `Provenance file at "${location}" contains an invalid record at index ${index}: ` +
          `${describeInvalidRecord(item)}. Restore it from version control, or re-seed/re-add the ` +
          'affected template(s), before retrying.',
      );
    }
    records.push(item);
  }
  return records;
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
 * the first record.
 *
 * review #500 (fix 3/3): this adapter used to print the "which record was
 * picked, which were skipped" diagnostic to stderr itself. Moved to `cli.ts`
 * (`formatMultiRecordUpgradeNotice`), which decides what reaches the terminal or
 * the `--json` handshake for every other message on this command surface —
 * an IO adapter choosing what to print, unconditionally and outside that
 * single place, is exactly the seam this bridge exists to avoid leaking
 * decisions across. `cli.ts` derives the same diagnostic from
 * `readProvenanceRecords` directly (the SET-shaped read above), independent
 * of this bridge, so a caller of this function (e.g. the upgrade engine's
 * own tests) that has no reason to care about the diagnostic no longer
 * inherits an unrelated side effect.
 */
export function createFsReadSingleProvenanceFn(): (repoRoot: string) => Promise<ProvenanceRecord | null> {
  return async function readSingleProvenance(repoRoot: string): Promise<ProvenanceRecord | null> {
    const records = await readProvenanceRecords(repoRoot);
    return records[0] ?? null;
  };
}
