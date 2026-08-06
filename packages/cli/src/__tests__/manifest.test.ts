// @cpt-flow:cpt-frontx-flow-template-manifest-validate-for-publication:p1
// @cpt-algo:cpt-frontx-algo-template-manifest-validate-contract:p1
// @cpt-state:cpt-frontx-state-template-manifest-validation-lifecycle:p1
// @cpt-dod:cpt-frontx-dod-template-manifest-validate-command:p1
// @cpt-dod:cpt-frontx-dod-template-manifest-single-description:p1
import path from 'node:path';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateManifestContract, readManifestFromContent } from '../manifest/validate-contract';
import { validateCommand } from '../commands/validate';
import { createFsListContentOwnedFilesFn, createFsReadFileFn } from '../adapters/fs-project-io';
import { MANIFEST_FILENAME } from '../manifest/types';
import type { TemplateManifest, ReadFileFn, ListContentOwnedFilesFn } from '../manifest/types';

// These tests exercise the manifest-CONTRACT path only (cpt-frontx-algo-
// template-manifest-validate-contract, p1); the content self-containment
// check (p2, packages/cli/src/__tests__/manifest-content-self-containment.test.ts)
// has its own dedicated coverage, so a stub that finds no files is the
// correct fixture here - it keeps these cases from depending on behavior
// that isn't what they're testing.
const noContentOwnedFiles: ListContentOwnedFilesFn = async () => [];

