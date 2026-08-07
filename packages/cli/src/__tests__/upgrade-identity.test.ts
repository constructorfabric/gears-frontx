import { describe, it, expect, vi } from 'vitest';
// cpt-frontx-algo-upgrade-changeset-compute inst-cmp-verify-identity
// cpt-frontx-dod-upgrade-changeset-computation
import { verifyTemplateIdentity } from '../upgrade/verify-identity';
import type { VerifyTemplateIdentityInput } from '../upgrade/verify-identity';
import { computeChangeSet } from '../upgrade/compute';
import type { ContentItem, ReadContentItemsFn } from '../scaffold/types';
import type { FetchFn } from '../resolver/types';
import type { OwnershipBoundary } from '../manifest/types';

// A subtree-less address, the shape every pre-manifest-identity record carries:
// its repository segment is `my-template`, which is exactly the identity the
// previous scheme derived (`ref.repo`).
const SUBTREE_LESS_SPEC = 'local:acme/my-template@1.0.0';

const NO_BOUNDARIES: OwnershipBoundary = { exclusiveSubtrees: [], sharedFiles: [] };

// The agreeing case every test varies one field of, so each case states only
// what it is about.
const AGREEING: VerifyTemplateIdentityInput = {
  recordedIdentity: '@acme/web-template',
  sourceSpec: SUBTREE_LESS_SPEC,
  baselineIdentity: '@acme/web-template',
  baselineVersion: '1.0.0',
  targetIdentity: '@acme/web-template',
  targetVersion: '2.0.0',
};

describe('verifyTemplateIdentity (inst-cmp-verify-identity)', () => {
  it('passes when the record and both resolved versions name one identity', () => {
    const verdict = verifyTemplateIdentity(AGREEING);

    expect(verdict).toEqual({ ok: true });
  });

  // inst-cmp-if-identity-drift / inst-cmp-abort-identity-drift
  it('refuses when the target version declares a different identity than the baseline version', () => {
    const verdict = verifyTemplateIdentity({ ...AGREEING, targetIdentity: '@acme/api-template' });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('identity-drift-between-versions');
    // The evidence a caller reports the problem from, without re-deriving it.
    expect(verdict).toMatchObject({
      baselineIdentity: '@acme/web-template',
      targetIdentity: '@acme/api-template',
    });
  });

  // The drift gate runs ahead of the pre-manifest-identity tolerance, so a
  // legacy-shaped record cannot carry a genuinely drifting address through.
  it('refuses a drifting address even when the record has the pre-manifest-identity shape', () => {
    const verdict = verifyTemplateIdentity({
      ...AGREEING,
      recordedIdentity: 'my-template',
      baselineIdentity: '@acme/web-template',
      targetIdentity: '@acme/api-template',
    });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('identity-drift-between-versions');
  });

  // inst-cmp-if-legacy-record / inst-cmp-accept-legacy-record
  it('passes a record whose identity is the repository name its subtree-less source-spec addresses', () => {
    const verdict = verifyTemplateIdentity({ ...AGREEING, recordedIdentity: 'my-template' });

    expect(verdict).toEqual({ ok: true });
  });

  // inst-cmp-else-record-unrecognized / inst-cmp-abort-record-unrecognized
  it('refuses when the record names neither the declared identity nor the repository its source-spec addresses', () => {
    const verdict = verifyTemplateIdentity({ ...AGREEING, recordedIdentity: 'some-other-template' });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('record-identity-unrecognized');
    expect(verdict).toMatchObject({
      recordedIdentity: 'some-other-template',
      declaredIdentity: '@acme/web-template',
    });
  });

  // The narrowing that stops the tolerance from excusing a real mismatch: a
  // subtree-addressed record was written by code that already took identity
  // from the manifest, so the repository name is not an identity it could
  // legitimately hold.
  it('refuses a subtree-addressed record whose identity is only the repository name', () => {
    const verdict = verifyTemplateIdentity({
      ...AGREEING,
      recordedIdentity: 'acme-templates',
      sourceSpec: 'local:acme/acme-templates//packages/web@1.0.0',
    });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('record-identity-unrecognized');
  });

  // Fail-closed: an address that cannot be read is not evidence of a match.
  it('refuses a differing record identity when its source-spec no longer parses', () => {
    const verdict = verifyTemplateIdentity({
      ...AGREEING,
      recordedIdentity: 'my-template',
      sourceSpec: 'my-template-without-any-host-or-ref',
    });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('record-identity-unrecognized');
  });
});

