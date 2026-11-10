// @cpt-algo:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-noncanonical
// @cpt-algo:cpt-frontx-algo-composed-provenance-project-state-io:p1:inst-psio-if-record-noncanonical
//
// The recorded paths — every `targets[]` entry and every `projectOwnedRoots`
// entry — are judged once, by the project state store, for every engine: one
// that is not already its own normalised project-relative spelling is refused
// as PROJECT_INVALID on load, and never written on a mutation.
import { describe, expect, it, vi } from 'vitest';
import { mutateProjectState, readProjectState } from '../project-state/io';
import type { ProjectStateDocument } from '../project-state/types';

const REPO_ROOT = '/repo';

function document(overrides: Partial<ProjectStateDocument> = {}): ProjectStateDocument {
  return {
    formatVersion: 1,
    templates: { app: { origin: 'path:vendor/app', version: '1.0.0', targets: ['packages/app'] } },
    projectOwnedRoots: [],
    ...overrides,
  };
}

const read = (doc: ProjectStateDocument) => async (location: string) =>
  location.endsWith('project.json') ? JSON.stringify(doc) : null;

describe('recorded path spelling, judged at state load for every engine', () => {
  it.each([
    { label: 'a project-owned root that climbs and comes back', doc: document({ projectOwnedRoots: ['x/../app/src'] }), names: 'projectOwnedRoots' },
    { label: 'a project-owned root with a trailing separator', doc: document({ projectOwnedRoots: ['app/src/'] }), names: 'projectOwnedRoots' },
    { label: 'a project-owned root that climbs out of the project', doc: document({ projectOwnedRoots: ['../outside'] }), names: 'projectOwnedRoots' },
    { label: 'a project-owned root spelled app//src', doc: document({ projectOwnedRoots: ['app//src'] }), names: 'projectOwnedRoots' },
    { label: 'a project-owned root spelled ./app/src', doc: document({ projectOwnedRoots: ['./app/src'] }), names: 'projectOwnedRoots' },
    { label: 'an empty project-owned root', doc: document({ projectOwnedRoots: [''] }), names: 'projectOwnedRoots' },
    { label: 'an absolute project-owned root', doc: document({ projectOwnedRoots: ['/etc'] }), names: 'projectOwnedRoots' },
    {
      label: 'a target that climbs and comes back',
      doc: document({ templates: { app: { origin: 'o', version: '1', targets: ['app/../other'] } } }),
      names: 'templates["app"].targets',
    },
    {
      label: 'a target spelled ./app',
      doc: document({ templates: { app: { origin: 'o', version: '1', targets: ['./app'] } } }),
      names: 'templates["app"].targets',
    },
    {
      label: 'an owned root with trailing whitespace',
      doc: document({ projectOwnedRoots: ['with space '] }),
      names: 'projectOwnedRoots',
    },
    {
      label: 'a target with a control character',
      doc: document({ templates: { app: { origin: 'o', version: '1', targets: ['ctl\u0001'] } } }),
      names: 'templates["app"].targets',
    },
    {
      label: 'a home-directory target',
      doc: document({ templates: { app: { origin: 'o', version: '1', targets: ['~'] } } }),
      names: 'templates["app"].targets',
    },
  ])('refuses $label with PROJECT_INVALID naming the offending entry', async ({ doc, names }) => {
    const result = await readProjectState(REPO_ROOT, read(doc));

    expect(result).toMatchObject({ ok: false, error: 'PROJECT_INVALID' });
    if (result.ok) return;
    expect(result.message).toContain(names);
  });

  it('carries the offending entry as details, the shape validate --project reports', async () => {
    const target = await readProjectState(
      REPO_ROOT,
      read(document({ templates: { app: { origin: 'o', version: '1', targets: ['./app'] } } })),
    );
    const root = await readProjectState(REPO_ROOT, read(document({ projectOwnedRoots: ['x/../app'] })));

    expect(target).toMatchObject({ ok: false, details: { name: 'app', target: './app' } });
    expect(root).toMatchObject({ ok: false, details: { path: 'x/../app' } });
  });

  it('accepts the canonical shapes apply and ownership add record, including the root target', async () => {
    const doc = document({
      templates: { app: { origin: 'o', version: '1', targets: ['packages/app', '.'] } },
      projectOwnedRoots: ['docs', 'a\\b', 'a:b'],
    });

    expect(await readProjectState(REPO_ROOT, read(doc))).toMatchObject({ ok: true });
  });

  it('refuses a mutation through the same load, writing nothing', async () => {
    const write = vi.fn(async () => {});

    const result = await mutateProjectState(
      REPO_ROOT,
      { kind: 'add-owned-root', path: 'ok' },
      read(document({ projectOwnedRoots: ['x/../app/src'] })),
      write,
    );

    expect(result).toMatchObject({ ok: false, error: 'PROJECT_INVALID' });
    expect(write).not.toHaveBeenCalled();
  });
});

describe('recorded path spelling, judged before a mutation writes', () => {
  it.each([
    { label: 'a non-canonical owned root', mutation: { kind: 'add-owned-root' as const, path: 'x/../app' } },
    {
      label: 'a non-canonical target',
      mutation: { kind: 'set-template' as const, name: 'app', entry: { origin: 'o', version: '1', targets: ['./app'] } },
    },
  ])('refuses to record $label, writing nothing', async ({ mutation }) => {
    const write = vi.fn(async () => {});

    const result = await mutateProjectState(REPO_ROOT, mutation, read(document()), write);

    expect(result).toMatchObject({ ok: false, error: 'PROJECT_INVALID' });
    expect(write).not.toHaveBeenCalled();
  });

  it('records a canonical target and owned root as given', async () => {
    const write = vi.fn(async () => {});

    const result = await mutateProjectState(REPO_ROOT, { kind: 'add-owned-root', path: 'docs' }, read(document()), write);

    expect(result).toMatchObject({ ok: true });
    expect(write).toHaveBeenCalledTimes(1);
  });
});
