---
status: accepted
date: 2026-10-09
description: Decision record on how far the default type provider's GTS store reaches across provider instances in a JavaScript realm.
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

**ID**: `cpt-frontx-gts-plugin-adr-type-store-scope`

## Context and Problem Statement

The default type-system provider (`cpt-frontx-adr-default-type-substrate-provider`) keeps what it knows in a GTS store. Beside it the provider keeps a second store, the scratch store, which mirrors the first. The provider validates a candidate instance against the scratch store before it writes the candidate into the first store. The GTS library keeps no state outside a store instance.

A composed application runs more than one copy of the provider in one JavaScript realm. Each load evaluates its own isolated module graph (`cpt-frontx-adr-mfe-load-isolation`). The host evaluates one copy of the provider. Every microfrontend whose code imports the provider evaluates another. Each copy constructs its default instance when it is evaluated. If every instance kept a store of its own, a type registered through one copy would be unknown to every other copy.

Three costs would follow. Each runtime registers again every schema it uses. A runtime cannot rely on what another runtime registered: a microfrontend cannot validate against a domain the host registered without registering it again. And a microfrontend that registers its own action schemas through its own copy writes them into a store that no other registry reads.

The copies in one realm need not come from the same release, and need not run the same GTS library. Two releases can also hold different content under one type identifier, for example when a built-in action schema gains a field without a change of identifier.

How far should the provider's store reach, and how do independently loaded copies converge on it without misreading one another?

## Decision Drivers

* **Reliance.** A runtime should be able to rely on the types and instances another runtime registered. When that reliance fails, the failure should say why.
* **Agreement on meaning.** Copies that share a store must agree on three things: the built-in set (the built-in schemas and the default lifecycle-stage instances), the shape of the GTS library's stores and entities, and the rules that keep the store correct. If they disagreed on the built-in set, a built-in entity would depend on which copy loaded first.
* **GTS is read only by the GTS library.** The provider must not interpret a GTS identifier or entity itself. Every such reading is a call into `@globaltypesystem/gts-ts`, and a missing call is grounds to ask for it upstream, never to reimplement it (`cpt-frontx-constraint-gts-plugin-delegates-gts-interpretation`).
* **Sharing that survives unrelated releases.** A release that changes neither the built-in set nor the GTS library line should not stop sharing.
* **Validate before persist.** An instance that fails validation must never become visible to a lookup, in any runtime.
* **Containment.** Sharing must add no port method, must need no change to the runtime's code and no application wiring, and must leave the default instance's construction unchanged (`cpt-frontx-gts-plugin-nfr-standalone`).
* **One realm protocol.** The convergence point must follow the discipline the platform already uses for realm-shared state (`cpt-frontx-adr-shared-dep-cache-reach`). That means a version-namespaced slot, recognition by structure, and an untouched entry plus a local fallback when the entry cannot be understood.
* **Private type knowledge where it is needed.** A runtime or a build-time validator that must keep type knowledge of its own needs a provider instance that neither sees nor adds to the realm's shared type knowledge.
* **Deterministic tests.** Realm state must not leak from one test into the next.

## Considered Options

* **One store per provider instance.** Each provider instance constructs its own store pair.
* **One store pair per compatible copy.** Copies share one store and one scratch store when they use the same store format, the same GTS library line and the same built-in set. A realm slot keyed on those three reaches the pair.
* **One store pair per provider release.** The slot key names the provider's exact package version.
* **One store pair per store format.** The slot key names only the store format, so every copy in the realm shares one pair.
* **Shared type definitions, private instances.** The realm holds a shared list of schemas. Each provider instance copies new schemas into its own store before it validates.
* **Reach another runtime's provider through the bridge or by injection.** A nested runtime uses its ancestor's provider instead of its own.

## Decision Outcome

Chosen option: **one store pair per compatible copy**, because it is the only option that lets runtimes rely on one another's registrations, never shares between copies that could disagree on meaning, keeps sharing across releases that change neither the built-in set nor the GTS library line, and needs no wiring.