// Proves the gate is reached through the real engine, not merely correct in
// isolation — and that it refuses before content is read.
describe('computeChangeSet identity verification (inst-cmp-verify-identity)', () => {
  const PROJ_ROOT = '/proj';

  // The shared resolver's fetch primitive. For the `local` host these fixtures
  // use, `buildFetchUrl` puts the requested version in the URL's trailing
  // "@ref" segment, so a fake keyed on that is all the engine can observe. The
  // github branch builds a `/tarball/<ref>` URL with no "@" and would need a
  // different fake; identity verification is host-agnostic, so one host proves it.
  function fetchServing(manifestByVersion: Map<string, string>): FetchFn {
    return async (url) => {
      const version = url.slice(url.lastIndexOf('@') + 1);
      const manifest = manifestByVersion.get(version);
      if (!manifest) throw new Error(`no template at version "${version}"`);
      return manifest;
    };
  }

  function manifest(
    name: string,
    version: string,
    ownershipBoundaries: OwnershipBoundary = NO_BOUNDARIES,
  ): string {
    return JSON.stringify({ name, version, ownershipBoundaries });
  }

  it('refuses the change set and reads no content when the target version declares a different template', async () => {
    const readContentItems = vi.fn<ReadContentItemsFn>().mockResolvedValue([]);

    const result = await computeChangeSet(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => ({
        templateIdentity: '@acme/web-template',
        scaffoldedFromVersion: '1.0.0',
        sourceSpec: SUBTREE_LESS_SPEC,
      }),
      fetchFn: fetchServing(
        new Map([
          ['1.0.0', manifest('@acme/web-template', '1.0.0')],
          ['2.0.0', manifest('@acme/api-template', '2.0.0')],
        ]),
      ),
      readProjectFile: async () => null,
      readContentItems,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('identity-drift-between-versions');
    expect(readContentItems).not.toHaveBeenCalled();
  });

  it('computes a change set for a pre-manifest-identity record whose identity is its repository name', async () => {
    const items: ContentItem[] = [{ path: 'src/App.tsx', content: 'v2 content' }];

    const result = await computeChangeSet(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => ({
        // Repository name, as records written before identity came from the
        // manifest carry it — no manifest declares this any more.
        templateIdentity: 'my-template',
        scaffoldedFromVersion: '1.0.0',
        sourceSpec: SUBTREE_LESS_SPEC,
      }),
      fetchFn: fetchServing(
        new Map([
          ['1.0.0', manifest('@acme/web-template', '1.0.0')],
          ['2.0.0', manifest('@acme/web-template', '2.0.0')],
        ]),
      ),
      readProjectFile: async () => null,
      readContentItems: async (entry) => (entry.ref === '2.0.0' ? items : []),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.clean).toEqual([{ kind: 'add', path: 'src/App.tsx', content: 'v2 content' }]);
  });

  // Pins the boundary the admitted pre-manifest-identity record buys, stated in
  // this feature's computation DoD: owned regions are matched by the identity
  // the RECORD carries, while the content's markers carry the DECLARED one, so
  // the region-union file yields nothing even though its region did change.
  it('yields no entry for a region-union shared file when the record predates manifest identity', async () => {
    const boundaries: OwnershipBoundary = {
      exclusiveSubtrees: [],
      sharedFiles: [{ path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts'] }],
    };
    // Markers carry '@acme/web-template' — what the manifest declares — and not
    // the 'my-template' repository name the record holds.
    const region = (body: string): string =>
      ['{', '  // frontx:region @acme/web-template:scripts', body, '  // frontx:endregion @acme/web-template:scripts', '}'].join('\n');

    const result = await computeChangeSet(PROJ_ROOT, '2.0.0', {
      readProvenance: async () => ({
        templateIdentity: 'my-template',
        scaffoldedFromVersion: '1.0.0',
        sourceSpec: SUBTREE_LESS_SPEC,
      }),
      fetchFn: fetchServing(
        new Map([
          ['1.0.0', manifest('@acme/web-template', '1.0.0', boundaries)],
          ['2.0.0', manifest('@acme/web-template', '2.0.0', boundaries)],
        ]),
      ),
      readProjectFile: async () => region('    "build": "old"'),
      readContentItems: async (entry) => [
        { path: 'package.json', content: region(entry.ref === '2.0.0' ? '    "build": "new"' : '    "build": "old"') },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet).toMatchObject({ clean: [], conflicts: [] });
  });
});
