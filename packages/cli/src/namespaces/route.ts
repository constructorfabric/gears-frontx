// @cpt-algo:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-namespace-surface:p1
import type { NamespaceRouteInput, NamespaceRouteResult, Namespace } from './types.js';
import { NAMESPACE_REGISTRY } from './types.js';

// @cpt-algo:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1
export function routeNamespaceCommand(input: NamespaceRouteInput): NamespaceRouteResult {
  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-receive-invocation
  const { namespace, command, args } = input;
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-receive-invocation

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-match-namespace
  let ns: Namespace;
  if (namespace === 'project') {
    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-case-project
    ns = 'project';
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-case-project
  } else if (namespace === 'microfrontend') {
    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-case-mfe
    ns = 'microfrontend';
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-case-mfe
  } else {
    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-default-unknown
    return {
      ok: false,
      reason: 'unknown-namespace',
      message: `Command routing failed — unrecognized namespace label: "${namespace}".`,
    };
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-default-unknown
  }
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-match-namespace

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-verify-command
  const registeredCommands = NAMESPACE_REGISTRY[ns];
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-verify-command

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-check-registered
  if (!registeredCommands.includes(command)) {
    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-abort-not-found
    return {
      ok: false,
      reason: 'command-not-found',
      message: `Command routing failed — command "${command}" not found in namespace "${ns}".`,
    };
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-abort-not-found
  }
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-check-registered

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-forward-to-shared-resolver
  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-return-result
  return { ok: true, namespace: ns, command, args };
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-return-result
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1:inst-forward-to-shared-resolver
}