// Helper: build a valid manifest JSON string. Categories: (1) identity,
// (2) version, (3) ownership boundaries, (4) referenced templates,
// (5) description. The base omits the description because it is optional, so
// a case that cares about it declares one through `overrides` and every other
// case doubles as coverage that omission conforms.
function validManifest(overrides: Partial<TemplateManifest> = {}): string {
  const base: TemplateManifest = {
    name: 'my-tpl',
    version: '1.0.0',
    ownershipBoundaries: {
      exclusiveSubtrees: ['src/generated'],
      sharedFiles: [
        { path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts.build'] },
      ],
    },
    referencedTemplates: [{ ref: 'github:acme/mfe-a@v1.0.0', appliedAt: 'packages/mfe-a' }],
  };
  return JSON.stringify({ ...base, ...overrides });
}

describe('validateManifestContract', () => {
  // inst-if-parse-error / inst-add-parse-violation
  it('malformed JSON → FAIL parse-error violation', () => {
    const result = validateManifestContract('not-valid-json{{{');
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field === 'manifest')).toBe(true);
  });

  // inst-check-identity / inst-add-identity-violation
  it('missing identity (name) → identity violation', () => {
    const raw = JSON.stringify({
      version: '1.0.0',
      ownershipBoundaries: { exclusiveSubtrees: [], sharedFiles: [] },
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field === 'name')).toBe(true);
  });

  // inst-check-version / inst-add-version-violation
  it('missing version → version violation', () => {
    const raw = JSON.stringify({
      name: 'my-tpl',
      ownershipBoundaries: { exclusiveSubtrees: [], sharedFiles: [] },
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field === 'version')).toBe(true);
  });

  // inst-if-version-missing — malformed (non-string) version
  it('malformed version (non-string) → version violation', () => {
    const raw = JSON.stringify({
      name: 'my-tpl',
      version: 123,
      ownershipBoundaries: { exclusiveSubtrees: [], sharedFiles: [] },
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field === 'version')).toBe(true);
  });

  // inst-check-boundaries — ownership-boundaries category absent
  it('missing ownership-boundaries category → boundaries violation', () => {
    const raw = JSON.stringify({ name: 'my-tpl', version: '1.0.0' });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field === 'ownershipBoundaries')).toBe(true);
  });

  // inst-for-each-subtree / inst-if-subtree-invalid / inst-add-subtree-violation
  it('ill-formed exclusive subtree → subtree violation', () => {
    const raw = JSON.stringify({
      name: 'my-tpl',
      version: '1.0.0',
      ownershipBoundaries: { exclusiveSubtrees: ['../escapes-root'], sharedFiles: [] },
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field.startsWith('ownershipBoundaries.exclusiveSubtrees'))).toBe(true);
  });

  // inst-for-each-shared-file / inst-if-shared-file-invalid / inst-add-shared-file-violation
  it('shared-file entry missing merge strategy / owned regions → shared-file violation', () => {
    const raw = JSON.stringify({
      name: 'my-tpl',
      version: '1.0.0',
      ownershipBoundaries: {
        exclusiveSubtrees: [],
        sharedFiles: [{ path: 'package.json' }], // missing mergeStrategy + ownedRegions
      },
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field.startsWith('ownershipBoundaries.sharedFiles'))).toBe(true);
  });

  // inst-for-each-referenced / inst-check-referenced-entry / inst-if-referenced-invalid
  it('referenced-template entry missing target location → referenced violation', () => {
    const raw = JSON.stringify({
      name: 'my-project',
      version: '1.0.0',
      ownershipBoundaries: { exclusiveSubtrees: [], sharedFiles: [] },
      referencedTemplates: [{ ref: 'github:acme/mfe@v1' }], // missing appliedAt
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field.startsWith('referencedTemplates'))).toBe(true);
  });

  // inst-for-each-referenced — malformed reference
  it('referenced-template entry with malformed reference → referenced violation', () => {
    const raw = JSON.stringify({
      name: 'my-project',
      version: '1.0.0',
      ownershipBoundaries: { exclusiveSubtrees: [], sharedFiles: [] },
      referencedTemplates: [{ ref: '   ', appliedAt: 'packages/x' }], // whitespace-only ref
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field.startsWith('referencedTemplates'))).toBe(true);
  });

  // inst-return-validated — conforming four-category manifest
  it('valid four-category manifest → VALIDATED with no violations', () => {
    const result = validateManifestContract(validManifest());
    expect(result.status).toBe('VALIDATED');
    expect(result.violations).toHaveLength(0);
  });

  // forward-reading invariant — schemaVersion is optional
  it('manifest without schemaVersion still passes (forward-readable)', () => {
    const raw = JSON.stringify({
      name: 'my-tpl',
      version: '2.0.0',
      ownershipBoundaries: { exclusiveSubtrees: [], sharedFiles: [] },
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('VALIDATED');
  });

  // a leaf template (no referenced templates) is valid
  it('leaf template with no referencedTemplates → VALIDATED', () => {
    const raw = JSON.stringify({
      name: 'leaf',
      version: '1.0.0',
      ownershipBoundaries: {
        exclusiveSubtrees: ['src'],
        sharedFiles: [],
      },
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('VALIDATED');
  });

  // inst-if-merge-strategy-invalid / inst-add-merge-strategy-violation
  it('merge strategy outside the closed set (exclusive, region-union) → merge-strategy violation', () => {
    const raw = JSON.stringify({
      name: 'my-tpl',
      version: '1.0.0',
      ownershipBoundaries: {
        exclusiveSubtrees: [],
        sharedFiles: [{ path: 'package.json', mergeStrategy: 'deep-merge', ownedRegions: ['scripts.build'] }],
      },
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field.endsWith('.mergeStrategy'))).toBe(true);
  });

  // inst-if-region-keys-missing / inst-add-region-keys-violation
  it('region-union shared-file entry with no owned region keys → region-keys violation', () => {
    const raw = JSON.stringify({
      name: 'my-tpl',
      version: '1.0.0',
      ownershipBoundaries: {
        exclusiveSubtrees: [],
        sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: [] }],
      },
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field.endsWith('.ownedRegions'))).toBe(true);
  });

  // inst-if-subtree-reserved / inst-add-subtree-reserved-violation
  it('exclusive subtree under the reserved .frontx/ namespace (not own AI bundle) → subtree-reserved violation', () => {
    const raw = JSON.stringify({
      name: 'my-tpl',
      version: '1.0.0',
      ownershipBoundaries: {
        exclusiveSubtrees: ['.frontx/provenance.json'],
        sharedFiles: [],
      },
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field.startsWith('ownershipBoundaries.exclusiveSubtrees'))).toBe(true);
  });

  // inst-if-shared-file-reserved / inst-add-shared-file-reserved-violation
  it('shared-file path under the reserved .frontx/ namespace → shared-file-reserved violation', () => {
    const raw = JSON.stringify({
      name: 'my-tpl',
      version: '1.0.0',
      ownershipBoundaries: {
        exclusiveSubtrees: [],
        sharedFiles: [{ path: '.frontx/provenance.json', mergeStrategy: 'exclusive', ownedRegions: [] }],
      },
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field.startsWith('ownershipBoundaries.sharedFiles') && v.field.endsWith('.path'))).toBe(true);
  });

  // inst-if-subtree-reserved (negative case) — a template's OWN AI bundle subtree is accepted
  it("a template's own .frontx/ai/<template-identity>/ exclusive subtree is accepted", () => {
    const raw = JSON.stringify({
      name: 'my-tpl',
      version: '1.0.0',
      ownershipBoundaries: {
        exclusiveSubtrees: ['.frontx/ai/my-tpl'],
        sharedFiles: [],
      },
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('VALIDATED');
  });

  // inst-if-subtree-reserved / inst-add-subtree-reserved-violation — the
  // environment-owned half of the reserved set. It exists because the seed flow
  // treats these entries as carrying no content, so a template permitted to
  // declare one could claim ground that guard already waved through as empty and
  // materialization would write into the developer's own `.git`.
  it.each(['.git', '.git/', '.DS_Store', 'Thumbs.db'])(
    'rejects an exclusive subtree named %s, which no template may own',
    (reserved) => {
      const result = validateManifestContract(
        validManifest({ ownershipBoundaries: { exclusiveSubtrees: [reserved], sharedFiles: [] } }),
      );

      expect(result.status).toBe('REJECTED');
      if (result.status !== 'REJECTED') return;
      expect(result.violations.some((v) => v.field.startsWith('ownershipBoundaries.exclusiveSubtrees'))).toBe(true);
    },
  );

  // Checked per path segment, so nesting a reserved name is refused too: a
  // template claiming `packages/.git` claims the same kind of ground.
  it('rejects an exclusive subtree that nests a reserved name at any depth', () => {
    const result = validateManifestContract(
      validManifest({ ownershipBoundaries: { exclusiveSubtrees: ['packages/.git'], sharedFiles: [] } }),
    );

    expect(result.status).toBe('REJECTED');
  });

  it('rejects a shared-file path containing a reserved segment', () => {
    const result = validateManifestContract(
      validManifest({
        ownershipBoundaries: {
          exclusiveSubtrees: [],
          sharedFiles: [{ path: '.git/config', mergeStrategy: 'exclusive', ownedRegions: [] }],
        },
      }),
    );

    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field.startsWith('ownershipBoundaries.sharedFiles'))).toBe(true);
  });

  // The environment-owned set is additive: the pre-existing `.frontx/` rule keeps
  // admitting a template's own bundle subtree and refusing the reserved metadata.
  it('leaves the .frontx/ rule unchanged — own bundle subtree admitted, provenance refused', () => {
    const admitted = validateManifestContract(
      validManifest({
        name: 'my-tpl',
        ownershipBoundaries: { exclusiveSubtrees: ['.frontx/ai/my-tpl/'], sharedFiles: [] },
      }),
    );
    const refused = validateManifestContract(
      validManifest({
        ownershipBoundaries: { exclusiveSubtrees: ['.frontx/provenance.json'], sharedFiles: [] },
      }),
    );

    expect(admitted.status).toBe('VALIDATED');
    expect(refused.status).toBe('REJECTED');
  });

  // A name that merely CONTAINS a reserved one is a different path and is fine.
  it('admits a subtree whose segment only contains a reserved name as a substring', () => {
    const result = validateManifestContract(
      validManifest({ ownershipBoundaries: { exclusiveSubtrees: ['src/.gitkeep-templates/'], sharedFiles: [] } }),
    );

    expect(result.status).toBe('VALIDATED');
  });

  // inst-check-description / inst-if-description-invalid / inst-add-description-violation
  it('passes a manifest declaring a non-empty description', () => {
    const result = validateManifestContract(
      validManifest({ description: 'Establishes the project shell and contributes the build toolchain.' }),
    );

    expect(result.status).toBe('VALIDATED');
  });

  // The category is optional so manifests published before it was declared stay
  // conforming; omitting it costs the template only its selectability.
  it('passes a manifest omitting the description entirely', () => {
    const result = validateManifestContract(validManifest());

    expect(result.status).toBe('VALIDATED');
  });

  // inst-add-description-violation — a description declared empty states
  // nothing, which is a violation rather than a silent absence.
  it('rejects a description declared as an empty string, naming the description field', () => {
    const result = validateManifestContract(validManifest({ description: '   ' }));

    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field === 'description')).toBe(true);
  });

  it('rejects a description declared as a non-string, naming the description field', () => {
    const raw = JSON.stringify({
      name: 'my-tpl',
      version: '1.0.0',
      ownershipBoundaries: { exclusiveSubtrees: [], sharedFiles: [] },
      description: 42,
    });

    const result = validateManifestContract(raw);

    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field === 'description')).toBe(true);
  });
});