**Reach.** Every provider instance a consumer obtains from the package's public surface without asking for a private store pair, the default instance included, reads and writes the one store pair in its JavaScript realm that matches its copy. A Web Worker or an iframe is a separate realm with its own pairs. Each copy still evaluates its own module graph. What the copies share is objects reached through the realm's global object, not a module record. A caller may instead construct an instance with a private store pair. That pair follows the same write rules, starts from the built-in set and never touches the realm slot, so nothing registered through it reaches another instance and nothing registered elsewhere reaches it. A runtime or a build-time validator that must keep type knowledge of its own uses it. The default instance always shares.

**Key.** The realm slot is a `Symbol.for` key that names three things. The first is a store format number. It changes whenever the shape of the slot entry or the meaning of the stored data changes. The second is the GTS library line of the copy, taken from the library version it was built against: `0.<minor>` while the library is below 1.0, and the major version from 1.0 on. Semantic versioning lets a 0.x library break between minor versions and a 1.x library only between major versions, so a line is the widest range in which the library promises stable stores and entities. The exact library version would be stricter than needed, because an application composed at runtime is expected to consume GTS entities of one version. The bare major would be too loose while the library is below 1.0: it would put different lines, between which the library may break, on one store. The third is a hash of the copy's built-in set: its built-in schemas and default lifecycle-stage instances. The provider's own package version is not in the key. So a release that changes neither the GTS library line nor the built-in set keeps sharing with earlier releases. A copy built locally that edits a built-in schema or lifecycle-stage instance changes the hash and opens a store of its own. A copy that changes the store rules without bumping the format is a defect, which an entry-contract test and review guard against.

Both stores of a pair are created by the copy that published the pair, when it publishes it. So all validation on a pair runs on the publisher's copy of the GTS library and of its JSON Schema engine. Within one line, copies may carry different patch levels of the library, and with them different engine versions. Verdicts on a pair therefore follow the copy that published it, which is usually the host's, because the host's copy is evaluated first. That is accepted, because a patch within a line changes no promised behaviour. The other copies only wrap entities and call the stores' operations. Sharing therefore relies on the GTS library keeping the operations of `GtsStore` (`register`, `unregister`, `get`, `getAll`, `validateInstance`, `validateTransientInstance`) and the shape of `JsonEntity` stable within a line. Both are exported public API, so this is a dependency on the library's own semantic versioning. Recognition by shape catches a missing operation, not a changed meaning. The line is derived from the library version this package was built against, which its exact pin fixes. A consumer that overrides that pin with a version from another line runs a library the key does not name. That is unsupported, and it is not detected.

**Protocol.** The slot holds an entry tagged with the key's three parts. It carries the two stores, a record of which copy wrote each identifier, a record of warnings already given, and a count of the copies that joined. A copy that finds no entry creates the pair and publishes the entry before it returns. A copy that finds an entry it recognizes adopts it. It recognizes the parts by the operations it calls on them, never by class identity, which independently evaluated copies do not share. A copy that finds a malformed or unrecognized entry logs a warning once, leaves the entry unread and unchanged, and works from a pair local to its own evaluated copy. The slot is trusted same-realm coordination state, exactly as in `cpt-frontx-adr-shared-dep-cache-reach`. It authenticates no publisher.

The realm also keeps an index of the keys opened in it. A copy that opens a new key while other keys exist logs a warning. The warning names the keys and the part that differs, and says that registrations under the other keys are not visible. Each copy that adopts a store logs at debug level, with an ordinal, so later warnings can name copies. The copy that publishes a store is always number 1 and logs nothing, so a single copy, as in Node, tests or server rendering, prints nothing on import.

