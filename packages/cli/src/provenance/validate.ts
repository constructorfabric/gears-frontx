// @cpt-dod:cpt-frontx-dod-composed-provenance-provenance-at-scaffold:p1
import type { ProvenanceRecord } from './types';

// Guards the provenance SET shape (ADR-0019: one record per applied
// template, never a single whole-repository record) and the shape of each
// element within it, against untrusted `unknown` input — a raw string read
// from disk (`adapters/provenance-io.ts`'s `readProvenanceRecords`) or
// already-snapshotted (`upgrade/apply.ts`'s `parseProvenanceRecordSet`).
//
// Previously duplicated verbatim between those two files: `upgrade/apply.ts`
// is a pure-logic engine that takes filesystem access only through injected
// deps, never through the adapters layer directly, so it could not import
// `adapters/provenance-io.ts`'s copy — but these predicates are pure
// functions over `unknown` with no filesystem access at all, so neither file
// needs to import the other; both import this neutral shared module instead.
// Consolidated here (review #500) after the duplication was shown to drift in
// practice: round 3 of this same review had to fix the
// `occupiedOwnershipBoundary` type check in BOTH copies, which is exactly the
// cost duplication was supposed to avoid paying twice.
//
// Each caller keeps building its OWN full error message around these
// building blocks — the surrounding text (e.g. whether to suggest
// "restore from version control") differs per caller and is pinned by that
// caller's own tests, so only the shape-checking logic and its fragment
// descriptions move here, not the assembled message.

function isRecordShaped(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Describes a parsed provenance payload that failed the `Array.isArray`
// check, for embedding in a caller's own "must contain a JSON array" message.
export function describeNonArrayPayload(value: unknown): string {
  if (value === null) return 'null';
  if (!isRecordShaped(value)) return `a ${typeof value}`;
  const identity = value.templateIdentity;
  return typeof identity === 'string'
    ? `a single object (templateIdentity: "${identity}") instead of an array`
    : 'a single object instead of an array';
}

// The fields ADR-0019/the `ProvenanceRecord` contract (./types.ts) requires
// on every record. `occupiedOwnershipBoundary` is declared optional there, so
// its ABSENCE is never checked — but review #500 round 3 found that its
// PRESENCE was not checked either: a record with `occupiedOwnershipBoundary:
// 42` (or any other non-string) passed as valid, so a later write could carry
// that malformed value forward unnoticed. Checked in `isValidProvenanceRecord`
// alongside the required fields, not folded into this constant itself, since
// this constant also drives `describeInvalidRecord`'s "missing or has a
// non-string" wording, which does not apply to a field that is allowed to be
// absent.
export const REQUIRED_PROVENANCE_RECORD_FIELDS = ['templateIdentity', 'scaffoldedFromVersion', 'sourceSpec'] as const;

export function isValidProvenanceRecord(value: unknown): value is ProvenanceRecord {
  return (
    isRecordShaped(value) &&
    REQUIRED_PROVENANCE_RECORD_FIELDS.every((field) => typeof value[field] === 'string') &&
    (value.occupiedOwnershipBoundary === undefined || typeof value.occupiedOwnershipBoundary === 'string')
  );
}

// Describes why a single element failed `isValidProvenanceRecord`, for
// embedding in a caller's own "invalid record at index N" message.
export function describeInvalidRecord(value: unknown): string {
  if (!isRecordShaped(value)) {
    return value === null ? 'is null, not an object' : `is a ${typeof value}, not an object`;
  }
  const invalidFields: string[] = REQUIRED_PROVENANCE_RECORD_FIELDS.filter((field) => typeof value[field] !== 'string');
  if (value.occupiedOwnershipBoundary !== undefined && typeof value.occupiedOwnershipBoundary !== 'string') {
    invalidFields.push('occupiedOwnershipBoundary');
  }
  return `is missing or has a non-string ${invalidFields.map((field) => `"${field}"`).join(', ')}`;
}
