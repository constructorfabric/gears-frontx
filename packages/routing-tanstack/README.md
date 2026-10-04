# @gears-frontx/routing-tanstack

FrontX's default routing-engine provider: the published library that binds the navigation
substrate's shared browser history (`@gears-frontx/routing`) to TanStack Router. It projects the
one entry a microfrontend was mounted at into a virtual location that engine can navigate,
constructs the engine's router over that virtual history, and mounts it into that microfrontend's
own component tree — the same construction path whether the microfrontend is composed inside an
application or served standalone.

This package has two callers. The framework router — the concrete router that implements the
runtime's router port — obtains each microfrontend's entry address and calls this package's
adaptation and construction surface (`adaptProviderHistory`, `createProviderRouter`,
`EngineProvider`) to build and mount that microfrontend's router. A microfrontend's own code never
calls that surface: it authors its own route tree with this package's re-exported builders, and may
use the location-preserving navigation helper or the engine's own scoped route hooks from rendered
code.

The navigation substrate stays engine-agnostic by constraint; this package is the deliberately
concrete side of that boundary. It is the only package in the ecosystem that imports a concrete
router engine, so a framework router can adopt a different conforming provider without a change to
the substrate, the runtime, or a sibling microfrontend.

The requirements (PRD), the structure and constraints (DESIGN), and the behavior the
`engine-provider` FEATURE specifies live in this package's own `architecture/` tree in the FrontX
repository; they are not part of the published package.

## `EngineProvider`

`EngineProvider` is the component that mounts the adapted router into a microfrontend's own tree.
It takes one of two prop shapes:

- `{ routeTree, history }` — build a router from a route tree and an already-adapted virtual
  history (the usual case, whether the microfrontend is composed inside an application or served
  standalone). A `routerOptions` prop carries the engine's other construction options through to
  that build; see below. Optional unless the route tree declares a router context (built with
  `createRootRouteWithContext`), in which case it is required.
- `{ router }` — mount a router that was already constructed elsewhere, for example through
  `createProviderRouter`.

Mounting through `EngineProvider` — either shape — is what connects the adapted history to the
shared navigation history, and what releases it again when the microfrontend unmounts.
`EngineProvider` establishes that subscription on mount and tears it down on unmount, and the two
are exact inverses of each other, so a component that mounts and unmounts repeatedly (including
React's development-mode double-mount) ends up with exactly one live subscription while it is
mounted and none once it is gone.

The subscription belongs to that pair and to nothing else. Calling `adaptProviderHistory` or
`createProviderRouter` subscribes to nothing. **Until `EngineProvider` mounts it, an adapted
history is inert**: its location holds whatever it projected when it was built, and no navigation
from anywhere else reaches it. That is what makes a history safe to discard: one built for a mount
that never happens, or the extra one React's development-mode double-render produces, holds no
subscription to leak.

`EngineProvider` is the only way to attach an adapted history to the shared navigation history: the
attach step runs internally, at `EngineProvider`'s own mount boundary, and re-reads the shared
history on attach, so the adapted history's own location picks up a navigation that landed while it
was unmounted, and the subscribers that stayed registered across that gap are told about the resync.
A subscriber that went away with the unmount is not one of them: a view rendered by a router that was
itself torn down and built again can still show the route it last rendered, until the next
navigation brings it forward.

## Router construction options

`createProviderRouter(routeTree, history, options)` takes the engine's remaining construction
options as its third argument, and `EngineProvider`'s `{ routeTree, history }` shape takes the same
object as its `routerOptions` prop. Both are required when the route tree declares a router
context, optional otherwise. `context` is the usual one — the dependency an application's
route loaders read, an API client being the common case:

```tsx
<EngineProvider routeTree={routeTree} history={history} routerOptions={{ context: { apiClient } }} />
```

`routeTree` and `history` are not part of that object and cannot be displaced by it: this package
supplies both, and `history` in particular has to stay the adapted, virtual one for the router to
match nothing but this microfrontend's own slice of the URL.

The engine-provider port the navigation substrate declares, and that the framework router's own
construction surface is typed against, takes exactly `{ history, entryAddress, routeTree }` — no
further construction options — because widening it would put a concrete engine's construction
surface into the substrate. A route tree built with `createRootRouteWithContext` reaches its context
through `createProviderRouter`'s third argument or `EngineProvider`'s `routerOptions` prop instead.

## What an entry cannot carry

The navigation substrate's history contract has no place for per-entry state: `push` and `replace`
take a path, and the substrate owns the browser's own per-entry state exclusively, for bookkeeping
of its own that it rewrites on every write. This provider therefore accepts the state argument the
engine's history contract passes and drops it, rather than keeping a copy in memory that the first
reload would empty and the first back step would bypass.

What that means in a microfrontend using this provider:

- `useLocation().state` never carries a value you put there, and neither does anything reading state
  off a location — `navigate({ state })` and `<Link state={...}>` included.
- Route masking does not work, because the engine implements it on top of that same per-entry state.

Carry what you would have put in state in the virtual location's own search instead, where it
survives a reload and a shared link. A microfrontend that genuinely needs entry-carried state needs
a different engine-provider port implementation, over an engine whose own history contract provides
it.

## License

Apache-2.0. `LICENSE` and `NOTICE` ship inside the package.
