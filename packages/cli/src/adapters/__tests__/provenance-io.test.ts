// @cpt-algo:cpt-frontx-algo-composed-provenance-provenance-write:p1
// @cpt-dod:cpt-frontx-dod-composed-provenance-provenance-at-scaffold:p1
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import {
  createFsProvenanceWriteFn,
  createFsReadSingleProvenanceFn,
  readProvenanceRecords,
} from '../provenance-io';
import { writeProvenance } from '../../provenance/write';
import { provenancePath } from '../../provenance/contract';
import type { ProvenanceRecord } from '../../provenance/types';

describe('provenance-io', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-provenance-io-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // inst-determine-storage-location / inst-write-record / inst-foreach-applied —
  // write-then-read round trip to the EXACT `.frontx/provenance.json` file
  // location and record shape the composed-provenance FEATURE specifies
  // (cpt-frontx-contract-project-provenance).
  it('(a) writes and reads back the provenance SET at .frontx/provenance.json', async () => {
    const writeFn = createFsProvenanceWriteFn();
    const applied: ProvenanceRecord[] = [
      {
        templateIdentity: 'root-project',
        scaffoldedFromVersion: '1.0.0',
        sourceSpec: 'github:acme/root-project@v1.0.0',
        occupiedOwnershipBoundary: '.',
      },
      {
        templateIdentity: 'mfe-a',
        scaffoldedFromVersion: '2.0.0',
        sourceSpec: 'github:acme/mfe-a@v2.0.0',
        occupiedOwnershipBoundary: 'src/mfe-a',
      },
    ];

    const result = await writeProvenance(applied, root, writeFn);
    expect(result.ok).toBe(true);

    const expectedLocation = provenancePath(root);
    expect(fs.existsSync(expectedLocation)).toBe(true);
    expect(expectedLocation).toBe(`${root}/.frontx/provenance.json`);

    const readBack = await readProvenanceRecords(root);
    expect(readBack).toEqual(applied);
  });

  // inst-determine-storage-location — no provenance file yet (before first
  // scaffold) reads back as an empty set, never throws.
  it('(b) returns an empty set when no provenance file exists yet', async () => {
    const readBack = await readProvenanceRecords(root);
    expect(readBack).toEqual([]);
  });

  // Bridges the SET-shaped read onto the upgrade engine's single-record
  // ReadProvenanceFn seam (packages/cli/src/upgrade/types.ts).
  it('(c) createFsReadSingleProvenanceFn returns the first record, or null when empty', async () => {
    const readSingle = createFsReadSingleProvenanceFn();
    expect(await readSingle(root)).toBeNull();

    const writeFn = createFsProvenanceWriteFn();
    const record: ProvenanceRecord = {
      templateIdentity: 'simple-project',
      scaffoldedFromVersion: '2.1.0',
      sourceSpec: 'github:acme/simple-project@v2.1.0',
      occupiedOwnershipBoundary: '.',
    };
    await writeProvenance(record, root, writeFn);

    expect(await readSingle(root)).toEqual(record);
  });

  // review #500 round 2 (P2-1): the SET shape was checked (`Array.isArray`)
  // but individual elements were not, so every caller of `readProvenanceRecords`
  // that trusts the `ProvenanceRecord[]` return type and dereferences a field
  // on an element (e.g. `record.templateIdentity`) would hit an unrelated
  // TypeError instead of the diagnosable error this function already gives
  // for a non-array payload. Bring element-level failures to the same
  // diagnosability: name the file and which element/field is invalid.
  it('(d) throws a diagnosable error naming the file and the index when an array element is not object-shaped', async () => {
    const location = provenancePath(root);
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, JSON.stringify([null]), 'utf-8');

    await expect(readProvenanceRecords(root)).rejects.toThrow(/index 0/);
    await expect(readProvenanceRecords(root)).rejects.toThrow(location);
  });

  it('(e) throws a diagnosable error naming the file and the index when an array element is missing templateIdentity', async () => {
    const location = provenancePath(root);
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(
      location,
      JSON.stringify([{ scaffoldedFromVersion: '1.0.0', sourceSpec: 'github:acme/x@v1.0.0' }]),
      'utf-8',
    );

    await expect(readProvenanceRecords(root)).rejects.toThrow(/templateIdentity/);
    await expect(readProvenanceRecords(root)).rejects.toThrow(/index 0/);
    await expect(readProvenanceRecords(root)).rejects.toThrow(location);
  });

  // review #500 round 3: `occupiedOwnershipBoundary` is optional on
  // `ProvenanceRecord`, so its ABSENCE was rightly never checked — but its
  // PRESENCE was not checked either: a record carrying a non-string value for
  // it (e.g. a number) passed `isValidProvenanceRecord` unnoticed, and a
  // subsequent write could carry that malformed value forward. Once present,
  // it must be a string like every other field.
  it('(f) throws a diagnosable error naming the field when occupiedOwnershipBoundary is present but not a string', async () => {
    const location = provenancePath(root);
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(
      location,
      JSON.stringify([
        {
          templateIdentity: 'root-project',
          scaffoldedFromVersion: '1.0.0',
          sourceSpec: 'github:acme/root-project@v1.0.0',
          occupiedOwnershipBoundary: 42,
        },
      ]),
      'utf-8',
    );

    await expect(readProvenanceRecords(root)).rejects.toThrow(/occupiedOwnershipBoundary/);
    await expect(readProvenanceRecords(root)).rejects.toThrow(/index 0/);
    await expect(readProvenanceRecords(root)).rejects.toThrow(location);
  });
});
