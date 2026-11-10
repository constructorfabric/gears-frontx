import { describe, expect, it } from 'vitest';
import { selectTemplateEntry, type ProjectStateDocument } from '../project-state';

const entry = { origin: 'path:t', version: '1.0.0', targets: [] };

describe('selectTemplateEntry', () => {
  it('answers undefined for prototype-named templates against empty and persisted state', () => {
    const empty: ProjectStateDocument = { formatVersion: 1, templates: {}, projectOwnedRoots: [] };
    const persisted: ProjectStateDocument = JSON.parse(
      JSON.stringify({ formatVersion: 2, templates: { '@x/real': entry }, projectOwnedRoots: [] }),
    );
    for (const doc of [empty, persisted]) {
      for (const name of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
        expect(selectTemplateEntry(doc, name)).toBeUndefined();
      }
    }
  });

  it('still returns a template registered under such a name', () => {
    const doc: ProjectStateDocument = JSON.parse(
      JSON.stringify({ formatVersion: 1, templates: { toString: entry }, projectOwnedRoots: [] }),
    );
    expect(selectTemplateEntry(doc, 'toString')).toEqual(entry);
  });
});
