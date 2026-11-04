---
status: accepted
date: 2026-10-01
decision-makers: German Bartenev
description: Architecture decision that the routing package resolves at observer creation, reports every transition and writes through the back-projection helper, leaving occupancy changes to executed actions chains.
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
  - [Resolve at observer creation, report every transition, write through the back-projection helper](#resolve-at-observer-creation-report-every-transition-write-through-the-back-projection-helper)
  - [Carry mount intent in the transition report](#carry-mount-intent-in-the-transition-report)
  - [Notify a runtime-side listener of the extensions a URL change removed and added](#notify-a-runtime-side-listener-of-the-extensions-a-url-change-removed-and-added)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-routing-adr-mount-trigger-ownership`

## Context and Problem Statement

Which channel may change occupancy is an ecosystem-wide rule, and it is decided at ecosystem altitude by `cpt-frontx-adr-extension-domain-occupancy`, the record that owns the occupancy model itself: every mount and unmount reaches a domain only through the runtime's actions-chains mediator (`cpt-frontx-adr-action-dispatch-and-chaining`), as an executed `mount_ext` or `unmount_ext`, and a navigation act never mounts or unmounts anything directly. A cold load, a reload, and a back or forward step are translated by the FrontX router into the same actions chains, and restoration chains carry the history intent `none`. That rule is the given here, not this record's to make.

What it leaves open is a narrower, member-level question this record settles: given that rule, and given that this package holds the concrete FrontX router (`cpt-frontx-adr-extension-routing-port`), what is this package permitted to do about mount triggers? `cpt-frontx-routing-principle-publishes-not-orchestrates` keeps any model of who may occupy a placement, how many occupants it admits, and how a race between two mounts resolves out of this package. The open part is the shape of this package's navigation-derived surface — what it resolves, what it reports, and what it writes — and what the FrontX router may send from it, so that the FrontX router can trigger the runtime's actions chains without this package acquiring an occupancy model of its own, and so that a cold load, a reload, and a back or forward step each land in the right state.

Two properties of this package make the question non-trivial. A `NavigationHistory` instance is realm-global, and its `location` and subscriber notification expose every subscriber the browser's full current URL — path, search, and hash together, not scoped to any one domain's own entries (`cpt-frontx-routing-principle-single-history-authority`). And a cold load has no dispatch history to replay at all, so at that one moment the address bar is the only thing that can say what should be occupied.

## Decision Drivers

* The ecosystem rule is the given — `cpt-frontx-adr-extension-domain-occupancy` decides that every occupancy change, restoration included, is an executed action. This record decides only this package's own surface and its FrontX router's mount triggers under that rule, and must not restate the rule as its own decision.
* No occupancy model in this package — `cpt-frontx-routing-principle-publishes-not-orchestrates` forbids this package from holding an occupancy model; whatever this record settles must not force it to hold one anyway just to keep the URL and the mounted set honest.
* Triggering chains, not treating actions — the FrontX router may trigger `mount_ext` and `unmount_ext` actions chains, but it must not know anything about an action's delivery, its execution state or its outcome; it reaches the runtime only through the abstract actions-chain executor and type system this package declares, which the runtime hands it, and it hardcodes no GTS id or type (`cpt-frontx-adr-extension-routing-port`).
* Deep-link, reload, and restoration correctness — a cold load or reload has nothing to replay, so resolution from the address bar must run once at observer creation. A back or forward step carries no new intent either, so each affected domain must re-resolve and the FrontX router must be able to restore the mounts through actions chains that add no history entry.
* Cross-runtime isolation despite a realm-global history — the shared `NavigationHistory` fan-out is visible to every subscriber regardless of which runtime it belongs to, so no runtime should need to read another domain's own entries to react correctly to its own. `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity` addresses this structurally: because a domain resolves only the entries whose own domain key is its own, a domain does not depend on navigation's silence to stay out of another domain's entries.

## Considered Options

* **Resolve at observer creation, report every transition, write through the back-projection helper** — the package's navigation-derived surface offers exactly three things and no fourth: resolution of the already-current location once, at observer creation, which is what a cold load and a reload need; a transition report on every subsequent ownership-relevant navigation, describing what the URL says about one domain, from which the FrontX router sends, for a page load or a back or forward step only, the `mount_ext` and `unmount_ext` actions chains through the actions-chain executor the runtime hands it, leaving every mount and unmount itself to the runtime that executes them; and a URL back-projection helper the FrontX router calls to write into the URL the extensions the runtime commands per domain (`cpt-frontx-adr-extension-routing-port`, "Commanding the URL"). No part of the surface mounts anything, and the FrontX router's chains carry no occupancy decision: what each request does is decided by the domain's handler.
* **Carry mount intent in the transition report** — the report states what should be mounted rather than what the URL says, and the FrontX router turns each report into a mount.
* **Notify a runtime-side listener of the extensions a URL change removed and added** — the FrontX router reports, to a listener the runtime registers with it, which extensions a page load or a back or forward step removed from and added to a domain, and the runtime builds and sends the `mount_ext` and `unmount_ext` chains itself.

## Decision Outcome

Chosen option: **resolve at observer creation, report every transition, write through the back-projection helper**, because it gives the FrontX router everything a deep link, a reload, and a back or forward step need while leaving the ecosystem's occupancy write authority exactly where `cpt-frontx-adr-extension-domain-occupancy` puts it, and it does so without a second flow from the FrontX router back to the runtime.

The three parts of that surface map onto the three things the FrontX router actually faces. On a cold load or reload there is nothing to replay, so resolution runs once against the already-current location and the FrontX router turns what it finds into `mount_ext` chains carrying the history intent `none` — the one moment at which the address bar alone says what should be occupied; the FrontX router then clears the URL's entries once those chains are sent, and the runtime's commands fill it again; the initial route stays captured until the first `push` command or back/forward step, and a domain, root or nested, whose observer starts while the initial route is kept resolves against it (`cpt-frontx-adr-extension-routing-port`, URL ownership; `cpt-frontx-feature-routing-route-ownership-signal`, Binding obligation, point 9). Afterwards, a back or forward step is a restoration: this package reports the diff at each affected domain, and the FrontX router turns it into `mount_ext` and `unmount_ext` chains carrying `none`, so the mounts change without a new history entry. And the extensions the runtime commands per domain are written through the back-projection helper (`cpt-frontx-adr-extension-routing-port`, "Commanding the URL"), which is what keeps every reachable history entry's projected state one the runtime commanded — the premise that makes restoration safe, since there is then no state a back step can land on whose occupancy no command produced.

A page load can also reach a projected state no history entry produced: a deep link or an address the user enters. It arrives as the observer's initial resolution and takes the same path. The report this package emits for such a state is only a report, and the FrontX router reaches any mount or unmount it implies only through `mount_ext` and `unmount_ext` chains — never by mounting directly off the observed signal. One path serves every change arriving as `initial` or `history`; this record states it because it constrains how the surface is wired, while the rule it serves belongs to the root record.

**What this package may do about mount triggers.** This package's router triggers the `mount_ext` and `unmount_ext` actions chains for a page load and for a back or forward step itself, sending them through the actions-chain executor this package declares and the runtime hands it, and taking the two action type ids only from the type system this package declares, so it is specific to the shape of those two actions but not to their GTS description. These are the same chains for both: removals first, `unmount_ext` only to a domain that declares it, each its own chain with the history intent `none` and no `fallback`. The FrontX router is not permitted to mount or unmount directly, to send a chain for a written navigation, to read an action's delivery, its execution state or its outcome, or to hold any model of what a domain admits — its strategy, its cardinality, or its queue.

The obligations this places on the FrontX router are carried by this member's own DESIGN, `cpt-frontx-routing-design-routing` (Obligations On The FrontX Router) — O5 (Writing exactly what the runtime commands) and O6 (every URL-driven change becomes an actions chain) — not restated as a second normative copy here.

### Consequences

* Good, because this package decides and performs no occupancy change: its surface resolves, reports, and writes, and its FrontX router turns a user's change to the URL into actions chains whose effect the domain's handler alone decides.
* Good, because a cold load and a reload resolve correctly from the address bar without that one authoritative moment leaking into the rest of the application's lifetime.
* Good, because restoration needs no extra machinery: each affected domain re-resolves, and the FrontX router restores the mounts through the same actions chains every other occupancy change uses.
* Good, because every change arriving as `initial` or `history` — a cold load, a restoration, or an address the user enters — reaches the mounts through one path, so no case is left for the FrontX router to improvise.
* Neutral, because the realm-global fan-out remains visible to every subscriber; what keeps a domain out of another domain's entries is the domain-key scoping of `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity`, not this record.
* Bad, because the FrontX router must write what the runtime commands through the back-projection helper, rather than getting URL writing for free from navigation.
* Bad, because the history intent becomes load-bearing: the FrontX router must mark every chain that restores a state the URL already carries with `none`, and a chain marked otherwise writes a history entry the user did not ask for.
* Bad, and accepted: this package becomes specific to the shape of the `mount_ext` and `unmount_ext` actions, and so to applications built on FrontX's microfrontend design, the only setting in which it has a use.

### Confirmation

Architecture review confirms this package's navigation-derived surface exposes resolution at observer creation, a transition report, and the URL back-projection helper: the signal and the helper mount nothing, and the FrontX router acts only through actions chains. Code review confirms the FrontX router wires no transition report directly to a mount call: every mount or unmount it derives from a change arriving as `initial` or `history` — at a cold load, a reload, a back or forward step, or an address the user enters — is a `mount_ext` or `unmount_ext` chain sent through the actions-chain executor the runtime hands it, restoration chains carry the history intent `none`, and the extensions the runtime commands per domain are written through the back-projection helper. Code review also confirms that the FrontX router hardcodes no GTS id or type, sends no chain for a written navigation, and reads no delivery, execution state or outcome of a chain.

The cold-load path is confirmed by `cpt-frontx-routing-seq-deep-link-cold-mount`, whose diagram shows resolution running once at observer creation from an already-current location followed by `mount_ext` chains carrying `none`, and whose back/forward fan-out ("report its own diff, if ownership-relevant") is the restoration path.

## Pros and Cons of the Options

### Resolve at observer creation, report every transition, write through the back-projection helper

Three parts, each answering one of the three situations the FrontX router faces: resolution once at observer creation for a cold load or reload, a transition report for every subsequent ownership-relevant navigation, from which the FrontX router sends the actions chains of a page load or a back or forward step, and a back-projection helper for writing the runtime's commands.

* Good, because each part is a publication act, so no part of the surface can become an occupancy-decision channel however the FrontX router wires it.
* Good, because the report is the same shape whether the navigation restores or arrives at an unrecognized state, so this package needs no notion of which it is — and therefore no occupancy model to tell them apart.
* Good, because the back-projection helper keeps the address bar a faithful reflection, which is what makes a later restoration replay something real.
* Neutral, because it requires the FrontX router to call the helper for every command of the runtime.
* Bad, because the FrontX router must combine three parts rather than consume one uniform driver.

### Carry mount intent in the transition report

The report states what should be mounted, and the FrontX router mounts from each report.

* Good, because there is exactly one thing for the FrontX router to wire and no situations to tell apart.
* Bad, because the report becomes an occupancy decision, which `cpt-frontx-routing-principle-publishes-not-orchestrates` forbids this package from making and `cpt-frontx-adr-extension-domain-occupancy` assigns to the runtime.
* Bad, because deciding what to mount requires knowing what may occupy a placement and how many occupants it admits — an occupancy model this package would have to hold a copy of.
* Bad, because every runtime's mount decision depends on the one realm-global fan-out every other runtime also subscribes to, which makes the address bar a cross-runtime control channel (`cpt-frontx-routing-principle-single-history-authority`).

### Notify a runtime-side listener of the extensions a URL change removed and added

Rejected; its pros and cons are recorded in `cpt-frontx-adr-extension-routing-port` (Notify a runtime-side listener of the extensions a URL change removed and added).

## More Information

Diagram note: this decision is a comparison of three options — the three-part publication surface against two rejected alternatives, a report carrying mount intent and a runtime-side listener — matching the shape this repository's own root ADRs already use for a decision of this kind (`cpt-frontx-adr-core-package-boundaries`, `cpt-frontx-adr-extension-domain-occupancy`), both recorded in prose and comparison tables with no diagram. No diagram is included here for the same reason.

**Scope of impact.** Governs the shape of this package's own navigation-derived surface — what it resolves, what it reports, what it writes — and what the FrontX router may do about mount triggers from it without acquiring a second occupancy-decision channel. It does not decide which channel may change occupancy, which `cpt-frontx-adr-extension-domain-occupancy` decides at ecosystem altitude, nor the mount strategies and cardinality matrix that record also owns, nor the actions-chains dispatch and chaining mechanism itself (`cpt-frontx-adr-action-dispatch-and-chaining`), nor the abstract router, the FrontX router's placement and abstract dependencies, the runtime's URL command, and the history intent (`cpt-frontx-adr-extension-routing-port`), nor the entry grammar the URL back-projection helper writes (`cpt-frontx-routing-adr-domain-occupancy-addressing-granularity`).

**Review trigger.** Revisit if this package is asked to expose a surface that says what to mount rather than what the URL says, or if its FrontX router is asked to send chains for anything other than a page load or a back or forward step, or to read an action's delivery, execution state or outcome — each of which would put an occupancy model inside this package. A change to which channel may change occupancy is not a trigger for this record; it is a trigger for `cpt-frontx-adr-extension-domain-occupancy`.

**Checklist applicability.**

* ARCH — applicable and addressed above (the shape of the surface the FrontX router triggers the runtime's actions chains from).
* ARCH-ADR-008 (supersession) — Not applicable because this is a new decision that supersedes no prior record.
* SEC — Not applicable because this decision introduces no secret, credential, or authorization concern.
* PERF — Not applicable because the shape of a publication surface is a correctness and coupling decision, not a throughput or latency target.
* REL — Not applicable because it governs coordination shape, not runtime availability or fault tolerance.
* DATA — Not applicable because no persistent data store or schema is involved.
* INT — applicable: the FrontX router sends its chains only through the actions-chain executor and type system this package declares and the runtime satisfies, and how it may wire the three-part surface is part of what the FrontX router must conform to.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.
* MAINT — applicable: keeping the surface purely publishing, and the FrontX router free of any occupancy model, bounds the blast radius of a future occupancy-model change to the runtime, never to this package.
* TEST — applicable and addressed under Confirmation: architecture and code review of the surface and of the FrontX router's chains, and the cold-load sequence.
* COMPL — Not applicable because no regulated or personal data is involved.
* UX — applicable in one narrow respect: a cold load, a reload, and a back or forward step land in the state the URL shows, and the chains that restore it add no history entry.
* BIZ — Not applicable because this is an internal architecture decision; product requirements are cited by ID below.

## Traceability

- **PRD**: [../PRD.md](../PRD.md)
- **DESIGN**: [../DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-routing-principle-publishes-not-orchestrates` — the principle this surface shape realizes: three publication acts, and a router that triggers actions chains while holding no occupancy model.
* `cpt-frontx-routing-principle-single-history-authority` — names the realm-global visibility that makes a report-only surface necessary rather than merely tidy.
* `cpt-frontx-routing-fr-route-ownership-signal` — the signal whose surface this decision shapes: cold-load resolution, transition reporting, and writing of the runtime's commands.
* `cpt-frontx-routing-seq-deep-link-cold-mount` — the sequence whose cold-load resolution and back/forward fan-out this decision leaves as, respectively, the resolution path and the restoration path, each reaching the mounts through `mount_ext` chains.
* `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity` — owns the entry grammar the back-projection helper writes, and the domain-key scoping that keeps a domain out of another domain's entries.
* `cpt-frontx-adr-extension-domain-occupancy` — the ecosystem record that decides every occupancy change, restoration included, is an executed action, and which this record's surface is shaped to serve rather than to duplicate.
* `cpt-frontx-adr-action-dispatch-and-chaining` — the mechanism every mount and unmount the FrontX router derives from the URL is sent through.
* `cpt-frontx-adr-extension-routing-port` — places the concrete router in this package, records its abstract actions-chain executor and type system, and owns its obligations to turn URL-driven changes into actions chains and to write what the runtime commands into the URL.
