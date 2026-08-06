// @cpt-flow:cpt-frontx-flow-cli-scaffolding-seed-repository:p1
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-add-template:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-boundary-declared-assembly:p1
import { describe, it, expect } from 'vitest';
import { seedRepository } from '../commands/seed-repository';
import { addTemplate } from '../commands/add-template';
import type { InventoryEntry } from '../inventory/types';
import { InventoryState } from '../inventory/types';
import type { TemplateManifest } from '../manifest/types';
import type { ContentItem, ReadContentItemsFn, ReadProjectFileFn, WriteFileFn } from '../scaffold/types';
import type { ProvenanceRecord, ProvenanceWriteFn } from '../provenance/types';
import type { ReadProvenanceRecordsFn } from '../scaffold/materialize';
import type { ReadTargetDirFn } from '../commands/seed-repository';

// The seed cases below aim at a notional '/target' that exists on no
// filesystem, so the probe reports it absent — the case materialization
// creates. The empty-target guard's own cases supply their own probe.
const targetAbsent: ReadTargetDirFn = async () => undefined;

// Same content-registry-keyed-by-name convention as assembler.test.ts — the
// manifest carries ONLY its declared categories; content items live separately
// and are read via the injected readContentFn seam, directly from the installed
// content path, never from the manifest.
function makeEntry(
  name: string,
  content: ContentItem[],
  manifestOverrides: Partial<TemplateManifest> = {},
): InventoryEntry {
  const manifest: TemplateManifest = {
    name,
    version: '1.0.0',
    ownershipBoundaries: { exclusiveSubtrees: [`${name}/`], sharedFiles: [] },
    ...manifestOverrides,
  };
  contentRegistry.set(name, content);
  return {
    name,
    source: `github:acme/${name}@v1.0.0`,
    ref: 'v1.0.0',
    status: InventoryState.INSTALLED,
    content: JSON.stringify(manifest),
  };
}

const contentRegistry = new Map<string, ContentItem[]>();
const readContentFn: ReadContentItemsFn = async (entry) => contentRegistry.get(entry.name) ?? [];

function makeFsFake() {
  const files = new Map<string, string>();
  const writeFileFn: WriteFileFn = async (path, content) => {
    files.set(path, content);
  };
  const provenanceWriteFn: ProvenanceWriteFn = async (path, content) => {
    files.set(path, content);
  };
  const readProvenanceFn: ReadProvenanceRecordsFn = async (targetDir) => {
    const raw = files.get(`${targetDir}/.frontx/provenance.json`);
    return raw ? (JSON.parse(raw) as ProvenanceRecord[]) : [];
  };
  // Backed by the SAME in-memory `files` map every other fake here writes
  // through, so a region-union path this fake fs already holds (from an
  // earlier seed/add in the same test) is visible to composeSharedFiles'
  // carry-forward check exactly as the real fs adapter would see it.
  const readProjectFileFn: ReadProjectFileFn = async (path) => files.get(path) ?? null;
  return { files, writeFileFn, provenanceWriteFn, readProvenanceFn, readProjectFileFn };
}

