// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
//
// One home for the discovery rule's tests, matching the one home the rule
// itself now has. Both CI guards used to carry their own copy of
// `findTemplateDirs` and their own copy of these cases (CodeRabbit on #493).
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { MANIFEST_FILENAME, findTemplateDirs } from './template-discovery.mjs';

/** @type {string | undefined} */
let rootDir;

afterEach(async () => {
  if (rootDir) await rm(rootDir, { recursive: true, force: true });
});

async function makeRoot() {
  rootDir = await mkdtemp(path.join(tmpdir(), 'frontx-template-discovery-'));
  return rootDir;
}

// Discovery only checks that the file is THERE, never what it contains - the
// manifest's content is the CLI validate command's subject.
/** @param {string} dir */
async function writeManifest(dir, filename = MANIFEST_FILENAME) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), '{}');
}

describe('findTemplateDirs', () => {
  // The property that made the #470 split a no-op for both guards: a template
  // is its manifest (ADR-0018), so `template-standard/` becoming
  // `template-shell/` plus `template-mfe/` needed no discovery change. A
  // `template-*` glob would instead have kept passing while covering nothing.
  it('finds every top-level directory carrying the manifest, whatever it is named', async () => {
    const root = await makeRoot();
    await writeManifest(path.join(root, 'template-shell'));
    await writeManifest(path.join(root, 'a-renamed-template'));
    await mkdir(path.join(root, 'packages'), { recursive: true }); // no manifest - not a template

    expect(findTemplateDirs(root).map((d) => path.basename(d))).toEqual(['a-renamed-template', 'template-shell']);
  });

  it('ignores a directory named template-* that carries no manifest', async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, 'template-empty'), { recursive: true });

    expect(findTemplateDirs(root)).toEqual([]);
  });

  it('ignores node_modules even if it somehow carries a manifest', async () => {
    const root = await makeRoot();
    await writeManifest(path.join(root, 'node_modules', 'something'));

    expect(findTemplateDirs(root)).toEqual([]);
  });

  // CodeRabbit review finding on #493: excluding every dot-prefixed directory
  // reintroduces the location assumption manifest-presence discovery exists to
  // drop. node_modules is the one true exclusion.
  it('does NOT ignore a dot-prefixed top-level directory that carries a manifest', async () => {
    const root = await makeRoot();
    await writeManifest(path.join(root, '.hidden-template'));

    expect(findTemplateDirs(root).map((d) => path.basename(d))).toEqual(['.hidden-template']);
  });

  // `validate-templates.mjs` passes the built CLI's own exported constant, so
  // that guard checks the CLI's idea of the filename rather than a second copy.
  it('honours a caller-supplied manifest filename over the local default', async () => {
    const root = await makeRoot();
    await writeManifest(path.join(root, 'template-shell'), 'a-different-manifest-name.json');

    expect(findTemplateDirs(root)).toEqual([]);
    expect(findTemplateDirs(root, 'a-different-manifest-name.json').map((d) => path.basename(d))).toEqual([
      'template-shell',
    ]);
  });
});

// #492 review finding 2's "unguarded duplicated literal" class. MANIFEST_FILENAME
// is deliberately a local literal rather than an import from `@gears-frontx/cli`,
// so a repo-script never needs the CLI built - but a duplicated literal that can
// silently drift needs a guard. This reads the canonical TypeScript source as
// text (never `import`ed: a `.ts` file isn't loadable by plain node, and importing
// the built `dist/` would reintroduce exactly the build dependency being avoided).
describe('MANIFEST_FILENAME sync guard', () => {
  it('stays in sync with the canonical export in packages/cli/src/manifest/types.ts', () => {
    const sourcePath = fileURLToPath(new URL('../packages/cli/src/manifest/types.ts', import.meta.url));
    const match = /export const MANIFEST_FILENAME = '([^']+)';/.exec(readFileSync(sourcePath, 'utf8'));

    expect(match, 'canonical MANIFEST_FILENAME export not found - did types.ts change shape?').not.toBeNull();
    expect(MANIFEST_FILENAME).toBe(match?.[1]);
  });
});

// Same drift class, different surface: template territory is defined by
// manifest presence (ADR-0018, cpt-frontx-adr-template-territory-traceability),
// but the artifact registry's ignore entry can only hold literal globs. A
// manifest-backed template directory added without updating those globs would
// be outside the marker policy in prose while `cfs validate` still scans it.
describe('artifacts.toml template-territory ignore sync guard', () => {
  it('ignore globs cover exactly the manifest-discovered template directories', () => {
    const repoRoot = fileURLToPath(new URL('..', import.meta.url));
    const toml = readFileSync(path.join(repoRoot, '.cf-studio', 'config', 'artifacts.toml'), 'utf8');
    const entry = toml
      .split('[[ignore]]')
      .find((block) => block.includes('cpt-frontx-adr-template-territory-traceability'));

    expect(entry, 'template-territory ignore entry not found - did artifacts.toml drop its ADR citation?').toBeDefined();

    const patternsLine = /patterns\s*=\s*\[([^\]]*)\]/.exec(/** @type {string} */ (entry));
    expect(patternsLine, 'template-territory ignore entry carries no patterns array').not.toBeNull();

    const patterns = /** @type {RegExpExecArray} */ (patternsLine)[1];
    const globbed = [...patterns.matchAll(/"([^"]+)\/\*\*"/g)].map((m) => m[1]).sort();
    const discovered = findTemplateDirs(repoRoot).map((d) => path.basename(d)).sort();

    expect(globbed).toEqual(discovered);
  });
});
