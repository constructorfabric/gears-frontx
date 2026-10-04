/**
 * Router Port Contract
 *
 * The abstract contract an injected router implements, accepted through the
 * optional `MfeRegistryConfig.router`. The runtime presents each domain and
 * extension registration to it, obtains each extension's opaque occupant
 * value from it at mount, reports each settled `mount_ext`/`unmount_ext`
 * execution to it, and hands it a reader for an extension's navigable
 * occupant value. The router owns routing identity and page-wide
 * domain-route uniqueness; this package keeps no routing grammar of its own
 * (`cpt-frontx-adr-extension-routing-port`).
 *
 * This package MUST NOT import `@gears-frontx/routing` or
 * `@gears-frontx/routing-tanstack`, nor be imported by either — the router
 * port is the only contact surface between this package and a concrete
 * router (`cpt-frontx-dod-mfe-host-communication-router-port-contract`).
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-frontx-dod-mfe-host-communication-router-port-contract:p1

import type { ExtensionDomain, Extension, MountExtPayload, UnmountExtPayload } from '../types';

/**
 * The opaque value a router assigns an extension at mount. The runtime
 * stores and hands this value over without ever inspecting it
 * (`cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous`).
 */
export type OccupantValue = unknown;

/**
 * The input to `RouterPort.assignOccupantValue`: the registered domain and
 * extension declarations for the mount in progress, and the value associated
 * with the mounting registry's own inbound bridge (`undefined` for a root
 * registry, when no value is associated with that bridge, or when this copy
 * backed away from the rendezvous).
 */
export interface OccupantValueAssignment {
  domain: ExtensionDomain;
  extension: Extension;
  enclosingValue: OccupantValue | undefined;
}

/**
 * The settled-action report a domain's handler path makes to the router,
 * exactly once per executed `mount_ext`/`unmount_ext` that reaches the
 * domain's registered handler
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution`
 * `inst-me-report-settled`).
 */
export interface SettledActionReport {
  /** The action type dispatched (mount_ext or unmount_ext). */
  actionTypeId: string;
  /** The domain the executed action's handler belongs to. */
  domainId: string;
  /** The executed action's payload, exactly as admitted, history intent included. */
  payload: MountExtPayload | UnmountExtPayload;
  /** Whether the domain's handler execution succeeded. */
  succeeded: boolean;
}

/**
 * The router port: the abstract contract an injected router implements.
 * Every member is synchronous. Adds no member to `MfeRegistry`,
 * `ChildMfeBridge`, or `ParentMfeBridge`.
 */
export interface RouterPort {
  /** The registration notification for a domain; throwing rejects the registration. */
  registerDomain(domain: ExtensionDomain): void;
  /** The registration notification for an extension; throwing rejects the registration. */
  registerExtension(extension: Extension): void;
  /** The release notification that frees what the router admitted for a domain. */
  releaseDomain(domainId: string): void;
  /** The release notification that frees what the router admitted for an extension. */
  releaseExtension(extensionId: string): void;
  /** The value assignment at mount. */
  assignOccupantValue(assignment: OccupantValueAssignment): OccupantValue;
  /** The settled-action report. */
  reportSettled(report: SettledActionReport): void;
  /** The supply of an extension's navigation from its occupant value. */
  supplyNavigation(readOccupantValue: () => OccupantValue | undefined): void;
}
