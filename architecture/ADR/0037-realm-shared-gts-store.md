---
status: proposed
date: 2026-10-09
---

# How Far Should the Default Type Provider's Store Reach?

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [One store per provider instance](#one-store-per-provider-instance)
  - [One store pair per compatible copy](#one-store-pair-per-compatible-copy)
  - [One store pair per provider release](#one-store-pair-per-provider-release)
  - [One store pair per store format](#one-store-pair-per-store-format)
  - [Shared type definitions, private instances](#shared-type-definitions-private-instances)
  - [Reach another runtime's provider through the bridge or by injection](#reach-another-runtimes-provider-through-the-bridge-or-by-injection)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-realm-shared-gts-store`

## Context and Problem Statement

The default type-system provider (`cpt-frontx-adr-default-type-substrate-provider`) keeps what it knows in a GTS store. Each provider instance constructs its own store. It also constructs a second store, the scratch store, which mirrors the first. The provider validates a candidate instance against the scratch store before it writes the candidate into the first store. The GTS library keeps no state outside a store instance.

A composed application runs more than one copy of the provider in one JavaScript realm. Each load evaluates its own isolated module graph (`cpt-frontx-adr-mfe-load-isolation`). The host evaluates one copy of the provider. Every microfrontend whose code imports the provider evaluates another. Each copy constructs its default instance when it is evaluated, and with it a store of its own. A type registered through one copy is unknown to every other copy.

Three costs follow. Each runtime registers again every schema it uses. A runtime cannot rely on what another runtime registered: a microfrontend cannot validate against a domain the host registered without registering it again. And a microfrontend that registers its own action schemas through its own copy writes them into a store that no other registry reads.

The copies in one realm need not come from the same release, and need not run the same GTS library. Two releases can also hold different content under one type identifier. The built-in action schemas did exactly this: they were closed and gained the `history` field without a change of identifier.

How far should the provider's store reach, and how do independently loaded copies converge on it without misreading one another?

## Decision Drivers

* **Reliance.** A runtime should be able to rely on the types and instances another runtime registered. When that reliance fails, the failure should say why.
* **Agreement on meaning.** Copies that share a store must agree on the built-in schemas, on the GTS library's behaviour and on the rules that keep the store correct. If they disagreed, a verdict would depend on which copy loaded first.
* **Sharing that survives unrelated releases.** A release that changes neither the built-in schemas nor the GTS library should not stop sharing.
* **Validate before persist.** An instance that fails validation must never become visible to a lookup, in any runtime.
* **Containment.** The change must add no port method, must need no change to the runtime's code and no application wiring, and must keep the provider's public surface to one addition (`cpt-frontx-gts-plugin-nfr-standalone`).
* **A way out.** A caller that needs a provider instance with a private store, as every instance had before, must be able to ask for one.
* **One realm protocol.** The convergence point must follow the discipline the platform already uses for realm-shared state (`cpt-frontx-adr-shared-dep-cache-reach`). That means a version-namespaced slot, recognition by structure, and an untouched entry plus a local fallback when the entry cannot be understood.
* **Deterministic tests.** Realm state must not leak from one test into the next.

## Considered Options

* **One store per provider instance.** Keep the current behaviour.
* **One store pair per compatible copy.** Copies share one store and one scratch store when they use the same store format, the same GTS library version and the same built-in schemas. A realm slot keyed on those three reaches the pair.
* **One store pair per provider release.** The slot key names the provider's exact package version.
* **One store pair per store format.** The slot key names only the store format, so every copy in the realm shares one pair.
* **Shared type definitions, private instances.** The realm holds a shared list of schemas. Each provider instance copies new schemas into its own store before it validates.
* **Reach another runtime's provider through the bridge or by injection.** A nested runtime uses its ancestor's provider instead of its own.

## Decision Outcome

Chosen option: **one store pair per compatible copy**, because it is the only option that lets runtimes rely on one another's registrations, never shares between copies that could disagree on meaning, keeps sharing across releases that change neither the built-in schemas nor the GTS library, and needs no wiring.

**Reach.** Every provider instance in one JavaScript realm reads and writes the one store pair that matches its copy. A Web Worker or an iframe is a separate realm with its own pairs. Each copy still evaluates its own module graph. What the copies share is objects reached through the realm's global object, not a module record. A caller can construct a provider instance with an isolation option. That instance gets a private store pair, as every instance had before, and never touches the realm slot. The provider's default instance is never isolated.

**Key.** The realm slot is a `Symbol.for` key that names three things. The first is a store format number. It changes whenever the shape of the slot entry or the meaning of the stored data changes. The second is the version of the GTS library the copy was built against. The third is a hash of the copy's built-in schemas and lifecycle instances. The provider's own package version is not in the key. So a patch release that changes neither the library nor the built-in schemas keeps sharing with earlier releases. A copy built locally that edits a built-in schema changes the hash and opens a store of its own. A copy that changes the store rules without bumping the format is a defect, which an entry-contract test and review guard against.

The GTS library depends on its validator, Ajv, through a version range, so two copies may carry different Ajv versions. That does not matter for agreement. Every store in a pair is created by the copy that published the pair, through a factory the pair carries. So all validation on a pair runs on one copy of the library and one copy of Ajv. The other copies only wrap entities and call the stores' operations, and the library version in the key fixes those. The library version is the one this package was built against, which its exact pin fixes. A consumer that overrides that pin runs a version the key does not name. That is unsupported, and it is not detected.

**Protocol.** The slot holds an entry tagged with the key's three parts. It carries the two stores, the store factory, a record of which copy wrote each identifier, a record of warnings already given, and a count of the copies that joined. A copy that finds no entry creates the pair and publishes the entry before it returns. A copy that finds an entry it recognizes adopts it. It recognizes the parts by the operations it calls on them, never by class identity, which independently evaluated copies do not share. A copy that finds a malformed or unrecognized entry logs a warning once, leaves the entry unread and unchanged, and works from a pair local to its own evaluated copy. The slot is trusted same-realm coordination state, exactly as in `cpt-frontx-adr-shared-dep-cache-reach`. It authenticates no publisher.

The realm also keeps an index of the keys opened in it. A copy that opens a new key while other keys exist logs a warning. The warning names the keys and the part that differs, and says that registrations under the other keys are not visible. Each copy that adopts a store logs at debug level, with an ordinal, so later warnings can name copies. The copy that publishes a store is always number 1 and logs nothing, so a single copy, as in Node, tests or server rendering, prints nothing on import.

**Reliance.** A runtime may rely on a type or instance that another runtime registered on the same store before the relying call. The runtime's own order makes the common case safe: the host registers a domain before it mounts an extension into it, and an extension's code runs during its own mount. Reliance fails in two ways. A runtime may run on a different store. The warning above reports that when the second store opens. Or the definition may not be registered yet. In both cases the failing call reports the missing identifier and the store key, and says that the identifier may be registered later or may be on another store. That holds for the error `register` raises and for the result `validateInstance` returns. A lookup through `getSchema` returns nothing and cannot carry a message; for it, the warning about a second store is the diagnostic.

**Writes to a type.** The first definition registered under a type identifier stands. A definition is refused before anything is written when its content is not representable as JSON, when its identifier is not a valid type identifier, or when the library classifies it as an instance because it declares no `$schema`. A later definition with the same content changes nothing and logs nothing. Same content means the same canonical JSON, in which `gts://X` and `X` count as one identifier. A later definition with different content also changes nothing. It logs one warning and returns normally. The warning names the identifier and the store key, names the copies that registered the kept and the refused definition, and carries both contents. It is given once per identifier and offered content, so a runtime that registers its schemas on every load does not repeat it. `register` with a schema behaves exactly as `registerSchema`, so the outcome never depends on load order. The store keeps a deep copy of a definition, and `getSchema` returns a deep copy of a stored schema, so no caller can change a definition after it is registered.

**Writes to an instance.** Instances keep the last write. A candidate instance is always validated against the store's current state first. An instance with the same content as the one held is a no-op. Otherwise the candidate replaces what the store held. When a copy replaces different content that a different copy wrote, the provider logs one warning naming the identifier and both copies. Two kinds of instance never log. The runtime registers every action payload under one empty identifier, only to validate it. It registers each shared property's value under one fixed identifier, again only to validate it, and a second runtime that mirrors the value writes the same content.

**The mirror.** The scratch store is shared together with the store, because it is correct only while it mirrors the store. Between any two calls, both stores hold the same entity under every identifier. Every call reads the stores from the entry when it starts, because another instance may have replaced the scratch store. When a candidate fails validation, the call restores the mirror before it raises the error. If the store holds an entity under the candidate's identifier, the call writes that entity back into the scratch store. Otherwise it replaces the scratch store with one rebuilt from the store by the pair's factory. A rebuild must stay within the runtime's 50 ms registration budget at 500 type definitions and 500 instances. Every store operation is synchronous, and a call does all its reads and writes without awaiting. A realm runs one call at a time, so calls never interleave and need no lock.

**Lifetime.** The pair lives as long as the realm. Nothing disposes it, counts its holders or evicts its entries. `cpt-frontx-adr-shared-dep-cache-reach` holds realm lifetime sound for inert text and not for state with freshness semantics. Type definitions here carry no freshness semantics by contract: GTS gives a changed definition a new identifier, and the first-wins rule enforces that. Instances do carry freshness, and they get it from the last write, not from expiry.

**The port.** The type-substrate port recorded a re-registered schema as replacing the earlier one (`cpt-frontx-state-type-substrate-port-schema-lifecycle`). It now leaves that outcome to the provider. The runtime never registers a schema twice and relies on neither outcome. So the port does not bind other providers, or the runtime's test doubles, to this provider's rule.

### Consequences

* Good, because a runtime can rely on the types and instances another runtime registered on the same store, which is the purpose of this change.
* Good, because a microfrontend's own schemas, registered through its own copy, reach the registries that admit its actions.
* Good, because copies that differ in store format, library version or built-in schemas never share, so no verdict depends on which of them loaded first.
* Good, because a release that changes neither the library nor the built-in schemas keeps sharing with earlier releases.
* Good, because a failed reliance is reported: the opening of a second store logs a warning, and the failing validation names the missing identifier and the store.
* Good, because a type's definition never changes after it is registered. The GTS library replaces the stored record of a re-registered schema but keeps the earlier schema for reference resolution, so a change of content used to leave two views of one type.
* Good, because an isolated provider instance remains available for a caller that must not share.
* Bad, because the first runtime to register a type identifier decides its definition for every runtime on that store. Often that is the shell. A reference shell that registers every microfrontend's schemas at boot, from copies taken when the shell was built, wins over a redeployed microfrontend whose schema changed under the same identifier. The microfrontend is then validated against the older definition, in its own runtime too. The conflict warning shows both definitions and the copies involved, which is enough to find the stale copy.
* Bad, because schemas a template owns, such as theme, language and screen-extension types, are versioned by that template, not by this provider. Runtimes built from different template releases collide on them under the first-wins rule.
* Bad, because in development a schema edited without a new identifier takes effect only after a full page reload. Hot module replacement re-registers it, and the edit is refused with a warning.
* Bad, because a runtime can replace an instance that another runtime registered. The runtime looks up manifests and entries by identifier, so every runtime then reads the later content. The replacement warning makes this visible.
* Bad, because a reference check now asks whether an identifier exists anywhere on the store. An action that names a target registered only in another runtime passes type validation and then fails at handler resolution, which still leads to its fallback.
* Bad, because a definition that is valid JSON but that the validator cannot compile is not detected before it is written. The GTS library offers no compile check. It then holds its identifier for the realm, and every validation against it fails with the validator's error.
* Bad, because the store's validator keeps a compiled validator for every validation call, a GTS library behaviour. Memory therefore grows with the number of validations, not with the number of identifiers. Each per-instance store grew the same way; sharing gathers that growth into one store instead of spreading it over many.
* Bad, because a rejected candidate under a new identifier rebuilds the scratch store from every entity on the store, not from one runtime's entities.
* Bad, because tests that construct several provider instances in one file and expect each to start empty must switch to the isolation option.

### Confirmation

Automated tests in the provider package confirm this decision.

* Tests that evaluate two independent copies confirm that compatible copies adopt one store pair, even when the adopted stores belong to a class foreign to the adopting copy. A schema registered through one copy validates an instance registered through the other.
* Tests of the key confirm that two library versions, or two built-in sets that differ in one schema, give different keys, and that two package versions with otherwise equal inputs give the same key.
* Tests confirm the warnings: when a second key opens, when an entry is not recognized, when a type definition conflicts, and when another copy's instance is replaced. They confirm that a conflict reported once stays silent afterwards, and that action payloads and shared-property values never log.
* Tests confirm that a failed validation on a missing identifier names it and the store key.
* Tests confirm that a second construction, and any re-registration of identical content, changes no stored entity and logs nothing.
* Tests confirm that `register` and `registerSchema` give the same outcome for a schema in an empty and in a populated store, and that changing a registered or returned schema object does not change the stored definition.
* Tests confirm that after a rejected candidate both stores hold the same entities again, and a benchmark confirms the rebuild budget.
* Tests confirm that an isolated instance sees no realm registration and touches no realm slot.

Review confirms that every store access in a call is synchronous, and that the provider's only public addition is the isolation option.

## Pros and Cons of the Options

### One store per provider instance

Each instance constructs its own store pair, as today.

* Good, because it holds no realm state and needs no protocol.
* Good, because one runtime cannot affect another runtime's verdicts.
* Bad, because no runtime can rely on another's registrations, and every runtime must register every definition it uses.
* Bad, because a microfrontend's own schemas reach no registry.

### One store pair per compatible copy

The slot key names the store format, the GTS library version and a hash of the built-in schemas.

* Good, because runtimes share wherever their copies agree on meaning.
* Good, because unrelated releases keep sharing.
* Good, because it follows the realm protocol the platform already uses.
* Neutral, because it keeps mutable state at a well-known realm slot, as the shared-dependency cache already does.
* Bad, because the store format must be bumped by hand when the entry or the meaning of its data changes.
* Bad, because one runtime's registrations affect what every other runtime on the store admits.

### One store pair per provider release

The slot key names the provider's exact package version.

* Good, because it is simple, and copies of one release always agree.
* Bad, because a patch release that changes nothing relevant stops sharing, so a host and a microfrontend one patch apart cannot rely on each other.
* Bad, because a locally built copy carries a published version string while its content may differ.

### One store pair per store format

Every copy in the realm shares one pair, whatever its built-in schemas or library.

* Good, because the most runtimes share.
* Bad, because two copies that hold different content under one built-in identifier keep whichever arrived first, so a verdict depends on load order.
* Bad, because copies running different library versions would wrap entities for a store they may not agree with.

### Shared type definitions, private instances

The realm shares a list of schemas, and each instance copies new ones into its own store before it validates.

* Good, because instances stay private to the runtime that registered them.
* Bad, because every instance must copy definitions into its own store before it validates, at a cost that grows with every write any runtime makes.
* Bad, because the domains, extensions and entries one runtime registers stay invisible to the others, so a runtime still cannot rely on them.

### Reach another runtime's provider through the bridge or by injection

A nested runtime uses its ancestor's provider instance instead of its own.

* Good, because it needs no realm slot.
* Bad, because the bridge carries participation in dispatch, and its contract allows no new capability (`cpt-frontx-constraint-mfes-cross-nesting-reachability`).
* Bad, because injection needs every application to wire it, and it does nothing for runtimes that are not related by nesting.

## More Information

**Relation to other decisions.** This decision narrows three accepted decisions, and each is amended in place.

* `cpt-frontx-adr-default-type-substrate-provider` still registers the built-in set at construction. The store it registers into is now shared by compatible copies, and every construction after the first on a store is a silent no-op.
* `cpt-frontx-adr-action-dispatch-and-chaining` still treats a forwarded target identifier as opaque. The reason is now that each registry has its own injected provider and the runtime cannot assume two registries share one.
* `cpt-frontx-adr-mfe-load-isolation` still gives every load its own module graph, including its own copy of the provider and of the GTS library. Its statement of a microfrontend's blast radius now names the one deliberate exception: microfrontends whose providers share a store share type registrations.

This decision follows the protocol of `cpt-frontx-adr-shared-dep-cache-reach` and does not amend it. It differs in three ways. Its key names what decides meaning: the store format, the library version and the built-in schemas. It holds mutable registry state, not inert source text, and the Lifetime paragraph above explains why realm lifetime still fits. It has no capacity bound, because it holds the realm's type vocabulary rather than a cache.

`cpt-frontx-adr-runtime-type-system-coupling` is unaffected. The runtime still sees types only by identity, and still reaches them only through its injected provider.

**Present detail.** For accuracy, and as non-binding present detail: the slot is `Symbol.for('@gears-frontx/gts-plugin:gts-store:1:<library version>:<built-in hash>')`. The built-in hash is a 53-bit cyrb53 hash of the canonical built-in set, in hexadecimal. The key index is `Symbol.for('@gears-frontx/gts-plugin:gts-store-keys')`. The isolation option is `new GtsPlugin({ isolated: true })`, and it ships in version 0.3.1. The FEATURE that owns the provider's behaviour owns these shapes (`cpt-frontx-algo-gts-type-provider-realm-store-rendezvous`).

**Guidance for consumers.** Tests that need a fresh store construct the provider with the isolation option. A template whose shell registers microfrontend schemas should expect the first registration to win, so a schema that changes takes a new type identifier. The reference templates live in their own repository and adopt this there.

**Review trigger.** Each trigger matches a warning the provider logs, so each can fire in practice. Revisit the key if the warning about a second store appears in applications that expect to share. Revisit the instance rule if the replacement warning shows one runtime replacing another's manifest, entry, domain or extension. Revisit the type rule if conflict warnings show stale definitions winning in deployed applications. Revisit both rules if the port gains a call that validates without persisting, because that call would remove the reason instances replace one another. Revisit the residual on uncompilable definitions if the GTS library gains a compile check.

**Checklist applicability.**

* ARCH — applicable and addressed above. This fixes where the default provider keeps its state and how copies converge on it. A published slot with adopters is costly to reverse.
* SEC — applicable and addressed here (SEC-ADR-001). The threat model is the one `cpt-frontx-adr-mfe-load-isolation` states: the runtime admits independently authored, potentially untrusted microfrontend code. Without a shared store, a microfrontend's code cannot reach the type knowledge that another runtime's admission uses. With it, any compatible copy can, through the provider's own public methods. It can register a type identifier before its rightful owner, and that definition then governs admission of that type on the store. It can replace an instance another runtime registered, such as a manifest that runtime later resolves by identifier. This is accepted on the ground `cpt-frontx-adr-shared-dep-cache-reach` records: the realm is the trusted coordination domain, and code already running in it can already substitute shared-dependency source text that other loads evaluate. The conflict and replacement warnings make the accidental case visible. Admission still runs at the registry that executes an action. A caller that must not share uses the isolation option. No secret or credential is introduced.
* INT — applicable. The entry is an internal contract between copies of one package, versioned by the store format. The port's re-registration outcome becomes provider-defined. The isolation option is the provider's one public addition.
* PERF — applicable. A rebuild of the scratch store must stay within the runtime's 50 ms registration budget at 500 type definitions and 500 instances; only a rejected candidate under a new identifier causes one. The validator's per-validation memory growth is a GTS library behaviour, unchanged in total by this decision.
* REL — applicable. A malformed or foreign entry degrades a copy to a local store pair. It never fails construction.
* MAINT — applicable. The store format must be bumped with any change to the entry or to the meaning of its data, and an entry-contract test pins the entry's shape. The provider's exact pin on the GTS library becomes load-bearing.
* TEST — applicable. Tests that need a fresh store use the isolation option. Tests of sharing reset the realm slot and key index, and evaluate independent copies with stores of a foreign class.
* DATA — Not applicable, because nothing is persisted. The stores live in memory for the realm's lifetime.
* OPS — Not applicable, because no deployed-service procedure is governed.
* COMPL — Not applicable.
* UX — Not applicable, because the decision has no end-user-facing behaviour.
* BIZ — Not applicable, because product requirements live in the PRD and are cited by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-fr-application-type-definitions` — a type definition an application registers at runtime reaches every runtime whose provider copy opens the same store.
* `cpt-frontx-fr-gts-realm-shared-type-store` — the provider requirement this decision realizes: compatible copies share one store pair, runtimes may rely on it, and the first definition of a type stands.
* `cpt-frontx-fr-mfe-type-validation` — admission still validates through the injected provider, against knowledge that now spans the store.
* `cpt-frontx-interface-type-system` — the provider gains the isolation option, its one public addition.
* `cpt-frontx-component-type-system-plugin` — this decision fixes where the Type System Plugin keeps its state.
* `cpt-frontx-constraint-gts-plugin-realm-shared-store` — the member constraint this decision establishes.
* `cpt-frontx-state-type-substrate-port-schema-lifecycle` — the port lifecycle this decision makes provider-defined for a re-registered schema.
* `cpt-frontx-algo-gts-type-provider-realm-store-rendezvous` — the algorithm that realizes the slot, its key, its recognition, its warnings and the local fallback.
* `cpt-frontx-dod-gts-type-provider-realm-shared-store` — the definition of done that fixes the write rules, the mirror, the isolation option and test isolation.
* `cpt-frontx-nfr-runtime-performance` — the rebuild budget this decision commits the provider to.
* `cpt-frontx-nfr-security` — the cross-runtime influence this decision introduces is recorded and accepted under SEC above.
