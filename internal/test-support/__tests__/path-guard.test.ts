import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// `joinWithinRoot` is the #597 fix's real path-containment helper, now
// implemented at `../path-guard.ts`: it lets the ~11 test files across
// packages/* that build fixture paths under a `mkdtempSync` root with
// unguarded `fs.*` calls stop tripping the corporate semgrep scanner's
// path-injection rule — without a `.semgrepignore`/`// nosemgrep`
// suppression (any edit to `.semgrepignore` requires Security Team sign-off
// the team will not grant). `.semgrepignore` and `.codacy.yaml` used to
// reference `joinUnderRoot`/`resolvePathUnderProjectRoot` as if they existed
// in `packages/cli/src/utils/fs.ts`; that file does not exist. This helper
// is the real one those comments should have pointed to.
//
// Design decision (recorded here, not silently gapped): `joinWithinRoot` is a
// pure string/segment-level guard, modeled on
// `resolvePackageJsonPathWithinRoot` (~L116) and `isSafePathSegment` (~L158)
// in `scripts/check-test-dependency-versions.mjs`. It does no filesystem
// canonicalization and provides no symlink-escape defense (e.g.
// `os.tmpdir()` vs. its realpath differing, macOS `/var` vs `/private/var`).
// A symlink-escape test is therefore intentionally out of scope here.
//
// The negative assertions below assert on a specific message pattern, not a
// bare `Error` constructor. `joinWithinRoot` MUST throw messages matching
// `/unsafe segment|escapes root/i` for these tests to pass for the right
// reason.
//
// package.json's `exports["./path-guard"]` points at `./path-guard.ts`,
// which implements `joinWithinRoot` below.
import { joinWithinRoot } from '../path-guard';

const UNSAFE_SEGMENT_ERROR = /unsafe segment|escapes root/i;

const created: string[] = [];

function makeRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-path-guard-'));
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('joinWithinRoot', () => {
  it('accepts a single literal segment that stays within root', () => {
    const root = makeRoot();

    expect(joinWithinRoot(root, 'fixture.txt')).toBe(path.join(root, 'fixture.txt'));
  });

  it('accepts nested valid segments joined in sequence', () => {
    const root = makeRoot();

    expect(joinWithinRoot(root, 'nested', 'fixture.txt')).toBe(
      path.join(root, 'nested', 'fixture.txt'),
    );
  });

  // F-008: segments that merely *contain* '.' or '..' as a substring (not an
  // exact-match path token) are legitimate filenames and must be accepted.
  // An overly strict Phase 2 implementation that greps for the substring
  // instead of comparing the whole segment would wrongly reject these.
  it('accepts a segment containing ".." as a substring, not an exact segment', () => {
    const root = makeRoot();

    expect(joinWithinRoot(root, '..hidden')).toBe(path.join(root, '..hidden'));
  });

  it('accepts a segment containing "." as a substring, not an exact segment', () => {
    const root = makeRoot();

    expect(joinWithinRoot(root, 'v1.2.3')).toBe(path.join(root, 'v1.2.3'));
  });

  it('rejects a ".." segment', () => {
    const root = makeRoot();

    expect(() => joinWithinRoot(root, '..')).toThrow(UNSAFE_SEGMENT_ERROR);
  });

  // F-002(a): a dangerous segment appearing after a valid one must still be
  // caught — a stub that only validates segments[0] would pass every other
  // case in this file but let this one through.
  it('rejects a ".." segment in a non-first position, after a valid segment', () => {
    const root = makeRoot();

    expect(() => joinWithinRoot(root, 'nested', '..')).toThrow(UNSAFE_SEGMENT_ERROR);
  });

  it('rejects an absolute path string as a segment', () => {
    const root = makeRoot();

    expect(() => joinWithinRoot(root, path.resolve(os.tmpdir(), 'elsewhere'))).toThrow(
      UNSAFE_SEGMENT_ERROR,
    );
  });

  it('rejects a segment containing a posix path separator', () => {
    const root = makeRoot();

    expect(() => joinWithinRoot(root, 'nested/fixture.txt')).toThrow(UNSAFE_SEGMENT_ERROR);
  });

  it('rejects a segment containing a win32 path separator', () => {
    const root = makeRoot();

    expect(() => joinWithinRoot(root, 'nested\\fixture.txt')).toThrow(UNSAFE_SEGMENT_ERROR);
  });

  it('rejects a segment containing a null byte', () => {
    const root = makeRoot();

    expect(() => joinWithinRoot(root, 'fixture\0.txt')).toThrow(UNSAFE_SEGMENT_ERROR);
  });

  it('rejects an empty-string segment', () => {
    const root = makeRoot();

    expect(() => joinWithinRoot(root, '')).toThrow(UNSAFE_SEGMENT_ERROR);
  });

  it('rejects a "." segment', () => {
    const root = makeRoot();

    expect(() => joinWithinRoot(root, '.')).toThrow(UNSAFE_SEGMENT_ERROR);
  });

  // F-002(b): a Windows drive-relative segment contains no path separator and
  // is not '.', '..', or empty, so a *separator-only* screen would let it
  // through. It is actually caught by the explicit `:` rejection in
  // `isSafePathSegment` (character screening), not by the containment check
  // — segments can never contain a path separator, so no segment can ever
  // combine with others to escape `root` via containment alone. Built with
  // `path.win32` explicitly so this assertion is platform-independent (a
  // literal `'C:temp.txt'` string behaves the same on every OS the test
  // suite runs on).
  it('rejects a drive-relative-style segment via character screening (":" rejection)', () => {
    const root = makeRoot();
    // `path.win32.normalize` keeps this in its drive-relative form (no
    // separator, unlike `path.win32.join`/`resolve`), so this segment
    // contains no path.sep/posix.sep/win32.sep and is not '.', '..', or
    // empty — a separator-only screen would let it through, but the `:`
    // character rejection in `isSafePathSegment` still catches it.
    const driveRelativeSegment = path.win32.normalize('C:temp.txt');

    expect(() => joinWithinRoot(root, driveRelativeSegment)).toThrow(UNSAFE_SEGMENT_ERROR);
  });

  // G-004: calling with zero segments is a documented no-op, not a silent
  // gap — pin the contract explicitly.
  it('returns root unchanged when called with zero segments', () => {
    const root = makeRoot();

    expect(joinWithinRoot(root)).toBe(path.resolve(root));
  });
});
