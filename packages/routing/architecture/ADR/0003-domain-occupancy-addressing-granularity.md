---
status: accepted
date: 2026-10-01
decision-makers: German Bartenev, G S
description: Architecture decision that every domain, at any depth and occupant count, is addressed by one uniform URL entry grammar in the query string.
---

# Domain Occupancy Addressing Granularity

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Occupant Identity Lexical Rule](#occupant-identity-lexical-rule)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [One uniform entry grammar for every domain](#one-uniform-entry-grammar-for-every-domain)
  - [Three separate mechanisms — axial pathname, single-entry parallel axis, bolted-on compound-key mode](#three-separate-mechanisms--axial-pathname-single-entry-parallel-axis-bolted-on-compound-key-mode)
  - [Compound key with a double-colon boundary delimiter and percent-encoded nested parameters](#compound-key-with-a-double-colon-boundary-delimiter-and-percent-encoded-nested-parameters)
  - [Pluggable URL codec over one internal model](#pluggable-url-codec-over-one-internal-model)
  - [Value-nested subtree encoding](#value-nested-subtree-encoding)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity`

## Context and Problem Statement

Domain occupancy addressing must express three concerns at once: hierarchy (how a nested domain's own position in the tree is named), occupancy fan-out (how more than one occupant of one domain is distinguished), and per-occupant parameters (how an occupant's own state is encoded). One option governs all three through three separate, independently specialized mechanisms. Hierarchy is expressed by continuing the pathname, but only one domain per zone is permitted to do so: the *axial* domain. Occupancy fan-out across sibling domains is expressed by a dedicated query-string key per domain, capped at exactly one entry — a *parallel axis*. Per-occupant parameters are encoded two different ways depending on which of the first two mechanisms an occupant's domain uses: matrix-params-shaped bare query keys for an axial or single-occupant parallel domain, and nested percent-encoded values for a compound-keyed one. That trichotomy has no room for projecting more than one occupant of one domain without a fourth, bolted-on mode composing keys alongside the single-entry parallel axis. Should hierarchy, occupancy fan-out, and per-occupant parameters be governed by three separate, independently specialized mechanisms — axial pathname continuation, a single-entry parallel-axis query key, and a bolted-on compound-key mode reserved for the multi-occupant case — or should all three be expressed as outputs of one uniform entry grammar?

## Decision Drivers

* Closing the addressing gap at its root, not with another special case — a model of three mechanisms has no room for more than one occupant of one domain; adding a fourth mode to it treats the symptom, not the trichotomy that produces it.
* One encoding for every occupant's own parameters — matrix-params for an axial occupant and nested percent-encoded values for a compound-keyed one is two rules for the identical concern, and a namespace collision this split invites.
* No privileged domain per zone — "at most one axial domain per zone" is a constraint with no principled basis beyond needing someone to own the pathname, and every mechanism built on top of it inherits that arbitrariness.
* Uniform resolution across depth and occupant count — resolution runs per domain and independently at every level, reading only the entries carrying that level's own domain key (`cpt-frontx-routing-design-routing`, A tree of domains, resolved level by level); the addressing mechanism should not fork into three cases the resolution primitive underneath never needs.
* Legibility and the shell's ownership of its subroute — a grammar that expresses every domain's occupancy in the query string keeps occupancy out of the pathname, keeps the pathname as the shell's subroute, and keeps every parameter's value readable in place rather than nested inside a second layer of encoding.

## Considered Options

* **One uniform entry grammar for every domain** — every domain in the tree, any depth, any occupant count, sibling or nested, is addressed by one construct: the query string carries one entry per occupant — `domain-key=extension;param;param=value;...` — with `domain-key` always a single `name`, the domain's own declared route value, at any depth, unique among the routed domains live in the page at once and checked at registration; a repeated domain key expresses multiplicity; the pathname carries no occupancy information at all and is the shell's subroute.
* **Three separate mechanisms — axial pathname, single-entry parallel axis, bolted-on compound-key mode**: hierarchy through pathname continuation for one privileged domain per zone, occupancy fan-out through a capped single-entry query key for every other domain, and a fourth, bolted-on compound-key mode admitted only once a domain's occupancy strategy holds several occupants at once.
* **Compound key with a double-colon boundary delimiter and percent-encoded nested parameters** — every occupant is addressed by a single query-string key composed of a dotted domain-path, a fixed double-colon boundary delimiter, and an occupant-identity segment, with that occupant's own parameters percent-encoded into the key's own value as a nested string.
* **Pluggable URL codec over one internal model** — the mechanism resolves to one internal occupancy model as decided below, but the query-string serialization itself is a consumer-selectable codec, with the flat entry grammar this record adopts shipped only as the default a consumer may swap for another.
* **Value-nested subtree encoding** — one query-string key per top-level domain, whose own value recursively encodes that domain's entire subtree — nested domains, their own occupants, and those occupants' own parameters — in a rison/URLON-shaped nested serialization, rather than one entry per occupant at every depth.

## Decision Outcome

Chosen option: **one uniform entry grammar for every domain**, because it is the only option that closes the addressing gap by construction rather than by addition, while keeping occupancy out of the pathname, which stays the shell's subroute, and giving every occupant's own parameters one readable encoding. Under this mechanism, a domain with one occupant and a domain with several are not two cases requiring two rules — a domain with N occupants simply contributes N entries sharing its own domain key, with zero special-casing between "one occupant" and "several." Hierarchy is expressed by domain-key naming alone, never by pathname segment nesting, so no domain needs to be privileged for a zone to nest correctly, and no domain lives in the pathname at all: a domain key is a single `name` — the domain's own declared route value — at any depth, with no ancestor chain of any kind, so a nested domain's own key is exactly as short as a root domain's own key. An extension domain needs its own unique domain instance to be addressable, so a domain's own route value is unique among the routed domains live in the page at once; a host MFE can be live twice only when it is given a distinct domain instance of its own, and distinct domain instances carry distinct route values of their own, so nothing about addressing is lost by keeping every domain key this short — uniqueness is checked privately at registration, and a duplicate registration is rejected. Every occupant's own parameters live inside its own entry as matrix-style `;key=value` pairs, uniformly — never a second, nested encoding chosen by which mechanism the occupant's domain happens to use — which closes the namespace-collision problem for every domain. The pathname carries nothing this library's domain-occupancy resolution model reads or writes: it is the shell's subroute, which the shell reads and changes, and nothing outside it; this package never reads or writes it for occupancy purposes, and its own resolution primitive never treats any pathname segment as a declared prefix. Occupancy lives only in the query string, under domain keys.

In outline, the query string carries one `domain-key=extension;param;param=value` construct per occupant, keyed by its domain's route; the pathname is the shell's subroute and carries no occupancy, and this package copies it verbatim without interpreting it; the hash belongs to no runtime: when the router rewrites the query string, the codec copies the current hash unchanged, and no FrontX helper takes or returns a hash (routing DESIGN §2.1, Control Boundary); and this package percent-encodes, but never interprets, the names and values of an occupant's parameters. The grammar in full — its productions, its percent-encoding, how a parse treats malformed and foreign query segments, and how order and multiplicity are kept — is specified by the navigation-substrate FEATURE (`cpt-frontx-feature-routing-navigation-substrate`, URL grammar); the write operations a caller names are specified by the route-ownership-signal FEATURE (`cpt-frontx-feature-routing-route-ownership-signal`, URL back-projection).

A nested domain cannot outlive the extension whose zone contains it. When a command drops an extension that hosts routed domains, every domain nested beneath it, transitively, leaves the URL in the same history write, and the FrontX router names them from its own knowledge, never from a domain key's shape, which carries no ancestry. A change confined to an extension's own parameters leaves its nested domains untouched. A part of the URL whose domain has no live observer is inert, not an error. Which party may write which part of the URL is decided in `cpt-frontx-adr-extension-routing-port` (URL ownership).

### Occupant Identity Lexical Rule

`cpt-frontx-routing-adr-occupant-reference-boundary` makes an occupant's identity the extension name the URL carries, so the routing core cannot describe that identity as purely opaque. The routing core never interprets what the identity names — that is the concern of the FrontX router, which knows the extension domain and extension concepts — but the value must be lexically valid to serve in a URL this package composes and parses. The identity is therefore **uninterpreted but well-formed**: its alphabet is the grammar's `name` production, and it is unique within its own domain, which the FrontX router's registration-time check guarantees (the routing PRD, Assumptions). The production itself, and where and when this package validates a value against it, are stated by `cpt-frontx-feature-routing-navigation-substrate` (URL grammar; `cpt-frontx-algo-routing-navigation-substrate-name-validity`). The parameter bag stays opaque in the sense `cpt-frontx-routing-adr-occupant-reference-boundary` gives it: the routing core carries it without reading any field inside it.

### Consequences

* Good, because multi-occupancy is not a special case — it is just "more than one entry under the same domain key," naturally supported by the one grammar, closing the addressing gap without a bolt-on.
* Good, because per-occupant parameters use one encoding everywhere, closing the namespace-collision gap uniformly across every domain.
* Good, because there is no arbitrary "at most one privileged domain per zone" constraint, and no domain needs to be selected as a zone's privileged one.
* Good, because parameters stay readable: a matrix-style `;key=value` pair reads in place in the address bar, rather than nested inside a second, percent-encoded layer, and the pathname stays the shell's subroute rather than ground the shell and this package share.
* Good, because a domain key never restates any ancestor, so an entry's own length is independent of how deep in the tree its domain sits, the URL stays shorter, and nothing about the tree's own shape leaks into the address bar.
* Bad, because a domain's own route value must stay unique among every routed domain live in the page at once: two live instances of the same host MFE need two distinct domain instances of their own, each supplying its own route value.
* Bad, because a URL part that no domain on the page reads can be inert: after a page load, unrelated parts leave when the FrontX router clears the URL's entries once the load's chains are sent (the initial route stays captured until the first `push` command or back/forward step), so only a back or forward step, or a domain left behind by unregistration, can leave an inert part in the URL, and such a part has no reset point beyond the structural reset the FrontX router carries out when the extension owning its zone is removed or replaced.
* Bad, because a consumer that expects occupancy in the pathname — for bookmarking habits, or for an external link assuming a path shape — finds none there: this package carries every domain's occupancy in the query string.

### Confirmation

Confirmed by a design/code review of whatever implements this mechanism: no code path in the routing core's resolution primitive treats a pathname segment as a declared prefix; every domain in a composed tree, regardless of occupant count or tree position, resolves and back-projects through the identical entry grammar, addressed by its own single declared route value with no reference to any enclosing domain's own key; registration checks a domain's own route value for uniqueness among the routed domains live in the page before accepting it; and no code path branches on "is this domain privileged" or "does this domain have one occupant or several." The acceptance scenarios this confirmation is checked against are the worked examples in the acceptance criteria of `cpt-frontx-feature-routing-navigation-substrate` (the reference link and the zero-occupant URL) and of `cpt-frontx-feature-routing-route-ownership-signal` (the console layout and the structural reset).

## Pros and Cons of the Options

### One uniform entry grammar for every domain

Every domain in the tree — any depth, any occupant count — contributes one query-string entry per occupant, keyed by its own domain key and carrying its extension and parameters; the pathname carries nothing this library reads or writes for occupancy, and is the shell's subroute.

* Good, because multi-occupancy requires no special case beyond "more entries under the same domain key."
* Good, because per-occupant parameters have exactly one encoding, everywhere, closing a namespace-collision class of bug for every domain.
* Good, because no domain needs to be selected as a zone's privileged, pathname-continuing one, and the pathname itself stays the shell's subroute.
* Good, because a domain key never restates an ancestor chain, so the URL stays shorter and reveals no tree topology at any depth.
* Bad, because a domain's own route value must stay unique among every routed domain live in the page at once, a cost that falls on any host MFE a consumer wants live more than once: each live instance needs its own distinct domain instance, supplying its own route value.
* Bad, because a part brought back by a back or forward step, or left behind by unregistration, whose domain has no live registration, has no reset point beyond the structural reset the FrontX router carries out when the extension owning its zone is removed or replaced; after a page load, unrelated parts leave when the FrontX router clears the URL's entries once the load's chains are sent, while the initial route stays captured until the first `push` command or back/forward step.
* Bad, because a consumer that expects occupancy in the pathname finds none there.

### Three separate mechanisms — axial pathname, single-entry parallel axis, bolted-on compound-key mode

Hierarchy through pathname continuation for one axial domain per zone; occupancy fan-out through a capped single-entry query key for every other domain; a fourth, bolted-on compound-key mode admitted only for a domain whose occupancy strategy holds several occupants at once.

* Good, because it keeps human-readable pathname URLs for the one axial domain per zone.
* Good, because it keeps the axial pathname shape for whatever relies on it.
* Neutral, because the single-entry parallel axis and the compound-key mode are two different rules a maintainer must know when to apply.
* Bad, because it requires a different rule for every combination of "is this domain the axial one" and "does this domain have one occupant or several," which is exactly the gap this record closes: no room for more than one occupant without inventing a fourth mode.
* Bad, because "at most one axial domain per zone" has no principled basis beyond needing someone to own the pathname.
* Bad, because per-occupant parameters carry two different encodings, leaving the namespace-collision problem closed only for the compound-keyed case, not for the axial one.

### Compound key with a double-colon boundary delimiter and percent-encoded nested parameters

Every occupant is addressed by a single query-string key composed of a dotted domain-path, a fixed double-colon boundary delimiter, and an occupant-identity segment; that occupant's own parameters are percent-encoded into the key's own value as a nested string.

* Good, because it collapses each occupant onto a single query-string key rather than one key plus a semicolon-delimited tail.
* Bad, because it nests one encoding inside another: every parameter value is percent-encoded twice over — once for the outer query-string rule, once again for the inner nested-parameter string — leaving the address bar materially less readable than a flat entry.
* Bad, because it introduces a second reserved delimiter (two consecutive colon characters) alongside the path delimiter (`.`), so a reader and an implementer must track two different boundary rules instead of one.
* Bad, because it produces long, ancestry-heavy keys for any deeply nested domain, since the whole chain of ancestors is restated inside the key itself rather than only the immediate parent's own extension.

### Pluggable URL codec over one internal model

One internal occupancy model, exactly as this record decides, but the query-string serialization a consumer's own URL actually carries is a swappable codec per deployment, with the flat entry grammar shipped only as the default a consumer may replace with another.

* Good, because a consumer with an unusual legibility or length constraint could, in principle, supply its own encoding without this package's own internal occupancy model changing underneath it.
* Bad, because an addressing scheme that varies per deployment is not actually a shared addressing scheme: two consumers running two different codecs cannot read each other's URLs, defeating the point of the uniform mechanism this record adopts.
* Bad, because it is premature abstraction for a single known encoding with no second implementation ever named or requested — this record collapses multiple mechanisms into one, not one mechanism into an open-ended set a consumer configures.
* Bad, because it multiplies the Confirmation surface above by however many codecs a consumer could plug in, with no bound on that number and no second, real encoding to confirm against.

### Value-nested subtree encoding

One query-string key per top-level domain, whose own value recursively encodes that domain's entire subtree — nested domains, their own occupants, and those occupants' own parameters — in a rison/URLON-shaped nested serialization, rather than one entry per occupant at every depth.

* Good, because the query string carries fewer top-level keys: one per top-level domain rather than one per occupant at every depth.
* Bad, because it breaks per-slot independence: mutating any subtree requires a read-modify-write of the whole root key, forcing every domain to parse, preserve, and rewrite ancestors' and siblings' own subtrees it does not own — directly contradicting the URL back-projection helper's own per-entry-only replace guarantee.
* Bad, because a domain several steps deep cannot resolve independently against its own domain key and its own registered extensions alone; it depends on every ancestor's own root key already having been parsed correctly, reintroducing the whole-URL coupling the uniform entry grammar avoids.
* Bad, because a rison/URLON-shaped value is materially less legible in the address bar than a flat, if longer, entry-based string — trading one already-accepted readability loss for a second, different one, without recovering the first.

## More Information

Diagram note: this record's own mechanism-count decision is a comparison across five options — the chosen uniform entry grammar against four rejected alternatives — matching the shape this repository's own root ADRs already use for a decision of this kind (`cpt-frontx-adr-core-package-boundaries`, `cpt-frontx-adr-extension-domain-occupancy`), both recorded in prose and comparison lists with no diagram. No diagram is included here for the same reason.

**Addressing model.** This record defines the addressing and composition model that `cpt-frontx-feature-routing-navigation-substrate` (URL grammar) states and that `cpt-frontx-routing-design-routing` (URL Grammar; Additional context, Worked Example) describes: hierarchy addressed through a domain's own single declared route value rather than pathname continuation reserved to one axial domain per zone, occupancy fan-out through one entry per occupant sharing a domain's own domain key rather than a single-entry parallel-axis query key, and every occupant's own parameters encoded the identical way — as matrix-style `;key=value` pairs within that occupant's own entry — regardless of occupant count or tree position.

**Scope of impact.** This decision governs the addressing and composition mechanism a domain's occupancy projects into the URL — how many query-string parts a domain contributes, how they are keyed and ordered, and how an occupant's own parameters are encoded. It does not decide the source of an occupant's identity value (`cpt-frontx-routing-adr-occupant-identity-stability`), whether the routing core imports `mfes` (`cpt-frontx-routing-adr-occupant-reference-boundary`), or which channel originates a mount (`cpt-frontx-adr-extension-domain-occupancy`, with this package's surface under that rule shaped by `cpt-frontx-routing-adr-mount-trigger-ownership`). `cpt-frontx-adr-extension-domain-occupancy` decides occupancy cardinality; this record decides how that cardinality is addressed in the URL.

**Traceability.** `cpt-frontx-routing-fr-concurrent-occupant-projection` and `cpt-frontx-routing-fr-per-occupant-addressable-parameters`, cited below, are the two functional requirements the routing PRD defines under Concurrent Occupant Projection and this grammar answers.

**Review trigger.** Revisit if a requirement emerges for a human-readable, bookmarkable pathname URL that this uniform grammar cannot express without reintroducing a privileged, pathname-continuing domain per zone.

**Checklist applicability.**

* ARCH — applicable and addressed above (an architecturally significant, hard-to-reverse addressing decision affecting every consumer that reads or constructs this package's own URLs).
* ARCH-ADR-008 (supersession) — Not applicable because this is a new decision that supersedes no prior record.
* SEC — Not applicable because this decision introduces no secret, credential, or authorization concern; it only shapes how occupancy is encoded in the URL.
* PERF — Not applicable because producing one entry per occupant carries no different runtime cost, at this package's own operating volumes, than the three-mechanism alternative described above.
* REL — Not applicable because it governs an addressing/encoding scheme, not runtime availability or fault tolerance.
* DATA — Not applicable because no persistent data store or schema is involved.
* INT — applicable: this decision fixes the URL shape this package produces and expects, which every consumer that bookmarks, links to, or parses this package's own URLs must conform to; the consequence above for a consumer that expects occupancy in the pathname is the integration impact.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.
* MAINT — applicable: collapsing multiple mechanisms into one bounds the number of addressing rules a maintainer must hold in mind to one, at the acknowledged cost of inert entries a back or forward step may bring back.
* TEST — applicable and addressed under Confirmation: design and code review against the worked examples the two routing FEATUREs carry as acceptance scenarios.
* COMPL — Not applicable because no regulated or personal data is involved.
* UX — applicable in one narrow respect: an occupant's parameters read in place in the address bar, and a bookmark or deep link carries every occupant of every domain.
* BIZ — Not applicable because this is an internal architecture decision; product requirements are cited by ID below.

## Traceability

- **PRD**: [../PRD.md](../PRD.md)
- **DESIGN**: [../DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-routing-fr-concurrent-occupant-projection` — the uniform entry grammar this record adopts is what lets a multi-occupant domain project every occupant without a mode bolted on alongside a separate single-occupant mechanism.
* `cpt-frontx-routing-fr-per-occupant-addressable-parameters` — every occupant's own parameters live inside its own entry through one encoding, regardless of occupant count or tree position, closing the namespace-collision gap for every domain rather than only the compound-keyed ones among the options considered.
* `cpt-frontx-adr-extension-domain-occupancy` — decides occupancy cardinality; this record decides how that cardinality is addressed in the URL.
* `cpt-frontx-routing-adr-occupant-reference-boundary` — fixes the Occupant contract an occupant's identity resolves through, independent of how the URL around that identity is composed.
* `cpt-frontx-routing-adr-mount-trigger-ownership` — shapes this package's navigation-derived surface and the ecosystem rule it serves; this record decides how the URL the back-projection helper writes is addressed.
* `cpt-frontx-routing-adr-occupant-identity-stability` — fixes the identity value this grammar carries as each occupant's extension name.
* `cpt-frontx-adr-extension-routing-port` — that record names the FrontX router this grammar's entries are read and written by, keeping occupancy write authority with the runtime's commands, which the FrontX router writes, and with the FrontX router's own correction of a user's change to the URL, never with the shell, an occupant, or a host.