**Reading GTS.** The provider interprets no GTS identifier or entity itself (`cpt-frontx-constraint-gts-plugin-delegates-gts-interpretation`). Extracting an identifier and a schema reference, classifying an entity as a schema or an instance, telling whether an identifier names a type, checking an identifier's validity, matching an identifier against a pattern, validating, and resolving references are all calls into the GTS library. The rules below are the provider's own. They decide what is written, replaced or refused, on top of the library's readings, and never replace a reading. The provider accepts less than the library: it refuses the cases listed below, and each refusal rests on the library's own answer.

**Reliance.** A runtime may rely on a type or instance that another runtime registered on the same store before the relying call. The runtime's own order makes the common case safe: the host registers a domain before it mounts an extension into it, and an extension's code runs during its own mount. Reliance fails in two ways. A runtime may run on a different store. The warning above reports that when the second store opens. Or the definition may not be registered yet. Every validation failure therefore names the store key it searched, beside the library's own reason. It also carries a hint phrased as a condition: if the failure refers to something not registered on this store, that may be registered later, or by a runtime on another store. The hint is always present, because the provider does not tell which referenced identifiers are missing. The GTS library collects only `$ref` values and concrete reference operands written in the entity itself (`JsonEntity.references`). An extension's `domain` value, which its schema constrains through `x-gts-instance-ref`, is checked only inside the library's validation, and the provider reads none of the per-issue detail that validation returns. So the hint reads no GTS and parses no message text. Where a lookup in the store can name a specific missing schema or object from the library's own answers, the error may name it too. That holds for the error `register` raises and for the result `validateInstance` returns. A lookup through `getSchema` returns nothing and cannot carry a message; for it, the warning about a second store is the diagnostic.

**Writes to a type.** The first definition registered under a type identifier stands. A definition is refused before anything is written in four cases, and the library decides the first three. The library classifies it as an instance, because it declares no `$schema`. The library rejects its identifier; the error then carries the library's own reason (`Gts.validateGtsID`). The library does not report its identifier as a type (`Gts.isType`). Or its content is not representable as JSON, so the provider cannot keep a copy of it; this refusal is about storing, not about reading GTS. A later definition with the same content changes nothing and logs nothing. Same content means structural equality of the two JSON values, with no reading of GTS: object keys are compared as sets and array elements in order. Two definitions that differ only in how they spell something the library treats as one, such as `gts://X~` against `X~` in `$id`, are therefore different content. The later one draws a conflict warning it did not need, and the first definition still stands, so the store stays correct. A later definition with different content also changes nothing. It logs one warning and returns normally. The warning names the identifier and the store key, names the copies that registered the kept and the refused definition, and carries both contents. It is given once per identifier and offered content, so a runtime that registers its schemas on every load does not repeat it. `register` with a schema behaves exactly as `registerSchema`, so the outcome never depends on load order. The store keeps a deep copy of a definition, and `getSchema` returns a copy of whatever it finds, a schema or an instance. No caller can change a stored definition through the object it registered or through the object it read. The same holds for an instance whose content is representable as JSON; the one exception is described under writes to an instance.

**Writes to an instance.** Instances keep the last write. An instance is refused before anything is touched when the library reports its identifier as a type (`Gts.isType`), or when the store holds a type under that identifier. A candidate instance is always validated against the store's current state first. An instance with the same content as the one held is still validated as offered, and only then changes nothing. Otherwise the candidate replaces what the store held. An instance whose content is representable as JSON is stored as a copy. An instance whose content is not representable as JSON, such as a shared-property value that holds a function, cannot be copied by the provider and is passed to the store as given. The GTS library keeps its own copy of every entity it stores and hands out a fresh copy on every read, keeping a value JSON cannot represent, such as a function, as the same value. So a caller cannot change a stored instance through the object it registered or read. When a copy replaces different content that a different copy wrote, the provider logs one warning naming the identifier and both copies. Two kinds of instance never log. The runtime registers every action payload only to validate it. A payload has no identifier, and the library stores no instance without one, so the provider validates it against the store and writes it to neither store. It registers each shared property's value under one fixed identifier, again only to validate it, and a second runtime that mirrors the value writes the same content. Whether an identifier is a shared property's value is the library's answer: the provider asks it to match the identifier against the shared-property base type pattern (`Gts.matchIDPattern`).

