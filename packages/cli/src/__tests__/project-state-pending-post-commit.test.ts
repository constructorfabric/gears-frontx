import { describe, expect, it } from 'vitest';
import { mutateProjectState, readProjectState } from '../project-state/io';
import type { ProjectStateDocument, TemplateEntry } from '../project-state/types';

// In-memory store only: no filesystem, nothing to clean up.
function store(document: unknown) {
  let raw = JSON.stringify(document);
  return {
    read: async () => raw,
    write: async (_path: string, content: string) => {
      raw = content;
    },
    doc: () => JSON.parse(raw) as ProjectStateDocument,
  };
}

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const base: TemplateEntry = { origin: 'path:t2', version: '2.0.0', targets: ['app'], previous: { origin: 'path:t1', version: '1.0.0' } };
const pending = { intentId: ID, inventory: 'not-required' as const, ai: 'pending' as const };
const doc = (templates: Record<string, unknown>, formatVersion = 3) => ({ formatVersion, templates, projectOwnedRoots: [] });

describe('pendingPostCommit in the project state (plan-ai-recovery r9 §2.3)', () => {
  it('is read from a formatVersion-3 document and refused from older stamps', async () => {
    expect((await readProjectState('/p', store(doc({ a: { ...base, pendingPostCommit: pending } })).read)).ok).toBe(true);
    for (const v of [1, 2]) {
      const result = await readProjectState('/p', store(doc({ a: { ...base, pendingPostCommit: pending } }, v)).read);
      expect(result).toMatchObject({ ok: false, message: expect.stringContaining('pendingPostCommit') });
    }
  });

  it.each([
    ['an unknown status', { ...pending, ai: 'half' }],
    ['a non-uuid intent', { ...pending, intentId: 'x' }],
    ['an unknown field', { ...pending, extra: 1 }],
    ['a malformed effect hash', { ...pending, effects: { ai: 'nothex' } }],
  ])('refuses %s', async (_label, record) => {
    const result = await readProjectState('/p', store(doc({ a: { ...base, pendingPostCommit: record } })).read);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('pendingPostCommit') });
  });

  it('refuses one intent recorded on two entries', async () => {
    const result = await readProjectState('/p', store(doc({ a: { ...base, pendingPostCommit: pending }, b: { ...base, pendingPostCommit: pending } })).read);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('repeats') });
  });

  it('only its own transition may change a pending entry; disjoint writes keep it; v3 is never lowered', async () => {
    const s = store(doc({ a: { ...base, pendingPostCommit: pending }, b: base }));
    const before = s.doc();
    // Another writer replacing the pending entry is refused without a write.
    const refused = await mutateProjectState('/p', { kind: 'set-template', name: 'a', entry: base }, s.read, s.write);
    expect(refused).toMatchObject({ ok: false, details: { pendingPostCommit: 'a' } });
    expect(s.doc()).toEqual(before);
    // Another transition's id is no authorization either.
    expect(await mutateProjectState('/p', { kind: 'set-template', name: 'a', entry: base }, s.read, s.write, { transitionIntentId: OTHER })).toMatchObject({ ok: false });
    // A disjoint entry stays writable and the pending record survives untouched.
    expect((await mutateProjectState('/p', { kind: 'set-template', name: 'b', entry: { ...base, targets: ['other'] } }, s.read, s.write)).ok).toBe(true);
    expect(s.doc().templates.a.pendingPostCommit).toEqual(pending);
    // The owning transition clears it; the document stays formatVersion 3.
    expect((await mutateProjectState('/p', { kind: 'set-template', name: 'a', entry: base }, s.read, s.write, { transitionIntentId: ID })).ok).toBe(true);
    expect(s.doc().templates.a).toEqual(base);
    expect(s.doc().formatVersion).toBe(3);
  });

  it('a new pending record can only be written by its own transition', async () => {
    const s = store(doc({ a: base }, 1));
    const withRecord = { ...base, pendingPostCommit: pending };
    expect(await mutateProjectState('/p', { kind: 'set-template', name: 'a', entry: withRecord }, s.read, s.write)).toMatchObject({ ok: false });
    expect((await mutateProjectState('/p', { kind: 'set-template', name: 'a', entry: withRecord }, s.read, s.write, { transitionIntentId: ID })).ok).toBe(true);
    expect(s.doc().formatVersion).toBe(3);
  });
});
