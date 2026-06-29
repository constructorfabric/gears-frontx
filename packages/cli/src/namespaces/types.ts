// @cpt-algo:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-namespace-surface:p1

export type Namespace = 'project' | 'microfrontend';

// Registry of commands supported by each namespace — cpt-frontx-interface-cli surface definition.
export const NAMESPACE_REGISTRY: Record<Namespace, string[]> = {
  project: ['scaffold'],
  microfrontend: ['scaffold'],
};

export interface NamespaceRouteInput {
  namespace: string;
  command: string;
  args: unknown;
}

export type NamespaceRouteResult =
  | { ok: true; namespace: Namespace; command: string; args: unknown }
  | { ok: false; reason: 'unknown-namespace' | 'command-not-found'; message: string };
