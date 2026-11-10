// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
//
// Unit tests for `bundleFootprintVerdict` — deterministic (no FS), focused on
// the conservative NFC+case-fold protection that must refuse regardless of the
// process-wide volume-case probe result. These cover the HIGH mixed-volume
// bypass: a process that probed a case-sensitive volume returning lowercase
// for all project-relative paths could still be removing a bundle on a
// case-insensitive mounted volume where uppercase spellings are aliases.
import { describe, expect, it, vi } from 'vitest';
import { bundleFootprintVerdict } from '../scaffold/strict-path';
import type { ClassifyPathStrictFn, EntryKindFn } from '../scaffold/strict-path';

// Force a case-sensitive foldForIdentity so the guard proves independence from the volume probe:
// reverting ciNorm's toLowerCase would break B-CM-canonical / B-CM-entry on this mock even on a
// case-insensitive host, and reverting NFC normalization would break B-CM-nfc-dir-unit.
vi.mock('../paths/volume-case', () => ({ foldForIdentity: (v: string) => v }));

// Identity classifier: canonical = raw, entries match path depth. Required for bundleFull.entries[parent.entries.length] lookup.
const identityClassify: ClassifyPathStrictFn = (raw) => {
  const segs = raw.split('/').filter(Boolean);
  return { kind: 'present', canonical: raw, entries: segs.map((_, i) => ({ path: segs.slice(0, i + 1).join('/'), symlink: false })) };
};

// Real-directory entryKind: returns 'directory' for '.frontx/ai/@x/t', 'absent' elsewhere.
const dirEntry: EntryKindFn = (p) => (p === '.frontx/ai/@x/t' ? 'directory' : 'absent');

