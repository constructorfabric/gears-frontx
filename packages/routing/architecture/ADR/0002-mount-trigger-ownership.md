---
status: proposed
date: 2026-10-01
decision-makers: German Bartenev
---

# Navigation's Role In Post-Boot Mounting

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Resolve at observer creation, report every transition, reflect through the back-projection helper](#resolve-at-observer-creation-report-every-transition-reflect-through-the-back-projection-helper)
  - [Carry mount intent in the transition report](#carry-mount-intent-in-the-transition-report)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-routing-adr-mount-trigger-ownership`

## Context and Problem Statement

Which channel may change occupancy is an ecosystem-wide rule, and it is decided at ecosystem altitude by `cpt-frontx-adr-extension-domain-occupancy`, the record that owns the occupancy model itself: every mount and unmount reaches a domain only through the runtime's actions-chains mediator (`cpt-frontx-adr-action-dispatch-and-chaining`), as an executed `mount_ext` or `unmount_ext`, and a navigation act never mounts or unmounts anything directly. A cold load, a reload, and a back or forward step are translated by the injected router into the same action chains, and restoration chains carry the history intent `none`. That rule is the given here, not this record's to make.

What it leaves open is a narrower, member-level question this record settles: given that rule, what is this package's own navigation-derived surface permitted to do? `cpt-frontx-routing-principle-publishes-not-orchestrates` already states that Route Ownership Signal publishes ownership transitions and never orchestrates mounting itself. The open part is the shape of that surface — what it resolves, what it reports, and what it reflects — so that the framework router, the router the template framework provides to implement the runtime's router port (`cpt-frontx-adr-extension-routing-port`), can drive the runtime's action chains from it without this package acquiring an occupancy model of its own, and so that a cold load, a reload, and a back or forward step each still land in the right state.

Two properties of this package make the question non-trivial. A `NavigationHistory` instance is realm-global, and its `location` and subscriber notification expose every subscriber the browser's full current URL — path, search, and hash together, not scoped to any one domain's own entries (`cpt-frontx-routing-principle-single-history-authority`). And a cold load has no dispatch history to replay at all, so at that one moment the address bar is the only thing that can say what should be occupied.

## Decision Drivers

* The ecosystem rule is the given — `cpt-frontx-adr-extension-domain-occupancy` decides that every occupancy change, restoration included, is an executed action. This record decides only this package's own surface under that rule, and must not restate the rule as its own decision.
* Publishes, does not orchestrate — `cpt-frontx-routing-principle-publishes-not-orchestrates` forbids this package from holding an occupancy model; whatever surface this record settles must not force it to hold one anyway just to keep the URL and the mounted set honest.
* Deep-link, reload, and restoration correctness — a cold load or reload has nothing to replay, so resolution from the address bar must still run once at observer creation. A back or forward step, or any navigation moving the location to a state a history entry already represents, carries no new intent either, so each affected domain must re-resolve and the framework router must be able to restore the mounts through action chains that add no history entry.
* Cross-runtime isolation despite a realm-global history — the shared `NavigationHistory` fan-out is visible to every subscriber regardless of which runtime it belongs to, so no runtime should need to read another domain's own entries to react correctly to its own. `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity` addresses this structurally: because a domain resolves only the entries whose own domain key is its own, a domain does not depend on navigation's silence to stay out of another domain's entries.

## Considered Options

* **Resolve at observer creation, report every transition, reflect through the back-projection helper** — the package's navigation-derived surface offers exactly three things and no fourth: resolution of the already-current location once, at observer creation, which is what a cold load and a reload need; a transition report on every subsequent ownership-relevant navigation, describing what the URL says about one domain, with every resulting mount or unmount left to the framework router, which reaches them only through action chains; and a URL back-projection helper the framework router calls to reflect each settled action into the URL. No part of the surface mounts anything or tells anyone to mount anything.
* **Carry mount intent in the transition report** — the report describes not what the URL says but what should be mounted, so the framework router wires the report straight into a mount for the application's whole lifetime, with no distinction between a state an executed action produced and one the address bar arrived at on its own.

## Decision Outcome

Chosen option: **resolve at observer creation, report every transition, reflect through the back-projection helper**, because it is the only option that gives the framework router everything a deep link, a reload, and a back or forward step need while leaving the ecosystem's occupancy write authority exactly where `cpt-frontx-adr-extension-domain-occupancy` puts it.

The three parts of that surface map onto the three things the framework router actually faces. On a cold load or reload there is nothing to replay, so resolution runs once against the already-current location and the framework router turns what it finds into `mount_ext` chains carrying the history intent `none` — the one moment at which the address bar alone says what should be occupied. Afterwards, a navigation reaching a state a history entry already represents is a restoration: this package reports the diff at each affected domain, and the framework router turns it into `mount_ext` and `unmount_ext` chains carrying `none`, so the mounts change without a new history write. And every `mount_ext` or `unmount_ext` the runtime reports as settled is reflected back through the back-projection helper, which is what keeps every reachable history entry's projected state one an executed action produced — the premise that makes restoration safe, since there is then no state a back step can land on whose occupancy no action produced.

A navigation can also reach a projected state no history entry produced: a post-boot deep link, a hand-edited address bar entry, or a third-party in-tab navigation. It takes the same path. The report this package emits for such a state is still only a report, and the framework router reaches any mount or unmount it implies only through `mount_ext` and `unmount_ext` chains — never by mounting directly off the observed signal. One path serves every URL-driven change; this record states it because it constrains how the surface is wired, while the rule it serves belongs to the root record.

The obligations this places on the framework router are carried by this member's own DESIGN — O5 (reflection of every settled action) and O6 (every URL-driven change becomes an action chain) in [../DESIGN.md](../DESIGN.md) §2.3 — not restated as a second normative copy here.

### Consequences

* Good, because this package's surface stays a publication surface: it resolves, reports, and reflects, and at no point decides or performs an occupancy change.
* Good, because a cold load and a reload resolve correctly from the address bar without that one authoritative moment leaking into the rest of the application's lifetime.
* Good, because restoration needs no extra machinery: each affected domain re-resolves, and the framework router restores the mounts through the same action chains every other occupancy change uses.
* Good, because every URL-driven change — a cold load, a restoration, or an address no history entry produced — reaches the mounts through one path, so no case is left for the framework router to improvise.
* Neutral, because the realm-global fan-out remains visible to every subscriber; what keeps a domain out of another domain's entries is the domain-key scoping of `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity`, not this record.
* Bad, because the framework router must reflect every settled action through the back-projection helper, rather than getting URL reflection for free from navigation.
* Bad, because the history intent becomes load-bearing: the framework router must mark every chain that restores a state the URL already carries with `none`, and a chain marked otherwise writes a history entry the user did not ask for.

### Confirmation

Architecture review confirms this package's public surface exposes resolution at observer creation, a transition report, and the URL back-projection helper, and exposes nothing that mounts or instructs a mount. Code review confirms the framework router wires no transition report directly to a mount call: every mount or unmount it derives from the URL — at a cold load, a reload, a back or forward step, or an address no history entry produced — is a `mount_ext` or `unmount_ext` chain, restoration chains carry the history intent `none`, and every settled action the runtime reports is reflected through the back-projection helper.

The cold-load path is confirmed by `cpt-frontx-routing-seq-deep-link-cold-mount`, whose diagram shows resolution running once at observer creation from an already-current location followed by `mount_ext` chains carrying `none`, and whose back/forward fan-out ("report its own diff, if ownership-relevant") is the restoration path.

## Pros and Cons of the Options

### Resolve at observer creation, report every transition, reflect through the back-projection helper

Three parts, each answering one of the three situations the framework router faces: resolution once at observer creation for a cold load or reload, a transition report for every subsequent ownership-relevant navigation, and a back-projection helper for reflecting each settled action.

* Good, because each part is a publication act, so no part of the surface can become an occupancy-decision channel however the framework router wires it.
* Good, because the report is the same shape whether the navigation restores or arrives at an unrecognized state, so this package needs no notion of which it is — and therefore no occupancy model to tell them apart.
* Good, because the back-projection helper keeps the address bar a faithful reflection, which is what makes a later restoration replay something real.
* Neutral, because it requires the framework router to call the helper for every settled action.
* Bad, because the framework router must combine three parts rather than consume one uniform driver.

### Carry mount intent in the transition report

The report states what should be mounted, and the framework router wires it into a mount for the whole lifetime of the application.

* Good, because there is exactly one thing for the framework router to wire and no situations to tell apart.
* Bad, because the report becomes an occupancy decision, which `cpt-frontx-routing-principle-publishes-not-orchestrates` forbids this package from making and `cpt-frontx-adr-extension-domain-occupancy` assigns to the runtime.
* Bad, because deciding what to mount requires knowing what may occupy a placement and how many occupants it admits — an occupancy model this package would have to hold a copy of.
* Bad, because every runtime's mount decision would then hang off the one realm-global fan-out every other runtime also subscribes to, making the address bar a cross-runtime control channel (`cpt-frontx-routing-principle-single-history-authority`).

## More Information

Diagram note: this decision is a single binary comparison — the three-part publication surface against the one rejected alternative of a report carrying mount intent — matching the shape this repository's own root ADRs already use for a decision of this kind (`cpt-frontx-adr-core-package-boundaries`, `cpt-frontx-adr-extension-domain-occupancy`), both recorded in prose and comparison tables with no diagram. No diagram is included here for the same reason.

**Scope of impact.** Governs the shape of this package's own navigation-derived surface — what it resolves, what it reports, what it reflects — and how the framework router wires that surface without acquiring a second occupancy-decision channel. It does not decide which channel may change occupancy, which `cpt-frontx-adr-extension-domain-occupancy` decides at ecosystem altitude, nor the mount strategies and cardinality matrix that record also owns, nor the actions-chains dispatch and chaining mechanism itself (`cpt-frontx-adr-action-dispatch-and-chaining`), nor the router port, the settled-action report, and the history intent (`cpt-frontx-adr-extension-routing-port`), nor the entry grammar the URL back-projection helper writes (`cpt-frontx-routing-adr-domain-occupancy-addressing-granularity`).

**Review trigger.** Revisit if this package is asked to expose anything the framework router could wire as a mount instruction — a surface that says what to mount rather than what the URL says — which would put an occupancy model back inside this package. A change to which channel may change occupancy is not a trigger for this record; it is a trigger for `cpt-frontx-adr-extension-domain-occupancy`.

**Checklist applicability.**

* ARCH — applicable and addressed above (the shape of the public surface the framework router wires the runtime's action chains against).
* SEC — Not applicable because this decision introduces no secret, credential, or authorization concern.
* PERF — Not applicable because the shape of a publication surface is a correctness and coupling decision, not a throughput or latency target.
* REL — Not applicable because it governs coordination shape, not runtime availability or fault tolerance.
* DATA — Not applicable because no persistent data store or schema is involved.
* INT — applicable: the three-part surface is what the framework router integrates against, and how it may be wired is part of what the framework router must conform to.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.
* MAINT — applicable: keeping the surface purely publishing bounds the blast radius of a future occupancy-model change to the runtime, never to this package.

## Traceability

- **PRD**: [../PRD.md](../PRD.md)
- **DESIGN**: [../DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-routing-principle-publishes-not-orchestrates` — the principle this surface shape realizes: three publication acts and nothing the framework router can mistake for an instruction to mount.
* `cpt-frontx-routing-principle-single-history-authority` — names the realm-global visibility that makes a report-only surface necessary rather than merely tidy.
* `cpt-frontx-routing-fr-route-ownership-signal` — the signal whose surface this decision shapes: cold-load resolution, transition reporting, and reflection of each settled action.
* `cpt-frontx-routing-seq-deep-link-cold-mount` — the sequence whose cold-load resolution and back/forward fan-out this decision leaves as, respectively, the resolution path and the restoration path, each reaching the mounts through `mount_ext` chains.
* `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity` — owns the entry grammar the back-projection helper writes, and the domain-key scoping that keeps a domain out of another domain's entries.
* `cpt-frontx-adr-extension-domain-occupancy` — the ecosystem record that decides every occupancy change, restoration included, is an executed action, and which this record's surface is shaped to serve rather than to duplicate.
* `cpt-frontx-adr-action-dispatch-and-chaining` — the mechanism every mount and unmount the framework router derives from the URL is sent through.
* `cpt-frontx-adr-extension-routing-port` — names the framework router that consumes this surface, and owns its obligations to turn URL-driven changes into action chains and to reflect every settled action into the URL.
