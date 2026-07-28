// @cpt-flow:cpt-frontx-flow-ai-kit-packaging-session-availability:p1
// @cpt-state:cpt-frontx-state-ai-kit-packaging-kit-lifecycle:p1
// @cpt-dod:cpt-frontx-dod-ai-kit-packaging-install-and-activate:p1
import { parse as parseToml } from 'smol-toml';
import { validateKitManifest } from './validate-manifest.js';
import type { KitManifest, KitRegistration, KitSessionResult, KitCapability } from './types.js';

// @cpt-begin:cpt-frontx-state-ai-kit-packaging-kit-lifecycle:p1:inst-transition-packaged-to-installed
// @cpt-begin:cpt-frontx-state-ai-kit-packaging-kit-lifecycle:p1:inst-transition-installed-to-active
// @cpt-begin:cpt-frontx-state-ai-kit-packaging-kit-lifecycle:p1:inst-transition-active-to-installed
// @cpt-begin:cpt-frontx-state-ai-kit-packaging-kit-lifecycle:p1:inst-transition-installed-to-packaged
export const KitLifecycleState = {
  PACKAGED: 'PACKAGED',
  INSTALLED: 'INSTALLED',
  SESSION_ACTIVE: 'SESSION_ACTIVE',
} as const;
// @cpt-end:cpt-frontx-state-ai-kit-packaging-kit-lifecycle:p1:inst-transition-installed-to-packaged
// @cpt-end:cpt-frontx-state-ai-kit-packaging-kit-lifecycle:p1:inst-transition-active-to-installed
// @cpt-end:cpt-frontx-state-ai-kit-packaging-kit-lifecycle:p1:inst-transition-installed-to-active
// @cpt-end:cpt-frontx-state-ai-kit-packaging-kit-lifecycle:p1:inst-transition-packaged-to-installed

export type ReadManifestFn = (kitPath: string) => Promise<string>;
export type ResourceExistsFn = (resourcePath: string) => Promise<boolean>;

// @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-session-start
export async function loadKitSession(
  registration: KitRegistration | null,
  readManifest: ReadManifestFn,
  resourceExists: ResourceExistsFn,
): Promise<KitSessionResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const capabilities: KitCapability[] = [];

  // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-locate-registration
  // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-if-no-registration
  if (!registration) {
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-no-registration-error
    errors.push('cyber-pilot-kit-frontx is not installed: kit registration not found in core.toml');
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-no-registration-error
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-return-no-kit
    return { state: KitLifecycleState.INSTALLED, capabilities, errors, warnings };
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-return-no-kit
  }
  // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-if-no-registration
  // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-locate-registration

  // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-read-manifest
  let rawManifest: string;
  try {
    rawManifest = await readManifest(registration.path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to read kit manifest: ${msg}`);
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-if-manifest-invalid
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-manifest-invalid-error
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-return-invalid
    return { state: KitLifecycleState.INSTALLED, capabilities, errors, warnings };
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-return-invalid
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-manifest-invalid-error
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-if-manifest-invalid
  }
  // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-read-manifest

  // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-invoke-validation
  // The kit manifest is TOML (`.cf-studio-kit.toml`). This previously called
  // JSON.parse, which rejects every well-formed manifest as malformed.
  let parsed: unknown;
  try {
    parsed = parseToml(rawManifest);
  } catch {
    errors.push('Kit manifest is malformed: failed to parse content');
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-if-manifest-invalid
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-manifest-invalid-error
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-return-invalid
    return { state: KitLifecycleState.INSTALLED, capabilities, errors, warnings };
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-return-invalid
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-manifest-invalid-error
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-if-manifest-invalid
  }

  const validation = validateKitManifest(parsed);
  if (validation.status === 'FAIL') {
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-if-manifest-invalid
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-manifest-invalid-error
    for (const v of validation.violations) {
      errors.push(`Manifest validation error [${v.code}] at ${v.field}: ${v.message}`);
    }
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-manifest-invalid-error
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-return-invalid
    return { state: KitLifecycleState.INSTALLED, capabilities, errors, warnings };
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-return-invalid
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-if-manifest-invalid
  }
  // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-invoke-validation

  const manifest = parsed as KitManifest;
  const unavailable: string[] = [];
  const declaredResources = manifest.kits.flatMap((kit) => kit.resources);

  // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-for-each-resource
  for (const resource of declaredResources) {
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-resolve-resource-path
    const resourcePath = `${registration.path}/${resource.install_path}`;
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-resolve-resource-path

    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-if-resource-missing
    const exists = await resourceExists(resourcePath);
    if (!exists) {
      // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-record-missing
      unavailable.push(resource.id);
      // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-record-missing
    } else {
      // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-if-resource-missing
      // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-else-resource-present
      // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-expose-resource
      capabilities.push({ id: resource.id, path: resourcePath, type: resource.type });
      // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-expose-resource
      // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-else-resource-present
    }
  }
  // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-for-each-resource

  // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-if-partial
  if (unavailable.length > 0) {
    // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-partial-warning
    warnings.push(`Kit session started with partial capabilities. Unavailable resources: ${unavailable.join(', ')}`);
    // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-partial-warning
  }
  // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-if-partial

  // @cpt-begin:cpt-frontx-dod-ai-kit-packaging-install-and-activate:p1:inst-transition-packaged-to-installed
  // @cpt-begin:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-return-session-active
  return { state: KitLifecycleState.SESSION_ACTIVE, capabilities, errors, warnings };
  // @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-return-session-active
  // @cpt-end:cpt-frontx-dod-ai-kit-packaging-install-and-activate:p1:inst-transition-packaged-to-installed
}
// @cpt-end:cpt-frontx-flow-ai-kit-packaging-session-availability:p1:inst-session-start