**The mirror.** The scratch store is shared together with the store, because it is correct only while it mirrors the store. Between any two calls, both stores hold the same entity under every identifier. Neither store of a pair is ever replaced. When a candidate fails validation, the call restores the mirror before it raises the error. If the store holds an entity under the candidate's identifier, the call writes that entity back into the scratch store. Otherwise it removes the candidate from the scratch store (`GtsStore.unregister`). Either way the restore touches one entry, however many entities the realm holds, so a rejected candidate costs its validation and its error. An anonymous payload never touches either store. A rejected call must stay within the registration budget of `cpt-frontx-nfr-runtime-performance`, which a benchmark measures on a populated store. Every store operation is synchronous, and a call does all its reads and writes without awaiting. A realm runs one call at a time, so calls never interleave and need no lock.

**Lifetime.** The pair lives as long as the realm. Nothing disposes it, counts its holders or evicts its entries. `cpt-frontx-adr-shared-dep-cache-reach` holds realm lifetime sound for inert text and not for state with freshness semantics. Type definitions here carry no freshness semantics by contract: GTS gives a changed definition a new identifier, and the first-wins rule enforces that. Instances do carry freshness, and they get it from the last write, not from expiry.

**The port.** The type-substrate port leaves the outcome of re-registering a schema to the provider (`cpt-frontx-state-type-substrate-port-schema-lifecycle`). The runtime never registers a schema twice and relies on neither outcome. So the port does not bind other providers, or the runtime's test doubles, to this provider's rule.

### Consequences

* Good, because a runtime can rely on the types and instances another runtime registered on the same store, which is the purpose of this change.
* Good, because a microfrontend's own schemas, registered through its own copy, reach the registries that admit its actions.
* Good, because copies that differ in store format, GTS library line or built-in set never share, so the built-in entities on a store never depend on which copy loaded first.
* Good, because the provider reads no GTS identifier or entity itself, so its readings cannot drift from the library's.
* Good, because a release that changes neither the GTS library line nor the built-in set keeps sharing with earlier releases.
* Good, because a runtime or a build-time validator that must keep type knowledge of its own constructs an instance with a private store pair, while the default instance always shares.
* Neutral, because verdicts on a pair come from the GTS library copy that published it, usually the host's. A microfrontend built with a later patch of the library is validated with the host's patch.
* Good, because a failed reliance is reported: the opening of a second store logs a warning, and every failing validation names the store it searched and says that something not registered there may be registered later or on another store.
* Good, because a type's definition never changes after it is registered. The GTS library replaces the stored record of a re-registered schema but keeps the earlier schema for reference resolution, so without the first-wins rule a change of content would leave two views of one type.
* Bad, because the shared store couples well-behaved runtimes. One runtime can register a different definition first, or replace an instance another runtime registered. This is a correctness risk, not a new capability for same-realm code (see SEC). The first-wins rule and the conflict and replacement warnings mitigate it. The cases below are its concrete forms.
* Bad, because the first runtime to register a type identifier decides its definition for every runtime on that store. Often that is the shell. A shell that registers every microfrontend's schemas at boot, from copies taken when the shell was built, wins over a redeployed microfrontend whose schema changed under the same identifier. The microfrontend is then validated against the older definition, in its own runtime too. The conflict warning shows both definitions and the copies involved, which is enough to find the stale copy.
* Bad, because schemas an application owns, such as theme, language and screen-extension types, are versioned by the application, not by this provider. Runtimes built from different releases of those schemas collide on them under the first-wins rule.
* Bad, because in development a schema edited without a new identifier takes effect only after a full page reload. Hot module replacement re-registers it, and the edit is refused with a warning.
* Bad, because a runtime can replace an instance that another runtime registered. The runtime looks up manifests and entries by identifier, so every runtime then reads the later content. The replacement warning makes this visible.
* Bad, because a reference check asks whether an identifier exists anywhere on the store. An action that names a target registered only in another runtime passes type validation and then fails at handler resolution, which still leads to its fallback.
* Bad, because sharing relies on the GTS library keeping its store operations and entity shape stable within a line. Recognition by shape catches a missing operation, not a changed meaning.
* Bad, because a definition that spells something differently from the held one, such as `gts://X~` against `X~`, draws a conflict warning although the library would read both alike.
* Bad, because a definition that is valid JSON but that the validator cannot compile is not detected before it is written. The GTS library offers no compile check. It then holds its identifier for the realm, and every validation against it fails with the validator's error.
* Bad, because the store's validator keeps a compiled validator for every validation call, a GTS library behaviour. Memory therefore grows with the number of validations, not with the number of identifiers. Sharing gathers that growth into one store instead of spreading it over many.