describe('bundleFootprintVerdict — conservative case-fold protection', () => {
  it('B-CM-canonical: uppercase-spelled canonical origin inside a real directory footprint is refused', () => {
    // Mutation: changing ciNorm to nfcNorm (no toLowerCase) would leave pathWithinTarget comparing
    // '.frontx/AI/@X/T/src' vs '.frontx/ai/@x/t' as distinct on a case-sensitive volume probe.
    const origins = [{ name: '@x/u', origin: 'path:.frontx/AI/@X/T/src', raw: '.frontx/AI/@X/T/src' }];
    const verdict = bundleFootprintVerdict('@x/t', origins, identityClassify, dirEntry);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('origin-overlaps-bundle');
  });

  it('B-CM-entry: uppercase access path traversing the real directory footprint is refused', () => {
    // canonical is outside the bundle; only the entry traversal path matches the bundle dir.
    const origins = [{ name: '@x/u', origin: 'path:.frontx/AI/@X/T', raw: '.frontx/AI/@X/T' }];
    const classify: ClassifyPathStrictFn = (raw) => {
      if (raw === '.frontx/AI/@X/T') {
        return {
          kind: 'absent',
          canonical: '.frontx/outside/u', // resolved elsewhere — not inside bundle
          entries: [
            { path: '.frontx/AI', symlink: false },
            { path: '.frontx/AI/@X', symlink: false },
            { path: '.frontx/AI/@X/T', symlink: false }, // uppercase equivalent of bundle dir
          ],
        };
      }
      const segs = raw.split('/').filter(Boolean);
      return { kind: 'present', canonical: raw, entries: segs.map((_, i) => ({ path: segs.slice(0, i + 1).join('/'), symlink: false })) };
    };
    const verdict = bundleFootprintVerdict('@x/t', origins, classify, dirEntry);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('origin-path-depends-on-removed-entry');
  });

  it('B-CM-control: an origin wholly outside the bundle directory is not refused', () => {
    const origins = [{ name: '@x/u', origin: 'path:vendor/x', raw: 'vendor/x' }];
    const verdict = bundleFootprintVerdict('@x/t', origins, identityClassify, dirEntry);
    expect(verdict.ok).toBe(true);
  });

  it('B-CM-fold-reverse-unit: origin at the physical (straße) bundle dir is refused when owner is spelled with the fold alias (strasse)', () => {
    // Mutation proof: with the OLD code (footprint = raw 'strasse'), nfcTouches('.frontx/ai/@x/straße/src')
    // compares against ciNorm('strasse') and returns false (ß≠ss in NFC+toLowerCase), yielding ok:true.
    // With the fix, footprint = physical 'straße' from bundleFull.entries[parent.entries.length],
    // and nfcTouches succeeds → refused.
    const ownerAlias = '@x/strasse'; // ASCII ss spelling
    const physicalBundle = '.frontx/ai/@x/straße'; // ß physical name on the FS
    const foldClassify: ClassifyPathStrictFn = (raw) => {
      // Simulate APFS strasse→straße physical resolution at the bundle step
      if (raw === `.frontx/ai/${ownerAlias}`) {
        return {
          kind: 'present',
          canonical: physicalBundle,
          entries: [
            { path: '.frontx', symlink: false },
            { path: '.frontx/ai', symlink: false },
            { path: '.frontx/ai/@x', symlink: false },
            { path: physicalBundle, symlink: false }, // physical stored name
          ],
        };
      }
      const segs = raw.split('/').filter(Boolean);
      return { kind: 'present', canonical: raw, entries: segs.map((_, i) => ({ path: segs.slice(0, i + 1).join('/'), symlink: false })) };
    };
    // entryKind must respond to both spellings because on real APFS both map to the same entry
    const foldDirEntry: EntryKindFn = (p) =>
      p === physicalBundle || p === `.frontx/ai/${ownerAlias}` ? 'directory' : 'absent';
    const origin = `${physicalBundle}/src`;
    const origins = [{ name: '@x/u', origin: `path:${origin}`, raw: origin }];
    const verdict = bundleFootprintVerdict(ownerAlias, origins, foldClassify, foldDirEntry);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('origin-overlaps-bundle');
  });

  it('B-CM-dangling-unit: dangling bundle symlink is treated as footprint — origin containing the link is refused', () => {
    // Mutation proof: with the OLD code (absent → ok:true), origin loop is never reached.
    // With the fix, bundleEntry.symlink === true causes fall-through; origin access path
    // that traverses the link entry is refused with origin-path-depends-on-removed-entry.
    const owner = '@x/u';
    const danglingLink = `.frontx/ai/${owner}`; // the link itself still exists
    const danglingClassify: ClassifyPathStrictFn = (raw) => {
      if (raw === danglingLink) {
        return {
          kind: 'absent', // target missing — the link file exists but target doesn't
          canonical: danglingLink,
          entries: [
            { path: '.frontx', symlink: false },
            { path: '.frontx/ai', symlink: false },
            { path: '.frontx/ai/@x', symlink: false },
            { path: danglingLink, symlink: true }, // the dangling link entry itself
          ],
        };
      }
      const segs = raw.split('/').filter(Boolean);
      return { kind: 'present', canonical: raw, entries: segs.map((_, i) => ({ path: segs.slice(0, i + 1).join('/'), symlink: false })) };
    };
    // entryKind reports the dangling link as a symlink (not absent — the link file exists)
    const danglingEntryKind: EntryKindFn = (p) => (p === danglingLink ? 'symlink' : 'absent');
    // origin traverses through the dangling link
    const originRaw = `${danglingLink}/src`;
    const origins = [{ name: '@x/v', origin: `path:${originRaw}`, raw: originRaw }];
    const verdict = bundleFootprintVerdict(owner, origins, danglingClassify, danglingEntryKind);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('origin-path-depends-on-removed-entry');
  });

  it('B-CM-dangling-control: genuinely absent bundle entry (no link) returns ok:true', () => {
    const owner = '@x/u';
    const absentPath = `.frontx/ai/${owner}`;
    const absentClassify: ClassifyPathStrictFn = (raw) => {
      if (raw === absentPath) {
        return {
          kind: 'absent',
          canonical: absentPath,
          entries: [
            { path: '.frontx', symlink: false },
            { path: '.frontx/ai', symlink: false },
            { path: '.frontx/ai/@x', symlink: false },
            // no entry for the bundle segment — it truly doesn't exist
          ],
        };
      }
      const segs = raw.split('/').filter(Boolean);
      return { kind: 'present', canonical: raw, entries: segs.map((_, i) => ({ path: segs.slice(0, i + 1).join('/'), symlink: false })) };
    };
    const absentEntryKind: EntryKindFn = (_p) => 'absent';
    const origins = [{ name: '@x/v', origin: 'path:vendor/x', raw: 'vendor/x' }];
    const verdict = bundleFootprintVerdict(owner, origins, absentClassify, absentEntryKind);
    expect(verdict.ok).toBe(true);
  });

  it('B-CM-nfc-dir-unit: NFD origin inside an NFC-named bundle directory footprint is refused', () => {
    // Bundle dir '@x/café' (NFC é); origin path uses NFD é (e + ́ combining acute).
    // Raw prefix containment fails because NFD é !== NFC é as bytes; ciNorm
    // normalises both sides to NFC before the containment check, so it correctly refuses.
    // The vi.mock above forces identity foldForIdentity, so reverting NFC normalisation in ciNorm
    // would break this test even on a case-insensitive host — mutation proven regardless of probe.
    const nfcOwner = '@x/café'; // NFC é
    const nfdOrigin = '.frontx/ai/@x/café/sub'; // NFD é (e + combining acute) + sub-path
    const origins = [{ name: '@x/u', origin: `path:${nfdOrigin}`, raw: nfdOrigin }];
    const nfcDirEntry: EntryKindFn = (p) => (p === `.frontx/ai/@x/café` ? 'directory' : 'absent');
    const verdict = bundleFootprintVerdict(nfcOwner, origins, identityClassify, nfcDirEntry);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('origin-overlaps-bundle');
  });
});