// inst-seed-check-target-empty / inst-seed-if-target-not-directory /
// inst-seed-abort-target-not-directory / inst-seed-if-target-not-empty /
// inst-seed-abort-target-not-empty — cpt-frontx-dod-cli-scaffolding-seed-empty-target
describe('seedRepository empty-target guard — cpt-frontx-dod-cli-scaffolding-seed-empty-target', () => {
  const entry = makeEntry('template-a', [{ path: 'template-a/index.ts', content: 'export const a = true;' }]);

  it('refuses a target directory that already holds entries, writing no file and resolving no template', async () => {
    const { files, writeFileFn, provenanceWriteFn } = makeFsFake();
    const lookupFn = vi.fn(() => entry);

    const result = await seedRepository(
      'template-a',
      '/existing-repo',
      lookupFn,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      async () => ['package.json', 'src', '.git'],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('target-not-empty');
    expect(files.size).toBe(0);
  });

  // .git is the load-bearing non-content entry: `git init` then `frontx seed` is
  // the ordinary way to start, so refusing a bare repository would refuse the
  // most common first step there is.
  it('seeds a directory holding only .git, so a freshly initialized repository is a supported start', async () => {
    const { files, writeFileFn, provenanceWriteFn } = makeFsFake();

    const result = await seedRepository(
      'template-a',
      '/fresh-repo',
      () => entry,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      async () => ['.git'],
    );

    expect(result.ok).toBe(true);
    expect(files.get('/fresh-repo/template-a/index.ts')).toBe('export const a = true;');
  });

  it('seeds a directory holding only platform droppings such as .DS_Store', async () => {
    const { writeFileFn, provenanceWriteFn } = makeFsFake();

    const result = await seedRepository(
      'template-a',
      '/dropping-only',
      () => entry,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      async () => ['.DS_Store', 'Thumbs.db'],
    );

    expect(result.ok).toBe(true);
  });

  it('still refuses a directory mixing non-content entries with real content', async () => {
    const { writeFileFn, provenanceWriteFn } = makeFsFake();

    const result = await seedRepository(
      'template-a',
      '/mixed',
      () => entry,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      async () => ['.git', 'package.json'],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('target-not-empty');
  });

  // The non-content entries were not the reason, so quoting them would send the
  // developer looking for content that is not what blocked them.
  it('names only the content entries in the refusal, never the non-content ones', async () => {
    const { writeFileFn, provenanceWriteFn } = makeFsFake();

    const result = await seedRepository(
      'template-a',
      '/mixed',
      () => entry,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      async () => ['.git', '.DS_Store', 'package.json'],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('package.json');
    expect(result.message).not.toContain('.git');
    expect(result.message).not.toContain('.DS_Store');
    expect(result.message).toContain('holds 1 entry');
  });

  // A path that exists as a file gets its own reason and NO add remedy: add
  // needs a directory too, so recommending it would be a second failure.
  it('refuses a target path that exists and is not a directory, offering no add remedy', async () => {
    const { files, writeFileFn, provenanceWriteFn } = makeFsFake();

    const result = await seedRepository(
      'template-a',
      '/some-file.txt',
      () => entry,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      async () => 'not-a-directory',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('target-not-directory');
    expect(result.message).toContain('/some-file.txt');
    expect(result.message).not.toContain('frontx add');
    expect(files.size).toBe(0);
  });

  it('qualifies the add remedy with the boundary-only limit that lets add overwrite a declared path', async () => {
    const { writeFileFn, provenanceWriteFn } = makeFsFake();

    const result = await seedRepository(
      'template-a',
      '/existing-repo',
      () => entry,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      async () => ['package.json'],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('declared template boundaries only');
  });

  it('names the refused directory and the add command as the remedy', async () => {
    const { writeFileFn, provenanceWriteFn } = makeFsFake();

    const result = await seedRepository(
      'template-a',
      '/existing-repo',
      () => entry,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      async () => ['package.json'],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('/existing-repo');
    expect(result.message).toContain('frontx add template-a /existing-repo');
  });

  // A repository holding thousands of files must still produce a readable
  // refusal, so the message samples and counts rather than listing everything.
  it('summarizes the remainder rather than listing every entry of a large directory', async () => {
    const { writeFileFn, provenanceWriteFn } = makeFsFake();
    const many = Array.from({ length: 12 }, (_, i) => `file-${i}.ts`);

    const result = await seedRepository(
      'template-a',
      '/existing-repo',
      () => entry,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      async () => many,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The property: exactly REFUSAL_ENTRY_SAMPLE names quoted, the balance
    // counted. Asserting one absent filename would pass for the wrong reason if
    // the cap changed but the sample happened to exclude that name.
    const quoted = many.filter((name) => result.message.includes(name));
    expect(quoted).toHaveLength(5);
    expect(result.message).toContain(`and ${many.length - 5} more`);
  });

  it('seeds a target directory that exists and is empty, because an empty directory holds nothing to overwrite', async () => {
    const { files, writeFileFn, provenanceWriteFn } = makeFsFake();

    const result = await seedRepository(
      'template-a',
      '/empty-dir',
      () => entry,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      async () => [],
    );

    expect(result.ok).toBe(true);
    expect(files.get('/empty-dir/template-a/index.ts')).toBe('export const a = true;');
  });

  it('seeds a target directory that does not exist, which materialization creates', async () => {
    const { files, writeFileFn, provenanceWriteFn } = makeFsFake();

    const result = await seedRepository(
      'template-a',
      '/not-yet',
      () => entry,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      async () => undefined,
    );

    expect(result.ok).toBe(true);
    expect(files.get('/not-yet/template-a/index.ts')).toBe('export const a = true;');
  });

  // inst-seed-recheck-target — resolution and the conflict check take time, so
  // the target is re-read immediately before the first write. A probe that
  // reports empty first and occupied second stands in for a directory that
  // gained content during that window.
  it('refuses on the last-moment re-read when the target became occupied after the pre-flight read', async () => {
    const { files, writeFileFn, provenanceWriteFn } = makeFsFake();
    const states: (string[] | undefined)[] = [[], ['package.json']];
    let call = 0;
    const flipping = async (): Promise<string[] | undefined> => states[call++] ?? ['package.json'];

    const result = await seedRepository(
      'template-a',
      '/races',
      () => entry,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      flipping,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('target-not-empty');
    // The point of re-reading at all: nothing was written despite the pre-flight
    // read having cleared the target.
    expect(files.size).toBe(0);
    expect(call).toBe(2);
  });

  it('refuses on the re-read when the target became a file after the pre-flight read', async () => {
    const { files, writeFileFn, provenanceWriteFn } = makeFsFake();
    const states: (string[] | 'not-a-directory' | undefined)[] = [undefined, 'not-a-directory'];
    let call = 0;
    const flipping = async (): Promise<string[] | 'not-a-directory' | undefined> => states[call++] ?? 'not-a-directory';

    const result = await seedRepository(
      'template-a',
      '/races-file',
      () => entry,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      flipping,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('target-not-directory');
    expect(files.size).toBe(0);
  });

  // The guard runs before resolution, so a populated target is refused without
  // the flow ever consulting the inventory.
  it('refuses before resolving the template, so only the reference check consults the inventory', async () => {
    const { writeFileFn, provenanceWriteFn } = makeFsFake();
    const lookupFn = vi.fn((): InventoryEntry | undefined => entry);

    await seedRepository(
      'template-a',
      '/existing-repo',
      lookupFn,
      readContentFn,
      writeFileFn,
      provenanceWriteFn,
      async () => ['package.json'],
    );

    // One call only: the reference check at inst-seed-check-resolved. Resolution
    // (inst-seed-resolve-set) would drive further lookups.
    expect(lookupFn).toHaveBeenCalledTimes(1);
  });
});

describe('seedRepository — cpt-frontx-flow-cli-scaffolding-seed-repository', () => {
  it('seeds an empty target: resolves the referenced set incl. preset references, stages via P14, passes P29, materializes, writes one provenance record per applied template', async () => {
    const preset = makeEntry('preset-template', [{ path: 'preset-template/README.md', content: 'preset' }], {
      referencedTemplates: [{ ref: 'mfe-a', appliedAt: 'mfe-a/' }],
    });
    const mfeA = makeEntry('mfe-a', [{ path: 'mfe-a/index.ts', content: 'export const mfeA = true;' }]);
    const entries: Record<string, InventoryEntry> = { 'preset-template': preset, 'mfe-a': mfeA };
    const lookupFn = (n: string) => entries[n];
    const { files, writeFileFn, provenanceWriteFn, readProjectFileFn } = makeFsFake();

    const result = await seedRepository('preset-template', '/target', lookupFn, readContentFn, writeFileFn, provenanceWriteFn, targetAbsent, readProjectFileFn);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appliedTemplates.sort()).toEqual(['mfe-a', 'preset-template']);
    expect(files.get('/target/preset-template/README.md')).toBe('preset');
    expect(files.get('/target/mfe-a/index.ts')).toBe('export const mfeA = true;');
    const provenance = JSON.parse(files.get('/target/.frontx/provenance.json')!) as ProvenanceRecord[];
    expect(provenance).toHaveLength(2);
    expect(provenance.map((r) => r.templateIdentity).sort()).toEqual(['mfe-a', 'preset-template']);
  });

  it('aborts with no files written when the template reference cannot be resolved from the local inventory', async () => {
    const { files, writeFileFn, provenanceWriteFn, readProjectFileFn } = makeFsFake();

    const result = await seedRepository('missing', '/target', () => undefined, readContentFn, writeFileFn, provenanceWriteFn, targetAbsent, readProjectFileFn);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unresolved');
    expect(files.size).toBe(0);
  });

  it('aborts BEFORE any file write when two templates in the staged assembly claim the same exclusive subtree', async () => {
    const templateA = makeEntry('template-a', [{ path: 'shared/a.ts', content: 'a' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['shared/'], sharedFiles: [] },
      referencedTemplates: [{ ref: 'template-b', appliedAt: 'template-b/' }],
    });
    const templateB = makeEntry('template-b', [{ path: 'shared/b.ts', content: 'b' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['shared/'], sharedFiles: [] },
    });
    const entries: Record<string, InventoryEntry> = { 'template-a': templateA, 'template-b': templateB };
    const { files, writeFileFn, provenanceWriteFn, readProjectFileFn } = makeFsFake();

    const result = await seedRepository('template-a', '/target', (n) => entries[n], readContentFn, writeFileFn, provenanceWriteFn, targetAbsent, readProjectFileFn);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('conflict');
    if (result.reason === 'conflict') {
      expect(result.conflicts).toEqual([{ ground: 'shared/', contestants: ['template-a', 'template-b'] }]);
    }
    expect(files.size).toBe(0);
  });
});

describe('addTemplate — cpt-frontx-flow-cli-scaffolding-add-template', () => {
  // inst-add-resolve-occupied
  it('resolves a provenance record written under the old identity scheme by its source address', async () => {
    // The repository remembers `legacy-repo-name`, the identity the resolver
    // derived from the repository segment before the manifest owned it. The
    // installed template now answers to its manifest name, and the two are
    // connected only by the source-spec the record carries.
    const applied = makeEntry('declared-identity', [{ path: 'applied/index.ts', content: 'applied' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['applied/'], sharedFiles: [] },
    });
    const legacyEntry: InventoryEntry = { ...applied, source: 'github:acme/legacy-repo-name@v1.0.0' };
    const newTemplate = makeEntry('new-template', [{ path: 'new/index.ts', content: 'new' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['new/'], sharedFiles: [] },
    });
    const entries: Record<string, InventoryEntry> = {
      'declared-identity': legacyEntry,
      'new-template': newTemplate,
    };
    const { files, writeFileFn, provenanceWriteFn, readProvenanceFn, readProjectFileFn } = makeFsFake();
    files.set(
      '/target/.frontx/provenance.json',
      JSON.stringify([
        { templateIdentity: 'legacy-repo-name', scaffoldedFromVersion: '1.0.0', sourceSpec: 'github:acme/legacy-repo-name@v2.0.0' },
      ]),
    );

    const result = await addTemplate(
      'new-template',
      '/target',
      (n: string) => entries[n],
      async () => Object.values(entries),
      readContentFn,
      writeFileFn,
      readProvenanceFn,
      provenanceWriteFn,
      readProjectFileFn,
    );

    // The add proceeds: the legacy record's boundaries were established from
    // the address match, so nothing was skipped and nothing was locked out.
    expect(result.ok).toBe(true);
    expect(files.get('/target/new/index.ts')).toBe('new');
  });

  // inst-add-resolve-occupied
  it('submits one claim per installed template when two provenance records resolve to the same one', async () => {
    // A repository carrying both a record written under the old identity scheme
    // and one written under the new: the legacy record resolves by source
    // address, the current one by identity, and both land on `applied/`.
    const applied = makeEntry('declared-identity', [{ path: 'applied/index.ts', content: 'applied' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['applied/'], sharedFiles: [] },
    });
    const newTemplate = makeEntry('new-template', [{ path: 'new/index.ts', content: 'new' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['new/'], sharedFiles: [] },
    });
    const entries: Record<string, InventoryEntry> = {
      'declared-identity': applied,
      'new-template': newTemplate,
    };
    const { files, writeFileFn, provenanceWriteFn, readProvenanceFn, readProjectFileFn } = makeFsFake();
    files.set(
      '/target/.frontx/provenance.json',
      JSON.stringify([
        { templateIdentity: 'legacy-repo-name', scaffoldedFromVersion: '1.0.0', sourceSpec: applied.source },
        { templateIdentity: 'declared-identity', scaffoldedFromVersion: '2.0.0', sourceSpec: applied.source },
      ]),
    );

    const result = await addTemplate(
      'new-template',
      '/target',
      (n: string) => entries[n],
      async () => Object.values(entries),
      readContentFn,
      writeFileFn,
      readProvenanceFn,
      provenanceWriteFn,
      readProjectFileFn,
    );

    // One claim per occupant, so `applied/` is not contested by itself and the
    // disjoint `new/` claim passes. Two claims would have made every add in
    // this repository fail with the occupant named under both identities.
    expect(result.ok).toBe(true);
    expect(files.get('/target/new/index.ts')).toBe('new');
  });

  // inst-add-resolve-occupied
  it('keeps the surviving claim after deduplication, so the occupant still contests its own ground', async () => {
    // The companion to the case above: deduplicating to ZERO claims would also
    // let a disjoint add through, so the guard has to be shown from the other
    // side — a template claiming the occupied ground must still be refused.
    const applied = makeEntry('declared-identity', [{ path: 'applied/index.ts', content: 'applied' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['applied/'], sharedFiles: [] },
    });
    const intruder = makeEntry('intruder', [{ path: 'applied/other.ts', content: 'intruder' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['applied/'], sharedFiles: [] },
    });
    const entries: Record<string, InventoryEntry> = {
      'declared-identity': applied,
      intruder,
    };
    const { files, writeFileFn, provenanceWriteFn, readProvenanceFn, readProjectFileFn } = makeFsFake();
    files.set(
      '/target/.frontx/provenance.json',
      JSON.stringify([
        { templateIdentity: 'legacy-repo-name', scaffoldedFromVersion: '1.0.0', sourceSpec: applied.source },
        { templateIdentity: 'declared-identity', scaffoldedFromVersion: '2.0.0', sourceSpec: applied.source },
      ]),
    );

    const result = await addTemplate(
      'intruder',
      '/target',
      (n: string) => entries[n],
      async () => Object.values(entries),
      readContentFn,
      writeFileFn,
      readProvenanceFn,
      provenanceWriteFn,
      readProjectFileFn,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('conflict');
    if (result.reason !== 'conflict') return;
    // Exactly one contest, and the occupant is named once — under the identity
    // of the first record that resolved, not under both.
    expect(result.conflicts).toEqual([{ ground: 'applied/', contestants: ['intruder', 'legacy-repo-name'] }]);
    expect(files.get('/target/applied/other.ts')).toBeUndefined();
  });

  // inst-add-resolve-occupied
  it('ignores an identity hit whose installed source addresses a different template, and resolves by address instead', async () => {
    // An inventory written before the collision guard existed: the key
    // `shared-key` points at a template acquired from somewhere else entirely.
    const impostor: InventoryEntry = {
      ...makeEntry('shared-key', [{ path: 'impostor/index.ts', content: 'impostor' }], {
        ownershipBoundaries: { exclusiveSubtrees: ['new/'], sharedFiles: [] },
      }),
      source: 'github:contoso/unrelated@v1.0.0',
    };
    const realOwner: InventoryEntry = {
      ...makeEntry('real-owner', [{ path: 'owned/index.ts', content: 'owned' }], {
        ownershipBoundaries: { exclusiveSubtrees: ['owned/'], sharedFiles: [] },
      }),
      source: 'github:acme/shared-key@v1.0.0',
    };
    const newTemplate = makeEntry('new-template', [{ path: 'new/index.ts', content: 'new' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['new/'], sharedFiles: [] },
    });
    const entries: Record<string, InventoryEntry> = {
      'shared-key': impostor,
      'real-owner': realOwner,
      'new-template': newTemplate,
    };
    const { files, writeFileFn, provenanceWriteFn, readProvenanceFn, readProjectFileFn } = makeFsFake();
    files.set(
      '/target/.frontx/provenance.json',
      JSON.stringify([
        { templateIdentity: 'shared-key', scaffoldedFromVersion: '1.0.0', sourceSpec: 'github:acme/shared-key@v1.0.0' },
      ]),
    );

    const result = await addTemplate(
      'new-template',
      '/target',
      (n: string) => entries[n],
      async () => Object.values(entries),
      readContentFn,
      writeFileFn,
      readProvenanceFn,
      provenanceWriteFn,
      readProjectFileFn,
    );

    // Trusting the identity hit would have checked the impostor's boundaries,
    // which do not include `owned/`, and the add would have proceeded over the
    // real owner's ground. Resolved by address, the real owner's `owned/` is
    // what the conflict check sees, and `new/` does not intersect it.
    expect(result.ok).toBe(true);
    expect(files.get('/target/new/index.ts')).toBe('new');
  });

  // inst-add-check-occupied, inst-add-abort-occupied-unknown
  it('aborts when an applied template recorded in provenance is not installed locally, naming the source-spec that would restore it', async () => {
    const newTemplate = makeEntry('new-template', [{ path: 'new/index.ts', content: 'new' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['new/'], sharedFiles: [] },
    });
    const entries: Record<string, InventoryEntry> = { 'new-template': newTemplate };
    const { files, writeFileFn, provenanceWriteFn, readProvenanceFn, readProjectFileFn } = makeFsFake();
    // Neither the identity nor the address resolves: the template genuinely is
    // not installed, so `frontx install <sourceSpec>` is a recovery that works.
    files.set(
      '/target/.frontx/provenance.json',
      JSON.stringify([
        { templateIdentity: 'legacy-repo-name', scaffoldedFromVersion: '1.0.0', sourceSpec: 'github:acme/legacy-repo-name@v1.0.0' },
      ]),
    );

    const result = await addTemplate(
      'new-template',
      '/target',
      (n: string) => entries[n],
      async () => Object.values(entries),
      readContentFn,
      writeFileFn,
      readProvenanceFn,
      provenanceWriteFn,
      readProjectFileFn,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('occupied-not-installed');
    expect(result.message).toContain('github:acme/legacy-repo-name@v1.0.0');
    // Skipping the unresolvable record instead of aborting would let the
    // conflict check pass a claim over ground the recorded template owns.
    expect(files.has('/target/new/index.ts')).toBe(false);
  });

  // inst-add-check-occupied, inst-add-abort-occupied-unknown
  it('aborts when an applied template is installed but its manifest cannot be read', async () => {
    const newTemplate = makeEntry('new-template', [{ path: 'new/index.ts', content: 'new' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['new/'], sharedFiles: [] },
    });
    const corrupted: InventoryEntry = { ...makeEntry('applied-template', []), content: 'not-a-manifest' };
    const entries: Record<string, InventoryEntry> = {
      'new-template': newTemplate,
      'applied-template': corrupted,
    };
    const { files, writeFileFn, provenanceWriteFn, readProvenanceFn, readProjectFileFn } = makeFsFake();
    // The record's source-spec must address the same template as the installed
    // entry, or the identity hit is rejected and this exercises the
    // not-installed branch instead of the unreadable-manifest one.
    files.set(
      '/target/.frontx/provenance.json',
      JSON.stringify([
        { templateIdentity: 'applied-template', scaffoldedFromVersion: '1.0.0', sourceSpec: 'github:acme/applied-template@v1.0.0' },
      ]),
    );

    const result = await addTemplate(
      'new-template',
      '/target',
      (n: string) => entries[n],
      async () => Object.values(entries),
      readContentFn,
      writeFileFn,
      readProvenanceFn,
      provenanceWriteFn,
      readProjectFileFn,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('occupied-manifest-unreadable');
    expect(files.has('/target/new/index.ts')).toBe(false);
  });

  it('adds into an existing repository: stages via the SAME P14 path, submits staged assembly + already-occupied boundaries to P29, materializes ONLY the new contribution, adds one provenance record per newly applied template', async () => {
    const existing = makeEntry('existing-template', [{ path: 'existing/index.ts', content: 'existing' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['existing/'], sharedFiles: [] },
    });
    const newTemplate = makeEntry('new-template', [{ path: 'new/index.ts', content: 'new' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['new/'], sharedFiles: [] },
    });
    const entries: Record<string, InventoryEntry> = { 'existing-template': existing, 'new-template': newTemplate };
    const lookupFn = (n: string) => entries[n];
    const { files, writeFileFn, provenanceWriteFn, readProvenanceFn, readProjectFileFn } = makeFsFake();
    files.set(
      '/target/.frontx/provenance.json',
      JSON.stringify([{ templateIdentity: 'existing-template', scaffoldedFromVersion: '1.0.0', sourceSpec: 'github:acme/existing-template@v1.0.0' }]),
    );

    const result = await addTemplate(
      'new-template',
      '/target',
      lookupFn,
      async () => Object.values(entries),
      readContentFn,
      writeFileFn,
      readProvenanceFn,
      provenanceWriteFn,
      readProjectFileFn,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appliedTemplates).toEqual(['new-template']);
    // Only the new template's contribution is materialized — the existing
    // template's own file was never re-written by this operation.
    expect(files.get('/target/new/index.ts')).toBe('new');
    expect(files.has('/target/existing/index.ts')).toBe(false);
    const provenance = JSON.parse(files.get('/target/.frontx/provenance.json')!) as ProvenanceRecord[];
    expect(provenance).toHaveLength(2);
    expect(provenance.map((r) => r.templateIdentity)).toEqual(['existing-template', 'new-template']);
  });

  it('aborts with no files written when the template reference cannot be resolved from the local inventory', async () => {
    const { files, writeFileFn, provenanceWriteFn, readProvenanceFn, readProjectFileFn } = makeFsFake();

    const result = await addTemplate('missing', '/target', () => undefined, async () => [], readContentFn, writeFileFn, readProvenanceFn, provenanceWriteFn, readProjectFileFn);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unresolved');
    expect(files.size).toBe(0);
  });

  it('aborts BEFORE any file write when the new template intersects an already-applied boundary', async () => {
    const existing = makeEntry('existing-template', [{ path: 'clash/existing.ts', content: 'existing' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['clash/'], sharedFiles: [] },
    });
    const clashing = makeEntry('clashing-template', [{ path: 'clash/new.ts', content: 'new' }], {
      ownershipBoundaries: { exclusiveSubtrees: ['clash/'], sharedFiles: [] },
    });
    const entries: Record<string, InventoryEntry> = { 'existing-template': existing, 'clashing-template': clashing };
    const { files, writeFileFn, provenanceWriteFn, readProvenanceFn, readProjectFileFn } = makeFsFake();
    files.set(
      '/target/.frontx/provenance.json',
      JSON.stringify([{ templateIdentity: 'existing-template', scaffoldedFromVersion: '1.0.0', sourceSpec: 'github:acme/existing-template@v1.0.0' }]),
    );

    const result = await addTemplate(
      'clashing-template',
      '/target',
      (n) => entries[n],
      async () => Object.values(entries),
      readContentFn,
      writeFileFn,
      readProvenanceFn,
      provenanceWriteFn,
      readProjectFileFn,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('conflict');
    if (result.reason === 'conflict') {
      expect(result.conflicts).toEqual([{ ground: 'clash/', contestants: ['clashing-template', 'existing-template'] }]);
    }
    // Only the pre-existing provenance file is present; no new file was written.
    expect(files.size).toBe(1);
    expect(files.has('/target/.frontx/provenance.json')).toBe(true);
  });
});

describe('boundary-declared-assembly DoD — cpt-frontx-dod-cli-scaffolding-boundary-declared-assembly', () => {
  it('reads declared ownership boundaries from the manifest and content from the installed content path scoped to those boundaries, never from the manifest', async () => {
    const entry = makeEntry('template-a', [
      { path: 'template-a/index.ts', content: 'in-bounds' },
      { path: 'unrelated/outside.ts', content: 'out-of-bounds' },
    ]);
    const { files, writeFileFn, provenanceWriteFn, readProjectFileFn } = makeFsFake();

    const result = await seedRepository('template-a', '/target', () => entry, readContentFn, writeFileFn, provenanceWriteFn, targetAbsent, readProjectFileFn);

    expect(result.ok).toBe(true);
    expect(files.get('/target/template-a/index.ts')).toBe('in-bounds');
    expect(files.has('/target/unrelated/outside.ts')).toBe(false);
  });
});