### Confirmation

Automated tests in the provider package confirm this decision.

* Tests that evaluate two independent copies confirm that compatible copies adopt one store pair, even when the adopted stores belong to a class foreign to the adopting copy. A schema registered through one copy validates an instance registered through the other.
* Tests of the key confirm that two library lines, or two built-in sets that differ in one schema, give different keys. They confirm that two patch versions on one GTS library line, and two package versions with otherwise equal inputs, give the same key.
* Tests confirm the warnings: when a second key opens, when an entry is not recognized, when a type definition conflicts, and when another copy's instance is replaced. They confirm that a conflict reported once stays silent afterwards, and that action payloads and shared-property values never log.
* Tests confirm that every failed validation names the store key and carries the conditional hint, including a failure caused by a missing `x-gts-instance-ref` target such as an extension's domain.
* Tests confirm that a second construction, and any re-registration of identical content, changes no stored entity and logs nothing. They confirm that a definition differing only in spelling, such as `gts://X~` against `X~`, draws one conflict warning and leaves the first definition in force.
* Tests confirm that `register` and `registerSchema` give the same outcome for a schema in an empty and in a populated store, and that changing a registered object, or an object `getSchema` returned for a schema or for an instance whose content is JSON, does not change what the store holds.
* Tests confirm that an instance constructed with a private store pair starts from the built-in set, follows the same write rules and never reads or writes the realm slot, and that the default instance always shares.
* Tests confirm that after a rejected candidate both stores hold the same entities again, and a benchmark confirms that a rejected candidate stays within the registration budget.

Review confirms that every store access in a call is synchronous, that the shared store adds no port method and needs no wiring, and that the provider interprets no GTS identifier or entity outside the GTS library.

## Pros and Cons of the Options

### One store per provider instance

Each instance constructs its own store pair.

* Good, because it holds no realm state and needs no protocol.
* Good, because one runtime cannot affect another runtime's verdicts.
* Bad, because no runtime can rely on another's registrations, and every runtime must register every definition it uses.
* Bad, because a microfrontend's own schemas reach no registry.

### One store pair per compatible copy

The slot key names the store format, the GTS library line and a hash of the built-in set.

* Good, because runtimes share wherever their copies agree on meaning.
* Good, because unrelated releases keep sharing.
* Good, because it follows the realm protocol the platform already uses.
* Neutral, because it keeps mutable state at a well-known realm slot, as the shared-dependency cache already does.
* Neutral, because within a line, verdicts follow the library copy that published the pair.
* Bad, because the store format must be bumped by hand when the entry or the meaning of its data changes.
* Bad, because one runtime's registrations affect what every other runtime on the store admits.

### One store pair per provider release

The slot key names the provider's exact package version.

* Good, because it is simple, and copies of one release always agree.
* Bad, because a patch release that changes nothing relevant stops sharing, so a host and a microfrontend one patch apart cannot rely on each other.
* Bad, because a locally built copy carries a published version string while its content may differ.

### One store pair per store format

Every copy in the realm shares one pair, whatever its built-in set or library.

