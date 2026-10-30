// Helper consumed by cpt-frontx-algo-upgrade-changeset-compute (inst-cmp-diff-files)
// — not itself a CDSL-designated instruction, so it carries no @cpt-begin/@cpt-end
// block marker of its own; the markers live at the call site in compute.ts.
import { readBundleFiles } from '../bundle/envelope';
import { MANIFEST_FILENAME } from '../manifest/types';
import type { ContentItem, ReadContentItemsFn } from '../scaffold/types';

/**
 * Reads the content items of a template version the upgrade engine
 * re-resolved through the shared resolver (`resolveTemplateAtVersion`), from
 * the content that resolution fetched and the entry carries.
 *
 * Those entries are never written to the local inventory, and the inventory
 * holds one version per template, so the disk-backed reader
 * (`createFsReadContentItemsFn`) cannot serve them: given the baseline and the
 * target it reads the same installed directory twice (#700).
 *
 * Content that is not a bundle envelope is the manifest file alone, the same
 * fallback `FsContentStore` applies when it materializes an install.
 */
export const readResolvedContentItems: ReadContentItemsFn = async (entry) => {
  const files = readBundleFiles(entry.content);
  if (files === undefined) return [{ path: MANIFEST_FILENAME, content: entry.content }];
  return Object.entries(files).flatMap(([path, content]): ContentItem[] =>
    typeof content === 'string' ? [{ path, content }] : [],
  );
};
