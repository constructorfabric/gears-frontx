// @cpt-flow:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1
import { validateExtensionEntry } from './contract.js';
import { scanAndComposeExtensions, type BaseCapabilities } from './scan.js';
import { discoverExtensionBundlesFromFs, type BundleFsReader } from './fs-discovery.js';
import { AiExtensionLifecycleState } from './types.js';
import type { AiExtensionBundle, LifecycleResult, ScanAndActivateResult, StructuralError } from './types.js';

export interface PrePublishValidationResult {
  ok: boolean;
  errors: StructuralError[];
}

/**
 * Bundle-and-publish leg (Template Developer): validates every declared
 * extension entry against the closed-set contract before the template may be
 * published. A non-conforming entry blocks publication with a reported
 * structural error.
 */
export function validateBundleForPublish(bundle: AiExtensionBundle): PrePublishValidationResult {
  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-declare-extensions
  const declaredEntries = bundle;
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-declare-extensions

  const errors: StructuralError[] = [];

  for (const raw of declaredEntries) {
    // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-check-contract-shape
    const result = validateExtensionEntry(raw);
    if (!result.ok) {
      // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-report-prepublish-error
      errors.push(result.error);
      // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-report-prepublish-error
    }
    // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-check-contract-shape
  }

  if (errors.length > 0) {
    // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-return-prepublish-fail
    return { ok: false, errors };
    // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-return-prepublish-fail
  }

  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-confirm-contract-conformance
  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-publish-template
  return { ok: true, errors: [] };
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-publish-template
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-confirm-contract-conformance
}

/**
 * Install-discover-activate leg (Project Developer): invoked once the CLI
 * signals that an installed template is present (cross-package edge F16 <- F10).
 * Runs the contract scan and composes the discovered conforming extensions
 * with the base kit's capability set into the agent-visible activation
 * result.
 */
export function discoverAndActivateForInstalledTemplate(
  bundle: AiExtensionBundle,
  baseCapabilities: BaseCapabilities,
  installOrder: number,
): ScanAndActivateResult {
  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-install-template
  // Installation itself is performed by the CLI's template-resolution path
  // (cpt-frontx-feature-template-resolution); this function runs once the CLI
  // signals that an installed template is present.
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-install-template

  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-initiate-discovery
  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-scan-each-slot
  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-scan-slot-entries
  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-check-slot-conformance
  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-record-structural-error
  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-add-to-discovered
  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-compose-under-precedence
  const result = scanAndComposeExtensions(bundle, baseCapabilities, installOrder);
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-compose-under-precedence
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-add-to-discovered
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-record-structural-error
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-check-slot-conformance
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-scan-slot-entries
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-scan-each-slot
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-initiate-discovery

  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-check-errors
  if (result.errors.length > 0) {
    // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-report-errors
    // Structural errors are surfaced to the Project Developer via `result.errors`;
    // no errored entry is present in `result.composed` (excluded in the scan).
    // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-report-errors
  }
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-check-errors

  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-activate-capabilities
  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-return-activated
  return result;
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-return-activated
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-activate-capabilities
}

/**
 * Install-discover-activate leg (Project Developer), FILESYSTEM realization:
 * scans the scaffolded project's `.frontx/ai/` for EACH per-template
 * id-scoped bundle root `.frontx/ai/<template-identity>/` per the FEATURE's
 * §1.5 AI-Extension Bundle Convention (via `discoverExtensionBundlesFromFs`),
 * and feeds every discovered bundle's conforming entries into the EXISTING
 * `scanAndComposeExtensions` algorithm — preserving its deterministic
 * precedence + lifecycle behavior. A malformed anchor in one bundle does not
 * prevent discovery of the others: fs-level structural errors (missing/
 * unparseable/identity-less anchor, out-of-set bundle-root subdir, malformed
 * on-disk slot shape) are scoped to their own bundle, merged with the scan's
 * own errors, and surfaced as REJECTED lifecycle results; a fs-level error
 * for one bundle's anchor means only that bundle contributes nothing.
 */
export function discoverAndActivateFromInstalledTemplateFs(
  contentRoot: string,
  reader: BundleFsReader,
  baseCapabilities: BaseCapabilities,
  installOrder: number,
): ScanAndActivateResult {
  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-scan-each-slot
  // @cpt-begin:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-scan-slot-entries
  const discoveredBundles = discoverExtensionBundlesFromFs(contentRoot, reader);
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-scan-slot-entries
  // @cpt-end:cpt-frontx-flow-template-ai-extensions-bundle-publish-discover-activate:p1:inst-scan-each-slot

  // Every co-located id-scoped bundle's conforming entries are fed into the
  // SAME scan call, in deterministic (sorted-identity) bundle order — no new
  // scan algorithm is introduced; disjoint bundles simply contribute to one
  // combined entry list ahead of composition.
  const combinedBundle: AiExtensionBundle = discoveredBundles.flatMap((discovered) => discovered.bundle);
  const fsStructuralErrors: StructuralError[] = discoveredBundles.flatMap((discovered) => discovered.structuralErrors);

  const scanResult = scanAndComposeExtensions(combinedBundle, baseCapabilities, installOrder);

  const fsRejectedResults: LifecycleResult[] = fsStructuralErrors.map((error) => ({
    state: AiExtensionLifecycleState.REJECTED,
    error,
  }));

  return {
    composed: scanResult.composed,
    errors: [...fsStructuralErrors, ...scanResult.errors],
    lifecycleResults: [...fsRejectedResults, ...scanResult.lifecycleResults],
  };
}
