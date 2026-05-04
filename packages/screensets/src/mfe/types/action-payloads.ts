/**
 * Action Payload Types
 *
 * Typed payload interfaces for extension lifecycle actions.
 * The `subject` field carries an extension ID and is enforced at runtime
 * via GTS schema validation (payload.subject with x-gts-ref to extension type).
 *
 * @packageDocumentation
 */

/**
 * Payload for load_ext action.
 * Preload an extension's bundle without mounting.
 */
export interface LoadExtPayload {
  /** The extension ID to load (GTS subject reference) */
  subject: string;
}

/**
 * Payload for mount_ext action. Pure data; no DOM references. Containers are
 * materialized by the domain implementation's `ContainerHooks` and attached
 * by the per-domain `ExtensionMounter`.
 */
export interface MountExtPayload {
  /** The extension ID to mount (GTS subject reference) */
  subject: string;
}

/**
 * Payload for unmount_ext action.
 * Unmount an extension from its container.
 */
export interface UnmountExtPayload {
  /** The extension ID to unmount (GTS subject reference) */
  subject: string;
}
