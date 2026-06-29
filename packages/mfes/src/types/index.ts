/**
 * MFE Domain Type Contracts
 *
 * Pure TypeScript interface definitions for MFE domain types.
 * All types are self-contained — no external package dependencies.
 * Types only reference each other.
 *
 * @packageDocumentation
 */

// @cpt-dod:cpt-frontx-dod-mfe-registry-type-contracts:p1

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * An action with target, self-identifying type, and optional payload
 * GTS Type: gts.frontx.mfes.comm.action.v1~
 */
export interface Action {
  /** Self-reference to this action's type ID */
  type: string;
  /** Target type ID (ExtensionDomain or Extension) */
  target: string;
  /**
   * Optional action payload.
   * Lifecycle actions (load_ext, mount_ext, unmount_ext) require a `subject` field
   * identifying the extension ID to act upon. This is enforced at runtime via GTS schema
   * validation (payload.subject with x-gts-ref to extension type).
   */
  payload?: { subject?: string } & Record<string, unknown>;
  /** Optional timeout override in milliseconds (overrides domain's defaultActionTimeout) */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// ActionsChain
// ---------------------------------------------------------------------------

/**
 * Defines a mediated chain of actions with success/failure branches
 * GTS Type: gts.frontx.mfes.comm.actions_chain.v1~
 *
 * Contains actual Action INSTANCES (embedded objects).
 * ActionsChain is NOT referenced by other types, so it has NO id field.
 */
export interface ActionsChain {
  /** Action instance (embedded object) */
  action: Action;
  /** Next chain to execute on success */
  next?: ActionsChain;
  /** Fallback chain to execute on failure */
  fallback?: ActionsChain;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Represents a lifecycle event that can trigger actions chains
 * GTS Type: gts.frontx.mfes.lifecycle.stage.v1~
 */
export interface LifecycleStage {
  /** The GTS type ID for this lifecycle stage */
  id: string;
  /** Human-readable description of when this stage triggers */
  description?: string;
}

/**
 * Binds a lifecycle stage to an actions chain
 * GTS Type: gts.frontx.mfes.lifecycle.hook.v1~
 */
export interface LifecycleHook {
  /** The lifecycle stage that triggers this hook */
  stage: string;
  /** The actions chain to execute when the stage triggers */
  actions_chain: ActionsChain;
}

// ---------------------------------------------------------------------------
// ExtensionDomain
// ---------------------------------------------------------------------------

/**
 * Defines an extension point (domain) where MFEs can be mounted
 * GTS Type: gts.frontx.mfes.ext.domain.v1~
 */
export interface ExtensionDomain {
  /** The GTS type ID for this domain */
  id: string;
  /** SharedProperty type IDs provided to MFEs in this domain */
  sharedProperties: string[];
  /** Action type IDs this extension domain is capable of receiving and executing */
  actions: string[];
  /** Action type IDs an extension's entry must support to be injectable into this domain */
  extensionsActions: string[];
  /**
   * Optional reference to a derived Extension type ID.
   * If specified, extensions must use types that derive from this type.
   */
  extensionsTypeId?: string;
  /** Default timeout for actions targeting this domain (milliseconds, REQUIRED) */
  defaultActionTimeout: number;
  /** Lifecycle stage type IDs supported for the domain itself */
  lifecycleStages: string[];
  /** Lifecycle stage type IDs supported for extensions in this domain */
  extensionsLifecycleStages: string[];
  /** Optional lifecycle hooks - explicitly declared actions for each stage */
  lifecycle?: LifecycleHook[];
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

/**
 * Presentation metadata for extensions.
 * Used by the host to build navigation menus and other UI elements.
 */
export interface ExtensionPresentation {
  /** Human-readable label for the extension */
  label: string;
  /** Optional icon identifier (e.g., "user", "settings") */
  icon?: string;
  /** Route path for navigation (e.g., "/profile", "/settings") */
  route: string;
  /** Optional sort order for menu items (lower numbers first) */
  order?: number;
}

/**
 * Binds an MFE entry to an extension domain
 * GTS Type: gts.frontx.mfes.ext.extension.v1~
 *
 * Domain-specific fields are defined in derived Extension types.
 * If domain.extensionsTypeId is specified, extension must use a type deriving from it.
 */
export interface Extension {
  /** The GTS type ID for this extension */
  id: string;
  /** ExtensionDomain type ID to mount into */
  domain: string;
  /** MfeEntry type ID to mount */
  entry: string;
  /** Optional lifecycle hooks - explicitly declared actions for each stage */
  lifecycle?: LifecycleHook[];
  // Domain-specific fields are added via derived types, not defined here
}

/**
 * Screen Extension (derived from Extension)
 * GTS Type: gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~
 *
 * Extends the base Extension type with presentation metadata required for screen domain.
 * Screen domain sets extensionsTypeId to reference this derived type, so all screen
 * extensions must include presentation metadata.
 */
export interface ScreenExtension extends Extension {
  /** Presentation metadata for screen domain extensions (required) */
  presentation: ExtensionPresentation;
}

// ---------------------------------------------------------------------------
// MfeEntry
// ---------------------------------------------------------------------------

/**
 * Defines an entry point with its communication contract (PURE CONTRACT - Abstract Base)
 * GTS Type: gts.frontx.mfes.mfe.entry.v1~
 */
export interface MfeEntry {
  /** The GTS type ID for this entry */
  id: string;
  /** SharedProperty type IDs that MUST be provided by domain */
  requiredProperties: string[];
  /** SharedProperty type IDs that MAY be provided by domain (optional field) */
  optionalProperties?: string[];
  /** Action type IDs this entry is capable of receiving and executing */
  actions: string[];
  /** Action type IDs the parent extension domain must support for this entry to be injectable */
  domainActions: string[];
}

// ---------------------------------------------------------------------------
// SharedProperty
// ---------------------------------------------------------------------------

/**
 * Defines a shared property instance passed from host to MFE
 * GTS Type: gts.frontx.mfes.comm.shared_property.v1~
 */
export interface SharedProperty {
  /** The GTS type ID for this shared property */
  id: string;
  /** The shared property value */
  value: unknown;
}

// ---------------------------------------------------------------------------
// Action Payloads
// ---------------------------------------------------------------------------

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
