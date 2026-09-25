/**
 * Default Diagnostic Sink
 *
 * `console.error`-based default for `MfeDiagnosticSink`, used when a host
 * does not supply its own via `MfeRegistryConfig.diagnosticSink`. Kept as
 * its own small module so the substitutable contract
 * (`packages/mfes/src/runtime/config.ts`) has an obvious, minimal default
 * implementation rather than an inline closure buried in the registry
 * constructor.
 *
 * @packageDocumentation
 * @internal
 */

import type {
  ChainNodeFailureDiagnostic,
  LifecycleDispatchRefusalDiagnostic,
  MfeDiagnosticSink,
} from './config';

/**
 * Default `MfeDiagnosticSink`: logs every diagnostic via `console.error`
 * with enough structure to attribute the refusal or node failure without
 * any external dependency. Never throws. Shared by both
 * `DefaultMfeRegistry` (for lifecycle-hook refusals) and
 * `DefaultActionsChainsMediator` (for chain-node failures) — the same
 * sink instance, wired via `MfeRegistryConfig.diagnosticSink`.
 *
 * @internal
 */
export class ConsoleDiagnosticSink implements MfeDiagnosticSink {
  reportLifecycleDispatchRefusal(diagnostic: LifecycleDispatchRefusalDiagnostic): void {
    console.error(
      '[MfeRegistry] Lifecycle hook dispatch refused',
      diagnostic
    );
  }

  reportChainNodeFailure(diagnostic: ChainNodeFailureDiagnostic): void {
    console.error(
      '[ActionsChainsMediator] Chain node failed',
      diagnostic
    );
  }
}