* Good, because the most runtimes share.
* Bad, because two copies that hold different content under one built-in identifier keep whichever arrived first, so a verdict depends on load order.
* Bad, because copies on different GTS library lines would wrap entities for a store they may not agree with.

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

**Bundled choices.** This record deliberately bundles the store's reach, its key and protocol, the write rules and the private store pair, because each depends on the others: a store is safe to share only under a key that names what decides meaning and under write rules that keep one runtime from changing a type another relies on, and the private store pair is the one exception to that reach.

**Relation to other decisions.** This decision bears on three accepted decisions.

* `cpt-frontx-adr-default-type-substrate-provider` registers the built-in set at construction, into the store compatible copies share, and every construction after the first on a store is a silent no-op.
* `cpt-frontx-adr-action-dispatch-and-chaining` treats a forwarded target identifier as opaque, because each registry has its own injected provider and the runtime cannot assume two registries share one.
* `cpt-frontx-adr-mfe-load-isolation` gives every load its own module graph, including its own copy of the provider and of the GTS library. Its statement of a microfrontend's blast radius notes that microfrontends whose providers share a store share type registrations, and that this adds no capability for same-realm code.

This decision follows the protocol of `cpt-frontx-adr-shared-dep-cache-reach` and does not amend it. It differs in three ways. Its key names what decides meaning: the store format, the GTS library line and the built-in set. It holds mutable registry state, not inert source text, and the Lifetime paragraph above explains why realm lifetime still fits. It has no capacity bound, because it holds the realm's type vocabulary rather than a cache.

The runtime sees types only by identity and reaches them only through its injected provider, as `cpt-frontx-adr-runtime-type-system-coupling` decides.

**Present detail.** For accuracy, and as non-binding present detail: the slot is `Symbol.for('@gears-frontx/gts-plugin:gts-store:2:<library line>:<built-in hash>')`. The key input is the field `libraryLine`, computed by `compatibleLine(version)` from the GTS library version this package was built against: `0.<minor>` below 1.0, and the major from 1.0. The warning about a second store names "the GTS library line" when that is the part that differs. The built-in hash is a 53-bit cyrb53 hash of the built-in set serialized with sorted keys, in hexadecimal. The key index is `Symbol.for('@gears-frontx/gts-plugin:gts-store-keys')`. The FEATURE that owns the provider's behaviour owns these shapes (`cpt-frontx-algo-gts-type-provider-realm-store-rendezvous`).

**Guidance for consumers.** A shell that registers microfrontend schemas should expect the first registration to win, so a schema that changes takes a new type identifier. A runtime or a build-time validator that must not see, or add to, the realm's shared type knowledge constructs its provider instance with a private store pair; everything else uses the default instance, which always shares.

**Review trigger.** Each trigger matches a warning the provider logs, so each can fire in practice. Revisit the key if the warning about a second store appears in applications that expect to share. Revisit the instance rule if the replacement warning shows one runtime replacing another's manifest, entry, domain or extension. Revisit the type rule if conflict warnings show stale definitions winning in deployed applications. Revisit both rules if the port gains a call that validates without persisting, because that call would remove the reason instances replace one another. Revisit the residual on uncompilable definitions if the GTS library gains a compile check. Revisit the structural comparison if the GTS library gains an operation that compares two entities. Revisit the key if the GTS library starts to export the version of the GTS specification it implements, which would name agreement more precisely than its own release line. The GTS library returns structured validation issues and exports its reference validator, so the reliance hint could name the exact missing identifier. Doing so is separate work.

**Checklist applicability.**

