---
status: accepted
date: 2026-10-01
decision-makers: German Bartenev
description: "Decides that the MFE runtime takes an optional abstract router and exchanges occupant values through a private rendezvous."
---

# Inject an Optional Abstract Router, Exchange Occupant Values Through a Private Rendezvous, and Command the URL

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Inject an optional abstract router and exchange occupant values through a private rendezvous](#inject-an-optional-abstract-router-and-exchange-occupant-values-through-a-private-rendezvous)
  - [Broadcast every occupant's address as a domain-wide shared property](#broadcast-every-occupants-address-as-a-domain-wide-shared-property)
  - [Carry a per-occupant value on the mount context or the bridge](#carry-a-per-occupant-value-on-the-mount-context-or-the-bridge)
  - [Let the runtime report facts about each execution and the router derive the URL](#let-the-runtime-report-facts-about-each-execution-and-the-router-derive-the-url)
  - [Let the runtime import the routing package](#let-the-runtime-import-the-routing-package)
  - [Build the concrete router outside the routing package](#build-the-concrete-router-outside-the-routing-package)
  - [Notify a runtime-side listener of the extensions a URL change removed and added](#notify-a-runtime-side-listener-of-the-extensions-a-url-change-removed-and-added)
  - [Let the router look registrations up through a required lookup](#let-the-router-look-registrations-up-through-a-required-lookup)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-extension-routing-port`

## Context and Problem Statement

A routed extension supplies its own navigation inside its own subroute, and which part of the URL that is, is not the extension's to choose: the router assigns the extension its occupant value the moment the extension mounts, from the domain's route and the extension's route alone, with no ancestor (the routing PRD's Glossary, occupant value; `cpt-frontx-routing-design-routing`, Visibility and zone boundaries). At that moment the only party holding every input is the runtime that performs the mount: it knows the domain and the extension being mounted. The extension, however, may run on its own independently loaded copy of the runtime package (`cpt-frontx-adr-mfe-load-isolation`), and every channel that reaches it across that boundary — the bridge (`cpt-frontx-adr-child-mfe-host-access`), the mount context, which carries the extension and domain identifiers, the lifecycle arguments, actions, and shared properties — is readable by the extension's own code. A channel the extension can read is a channel through which one occupant reaches another occupant's part of the URL, although an occupant owns exactly one entry and nothing else.

The second half of the problem is agreement. The navigation substrate publishes which owner each entry resolves to and leaves two-way agreement between the URL and what is mounted to its consumer (`cpt-frontx-routing-fr-route-ownership-signal`), while every occupancy change, restoration included, passes through the actions-chains channel alone (`cpt-frontx-adr-extension-domain-occupancy`). Nothing names that consumer for every routed domain, nor which party decides what the URL shows while requests are accepted, queued, joined and settled, a knowledge only the runtime holds. The runtime, in turn, may depend on no routing package (`cpt-frontx-principle-agnostic-core`). Nothing fixes either where the concrete FrontX router lives, although routing is a fundamental FrontX responsibility that no shell or MFE code may have code for or any ability to affect.

How does an extension's routing address reach that extension's navigation without passing through anything extension or host code can read, which party pursues agreement between the URL and the mounts, in both directions, for every routed domain, and where does the concrete router live? The answer binds the runtime maintainers, the maintainers of the routing package that holds the concrete FrontX router, and every microfrontend author who declares a route tree; it has to be settled before that router is specified, because the router conforms to the contract this decision defines.

## Decision Drivers

In priority order:

* **Routing is FrontX internal** — neither shell code nor any MFE may have code for the router or any ability to affect it; the routing package provides one ready router per runtime, and the runtime receives it when its registry is built.
* **Occupant values stay private** — no interface FrontX hands to extension or host code may expose an occupant value, so that one occupant cannot read or address another's entry (anchors `cpt-frontx-nfr-security`, access posture).
* **No dependency between the runtime and routing** — the runtime may depend on neither the navigation substrate nor its engine provider, and neither may depend on the runtime, so the runtime stays free of any routing grammar and the router names no runtime type (`cpt-frontx-adr-core-package-boundaries`, `cpt-frontx-principle-agnostic-core`).
* **A minimal router API** — the router must learn everything it needs from what the runtime tells it, in ids, routes and one fact per domain, and must know the extension domain and extension concepts only as far as finding them by their route value to send `mount_ext` and `unmount_ext` requires.
* **Open to any type system** — the router must hardcode no type-system id or type, so that it works with any conforming external type system, as the runtime does.
* **A registry without a router** — a registry built with no router must run every extension with no command sent to anyone.
* **Crossing independently loaded copies** — the value must reach the extension's own copy of the runtime package, and only the realm's global object and object references explicitly passed across reliably cross that boundary (`cpt-frontx-adr-mfe-load-isolation`, `cpt-frontx-adr-shared-dep-cache-reach`).
* **One writer of occupancy** — the URL's occupancy must change only as a byproduct of executed actions, matching the single occupancy channel `cpt-frontx-adr-extension-domain-occupancy` fixes.
* **The runtime decides, the router writes** — how a domain treats its requests (its strategy, its queue, its joins) is known to the runtime alone, so the runtime must decide what the URL shows; the router writes the URL and, for a user's change to the URL, sends the actions chains that change implies, knowing nothing about an action's delivery, its execution state or its outcome.
* **Small public change that reveals no occupancy** — for routing, the runtime's published surface exports the abstract class `RouterPort` and the `HistoryIntent` type; and no registry read reveals route tokens or other domains' occupancy, so `getMountedExtensions` and `getParentBridge` are not members of `MfeRegistry`, and registry reads return registrations without `route`. This is a breaking change to `cpt-frontx-interface-mfe-runtime`.
* **A strictly typed history intent** — the intent a mount carries must be rejected when malformed or misspelled rather than silently read as its default.

## Considered Options

* **Inject an optional abstract router and exchange occupant values through a private rendezvous** — the runtime declares an abstract router, accepts it as an optional part of the registry factory's configuration, tells it every registration it needs, obtains an opaque per-extension value from it at mount, hands that value to the extension's own copy of the runtime through a version-namespaced realm-global rendezvous associated with the extension's bridge, and commands through it what each routed domain's URL entries show; the concrete router lives in `@gears-frontx/routing`, declares its own abstract actions-chain executor and type system, which the runtime hands it, sends the actions chains of a user's URL change itself, and is one ready instance per runtime, which the runtime receives when its registry is built.
* **Broadcast every occupant's address as a domain-wide shared property** — the host computes the address of every routable extension of every domain it projects and broadcasts the whole map as a shared property each such domain declares; each occupant picks its own entry out of the map.
* **Carry a per-occupant value on the mount context or the bridge** — the runtime computes each occupant value at mount and hands it to that occupant on the mount context or as a member of its bridge.
* **Let the runtime report facts about each execution and the router derive the URL** — the runtime reports to the router what happened in each execution of a domain's lifecycle actions, and the router derives from those reports what each routed domain's URL entries show.
* **Let the runtime import the routing package** — the runtime depends on the navigation substrate, composes each occupant's address with the substrate's own grammar, and drives URL agreement itself.
* **Build the concrete router outside the routing package** — the concrete router is built outside the routing package, attached to every registry, and extension code is handed a handle for its own subroute.
* **Notify a runtime-side listener of the extensions a URL change removed and added** — the router reports, to a listener the runtime registers with it, which extensions a page load or a back or forward step removed and added, and the runtime builds and sends the `mount_ext` and `unmount_ext` chains.
* **Let the router look registrations up through a required lookup** — the router receives a required lookup into the runtime's registrations and reads domains and extensions through it when it needs them, checking routes when a domain attaches.

## Decision Outcome

Chosen option: **inject an optional abstract router and exchange occupant values through a private rendezvous**, because it is the only option that keeps occupant values off every interface extension and host code can read, keeps the runtime free of any routing dependency, lets a registry without a router mount extensions with no command sent, keeps the public surface for routing small, and lets the runtime, which alone knows how each domain treats its requests, decide what the URL shows while the router writes it; placing the concrete router in `@gears-frontx/routing` keeps routing FrontX internal, out of reach of shell and MFE code.

**One record.** The parts of this decision stay in one record because each is part of the one relationship between the runtime and the router through the abstract router: where the router lives and what it depends on, what the runtime tells the router and obtains from it, how the occupant value reaches the extension, how the runtime commands the URL, the history intent that chooses the verb of that command, and the closed action schemas that make that intent strictly typed.

**The abstract router.** The runtime depends on an optional abstract router that it declares itself, as an abstract class, supplied through the registry factory's existing configuration in the same way the type system is supplied (`cpt-frontx-adr-runtime-type-system-coupling`). There is no dependency between the runtime and `@gears-frontx/routing`, nor between the runtime and the engine-provider package, in either direction. A registry built with no router makes no router call and issues no command. The runtime calls the abstract router's methods; the router calls nothing of the runtime beyond the abstract dependencies of its own that the runtime hands it. Apart from the executor and the type system `connect` hands over, the abstract router names nothing of the runtime's types: the runtime tells the router everything it needs in ids, routes and one fact per domain, whether the domain declares `unmount_ext`. The router declares no type of the runtime and receives those two objects structurally. Through the abstract router the runtime tells the router the registration of each routed domain and extension, which is rejected when the router rejects its route, and their release; that a domain's root has attached, and that it is about to detach; the URL command, described under Commanding the URL; and the extension runtime's navigation supply. It also obtains from the router the occupant value at mount, described below. These add no registry or bridge member. The `MfeRegistry` surface removes `getMountedExtensions` and `getParentBridge`, and registry reads return registrations without `route`. The factory snapshots both the type-system instance and the optional router instance on its first build. A later build must supply the identical values, including identical absence; a different type system or router is rejected rather than receiving the cached registry.

**Where the router lives.** The concrete FrontX router lives in `@gears-frontx/routing`. It is FrontX internal: neither shell code nor any MFE has code for it or any ability to affect it. The routing package exports one ready router instance per runtime, and the runtime receives it when its registry is built, the shell's and every MFE's. The router depends on no runtime type and conforms to the abstract router structurally. It knows the extension domain and extension concepts, because it must find a domain and an extension by their route value to send `mount_ext` and `unmount_ext`, and it keeps its own copy of the registrations the runtime tells it. It rejects, at registration, a routed-domain route that is invalid or collides with another routed domain live in the page, and an extension route that is invalid or already held in that domain.

**The router's own dependencies.** The routing package declares its own abstract dependencies, an actions-chain executor and a type system, the same way the runtime declares the abstract router. When the router is injected, the runtime hands it its registry's actions-chain executor and its type system. The router is specific to the shape of the `mount_ext` and `unmount_ext` actions, not to their type-system description: it hardcodes no GTS id or type, takes the two action type ids only from the type system it is handed, and works with any external type system. It uses the executor only to send the chains of a user's change to the URL, described under URL ownership, and it never reads an action's delivery, its execution state or its outcome.

**The occupant value.** At domain and extension registration, the runtime tells the injected router the domain's or extension's id and route, and the router validates and derives any routing identity it needs. At mount, the parent-side copy of the runtime obtains from the router an opaque per-extension value — the occupant value — computed from the registered domain and the registered extension; a domain's key carries no ancestor chain, so no enclosing value is needed. The runtime neither derives nor validates a domain key or an extension token and never interprets an occupant value. In the extension's own runtime, the extension's own copy of the runtime package consumes the value, so that the router injected there can supply that extension's navigation. An MFE neither constructs nor receives the concrete router or an occupant value: it renders its own route tree with the engine-provider package's extension router (`ExtensionRouter`, from `@gears-frontx/routing-tanstack`) in its own content, which builds and renders one router over the calling runtime's own subroute and never outside it. Extension code reads and modifies only its own subroute, and shell code only the shell's subroute (the pathname). A route occupant is an extension, and an extension is one MFE instance.

**The navigation facade.** The engine-provider package gives code a navigation facade, `navigation()`, scoped to the calling runtime's own subroute: an extension's own entry, where it can change only its own entry's parameters (the virtual location the engine provider projects), or the shell's subroute (the pathname). The facade, like the extension router, works over that subroute and never outside it. An extension without a route of its own or of its domain, or whose occupant-value exchange failed, has no access to the router: the extension router and the facade refuse there. It exposes neither the router, the occupant value, nor raw history. Code outside the rendered tree, action handlers included, uses this facade; rendered code may use the engine provider's scoped route hooks.

**Private exchange.** Occupant values are exchanged only between copies of the runtime package, and between the runtime and the injected router. Copies exchange them through a version-namespaced realm-global rendezvous of its own, reached behind an internal accessor, following the protocol of `cpt-frontx-adr-shared-dep-cache-reach`: entries are checked structurally rather than by class identity, and a copy that finds a malformed entry or a version it does not recognize treats the rendezvous as absent and neither reads, mutates, replaces nor deletes what it found. The rendezvous associates each occupant value with the bridge object the parent copy creates for that extension; the value is set before the extension's lifecycle mount runs and is released with that bridge. Occupant values never travel on the bridge, on the inbound bridge link, on the mount context, in lifecycle arguments, in actions, or in shared properties.

**The guarantee and its limit.** No interface FrontX hands to extension or host code — the bridge, the registry, the mount context, lifecycle arguments, actions, or shared properties — exposes an occupant value, and no FrontX code passes one to extension or host code. This guarantee is stated at the level of FrontX's own interfaces. It is not a confidentiality boundary against code that deliberately reads the realm's global object or the raw URL: the rendezvous slot and the URL are readable by any script running in the same realm, and that is accepted on the same ground `cpt-frontx-adr-shared-dep-cache-reach` records for its own slot.

**Commanding the URL.** The runtime decides what each routed domain shows in the URL, and the router writes it. The abstract router receives one command from the runtime: this domain must show exactly these extensions in the URL, written with the history verb `push` or `replace`. The runtime issues it from the wrappers it places around each domain's mount and unmount handlers, at two moments:

* When a domain's handler accepts an application request carrying the history intent `push` or `replace`, the runtime commands the domain's projected occupancy with that verb. The URL follows the request the moment it is accepted, one history entry per request, as a single-page application's address changes when the user clicks a menu item, before loading finishes.
* When any request settles, the runtime commands the domain's projected occupancy with `replace`. Every request that reached the wrapper issues this command once, including a request the handler refuses and a request absorbed without running: replaced, timed out, or closed by the domain's unregistration while pending.

The command names the domain's projected occupancy: what the domain will hold once every request it has accepted completes as requested. Apart from the residual accepted under Consequences, the command does not show an extension whose removal the domain has accepted, and in an Exclusive or Optional domain it never names two extensions. How the runtime computes the projection and when it issues each command are specified by `cpt-frontx-feature-extension-domain-governance`; how the router writes a command is specified by `cpt-frontx-feature-routing-route-ownership-signal`. Domain and MFE developers have no access to the router or to these commands: the runtime places the wrappers around their handlers, and no interface they hold reaches the router. Their only URL access is their own subroute, through the navigation facade.

**Mounting, unmounting, and the history intent.** Mounting happens only through the `mount_ext` action; restoration and opening are included, and both are sent as actions chains (`cpt-frontx-adr-action-dispatch-and-chaining`). Both `mount_ext` and `unmount_ext` carry one optional, strictly typed history intent whose values are `none`, `replace`, and `push`; an absent intent means `push`. The runtime reads the intent only to choose the verb of the command it issues at acceptance: `push` and `replace` as named, while `none` issues no command at acceptance. The settle command is always a `replace`. Every URL-driven chain the router sends to bring the mounts to a URL's state (a cold load, a reload, a back or forward step, or an address the user enters) carries `none`: the chain's own request writes nothing at acceptance, and the URL shows it once its settle command, a `replace`, is written, so it never creates a history entry. An application request sent with `none` reaches the URL only when it settles.

**Closed action schemas.** Concrete action schemas are closed: an undeclared field on the action or on its payload is rejected at admission. The base action schema stays open, so concrete actions can derive from it. Closure is what makes the history intent strictly typed: an open payload would admit a misspelled intent field and read the mount as the default.

**URL ownership.** The route is a byproduct of actions execution: the route is used to try to set application state, but in the end the route always stays in sync with the actual application state. The URL's occupancy changes only through the runtime's commands and through the router's own correction after a user's change to the URL; shell, MFE, and host code never write it, and each runtime reads and writes only its own subroute: an extension its own entry, the shell its subroute (the pathname). Beyond a domain's id and route, the router knows one fact about it, whether it declares `unmount_ext`, which the runtime tells it at registration, and nothing about its strategy or cardinality.

The router sends chains, through the actions-chain executor the runtime handed it, only for a URL change the user made: a page load or a back or forward step; a written navigation (`push` or `replace`) sends nothing. Those chains are the `mount_ext` and `unmount_ext` actions chains the change implies, and each carries the history intent `none`, so it issues no acceptance command: the runtime commands what the URL shows, and the router writes it. The domain's handler decides what each request does. An Exclusive domain declares no `unmount_ext`; how its occupant leaves is decided by `cpt-frontx-adr-extension-domain-occupancy`. How the router sends those chains, handles a page load's initial route and corrects the URL after a back or forward step is specified by `cpt-frontx-feature-routing-route-ownership-signal`.

An extension registered after its domain has begun routing is supported: the router resolves each navigation against the domain's current extensions, so the extension becomes resolvable from the next navigation and a released one resolves as unresolved; nothing re-resolves when the set itself changes, and the URL's entries are cleared after the page load's first transition and the initial route stays captured until the first `push` command or back/forward step, so a deep link is lost only for an extension whose registration is not in place when its domain's observer takes its first resolution. When an executed `mount_ext` or `unmount_ext` removes or replaces an extension that hosts routed domains, teardown of that extension internally releases the nested occupants and observers inside the hosted extension's own registry. Those nested releases are part of the parent action's execution, not separately dispatched `unmount_ext` actions; no nested release issues a command or writes the URL, and the host's nested entries leave the URL in the write of the command that drops the host.

**Unregistration and disposal.** Unregistering an extension or a domain, and terminal disposal of a registry, release occupants directly as resource cleanup. They are not occupancy actions: beyond the release notifications that free what the router admitted, they issue no command themselves, and the router writes nothing to the URL for them. A pending request that unregistration fails settles like any absorbed request, and a command for a domain with no live observer writes nothing.

### Consequences

* Good, because no FrontX interface lets one occupant read or address another occupant's entry, so each occupant reaches only its own entry's parameters.
* Good, because the runtime holds no routing grammar and no routing dependency, and the concrete router behind the abstract router can be substituted without touching the runtime.
* Good, because a registry with no router behaves exactly as a registry outside any routed composition, so routing remains opt-in.
* Good, because the URL's occupancy has one source: every change to it is a byproduct of an executed action, apart from the router's own correction of a user change, and restoration reaches the mounts through the same channel as origination.
* Good, because the runtime's public surface exports the abstract class `RouterPort`, the `HistoryIntent` type, one optional configuration field carrying that abstract router, and one optional property on each of the two lifecycle actions, `mount_ext` and `unmount_ext`; none adds a member to the registry or to either bridge contract.
* Bad, and accepted: breaking change to `cpt-frontx-interface-mfe-runtime` — `getMountedExtensions` and `getParentBridge` are not members of `MfeRegistry`, registry reads return registrations without `route`, and `RouterPort` is an abstract class with `reflect`, `connect`, `startDomain` and `stopDomain`, which breaks every implementer of the earlier router contract. No backward compatibility is kept; pre-1.0, the breaking change is carried by a minor version bump (0.3 → 0.4) per CONTRIBUTING versioning.
* Bad, and accepted: the rendezvous slot and the URL are readable by any same-realm script, so the guarantee is an interface guarantee and not a confidentiality boundary against code that deliberately reads the realm's global object or the URL.
* Neutral, because an extension must build its registry within its mount window: an extension runtime that builds no registry, or builds it outside the mount window, never adopts its inbound bridge and is never supplied navigation, which is a defect of the MFE entry and lies outside the private-subroute guarantee.
* Bad, because a copy that does not recognize the rendezvous version backs away, so no occupant value crosses between copies that disagree on the protocol version.
* Good, because routing is FrontX internal: no shell or MFE code has code for the router or any ability to affect it.
* Good, because the router names no runtime type and hardcodes no GTS id or type, so it works with any conforming type system.
* Bad, because the abstract router and the router's own abstract dependencies form a cross-package contract between the runtime and the routing package, held by structural conformance rather than by an import and checked only where a registry is built with the router, so its evolution has to be coordinated across both packages.
* Bad, and accepted: the routing package becomes specific to the shape of the `mount_ext` and `unmount_ext` actions, and so to applications built on FrontX's microfrontend design, the only setting in which it has a use.
* Neutral, because the router keeps its own copy of the registrations, so the runtime tells it every routed registration and release.
* Bad, and accepted: the router is a module export of `@gears-frontx/routing`, so code that deliberately imports that package can reach its methods, as it can reach the realm's global object or the raw URL; no interface FrontX hands to shell or extension code exposes the router, and no FrontX code passes it to them.
* Bad, because closing concrete action schemas makes them stricter: an action carrying a field its schema does not declare fails admission, so its chain takes its `fallback` when present and otherwise ends silently; every sender has to conform to the schema it targets.
* Neutral, because the router holds no knowledge of how a domain treats its requests (its cardinality, its queue, its joins): the runtime, which owns that knowledge, decides what the URL shows, and the router dispatches one actions chain per extension a user's URL change removed from a domain declaring `unmount_ext` or added and resolved, and writes the commands it receives.
* Good, because the URL follows an application request the moment the domain accepts it, as a single-page application's address does, and settles to the state that results: the projected occupancy does not show an extension whose removal the domain has accepted, apart from the residual accepted below, and never names two extensions in an Exclusive or Optional domain.
* Good, because the URL stays in sync with the actual application state: a page load's URL entries are cleared once its chains are sent, while the initial route stays captured until the first `push` command or back/forward step, so after the load the URL holds only what the runtime's commands write and an entry no actions chain mounts is absent from it; an entry that does not resolve is dropped after the back or forward step that brought it; a request that fails or is absorbed is corrected by its own settle command without creating a history entry; and a back or forward step that reaches the runtime with no request is corrected by the router itself.
* Neutral, because the runtime commands the projection at every settle and keeps no memory of what it has commanded, so many commands match the live URL and write nothing.
* Bad, and accepted: a failed application push can leave a history entry equal to the previous one.
* Bad, and accepted: a Concurrent remount that joins an in-flight mount which an unmount waits on briefly shows that extension in the URL although the domain has accepted its removal.
* Bad, and accepted: a replacement that fails before it evicts leaves the host's nested URL entries cleared while its nested occupants stay mounted.
* Bad, and accepted: a correction the router writes while a URL-driven mount is in flight briefly shows the previous extension.
* Bad, and accepted: the correction that follows a back or forward step to an unknown address makes the next Forward step a dead step.
* Bad, and accepted: raw user input (typed or bookmarked) with two tokens in an Exclusive or Optional domain shows both until the first settle command.
* Neutral, because an extension registered after its domain began routing is resolvable from the next navigation but a registration alone mounts nothing, and a deep link to an extension not yet registered at page load is lost.
* Neutral, because a written navigation never dispatches, so a command's own URL write causes no further chain, and a domain's handler alone decides a request for an extension already mounted or already absent.
* Neutral, because unregistration and terminal disposal release occupants without writing the URL, so an entry they leave behind stays in place as unresolved or inert until an action changes it.

### Confirmation

Compliance is confirmed by an import-graph guard, by automated tests, and by architecture review.

* **Import graph** — a continuous-integration guard confirms that the runtime package imports neither `@gears-frontx/routing` nor the engine-provider package, and that neither of them imports the runtime package. This record owns that guard.
* **Router placement** — architecture review confirms that the concrete router lives in `@gears-frontx/routing`; that no shell or MFE code constructs, calls or affects the router; and that the router names no runtime type and hardcodes no GTS id or type, taking the `mount_ext` and `unmount_ext` type ids only from the type system the runtime hands it.
* **Registry without a router** — a test builds a registry with no router and confirms that extensions mount and unmount and that no command is issued.
* **Factory cache** — a factory-cache test confirms that a second build with a different router, with a router after initially omitting one, or omitting a router after initially supplying one throws.
* **Registration** — tests with a router test double confirm that the runtime tells the router each routed domain's and extension's id and route and, for a domain, whether it declares `unmount_ext`; that a registration whose route the router rejects is rejected; and that unregistration and terminal disposal send the release notifications. Tests of the router confirm that it rejects at registration a route that is invalid, a routed-domain route colliding with another routed domain live in the page, and an extension route already held in that domain; the import-graph guard and architecture review confirm that the runtime derives and validates no domain key and no extension token.
* **Router dependencies** — tests of the router confirm that it sends every chain through the actions-chain executor the runtime hands it, and architecture review confirms that it reads no delivery, execution state or outcome of a chain.
* **Occupant value** — tests with a router test double confirm that the parent-side copy obtains the value from the router at mount from the domain and the extension; that the value is set before the lifecycle mount runs; that the extension's own copy obtains it, across two independently loaded copies of the runtime package rather than one shared module graph; and that the value is released with the bridge.
* **No exposure** — tests confirm that no occupant value is observable on the bridge, the inbound bridge link, the mount context, lifecycle arguments, actions, or shared properties; architecture review confirms that no FrontX code passes one to extension or host code.
* **Protocol** — a test confirms that a rendezvous entry carrying an unrecognized version, or a malformed entry, is left untouched: it is neither read, mutated, overwritten nor deleted.
* **Commands** — tests with a router test double confirm that the runtime commands the domain's projected occupancy at acceptance with the request's `push` or `replace` and at every settle with `replace`, that the command never names two extensions in an Exclusive or Optional domain, that no settle command is delivered while the router sends the chains of one URL change, and that unregistration and terminal disposal issue no command.
* **History intent and schemas** — schema tests confirm that the history intent is strictly typed and selects only the verb of the acceptance command, and that concrete action schemas are closed while the base action schema stays open.
* **URL ownership** — architecture review confirms that shell, MFE, and host code write no occupancy into the URL, that domain and MFE code reach neither the router nor its commands, and that every occupancy change in the URL traces to a runtime command or to the router's correction after a user's change; tests of the router against the routing FEATURE that owns its behaviour confirm that it sends chains only for a page load or a back or forward step, clears the URL's entries once per page load, keeping the initial route captured until the first `push` command or back/forward step, and reads of a domain only whether it declares `unmount_ext`.
* **Navigation facade** — tests confirm that the engine-provider package's navigation facade and extension router work over the calling runtime's own subroute and write nothing outside it: in an extension, only its own entry's parameters (the virtual location the engine provider projects); in the shell, only the shell's subroute (the pathname); and that neither the facade, the extension router, nor the scoped route hooks expose the router, the occupant value, or raw history.
* **Extension without an occupant value** — tests confirm that the extension router and the facade refuse in an extension runtime supplied navigation without an occupant value, and that the shell runtime is the only runtime where the read of the runtime's own entry address is `undefined`.
* **Navigation supply** — a test confirms that the extension's own runtime copy supplies that extension's navigation only from the occupant value assigned to it, and that the router it hands that navigation to reads no other extension's occupant value.

## Pros and Cons of the Options

### Inject an optional abstract router and exchange occupant values through a private rendezvous

The runtime declares an abstract router, takes it optionally through the registry factory's configuration, tells it every registration it needs in ids, routes and one fact per domain, and hands each occupant value to the extension's own copy of the runtime through a version-namespaced realm-global rendezvous associated with the extension's bridge. The concrete router lives in `@gears-frontx/routing`, receives from the runtime the actions-chain executor and type system its own abstract dependencies declare, and sends the chains of a user's URL change itself; it is one ready instance per runtime, which the runtime receives when its registry is built.

* Good, because occupant values travel on no interface extension or host code can read.
* Good, because the runtime depends only on a contract it declares itself, the same pattern it follows for the type system, and the router depends only on the abstract dependencies it declares itself.
* Good, because the rendezvous reuses the protocol decided for independently loaded copies, including its back-away behaviour on an unrecognized version.
* Good, because a registry without a router needs nothing new.
* Good, because the runtime, which knows how each domain treats its requests, decides what the URL shows, and the router writes the URL and sends chains only for a user's change to it.
* Good, because the router lives in a FrontX package, so no shell or MFE code has code for it or any ability to affect it.
* Good, because the router keeps its own copy of the registrations, so it rejects an invalid or duplicate route at registration.
* Neutral, because it adds one more realm-global slot to the set the runtime coordinates through.
* Bad, because the rendezvous slot is readable by same-realm code, so the privacy holds at the interface level only.
* Bad, because the routing package becomes specific to the shape of the `mount_ext` and `unmount_ext` actions.

### Broadcast every occupant's address as a domain-wide shared property

The host computes the address of every routable extension of every domain it projects and broadcasts the map as a shared property each projected domain declares. Every occupant of such a domain receives the property and reads its own entry from it.

* Good, because it uses a channel that exists, with no change to the runtime.
* Bad, because a shared property reaches every occupant of the domain that declares it, so every occupant reads every sibling's address.
* Bad, because the host composes and broadcasts addresses itself, so host code becomes a writer of routing state, outside the one occupancy channel.
* Bad, because the host, not the runtime, decides what the URL shows, against the driver that the runtime decides and the router writes.
* Bad, because every routed domain must declare a property that carries routing state rather than host state, mixing the URL channel into shared-property broadcast.

### Carry a per-occupant value on the mount context or the bridge

The runtime computes each occupant value at mount and hands it to that occupant on the mount context or as a member of its bridge.

* Good, because each occupant receives only its own value, through a path that crosses the copy boundary reliably.
* Bad, because the mount context and the bridge are both held by extension code, so the value is reachable by the extension itself and by anything it passes them to.
* Bad, because it grows a published contract the extension depends on, the mount context or the child-facing bridge, for state only the router needs.

### Let the runtime report facts about each execution and the router derive the URL

The runtime reports facts about each execution of a domain's lifecycle actions (the operation, its outcome, the resulting occupancy), and the router derives from them what the URL entries show and writes it.

* Good, because the abstract router carries only observations, so the runtime states no URL intent.
* Neutral, because the runtime holds no routing grammar and no routing dependency.
* Bad, because the router must interpret operations, outcomes and occupancy it does not own, so the decision of what the URL shows moves from the runtime that knows how each domain treats its requests to the router that does not, against the driver that the runtime decides and the router writes.
* Bad, because a report cannot express a single-occupant swap without the router knowing the domain's cardinality.
* Bad, because a report cannot distinguish an absorbed mount from an absorbed unmount without the router knowing the domain's queue behaviour.

### Let the runtime import the routing package

The runtime depends on the navigation substrate, composes each occupant's address with the substrate's grammar, and keeps the URL and the mounts in agreement itself.

* Good, because no port indirection is needed and the runtime controls agreement directly.
* Bad, because it adds a dependency between the runtime and the routing packages, against the driver that neither depends on the other.
* Bad, because the runtime would carry one routing grammar and could not be composed with any other router.

### Build the concrete router outside the routing package

The concrete router is built outside the routing package, attached to every registry, and extension code is handed a handle for its own subroute.

* Good, because the routing packages stay a pure navigation and engine-provider surface, with no knowledge of the `mount_ext` and `unmount_ext` actions.
* Neutral, because the runtime's abstract router and the absence of any dependency between the runtime and routing are the same as under the chosen option.
* Bad, because the router is then code outside FrontX's routing package, so code other than FrontX has it and can affect it, against routing being FrontX internal.
* Bad, because routing then needs more than injecting the router: the router has to be constructed, attached to each registry, and paired with an extension-facing handle outside the routing package.

### Notify a runtime-side listener of the extensions a URL change removed and added

The router reports, to a listener the runtime registers with it, which extensions a page load or a back or forward step removed and added, and the runtime builds and sends the `mount_ext` and `unmount_ext` chains from those reports.

* Good, because the routing package needs no actions-chain executor and no knowledge of the shape of the `mount_ext` and `unmount_ext` actions.
* Neutral, because the chains sent are the same as under the chosen option.
* Bad, because it adds a listener contract and a second flow between the two packages, from the router back to the runtime, on top of the runtime's commands, which is more complicated and extra machinery.

### Let the router look registrations up through a required lookup

The router receives a required lookup into the runtime's registrations and reads domains and extensions through it when it needs them; routes are checked when a domain attaches.

* Good, because the router keeps no copy of the registrations, and the runtime sends fewer calls.
* Bad, because the lookup is a required dependency of the router on the runtime's registrations, so the router has an interface related to the runtime.
* Bad, because an invalid or duplicate route is found only when its domain attaches, not rejected at registration, so a registration with such a route is admitted into the registry.

## More Information

**Relation to other decisions.** The rendezvous follows the protocol of `cpt-frontx-adr-shared-dep-cache-reach`: it occupies a slot of its own, and its entries live with the bridge they are associated with rather than for the realm's lifetime. It is also separate from the mount-context rendezvous decided in `cpt-frontx-adr-action-dispatch-and-chaining`, whose entry is scoped to one synchronous mount window, and it adds nothing to the bridge contracts decided in `cpt-frontx-adr-child-mfe-host-access`. This decision operates within the single occupancy channel of `cpt-frontx-adr-extension-domain-occupancy`: the router is the consumer that record obliges to restore and originate occupancy only through actions chains. `cpt-frontx-adr-core-package-boundaries` points to this record for the runtime's relationship to routing; this record owns the abstract router's obligations and its import-graph guard.

**What stays out of this record.** The abstract router's members and their signatures belong to the runtime's host-communication FEATURE (`cpt-frontx-feature-mfe-host-communication`). The members of the router's own abstract dependencies, the per-strategy computation of the projected occupancy, the shape of an occupant value, the realm slot's description, the accessor, and the concrete schema fields belong to the FEATUREs that own the router, the runtime's mounting and the type system's lifecycle schemas (`cpt-frontx-adr-contract-schema-ownership`). The URL grammar is stated by `cpt-frontx-feature-routing-navigation-substrate` (URL grammar), and `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity` records why it is chosen; the router's internal orchestration is specified by `cpt-frontx-feature-routing-route-ownership-signal`. The routing packages expose only the ready router, its abstract dependency types, and what the engine-provider package consumes; everything else stays internal.

**Scope of impact.** Applies to where the concrete router lives and which party may reach it, to how an extension's occupant value reaches that extension's navigation, to which party admits routed registrations, which party decides what the URL shows for routed domains and which party writes it, to how mounting is requested, and to the closure of concrete action schemas. It does not decide the URL grammar, the router's orchestration of nested occupants beyond their release as part of the departing host's action, how a microfrontend bundle is loaded or isolated, or how actions are routed between registries.

**Review trigger.** Revisit if an extension needs its occupant value for a purpose other than navigation; if a confidentiality boundary against same-realm code becomes a requirement; if a router needs, at mount, an input the parent-side runtime does not hold; if a mount path other than `mount_ext` becomes necessary; if a need arises for a command other than the exact-set one; or if the routing package is needed outside applications built on FrontX's microfrontend design.

**Checklist applicability.**

* ARCH — applicable and addressed above: this fixes a cross-package contract every routed composition depends on, and a published port with an implementer is costly to reverse.
* ARCH-ADR-008 (supersession) — Not applicable because this is a new decision that supersedes no prior record.
* SEC — applicable and addressed above: occupant values are absent from every interface handed to extension or host code, and the realm slot and raw URL remain readable by same-realm code, which is accepted as an interface-level guarantee rather than a confidentiality boundary.
* INT — applicable: the abstract router, together with the routing package's own abstract actions-chain executor and type system, is the integration contract between the runtime and the routing package, and the breaking change to the runtime's surface (registry-read removal, abstract `RouterPort` members), which keeps no backward compatibility, is recorded under Consequences; closing concrete action schemas tightens what every sender may put in an action. Breaking-change policy for the runtime's surface is governed by `cpt-frontx-interface-mfe-runtime`.
* REL — applicable in one narrow respect: a registry without a router, and a copy that backs away from an unrecognized rendezvous version, both leave mounting working with no occupant value crossing; and a failed or absorbed request is corrected in the URL at its settle.
* MAINT — applicable: the router contract evolves across two packages released on their own lines, as recorded under Consequences.
* TEST — applicable and addressed under Confirmation, including a test across two independently loaded copies of the runtime package.
* PERF — Not applicable because the decision adds one rendezvous association, one command per accepted application request and one per settled request, and sets no throughput or latency target; a command that matches the live URL writes nothing.
* DATA — Not applicable because no persistent store is involved; occupant values live with the bridge they are associated with.
* OPS — Not applicable because no deployed-service procedure is governed by this decision.
* COMPL — Not applicable because no regulated or personal data is involved.
* UX — applicable in one narrow respect: the URL follows a request when it is accepted, history entries are created per accepted application push, and the dead steps recorded under Consequences (a failed push, a correction after an unknown address) are accepted.
* BIZ — Not applicable because this is an internal architecture decision; product requirements are cited by ID below.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-nfr-security` — a microfrontend receives no other occupant value through any FrontX interface, in line with the access posture that grants a microfrontend nothing beyond what its domain grants; the realm-slot and URL limitation is recorded as accepted.
* `cpt-frontx-interface-mfe-runtime` — breaking change: the surface exports the abstract class `RouterPort`, the `HistoryIntent` type, one optional configuration field carrying the abstract router and one optional property on each of `mount_ext` and `unmount_ext`; `getMountedExtensions` and `getParentBridge` are not members of `MfeRegistry`, and registry reads return registrations without `route`.
* `cpt-frontx-constraint-mfes-router-port` — the runtime's constraint that carries this decision: an optional abstract router of its own, no routing dependency in either direction, and the private occupant-value exchange.
* `cpt-frontx-mfes-interface-router-port` — the abstract router contract between the runtime and `@gears-frontx/routing` whose obligations this decision fixes.
* `cpt-frontx-component-mfe-runtime` — this decision shapes how the MFE Runtime obtains, hands over, and releases occupant values, how it tells the router the routed registrations, and how it commands each routed domain's URL entries with the domain's projected occupancy when a request is accepted and when it settles.
* `cpt-frontx-fr-mfe-host-communication` — mounting, restoration and opening included, is requested only through `mount_ext` sent as actions chains, the addressed channel this requirement describes.
* `cpt-frontx-principle-agnostic-core` — the runtime depends on a router contract it declares itself and carries no routing grammar.
* `cpt-frontx-constraint-mfes-cross-nesting-reachability` — the occupant-value rendezvous adds no capability method to the registry or to either bridge.
* `cpt-frontx-constraint-mfes-recursive-chain-execution` — commands are issued from the wrappers around each domain's handlers, so chain execution records and commands nothing.
* `cpt-frontx-fr-gts-default-infrastructure-types` — the ecosystem's lifecycle action schemas are closed, and `mount_ext` and `unmount_ext` declare the history intent.
* `cpt-frontx-routing-fr-route-ownership-signal` — names the consumer that requirement leaves two-way agreement to: the injected router, for every routed domain.
* `cpt-frontx-routing-fr-frontx-router` — places the FrontX router that requirement asks for in `@gears-frontx/routing`, and fixes how it sends the chains of a user's change to the URL and writes the runtime's commands.
* `cpt-frontx-routing-fr-engine-provider-port` — the address an occupant's navigation is built from reaches the injected router as the occupant value, never through extension code.
* `cpt-frontx-routing-nfr-standalone` — the routing package imports no other ecosystem package and invokes no mount; its router reaches mounts only through the actions chains it sends through the executor the runtime hands it.
* `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen` — a deep link, reload or history step reaches the mounts through actions chains the router sends.
* `cpt-frontx-adr-core-package-boundaries` — partitions the core framework and points to this record for the runtime's relationship to routing.
* `cpt-frontx-adr-shared-dep-cache-reach` — supplies the version-namespaced rendezvous protocol this decision follows.
* `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity` — decides the URL grammar the router this decision injects reads and writes; this decision fixes who reaches the router and through what channel, not the grammar itself.