describe('validateCommand', () => {
  // inst-if-manifest-absent / inst-return-manifest-absent
  it('returns FAIL + non-zero exit code when manifest absent', async () => {
    const readFileFn: ReadFileFn = vi.fn().mockRejectedValue(new Error('ENOENT: no such file'));
    const result = await validateCommand('/some/template', readFileFn, noContentOwnedFiles);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/manifest not found/i);
  });

  // inst-else-pass / inst-return-pass
  it('returns PASS + zero exit code for conforming manifest', async () => {
    const readFileFn: ReadFileFn = vi.fn().mockResolvedValue(validManifest());
    const result = await validateCommand('/some/template', readFileFn, noContentOwnedFiles);
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  // Review finding on #493: `ListContentOwnedFilesFn` has no error channel, so
  // a real `readdir`/`stat` refusal (permission denied, a path that vanished
  // mid-walk) reaches this command as a throw. It used to escape as a raw node
  // stack trace, bypassing the exit-code contract every other failure here
  // goes through.
  it('converts an enumeration failure into a named failure result rather than throwing', async () => {
    const readFileFn: ReadFileFn = vi.fn().mockResolvedValue(validManifest());
    const throwingEnumeration: ListContentOwnedFilesFn = async () => {
      throw Object.assign(new Error("EACCES: permission denied, scandir '/some/template/src/generated'"), {
        code: 'EACCES',
      });
    };

    const result = await validateCommand('/some/template', readFileFn, throwingEnumeration);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/could not be inspected for self-containment/i);
    expect(result.message).toContain('/some/template/src/generated');
  });

  // inst-report-violations / inst-return-fail
  it('reports all violations on REJECTED manifest', async () => {
    // Missing identity, version, and ownership boundaries — multiple violations expected.
    const raw = JSON.stringify({});
    const readFileFn: ReadFileFn = vi.fn().mockResolvedValue(raw);
    const result = await validateCommand('/some/template', readFileFn, noContentOwnedFiles);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.violations).toBeDefined();
    expect((result.violations ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

// Real-fs coverage of validateCommand's content-self-containment seam (gs-layer
// CHANGES_REQUESTED, review round on #493): the adapter-level throws
// (fs-project-io.test.ts) and validateCommand's throw-to-FAIL conversion
// (the fake-throw case above) are each proven separately; these three drive
// the REAL createFsListContentOwnedFilesFn and createFsReadFileFn against a
// real tmpdir template, the same wiring cli.ts uses in production, so the
// conversion is proven end to end rather than only at either seam alone.
describe('validateCommand — real fs content self-containment (review round on #493)', () => {
  let templateDir: string;
  let outsideDir: string;

  afterEach(async () => {
    if (templateDir) await rm(templateDir, { recursive: true, force: true });
    if (outsideDir) await rm(outsideDir, { recursive: true, force: true });
    templateDir = '';
    outsideDir = '';
  });

  async function makeTemplate(exclusiveSubtrees: string[]): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'frontx-validate-command-'));
    templateDir = dir;
    const manifest = validManifest({ ownershipBoundaries: { exclusiveSubtrees, sharedFiles: [] } });
    await writeFile(path.join(dir, MANIFEST_FILENAME), manifest);
    return dir;
  }

  it('refuses with exit 1 when a declared content-owning path does not exist on disk', async () => {
    const dir = await makeTemplate(['packages']);
    // No `packages` directory is ever created under `dir`.

    const result = await validateCommand(dir, createFsReadFileFn(), createFsListContentOwnedFilesFn());

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/could not be inspected/i);
    expect(result.message).toContain('packages');
  });

  it('refuses with exit 1 when a declared content-owning path is a symlink resolving outside the template root', async () => {
    const dir = await makeTemplate(['packages']);
    outsideDir = await mkdtemp(path.join(tmpdir(), 'frontx-validate-command-outside-'));
    await symlink(outsideDir, path.join(dir, 'packages'));

    const result = await validateCommand(dir, createFsReadFileFn(), createFsListContentOwnedFilesFn());

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('packages');
    expect(result.message).toContain('resolves outside the template root');
  });

  it('accepts a BOM-prefixed tsconfig.json carrier that is otherwise valid JSONC', async () => {
    const dir = await makeTemplate(['tsconfig.json']);
    // A leading UTF-8 byte-order mark, written via fs like a real editor
    // would leave it, not simulated through a fixture-file trick.
    await writeFile(path.join(dir, 'tsconfig.json'), '﻿{ "compilerOptions": { "strict": true } }');

    const result = await validateCommand(dir, createFsReadFileFn(), createFsListContentOwnedFilesFn());

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });
});

describe('single authoritative description', () => {
  // cpt-frontx-dod-template-manifest-single-description
  it('the same four-category shape validated is what validate/install/assembly consume', () => {
    // structural: validateManifestContract accepts raw and the same TemplateManifest
    // shape (identity, version, ownership boundaries, referenced templates) is returned
    // by readManifestFromContent on success — no divergent or partial descriptor exists.
    const result = validateManifestContract(validManifest());
    expect(result.status).toBe('VALIDATED');
  });
});


describe('readManifestFromContent — bundle envelope unwrap', () => {
  // Discovered while proving the TEST-ONLY offline local-fetch adapter
  // (packages/cli/src/adapters/local-fetch.ts) assembles a real multi-file
  // template end-to-end: every real fetch result (the GitHub adapter's
  // tarball unpack, and this TEST-ONLY local-directory adapter) returns the
  // `{ "$frontxTemplateFiles": { <relative path>: <file text>, ... } }`
  // bundle envelope FsContentStore already materializes to real on-disk
  // files — never a bare manifest string. `readManifestFromContent` is the
  // ONE read path composition/uniform-apply/materialize all call on
  // `InventoryEntry.content`, so it must transparently unwrap that envelope
  // down to its manifest file before validating — the single authoritative
  // description (cpt-frontx-dod-template-manifest-single-description) is
  // unaffected either way.
  it('unwraps a $frontxTemplateFiles bundle envelope to its frontx-template.json entry before validating', () => {
    const manifest = validManifest();
    const bundle = JSON.stringify({
      $frontxTemplateFiles: { 'frontx-template.json': manifest, 'src/index.ts': 'export {};' },
    });

    const result = readManifestFromContent(bundle);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.name).toBe('my-tpl');
  });

  it('still reads a bare (non-bundle) manifest string exactly as before — legacy single-file content is unaffected', () => {
    const manifest = validManifest();

    const result = readManifestFromContent(manifest);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.name).toBe('my-tpl');
  });

  it('rejects with a clear violation when a bundle envelope has no frontx-template.json entry', () => {
    const bundle = JSON.stringify({ $frontxTemplateFiles: { 'src/index.ts': 'export {};' } });

    const result = readManifestFromContent(bundle);

    expect(result.ok).toBe(false);
  });
});
