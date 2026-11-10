import { describe, expect, it } from 'vitest';
import * as api from '../index';

// Writers are executable-only (plan-ai-recovery r9 §4): the library barrel may
// export only read, resolve and plan functions. Every value export is listed
// here, so adding one — a writer in particular — fails until it is judged.
const READ_ONLY_VALUE_EXPORTS = [
  'InventoryState',
  'MANIFEST_FILENAME',
  'OFFICIAL_DEFAULT_TEMPLATES',
  'buildListCatalog',
  'classifyTarget',
  'computeDeletionPlan',
  'createFsBackedDiscoveryHook',
  'createFsListDiskFilesFn',
  'createFsListPayloadFilesFn',
  'createFsListTargetFilesFn',
  'createFsReadDiskEntryFn',
  'createFsReadExistingContentFn',
  'createFsReadFileFn',
  'createFsReadInstalledContentFn',
  'createFsReadTargetPathStateFn',
  'createFsResolveDeclaredExclusionFn',
  'createResolvePayloadFn',
  'formatListHuman',
  'listCatalogEnvelope',
  'listCommand',
  'officialDefaultOrigin',
  'ownershipList',
  'parseSourceSpec',
  'readManifestFromContent',
  'refuseLegacyManifest',
  'resolveToInventory',
  'validateCommand',
  'validateContentSelfContainment',
  'validateManifestContract',
  'validateProject',
  'validateUpgrade',
  'versionMatchesRecorded',
];

const WRITERS = [
  'TemplateInventory', 'InventoryIndex', 'InventoryStore', 'installCommand', 'updateLocalCommand', 'uniformApply',
  'resolveAndCheckBatch', 'runApplyPipeline', 'assembleBatch', 'seedRepository', 'upgradeToOrigin', 'restorePreceding',
  'commitUpgrade', 'upgradeCommand', 'createFsWriteDiskFileFn', 'createFsRenameDiskFileFn', 'createFsUnlinkDiskFileFn',
  'registerTemplate', 'unregisterTemplate', 'ownershipAdd', 'ownershipRemove', 'deleteTarget',
];

describe('public library surface', () => {
  it('exports exactly the judged read-only values and no mutation entrypoint', () => {
    expect(Object.keys(api).sort()).toEqual([...READ_ONLY_VALUE_EXPORTS].sort());
    for (const writer of WRITERS) expect(api).not.toHaveProperty(writer);
  });
});
