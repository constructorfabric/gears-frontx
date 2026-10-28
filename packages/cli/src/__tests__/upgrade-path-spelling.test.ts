// @cpt-algo:cpt-frontx-algo-upgrade-changeset-classify:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-validate:p1
//
// The upgrade engine judges ownership and containment on the NORMALISED
// project-relative path, and never touches disk for a location that is not
// spelled as the one it names. These cases drive `validateUpgrade` — the engine's
// own entry point — with payloads built by hand, so the resolver's bundle-key
// guard (`inst-resolve-bundle-keys`) is not in the way: the engine's check has to
// hold with that guard removed, and it has to hold for the inputs that never go
// through it at all (a recorded target, a `path:` origin's keys).
//
// Reproduced before the fix, on a built binary, with a crafted upgrade payload:
//   target `app`, key `../other/x.txt`           => `other/x.txt` written (ADD),
//                                                   or overwritten (REPLACE)
//   target `.`,   key `src/../.frontx/x.json`    => written into `.frontx/`
//   recorded target `app/../.frontx`             => the `.frontx` exclusion did
//                                                   not apply; files REPLACEd there
//   recorded target `../outside`                 => an outside file was read and
//                                                   reported as the REPLACE's
//                                                   `expectedDisk`
import { describe, expect, it } from 'vitest';
import { validateUpgrade } from '../upgrade/validate';
import type { ValidateInput } from '../upgrade/validate';
import type { DiskEntry, ReadDiskEntryFn, ResolvedPayload, ResolvePayloadResult } from '../upgrade/types';
import type { TemplateEntry } from '../project-state/types';

const REPO_ROOT = '/repo';

function payload(origin: string, version: string, files: Record<string, string>): ResolvedPayload {
  return { name: 'my-template', version, origin, files: new Map(Object.entries(files)), excludedSubtrees: [] };
}

function harness(options: { target: string; baselineFiles: Record<string, string>; candidateFiles: Record<string, string>; disk?: Record<string, DiskEntry> }) {
  const reads: string[] = [];
  const readDiskEntry: ReadDiskEntryFn = async (absolutePath) => {
    reads.push(absolutePath);
    return options.disk?.[absolutePath] ?? { kind: 'absent' };
  };
  const fixtures: Record<string, ResolvedPayload> = {
    'origin-a': payload('origin-a', '1.0.0', options.baselineFiles),
    'origin-b': payload('origin-b', '2.0.0', options.candidateFiles),
  };
  const entry: TemplateEntry = { origin: 'origin-a', version: '1.0.0', targets: [options.target] };
  const input: ValidateInput = {
    name: 'my-template',
    entry,
    candidateOrigin: 'origin-b',
    document: { formatVersion: 1, templates: { 'my-template': entry }, projectOwnedRoots: [] },
    repoRoot: REPO_ROOT,
    resolvePayload: async (origin): Promise<ResolvePayloadResult> => ({ ok: true, payload: fixtures[origin] }),
    resolveRegisteredExclusions: async () => [],
    readDiskEntry,
    canonicalizeFn: (raw) => raw,
  };
  return { input, reads };
}

describe('the upgrade engine judges a payload path on its normalised project-relative spelling', () => {
  it.each([
    { label: 'a key that climbs into a sibling of the target', target: 'app', key: '../other/x.txt', named: 'app/../other/x.txt' },
    { label: 'a key that climbs and comes back into the CLI namespace', target: '.', key: 'src/../.frontx/injected.json', named: 'src/../.frontx/injected.json' },
    { label: 'a key that climbs out of the project root', target: 'app', key: '../../outside.txt', named: 'app/../../outside.txt' },
    { label: 'an absolute key under a nested target', target: 'app', key: '/etc/passwd', named: 'app//etc/passwd' },
    { label: 'an absolute key under the root target', target: '.', key: '/etc/passwd', named: '/etc/passwd' },
    { label: 'a key with a doubled separator', target: 'app', key: 'src//x.ts', named: 'app/src//x.ts' },
    { label: 'a key spelled with a `.` segment', target: 'app', key: './x.ts', named: 'app/./x.ts' },
  ])('refuses $label with INVALID_PATH, reading nothing from disk', async ({ target, key, named }) => {
    const h = harness({ target, baselineFiles: {}, candidateFiles: { [key]: 'PWNED' } });

    const result = await validateUpgrade(h.input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_PATH');
    expect(result.message).toContain(JSON.stringify(named));
    expect(result.details).toMatchObject({ paths: [{ target, path: named }] });
    // Neither the path nor an ancestor of it was probed: nothing outside what the
    // payload honestly names was ever touched.
    expect(h.reads).toEqual([]);
  });

  it('judges a key the BASELINE carries the same way — a REMOVE of an unaddressable path is as unsafe as an ADD', async () => {
    const h = harness({ target: 'app', baselineFiles: { '../other/x.txt': 'OLD' }, candidateFiles: {} });

    const result = await validateUpgrade(h.input);

    expect(result).toMatchObject({ ok: false, code: 'INVALID_PATH' });
    expect(h.reads).toEqual([]);
  });

  it('names every unaddressable path once, however many payloads carry it', async () => {
    const h = harness({
      target: 'app',
      baselineFiles: { '../other/x.txt': 'OLD', '../a.txt': 'A' },
      candidateFiles: { '../other/x.txt': 'NEW' },
    });

    const result = await validateUpgrade(h.input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details).toMatchObject({
      paths: [
        { target: 'app', path: 'app/../other/x.txt' },
        { target: 'app', path: 'app/../a.txt' },
      ],
    });
  });

  it('refuses before an ordinary conflict is reported: the same upgrade also has a doubly-changed file', async () => {
    const h = harness({
      target: 'app',
      baselineFiles: { 'src/a.ts': 'old' },
      candidateFiles: { 'src/a.ts': 'new', '../other/x.txt': 'PWNED' },
      disk: { '/repo/app/src/a.ts': { kind: 'file', content: 'edited by hand' } },
    });

    const result = await validateUpgrade(h.input);

    expect(result).toMatchObject({ ok: false, code: 'INVALID_PATH' });
  });

  it('still plans a canonical payload (control)', async () => {
    const h = harness({ target: 'app', baselineFiles: {}, candidateFiles: { 'src/x.ts': 'NEW', 'a:b.ts': 'colon', 'we\\ird.ts': 'backslash' } });

    const result = await validateUpgrade(h.input);

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'plan') return;
    expect(result.plan.operations.map((operation) => [operation.op, operation.path]).sort()).toEqual([
      ['ADD', 'app/a:b.ts'],
      ['ADD', 'app/src/x.ts'],
      ['ADD', 'app/we\\ird.ts'],
    ]);
  });
});

describe('the upgrade engine judges a recorded target on its normalised spelling too', () => {
  it.each([
    { label: 'a target that climbs and comes back into the CLI namespace', target: 'app/../.frontx' },
    { label: 'a target that climbs into a sibling', target: 'app/../other' },
    { label: 'a target that climbs out of the project root', target: '../outside' },
    { label: 'an absolute target', target: '/etc' },
    { label: 'a target with a trailing separator', target: 'app/' },
  ])('refuses $label with INVALID_PATH, reading nothing from disk', async ({ target }) => {
    const h = harness({ target, baselineFiles: { 'src/index.ts': 'v1' }, candidateFiles: { 'src/index.ts': 'v2' } });

    const result = await validateUpgrade(h.input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_PATH');
    expect(result.details).toMatchObject({ paths: [{ target, path: target }] });
    expect(result.message).toContain('the target');
    expect(h.reads).toEqual([]);
  });
});
