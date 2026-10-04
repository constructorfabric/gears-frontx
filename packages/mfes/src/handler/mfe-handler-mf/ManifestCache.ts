import type { MfManifest } from '../../manifest/mf-manifest';

/**
 * Internal cache for Module Federation manifests.
 */
export class ManifestCache {
  private readonly manifests = new Map<string, MfManifest>();

  cacheManifest(manifest: MfManifest): void {
    this.manifests.set(manifest.id, manifest);
  }

  getManifest(manifestId: string): MfManifest | undefined {
    return this.manifests.get(manifestId);
  }
}