* ARCH — applicable and addressed above. This fixes where the default provider keeps its state and how copies converge on it. A published slot with adopters is costly to reverse.
* SEC — applicable and addressed here (SEC-ADR-001). The decision gives same-realm code no new capability. The threat model is the one `cpt-frontx-adr-mfe-load-isolation` states, and that decision isolates module records, not the realm. Microfrontend code already runs in the host's realm. There it can patch `GtsStore.prototype`, the validator, `JSON` or dispatch, or substitute shared-dependency source text that other loads evaluate (`cpt-frontx-adr-shared-dep-cache-reach`). Registering a type first, or replacing an instance, through the provider's public methods gives such code nothing it does not already have. What the shared store does add is a correctness risk between well-behaved runtimes, recorded under Consequences: one runtime can register a different definition first, or replace another runtime's instance. The first-wins rule and the conflict and replacement warnings mitigate it. Admission runs at the registry that executes an action. No secret or credential is introduced.
* INT — applicable. The entry is an internal contract between copies of one package, versioned by the store format. The port's re-registration outcome is provider-defined. Sharing adds no port method; the provider's public surface carries one construction option, a private store pair, and the default instance always shares.
* PERF — applicable. A rejected candidate must be refused within the registration budget of `cpt-frontx-nfr-runtime-performance`. Restoring the mirror touches one entry, so the cost is the candidate's validation and its error, not the realm-wide entity count; a benchmark measures it on a populated store. The validator's per-validation memory growth is a GTS library behaviour, unchanged in total by this decision.
* REL — applicable. A malformed or foreign entry degrades a copy to a local store pair. It never fails construction.
* MAINT — applicable. The store format must be bumped with any change to the entry or to the meaning of its data, and an entry-contract test pins the entry's shape. The provider's pin on the GTS library becomes load-bearing: the key takes the GTS library line from it, and sharing relies on the library's semantic versioning within that line. Every reading of GTS stays in the library, so a change in GTS meaning reaches the provider only through a library release.
* TEST — applicable. Tests of sharing reset the realm slot and key index, and evaluate independent copies with stores of a foreign class.
* DATA — applicable and addressed above. Nothing is persisted, and the stores live in memory for the realm's lifetime, but the decision fixes how stored data changes: the first definition registered under a type identifier stands, the last valid write of an instance replaces what the store held, and the store format number names the shape and meaning of the stored data.
* OPS — Not applicable, because no deployed-service procedure is governed.
* COMPL — Not applicable because no regulated or personal data is processed.
* UX — Not applicable, because the decision has no end-user-facing behaviour.
* BIZ — Not applicable, because product requirements live in the PRD and are cited by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-fr-application-type-definitions` — a type definition an application registers at runtime reaches every runtime whose provider copy opens the same store.
* `cpt-frontx-fr-gts-realm-shared-type-store` — the provider requirement this decision realizes: compatible copies share one store pair, runtimes may rely on it, and the first definition of a type stands.
* `cpt-frontx-fr-mfe-type-validation` — admission validates through the injected provider, against knowledge that spans the store.
* `cpt-frontx-interface-type-system` — the default provider instance, and every instance constructed without a private store pair, shares its copy's store pair, and the decision adds no member to the interface.
* `cpt-frontx-component-type-system-plugin` — this decision fixes where the Type System Plugin keeps its state.
* `cpt-frontx-constraint-gts-plugin-realm-shared-store` — the member constraint this decision establishes.
* `cpt-frontx-constraint-gts-plugin-delegates-gts-interpretation` — the member constraint every write rule here sits on: the provider reads GTS only through the GTS library.
* `cpt-frontx-state-type-substrate-port-schema-lifecycle` — the port lifecycle this decision makes provider-defined for a re-registered schema.
* `cpt-frontx-algo-gts-type-provider-realm-store-rendezvous` — the algorithm that realizes the slot, its key, its recognition, its warnings and the local fallback.
* `cpt-frontx-dod-gts-type-provider-realm-shared-store` — the definition of done that fixes the write rules, the mirror and test isolation.
* `cpt-frontx-nfr-runtime-performance` — the registration budget this decision holds a rejected candidate to.
* `cpt-frontx-nfr-security` — this decision gives same-realm code no new capability, as SEC above records; the coupling it adds between runtimes is a correctness risk, recorded under Consequences.
