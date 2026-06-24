/**
 * MFE Type System - TypeScript Interface Definitions
 *
 * Core MFE types are now in @gears-frontx/mfes. Re-exported here for backward compatibility.
 * Screensets-specific types (MfeEntryMF, MfManifest) remain here.
 *
 * @packageDocumentation
 */

// Core MFE types (now in @gears-frontx/mfes, re-exported for backward compat)
export type { MfeEntry } from './mfe-entry';
export type { ExtensionDomain } from './extension-domain';
export type { Extension, ScreenExtension, ExtensionPresentation } from './extension';
export type { SharedProperty } from './shared-property';
export type { Action } from './action';
export type { ActionsChain } from './actions-chain';
export type { LifecycleStage, LifecycleHook } from './lifecycle';

// Action payloads
export type { LoadExtPayload, MountExtPayload, UnmountExtPayload } from './action-payloads';

// Screensets-specific types (remain here)
export type { MfeEntryMF } from './mfe-entry-mf';

// Module Federation types (remain here)
export type { MfManifest, MfManifestAssets, MfManifestShared, MfManifestMetaData, MfManifestRemoteEntry, MfManifestBuildInfo } from './mf-manifest';
