---
status: proposed
date: 2026-10-01
---

# Inject an Optional Router Port and Exchange Occupant Values Through a Private Rendezvous

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
  - [Let the runtime import the routing package](#let-the-runtime-import-the-routing-package)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-extension-routing-port`

## Context and Problem Statement

A routed extension supplies its own navigation inside the address the URL gives it, and that address is not the extension's to choose: an occupant's entry address is assigned by the enclosing level, the moment that level mounts the occupant ([packages/routing/architecture/PRD.md](../../packages/routing/architecture/PRD.md) glossary, entry address; [packages/routing/architecture/DESIGN.md](../../packages/routing/architecture/DESIGN.md) §1, Visibility and zone boundaries). At that moment the only party holding every input is the runtime that performs the mount: it knows the domain, the extension being mounted, and the value the level enclosing that domain was itself given. The extension, however, may run on its own independently loaded copy of the runtime package (`cpt-frontx-adr-mfe-load-isolation`), and every channel that reaches it across that boundary — the bridge (`cpt-frontx-adr-child-mfe-host-access`), the mount context, which carries the extension and domain identifiers, the lifecycle arguments, actions, and shared properties — is readable by the extension's own code. A channel the extension can read is a channel through which one occupant reaches the address of another, although an occupant owns exactly one entry and nothing else.

The second half of the problem is agreement. The navigation substrate publishes which owner each entry resolves to and leaves two-way agreement between the URL and what is mounted to its consumer (`cpt-frontx-routing-fr-route-ownership-signal`), while every occupancy change, restoration included, passes through the actions-chains channel alone (`cpt-frontx-adr-extension-domain-occupancy`). Nothing names that consumer for every routed domain, nor how it learns that a mount or unmount has settled. The runtime, in turn, may depend on no routing package (`cpt-frontx-adr-core-package-boundaries`).

How does an extension's routing address reach that extension's navigation without passing through anything extension or host code can read, and which party pursues agreement between the URL and the mounts, in both directions, for every routed domain? The answer binds the runtime maintainers, the authors of the concrete router the template framework provides, and every microfrontend author who declares a route tree; it has to be settled before that concrete router is specified, because the router implements the contract this decision defines.

## Decision Drivers

In priority order:

* **Occupant values stay private** — no interface FrontX hands to extension or host code may expose an occupant's address, so that one occupant cannot read or address another's entry (anchors `cpt-frontx-nfr-security`, access posture).
* **No dependency between the runtime and routing** — the runtime may depend on neither the navigation substrate nor its engine provider, and neither may depend on the runtime, so the runtime stays free of any routing grammar (`cpt-frontx-adr-core-package-boundaries`, `cpt-frontx-principle-agnostic-core`).
* **Standalone without a router** — a registry built with no router must run every extension standalone, with nothing reported to anyone.
* **Crossing independently loaded copies** — the value must reach the extension's own copy of the runtime package, and only the realm's global object and object references explicitly passed across reliably cross that boundary (`cpt-frontx-adr-mfe-load-isolation`, `cpt-frontx-adr-shared-dep-cache-reach`).
* **One writer of occupancy** — the URL's occupancy must change only as a byproduct of executed actions, matching the single occupancy channel `cpt-frontx-adr-extension-domain-occupancy` fixes.
* **Small, backward-compatible public change** — the runtime's published surface may grow only by optional additions (`cpt-frontx-interface-mfe-runtime`).
* **A strictly typed history intent** — the intent a mount carries must be rejected when malformed or misspelled rather than silently read as its default.

## Considered Options

* **Inject an optional abstract router and exchange occupant values through a private rendezvous** — the runtime declares an abstract router, accepts it as an optional part of the registry factory's configuration, obtains an opaque per-extension value from it at mount, and hands that value to the extension's own copy of the runtime through a version-namespaced realm-global rendezvous associated with the extension's bridge.
* **Broadcast every occupant's address as a domain-wide shared property** — the host computes the address of every routable extension of every domain it projects and broadcasts the whole map as a shared property each such domain declares; each occupant picks its own entry out of the map.
* **Carry a per-occupant value on the mount context or the bridge** — the runtime computes each occupant's address at mount and hands it to that occupant on the mount context or as a member of its bridge.
* **Let the runtime import the routing package** — the runtime depends on the navigation substrate, composes each occupant's address with the substrate's own grammar, and drives URL agreement itself.

## Decision Outcome

Chosen option: **inject an optional abstract router and exchange occupant values through a private rendezvous**, because it is the only option that keeps occupant values off every interface extension and host code can read, keeps the runtime free of any routing dependency, lets a registry without a router run unchanged, and grows the public surface by optional additions alone.

**The router port.** The runtime depends on an optional abstract router that it declares itself, supplied through the registry factory's existing configuration in the same way the type system is supplied (`cpt-frontx-adr-runtime-type-system-coupling`). There is no dependency between the runtime and `@gears-frontx/routing`, nor between the runtime and the engine-provider package, in either direction. A registry built with no router runs every extension standalone and reports nothing. The concrete FrontX router that implements the port is provided by the template framework package and is template territory (`cpt-frontx-adr-template-territory-traceability`). The port includes registration and release notifications for routed domains and extensions. These are the router's private admission path for routing identity and page-wide domain-route uniqueness; they add no registry or bridge member. The factory snapshots both the type-system instance and the optional router instance on its first build. A later build must supply the identical values, including identical absence; a different type system or router is rejected rather than receiving the cached registry.

**The occupant value.** At domain and extension registration, the runtime presents the declaration to the injected router, which validates and derives any routing identity it needs and rejects a routed-domain route that collides with another routed domain live in the page. At mount, the parent-side copy of the runtime obtains from the router an opaque per-extension value — the occupant value — computed from the registered domain, the registered extension, and the value assigned to the level enclosing that domain. The runtime neither derives nor validates routing tokens and never interprets an occupant value. In the extension's own runtime, the extension's own copy of the runtime package consumes the value, so that the router injected there can supply that extension's navigation. An MFE does not construct or receive the concrete router or occupant value: it supplies its route tree to the single framework application instance its runtime — the extension's own independently loaded copy — creates, once, and keeps across every mount, which builds and renders that extension's one router. It may invoke the framework instance's extension-local navigation facade and use scoped route hooks. A route occupant is an extension, and an extension is one MFE instance.

**The navigation facade.** The framework instance exposes to its own extension code a navigation facade scoped to that instance's route tree. The facade delegates to the router the framework built and can change only that occupant's own pathname and search parameters. It exposes neither the router, the occupant value, nor raw history. Code outside the rendered tree, action handlers included, uses this facade; rendered code may use the engine provider's scoped route hooks.

**Private exchange.** Occupant values are exchanged only between copies of the runtime package, and between the runtime and the injected router. Copies exchange them through a version-namespaced realm-global rendezvous of its own, reached behind an internal accessor, following the protocol of `cpt-frontx-adr-shared-dep-cache-reach`: entries are checked structurally rather than by class identity, and a copy that finds a malformed entry or a version it does not recognize treats the rendezvous as absent and neither reads, mutates, replaces nor deletes what it found. The rendezvous associates each occupant value with the bridge object the parent copy creates for that extension; the value is set before the extension's lifecycle mount runs and is released with that bridge. Occupant values never travel on the bridge, on the inbound bridge link, on the mount context, in lifecycle arguments, in actions, or in shared properties.

**The guarantee and its limit.** No interface FrontX hands to extension or host code — the bridge, the registry, the mount context, lifecycle arguments, actions, or shared properties — exposes an occupant value, and no FrontX code passes one to extension or host code. This guarantee is stated at the level of FrontX's own interfaces. It is not a confidentiality boundary against code that deliberately reads the realm's global object or the raw URL: the rendezvous slot and the URL are readable by any script running in the same realm, and that is accepted on the same ground `cpt-frontx-adr-shared-dep-cache-reach` records for its own slot.

**Reporting settled actions.** The runtime reports each `mount_ext` or `unmount_ext` action execution that settles in a domain, once, to the router injected into the registry holding that domain. The report carries the domain, the history intent, and the extensions physically mounted and unmounted during that execution: the mount and unmount lifecycle events that occur while the action executes, including an occupant the domain releases internally while executing it, such as an Optional displacement or an Exclusive eviction. Nested occupants of a hosted extension are released inside that extension's own registry as part of the parent action's execution. They are not part of the parent report's mounted and unmounted extensions, and no internal release is reported separately. An execution is a request for which the domain's strategy ran. An execution that settles without changing any mount is still reported once, with nothing mounted or unmounted, and the router writes nothing for it. The report states what physically happened and the domain owns its cardinality, so the router stays domain-agnostic. Mount or unmount events that occur outside an action execution, such as a slot detach, unregistration, or terminal disposal, never reach the router as reports; only the release notifications that free what the router admitted reach it. The router applies the report's mounted and unmounted extensions in one URL write with that action's history intent. Of the action, the router reads only the report: it never reads the action type and holds no cardinality knowledge of the domain. The report is made from the domain's own handler path, before the chain continues (its `next` on success, its `fallback` on failure). A request for which the domain's strategy never runs is not an execution and reports nothing — for example, a mount of an extension that is already mounted, an unmount whose subject is absent at its turn, a request that joins an entry already queued or running, a pending request replaced by a later one, a pending request whose timer fires before it starts, and a request refused while its domain is being unregistered (`cpt-frontx-adr-extension-domain-occupancy`). An Exclusive domain's `unmount_ext` is passed straight to the domain's handler, outside the occupancy queue and the report: its strategy's unmount changes nothing and fails, and nothing is reported.

**Mounting, unmounting, and the history intent.** Mounting happens only through the `mount_ext` action; restoration and opening are included, and both are sent as actions chains (`cpt-frontx-adr-action-dispatch-and-chaining`). Both `mount_ext` and `unmount_ext` carry one optional, strictly typed history intent whose values are `none`, `replace`, and `push`; an absent intent means `push`. The runtime passes the intent to the router uninterpreted on either action. Every URL-driven chain the router sends to bring the mounts to a URL's state — a cold load, a reload, a back or forward step, or an address the user enters — carries `none`, so that chain writes nothing to history: the URL is already where it needs to be.

**Closed action schemas.** Concrete action schemas are closed: an undeclared field on the action or on its payload is rejected at admission. The base action schema stays open, so concrete actions can derive from it. Closure is what makes the history intent strictly typed: an open payload would admit a misspelled intent field and read the mount as the default.

**URL ownership.** The router pursues agreement between the URL and the mounts for every routed domain, in both directions: it dispatches the actions that bring the mounts to the URL, and settled mounts are reflected back into the URL. The domain's handler decides the outcome of each request, and a request the handler refuses leaves the mounts as they are. Each runtime reads and writes only its own entry's parameters. Which occupants appear in the URL is the router's internal orchestration, and the URL's occupancy changes only as a byproduct of action execution; shell, MFE, and host code never write it. For a URL transition the router sends one `unmount_ext` for each occupant removed from the URL and one `mount_ext` for each occupant added. An owner change is an `unmount_ext` of the previous owner plus a `mount_ext` of the new one. Each `unmount_ext` and each `mount_ext` the router sends is its own actions chain, so a removal's failure holds back no addition. The router dispatches this way uniformly in every domain, removals before additions, where "before" means dispatch order. The router only dispatches: what happens to a request that arrives while a mount or unmount of the same extension is in flight is decided by the domain's handler, through its queue or the Concurrent strategy, not by the router. The router does not suppress the action effects of its own URL writes: an `unmount_ext` it sends for an extension that is already absent is handled by the domain like any other request. When an executed `mount_ext` or `unmount_ext` removes or replaces an extension that hosts routed domains, teardown of that extension internally releases the nested occupants and observers inside the hosted extension's own registry. Those nested releases are part of the parent action's execution, not separately dispatched `unmount_ext` actions, and not part of the parent report's mounted and unmounted extensions. The router itself removes the parent entry and every nested domain entry it knows belongs to that departing host, in the same single URL write for the parent action. No nested release independently writes or reports occupancy. An Exclusive domain's `unmount_ext` does nothing and fails: its occupant leaves through a replacing `mount_ext`, through teardown of an ancestor caused by that ancestor's action, or through terminal disposal, never through its own `unmount_ext`.

**Unregistration and disposal.** Unregistering an extension or a domain, and terminal disposal of a registry, release occupants directly as resource cleanup. They are not occupancy actions: beyond the release notifications that free what the router admitted, they send no settled-action report, and the router writes nothing to the URL for them. An entry whose extension token matches no registration is left in place and reported unresolved, and an entry whose domain has no live observer is inert, per the rules of `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity`.

### Consequences

* Good, because no FrontX interface lets one occupant read or address another occupant's entry, so each occupant reaches only its own entry's parameters.
* Good, because the runtime holds no routing grammar and no routing dependency, and the router behind the port can be substituted without touching the runtime.
* Good, because a registry with no router behaves exactly as a registry outside any routed composition, so routing remains opt-in.
* Good, because the URL's occupancy has one writer: every change to it is a byproduct of an executed action, and restoration reaches the mounts through the same channel as origination.
* Good, because the runtime's public surface grows by one optional configuration field, carrying the abstract router the runtime declares, and one optional property on each of the two lifecycle actions, `mount_ext` and `unmount_ext`; both are backward-compatible additions, and neither adds a member to the registry or to either bridge contract.
* Bad, and accepted: the rendezvous slot and the URL are readable by any same-realm script, so the guarantee is an interface guarantee and not a confidentiality boundary against code that deliberately reads the realm's global object or the URL.
* Bad, because a copy that does not recognize the rendezvous version backs away, so no occupant value crosses between copies that disagree on the protocol version.
* Bad, because the abstract router is a cross-package contract between the runtime and the template framework, and its evolution has to be coordinated across both.
* Bad, because closing concrete action schemas makes them stricter: an action carrying a field its schema does not declare fails admission, so its chain takes its `fallback` when present and otherwise ends silently; every sender has to conform to the schema it targets.
* Neutral, because a request for which the domain's strategy never runs produces no report, so the router learns only of executed `mount_ext` and `unmount_ext` actions, one report each, never of requests that were absorbed before execution; a release a domain performs inside an execution reaches it in that execution's report, and a mount or unmount outside any execution never reaches it as a report.
* Neutral, because the router holds no cardinality knowledge and dispatches one action chain per occupant change in every domain, so each domain's handler alone decides the outcome; in an Exclusive domain the `unmount_ext` sent for a removed occupant fails.
* Neutral, because the router does not suppress the effects of its own URL writes, so a domain handles an `unmount_ext` for an extension that is already absent like any other request.
* Neutral, because unregistration and terminal disposal release occupants without writing the URL, so an entry they leave behind stays in place as unresolved or inert until an action changes it.

### Confirmation

Compliance is confirmed by an import-graph guard, by automated tests, and by architecture review.

* **Import graph** — a continuous-integration guard confirms that the runtime package imports neither `@gears-frontx/routing` nor the engine-provider package, and that neither of them imports the runtime package. This is the guard `cpt-frontx-adr-core-package-boundaries` assigns to this decision.
* **Standalone** — a test builds a registry with no router and confirms that extensions mount and unmount and that nothing is reported.
* **Factory cache** — a factory-cache test confirms that a second build with a different router, with a router after initially omitting one, or omitting a router after initially supplying one throws.
* **Registration** — tests with a router test double confirm that domain and extension registration is presented to the router, that a routed-domain route colliding with another routed domain live in the page is rejected, and that unregistration and terminal disposal send the release notifications; the import-graph guard and architecture review confirm that the runtime derives and validates no routing token.
* **Occupant value** — tests with a router test double confirm that the parent-side copy obtains the value from the router at mount from the domain, the extension, and the enclosing level's value; that the value is set before the lifecycle mount runs; that the extension's own copy obtains it, across two independently loaded copies of the runtime package rather than one shared module graph; and that the value is released with the bridge.
* **No exposure** — tests confirm that no occupant value is observable on the bridge, the inbound bridge link, the mount context, lifecycle arguments, actions, or shared properties; architecture review confirms that no FrontX code passes one to extension or host code.
* **Protocol** — a test confirms that a rendezvous entry carrying an unrecognized version, or a malformed entry, is left untouched: it is neither read, mutated, overwritten nor deleted.
* **Reporting** — tests confirm that each action execution that settles in a domain is reported exactly once, before the chain continues; that the report carries the extensions physically mounted and unmounted during that execution, with an Optional displacement or an Exclusive eviction in that same report; that no internal release, nested host teardown included, produces a report of its own or appears in the parent's report; that an execution that settles without changing any mount is reported once with nothing mounted or unmounted and causes no URL write; that a request for which the domain's strategy never runs reports nothing — for example, an already-mounted request, a joined request, a replaced pending request, and a pending request whose timer fires; that an Exclusive domain's `unmount_ext` is passed straight to the domain's handler outside the occupancy queue and the report, changes nothing, fails, and reports nothing; and that mount and unmount events outside an action execution, such as a slot detach, unregistration, and terminal disposal, send no settled-action report.
* **History intent and schemas** — tests confirm that the history intent reaches the router uninterpreted, that an absent intent means `push`, that a value outside `none`, `replace`, and `push` is rejected, that an undeclared field on a concrete action or its payload is rejected, and that an action derived from the base action schema is admitted.
* **URL ownership** — architecture review confirms that shell, MFE, and host code write no occupancy into the URL, and that every occupancy change in the URL traces to one executed `mount_ext` or `unmount_ext`; entries of nested occupants removed during host teardown are removed by the router itself in the same URL write as the parent action, not by synthetic nested actions; unregistration and terminal disposal write nothing to the URL. Architecture review also confirms that the router applies each report's mounted and unmounted extensions in one URL write with that action's history intent and reads neither the action type nor any cardinality of the domain; and that for a URL transition it sends one `unmount_ext` per removed occupant and one `mount_ext` per added occupant, each its own chain, removals dispatched first, in every domain, without suppressing the effects of its own URL writes.
* **Navigation facade** — tests confirm that the extension-local navigation facade changes only its own occupant's pathname and search parameters, and that neither the facade nor the scoped route hooks expose the router, the occupant value, or raw history.
* **Navigation supply** — a test confirms that the extension's own runtime copy supplies that extension's navigation only from the occupant value assigned to it, and that the router it hands that navigation to reads no other extension's occupant value.

## Pros and Cons of the Options

### Inject an optional abstract router and exchange occupant values through a private rendezvous

The runtime declares an abstract router, takes it optionally through the registry factory's configuration, and hands each occupant value to the extension's own copy of the runtime through a version-namespaced realm-global rendezvous associated with the extension's bridge.

* Good, because occupant values travel on no interface extension or host code can read.
* Good, because the runtime depends only on a contract it declares itself, the same pattern it follows for the type system.
* Good, because the rendezvous reuses a protocol already decided for independently loaded copies, including its back-away behaviour on an unrecognized version.
* Good, because a registry without a router needs nothing new.
* Neutral, because it adds one more realm-global slot to the set the runtime coordinates through.
* Bad, because the rendezvous slot is readable by same-realm code, so the privacy holds at the interface level only.

### Broadcast every occupant's address as a domain-wide shared property

The host computes the address of every routable extension of every domain it projects and broadcasts the map as a shared property each projected domain declares. Every occupant of such a domain receives the property and reads its own entry from it.

* Good, because it uses a channel that exists, with no change to the runtime.
* Bad, because a shared property reaches every occupant of the domain that declares it, so every occupant reads every sibling's address.
* Bad, because the host composes and broadcasts addresses itself, so host code becomes a writer of routing state, outside the one occupancy channel.
* Bad, because every routed domain must declare a property that carries routing state rather than host state, mixing the URL channel into shared-property broadcast.

### Carry a per-occupant value on the mount context or the bridge

The runtime computes each occupant's address at mount and hands it to that occupant on the mount context or as a member of its bridge.

* Good, because each occupant receives only its own value, through a path that crosses the copy boundary reliably.
* Bad, because the mount context and the bridge are both held by extension code, so the value is reachable by the extension itself and by anything it passes them to.
* Bad, because it grows a published contract the extension depends on, the mount context or the child-facing bridge, for state only the router needs.

### Let the runtime import the routing package

The runtime depends on the navigation substrate, composes each occupant's address with the substrate's grammar, and keeps the URL and the mounts in agreement itself.

* Good, because no port indirection is needed and the runtime controls agreement directly.
* Bad, because it breaks the partition `cpt-frontx-adr-core-package-boundaries` fixes, which allows no dependency between the runtime and the routing packages in either direction.
* Bad, because the runtime would carry one routing grammar and could not be composed with any other router.

## More Information

**Relation to other decisions.** The rendezvous follows the protocol of `cpt-frontx-adr-shared-dep-cache-reach` and does not amend it: it occupies a slot of its own, and its entries live with the bridge they are associated with rather than for the realm's lifetime. It is also separate from the mount-context rendezvous decided in `cpt-frontx-adr-action-dispatch-and-chaining`, whose entry is scoped to one synchronous mount window, and it adds nothing to the bridge contracts decided in `cpt-frontx-adr-child-mfe-host-access`. This decision operates within the single occupancy channel of `cpt-frontx-adr-extension-domain-occupancy`: the router is the consumer that record obliges to restore and originate occupancy only through actions chains. The partition-level statement of the router port is recorded in `cpt-frontx-adr-core-package-boundaries`; this record owns the port's obligations and its import-graph guard.

**What stays out of this record.** The abstract router's members, the shape of an occupant value, the realm slot's description, the accessor, and the concrete schema fields belong to the FEATUREs that own the runtime's mounting and the type system's lifecycle schemas (`cpt-frontx-adr-contract-schema-ownership`). The URL grammar belongs to the navigation substrate's own architecture tree (`cpt-frontx-routing-adr-domain-occupancy-addressing-granularity`). The concrete router's orchestration remains template-framework territory. The routing packages expose only the primitives that framework router or MFE route-tree authoring actually consumes; helper layers used solely to implement those primitives remain internal.

**Scope of impact.** Applies to how an extension's occupant value reaches that extension's navigation, to which party admits routed registrations and keeps the URL and the mounts in agreement for routed domains, to how mounting is requested, and to the closure of concrete action schemas. It does not decide the URL grammar, the router's orchestration of nested occupants beyond their release as part of the departing host's action, how a microfrontend bundle is loaded or isolated, or how actions are routed between registries.

**Review trigger.** Revisit if an extension needs its occupant value for a purpose other than navigation; if a confidentiality boundary against same-realm code becomes a requirement; if a router needs, at mount, an input the parent-side runtime does not hold; or if a mount path other than `mount_ext` becomes necessary.

**Checklist applicability.**

* ARCH — applicable and addressed above: this fixes a cross-package contract every routed composition depends on, and a published port with an implementer is costly to reverse.
* ARCH-ADR-008 (supersession) — Not applicable because this is a new decision that supersedes no prior record.
* SEC — applicable and addressed above: occupant values are absent from every interface handed to extension or host code, and the realm slot and raw URL remain readable by same-realm code, which is accepted as an interface-level guarantee rather than a confidentiality boundary.
* INT — applicable: the abstract router is the integration contract between the runtime and the template framework, and the runtime's public additions are optional; closing concrete action schemas tightens what every sender may put in an action. Breaking-change policy for the runtime's surface is governed by `cpt-frontx-interface-mfe-runtime`.
* REL — applicable in one narrow respect: a registry without a router, and a copy that backs away from an unrecognized rendezvous version, both leave mounting working with no occupant value crossing.
* MAINT — applicable: the router contract evolves across two packages released on their own lines, as recorded under Consequences.
* TEST — applicable and addressed under Confirmation, including a test across two independently loaded copies of the runtime package.
* PERF — Not applicable because the decision adds one rendezvous association and one report per settled `mount_ext` or `unmount_ext` execution and sets no throughput or latency target.
* DATA — Not applicable because no persistent store is involved; occupant values live with the bridge they are associated with.
* OPS — Not applicable because no deployed-service procedure is governed by this decision.
* COMPL — Not applicable because no regulated or personal data is involved.
* UX — Not applicable because the decision governs who writes the URL, not how navigation looks to an end user.
* BIZ — Not applicable because this is an internal architecture decision; product requirements are cited by ID below.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-nfr-security` — a microfrontend receives no other occupant's address through any FrontX interface, in line with the access posture that grants a microfrontend nothing beyond what its domain grants; the realm-slot and URL limitation is recorded as accepted.
* `cpt-frontx-interface-mfe-runtime` — the runtime's public surface grows by one optional configuration field carrying the abstract router and one optional property on each of `mount_ext` and `unmount_ext`, both backward-compatible.
* `cpt-frontx-component-mfe-runtime` — this decision shapes how the MFE Runtime obtains, hands over, and releases occupant values, how it presents registrations to the router, and how it reports settled `mount_ext` and `unmount_ext` executions together with the extensions physically mounted and unmounted during each.
* `cpt-frontx-fr-mfe-host-communication` — mounting, restoration and opening included, is requested only through `mount_ext` sent as actions chains, the addressed channel this requirement describes.
* `cpt-frontx-principle-agnostic-core` — the runtime depends on a router contract it declares itself and carries no routing grammar.
* `cpt-frontx-constraint-mfes-cross-nesting-reachability` — the occupant-value rendezvous adds no capability method to the registry or to either bridge.
* `cpt-frontx-constraint-mfes-recursive-chain-execution` — reports are made inside the domain's handler path, so chain execution records and reports nothing.
* `cpt-frontx-fr-gts-default-infrastructure-types` — the ecosystem's lifecycle action schemas are closed, and `mount_ext` and `unmount_ext` declare the history intent.
* `cpt-frontx-routing-fr-route-ownership-signal` — names the consumer that requirement leaves two-way agreement to: the injected router, for every routed domain.
* `cpt-frontx-routing-fr-engine-provider-port` — the address an occupant's navigation is built from reaches the injected router as the occupant value, never through extension code.
* `cpt-frontx-routing-nfr-standalone` — the navigation substrate invokes no mount; the router reaches mounts only by executing actions.
* `cpt-frontx-routing-usecase-deep-link-to-microfrontend-screen` — a deep link, reload or history step reaches the mounts through actions chains the router sends.
* `cpt-frontx-adr-core-package-boundaries` — records the router port at partition level and assigns its obligations and import-graph guard to this decision.
* `cpt-frontx-adr-shared-dep-cache-reach` — supplies the version-namespaced rendezvous protocol this decision follows.
* `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity` — owns the URL grammar and entry structure the router this decision injects reads and writes; this decision fixes who reaches the router and through what channel, not the grammar itself.
