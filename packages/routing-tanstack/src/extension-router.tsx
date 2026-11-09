// Extension Router — `cpt-frontx-algo-routing-engine-provider-extension-router`.
//
// FEATURE (engine-provider) §2, "Render The Extension's One Router From Its
// Route Tree"; §3, "Extension Router". The runtime's one router over the
// calling runtime's own private subroute: an extension's own entry, or, in
// the shell runtime, the shell's subroute (the pathname).
import { useMemo, useState, type ReactElement } from 'react';
import { resolveNavigationHistory, router } from '@gears-frontx/routing';
import type { AnyRoute, SearchParser, SearchSerializer } from '@tanstack/react-router';
import { adaptProviderHistory } from './engine-provider-history.js';
import { createProviderRouter, EngineProvider } from './router-creation.js';

/** `ExtensionRouter`'s input: the runtime's own route tree, authored with
 * this package's re-exported route-tree builders, and optionally the engine's
 * search parser and serializer. */
export interface ExtensionRouterProps {
  readonly routeTree: AnyRoute;
  /**
   * Reads the virtual location's search string into the router's search
   * object. The engine's default reads each value as JSON. Build one with
   * this package's re-exported `parseSearchWith`, and keep its identity across
   * renders, as a module-level constant does: a new function builds the
   * router again, which mounts afresh, so route-local state starts over.
   */
  readonly parseSearch?: SearchParser;
  /**
   * Writes the router's search object back as a search string. The engine's
   * default writes a string that would read back as another JSON value
   * JSON-quoted. Build one with this package's re-exported
   * `stringifySearchWith`; keep its identity across renders, as for
   * `parseSearch`.
   */
  readonly stringifySearch?: SearchSerializer;
}

/**
 * Builds and renders the runtime's one router from `routeTree`, over a
 * history adapted from the entry address the ready FrontX router of
 * `@gears-frontx/routing` returns through `ownEntryAddress()`. In an
 * extension runtime with no access to the router, that read throws and so
 * does this component's render.
 */
// @cpt-algo:cpt-frontx-algo-routing-engine-provider-extension-router:p2
// @cpt-flow:cpt-frontx-flow-routing-engine-provider-render-extension-router:p1
// @cpt-dod:cpt-frontx-dod-routing-engine-provider-extension-router:p1
// @cpt-begin:cpt-frontx-algo-routing-engine-provider-extension-router:p2:inst-er-accept-route-tree
export function ExtensionRouter({ routeTree, parseSearch, stringifySearch }: ExtensionRouterProps): ReactElement {
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-extension-router:p2:inst-er-accept-route-tree
  // @cpt-begin:cpt-frontx-flow-routing-engine-provider-render-extension-router:p1:inst-run-extension-router
  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-extension-router:p2:inst-er-adapt-history
  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-extension-router:p2:inst-er-private-subroute
  // Built once per mount (a lazy state initializer, never rerun on a
  // re-render). The entry address is read only from the ready FrontX router:
  // the runtime's own entry in an extension runtime, `undefined` in the
  // shell runtime, which `adaptProviderHistory` turns into the shell's
  // subroute (the pathname); in an extension runtime without router access
  // the read throws, and the render refuses with it.
  const [history] = useState(() => adaptProviderHistory(resolveNavigationHistory(), router.ownEntryAddress()));
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-extension-router:p2:inst-er-private-subroute
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-extension-router:p2:inst-er-adapt-history

  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-extension-router:p2:inst-er-create-router
  // Built again only when the route tree or a search function changes. The
  // search parser and serializer are the only construction options supplied;
  // the engine falls back to its own default for one left undefined.
  const engineRouter = useMemo(
    () => createProviderRouter(routeTree, history, { parseSearch, stringifySearch }),
    [routeTree, history, parseSearch, stringifySearch],
  );
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-extension-router:p2:inst-er-create-router

  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-extension-router:p2:inst-er-render
  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-extension-router:p2:inst-er-return
  // @cpt-begin:cpt-frontx-flow-routing-engine-provider-render-extension-router:p1:inst-return-rendered-router
  // `EngineProvider`'s mount boundary registers the history's subscription
  // against the shared navigation history and releases it on unmount.
  return <EngineProvider router={engineRouter} />;
  // @cpt-end:cpt-frontx-flow-routing-engine-provider-render-extension-router:p1:inst-return-rendered-router
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-extension-router:p2:inst-er-return
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-extension-router:p2:inst-er-render
  // @cpt-end:cpt-frontx-flow-routing-engine-provider-render-extension-router:p1:inst-run-extension-router
}
