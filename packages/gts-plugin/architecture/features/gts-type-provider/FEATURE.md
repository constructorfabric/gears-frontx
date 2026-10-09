# Feature: GTS Default Type-System Provider


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Validate MFE Extension Type at Registration](#validate-mfe-extension-type-at-registration)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Infrastructure Registration Into a Shared or Private Store Pair](#infrastructure-registration-into-a-shared-or-private-store-pair)
  - [Realm Store Rendezvous](#realm-store-rendezvous)
  - [Canonical Form of Content](#canonical-form-of-content)
  - [Schema Write](#schema-write)
  - [Instance Write](#instance-write)
  - [Mirror Restore](#mirror-restore)
  - [Schema Validation](#schema-validation)
  - [Type-Of Hierarchy Resolution](#type-of-hierarchy-resolution)
  - [Runtime Registration Against the Store Pair](#runtime-registration-against-the-store-pair)
- [4. States (CDSL)](#4-states-cdsl)
  - [Provider Initialization State Machine](#provider-initialization-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Infrastructure Schema Ownership](#infrastructure-schema-ownership)
  - [Type Validation and Hierarchy Resolution](#type-validation-and-hierarchy-resolution)
  - [Realm-Shared Type Store](#realm-shared-type-store)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-gts-type-provider`
## 1. Feature Context

- [x] `p2` - `cpt-frontx-feature-gts-type-provider`

### 1.1 Overview

The GTS Default Type-System Provider (`@gears-frontx/gts-plugin` — target) implements the MFE Runtime's opaque type-substrate port over the Global Type System (GTS) specification, owning the ecosystem's infrastructure schemas and default lifecycle instances, and supplying schema validation and type-of hierarchy resolution ready to use immediately after construction.

Provider instances share what they know across a JavaScript realm. A composed application evaluates a copy of the provider in each runtime that imports it. Copies with the same store format, the same GTS library version and the same built-in schemas open one shared store pair, so a runtime can rely on the types and instances another runtime registered there. The first definition registered under a type identifier stands. An instance constructed with the isolation option keeps a private store pair instead.

Two algorithms carry a `-v2` identifier, `cpt-frontx-algo-gts-type-provider-infra-registration-v2` and `cpt-frontx-algo-gts-type-provider-runtime-registration-v2`. Each replaced an earlier algorithm that described one private store per provider instance and has been removed. The suffix stays because the kit's identifiers are not reused.

### 1.2 Purpose

This feature makes the MFE Runtime ready to validate microfrontends and extensions without requiring every consumer to author a type system. It confines the concrete type-definition specification to a single injectable component, keeping every other published-libraries concern agnostic of the schema format.

**Requirements**: `cpt-frontx-fr-mfe-type-validation`, `cpt-frontx-fr-application-type-definitions`, `cpt-frontx-fr-gts-realm-shared-type-store`

**Principles**: `cpt-frontx-principle-opaque-type-substrate`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Wires the provider into the registry factory and registers application type definitions at runtime through the type-substrate port |

### 1.4 References

- **PRD**: [PRD.md](../../../../../architecture/PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADRs**: `cpt-frontx-adr-default-type-substrate-provider`, `cpt-frontx-adr-realm-shared-gts-store`
- **Dependencies**: `cpt-frontx-feature-type-substrate-port`

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor (human or external system) and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### Validate MFE Extension Type at Registration

- [x] `p1` - **ID**: `cpt-frontx-flow-gts-type-provider-validate-extension-type`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Extension type identifier is recognized and validates successfully; the runtime admits the extension.

**Error Scenarios**:
- Extension type identifier does not derive from the expected base type — runtime rejects the extension with a type-mismatch error.
- Extension instance data does not satisfy the registered schema — runtime rejects the extension with validation errors.
- No schema is registered for the declared type identifier — runtime rejects the extension with an unknown-type error.

**Steps**:
1. [x] - `p1` - Actor supplies an extension definition to the MFE Runtime with a declared type identifier. - `inst-vt-01`
2. [x] - `p1` - Runtime delegates type-derivation resolution to the provider: invokes `isTypeOf` with the extension's declared type identifier and the expected infrastructure base type. - `inst-vt-02`
3. [x] - `p1` - Provider applies the GTS prefix-matching rule to determine whether the declared type derives from the base type. - `inst-vt-03`
4. [x] - `p1` - **IF** the declared type does not derive from the expected base type: - `inst-vt-04`
   1. [x] - `p1` - Provider returns a negative derivation result. - `inst-vt-04a`
   2. [x] - `p1` - Runtime rejects the extension with a type-mismatch error. - `inst-vt-04b`
   3. [x] - `p1` - **RETURN** rejected extension registration. - `inst-vt-04c`
5. [x] - `p1` - Runtime delegates instance validation to the provider: invokes `validateInstance` for the extension's instance identifier. - `inst-vt-05`
6. [x] - `p1` - **IF** no schema is registered for the instance's type: - `inst-vt-06`
   1. [x] - `p1` - Provider returns a validation failure indicating an unknown type. - `inst-vt-06a`
   2. [x] - `p1` - Runtime rejects the extension. - `inst-vt-06b`
   3. [x] - `p1` - **RETURN** rejected extension registration. - `inst-vt-06c`
7. [x] - `p1` - Provider validates the instance data against the resolved schema. - `inst-vt-07`
8. [x] - `p1` - **IF** validation fails: - `inst-vt-08`
   1. [x] - `p1` - Provider returns a failure result with error details. - `inst-vt-08a`
   2. [x] - `p1` - Runtime rejects the extension with the reported validation errors. - `inst-vt-08b`
   3. [x] - `p1` - **RETURN** rejected extension registration. - `inst-vt-08c`
9. [x] - `p1` - Provider returns a validation success result. - `inst-vt-09`
10. [x] - `p1` - Runtime proceeds to admit the extension. - `inst-vt-10`
11. [x] - `p1` - **RETURN** successful extension registration. - `inst-vt-11`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. Examples: database layer operations, authorization logic, middleware, validation routines, library functions, background jobs. These are reusable building blocks called by Actor Flows or other processes.

### Infrastructure Registration Into a Shared or Private Store Pair

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-infra-registration-v2`

**Input**: The construction options. `isolated` is absent or false unless the caller asks for a private store pair.

**Output**: The provider's store pair holds the built-in schemas and the validated built-in lifecycle stage instances; the provider transitions to READY state.

**Steps**:
1. [x] - `p1` - Load the full set of ecosystem infrastructure schema definitions from the declared schema sources (13 schemas: 8 core, 2 MF-specific, 3 extension action schemas), and the set of default lifecycle stage instances from the declared instance sources (4 instances: init, activated, deactivated, destroyed). Each concrete action schema (`mount_ext`, `unmount_ext`, `load_ext`) is self-contained — it re-declares every property the base action schema (`action.v1`) would otherwise provide — and closed: `additionalProperties: false` at its own top level and on its own `payload`, so an undeclared field on either is rejected at validation. The base action schema (`action.v1`) stays open. `mount_ext` and `unmount_ext` each declare an optional `history` property — a strictly typed enum of `none`, `replace`, and `push` — rejected when present with any other value. - `inst-irv2-load`
2. [x] - `p1` - **IF** the provider is constructed with `isolated: true`, create a private store pair for this provider instance, as every instance had before realm sharing. A private pair holds the same fields a realm entry holds. It touches no realm slot and no key index, and logs no join. - `inst-irv2-private`
3. [x] - `p1` - **ELSE** obtain the store pair through the realm store rendezvous (`cpt-frontx-algo-gts-type-provider-realm-store-rendezvous`), passing it the loaded built-in sets. - `inst-irv2-shared`
4. [x] - `p1` - **FOR EACH** built-in schema, write it through the schema write (`cpt-frontx-algo-gts-type-provider-schema-write`). When the pair already holds the same content, the write changes nothing and logs nothing, so every construction after the first on a store is a silent no-op. - `inst-irv2-schemas`
5. [x] - `p1` - **FOR EACH** built-in lifecycle stage instance, write it through the instance write (`cpt-frontx-algo-gts-type-provider-instance-write`), which validates it before it becomes visible: - `inst-irv2-stages`
   1. [x] - `p1` - **IF** the instance write rejects it, abort construction with an error that names the instance and the reported reason. Nothing invalid is left in either store. - `inst-irv2-stage-reject`
6. [x] - `p1` - **RETURN** the provider, ready, with its store pair. - `inst-irv2-return`

### Realm Store Rendezvous

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-realm-store-rendezvous`

**Input**: The realm's global object; the built-in schemas and lifecycle stage instances this copy loaded; and the GTS library version this copy was built against.

**Output**: The store pair this provider instance uses for its lifetime. It is shared with every compatible copy in the realm, or it is local to this evaluated copy when the realm entry cannot be understood.

**Steps**:
1. [x] - `p1` - Compute the built-in hash once per evaluated copy. Put every built-in schema and lifecycle stage instance in canonical form (`cpt-frontx-algo-gts-type-provider-canonical-form`), sort them by identifier, and join their serializations. Hash the result with the 53-bit cyrb53 function and write it as lowercase hexadecimal. The hash function is part of store format 1. Every provider instance of the copy reuses the result. - `inst-rs-hash`
2. [x] - `p1` - Take the GTS library version from the `version` field of the library's own package manifest. The build inlines that value into this package's output; it must not leave an import of a JSON file in the output, which Node's module loader rejects without an import attribute. The tests read the same manifest, so tests and builds agree without a second source. A consumer that overrides this package's exact pin on the library runs a version the key does not name. That is unsupported and is not detected. - `inst-rs-library-version`
3. [x] - `p1` - Derive the slot key `Symbol.for('@gears-frontx/gts-plugin:gts-store:1:<library version>:<built-in hash>')`, where `1` is the store format. The format is bumped in the same change that alters the shape of the slot entry or the meaning of the data the stores hold. The package's own version is not part of the key, so a release that changes neither the library version nor the built-in sets keeps sharing with earlier releases. - `inst-rs-derive-key`
4. [x] - `p1` - Read the slot through an internal accessor that takes the global object and the key inputs as arguments. The accessor and the key live in a module the package entry point does not export. - `inst-rs-read-slot`
5. [x] - `p1` - **IF** the slot holds nothing: - `inst-rs-if-empty`
   1. [x] - `p1` - Create the pair with this copy's GTS library and publish the entry before returning. The entry holds the format, the library version and the built-in hash; the store and the scratch store; a factory that creates a store with the library copy that created the pair; the writer map, from identifier to the token of the copy that wrote what the store holds under it; the set of warnings already reported; and the count of copies that joined. Construction is synchronous, so two copies can never each publish an entry for one key. - `inst-rs-publish`
   2. [x] - `p1` - Append the key's name, the string the slot symbol is created from, to the realm's key index: the array held at `Symbol.for('@gears-frontx/gts-plugin:gts-store-keys')`, created when it is absent. Every store format appends key-name strings to this one index, so any format can read what another wrote. A reader that meets an element that is not a string uses its text form. A value there that is not an array is left alone, and the next step is skipped. - `inst-rs-index`
   3. [x] - `p1` - **IF** the index already held other keys, log a console warning. It names this key and the other keys, and says which part differs: the store format, the GTS library version or the built-in hash. It states that types and instances registered under the other keys are not visible to runtimes on this key. - `inst-rs-warn-new-store`
6. [x] - `p1` - **ELSE IF** the entry is recognized: it is a non-null object; its format, library version and built-in hash equal this copy's; its store and its scratch store each expose `register`, `get`, `getAll` and `validateInstance` as functions; its factory is a function; its writer map exposes `get` and `set`; its reported set exposes `has` and `add`; and its copy count is a number: - `inst-rs-if-recognized`
   1. [x] - `p1` - Adopt the entry. Recognize every part by the operations this copy calls on it, never by class identity. Each copy evaluates its own GTS library, so a store another copy created is an instance of a class this copy does not share. - `inst-rs-adopt`
   2. [x] - `p1` - Adopt a recognized entry whichever same-realm code published it. The slot is trusted same-realm coordination state, so recognition guards against accidental incompatibility and does not establish who published the entry (`cpt-frontx-adr-realm-shared-gts-store`). - `inst-rs-trusted-coordination`
7. [x] - `p1` - **ELSE** the entry is malformed, or holds values this copy does not recognize: - `inst-rs-else-unrecognized`
   1. [x] - `p1` - Log a console warning that names the slot and says this copy works from a local store pair, so registrations other runtimes make are not visible to it. Log it once per evaluated copy, when the copy creates its local pair: the copy's key and situation do not change between constructions, so repeating it adds only noise. Read the entry no further than the recognition check, and never mutate, replace or delete it. - `inst-rs-leave-unrecognized`
   2. [x] - `p1` - Use the pair local to this evaluated copy for this key, creating it on first use with the fields an entry holds. Local pairs are held by key name, so the accessor returns the right pair for whatever key inputs it is given. Every non-isolated provider instance of this copy shares that local pair. - `inst-rs-fallback-local`
8. [x] - `p1` - When this evaluated copy first obtains the pair, increase the pair's copy count and give the copy a writer token that carries the new count as its ordinal. Every provider instance of the copy uses that token. **IF** the copy adopted a pair that another copy published, so its ordinal is 2 or more, log at debug level that copy number N joined the store under its key, so a developer can match the ordinals in later warnings to load order. The copy that publishes a pair is always number 1 and logs nothing, so importing the package in a single-copy setting, such as Node, tests or server rendering, prints nothing. A local or private pair logs no join. - `inst-rs-join`
9. [x] - `p1` - Hold the pair object for the provider instance's lifetime. Read its store, its scratch store and its factory afresh at the start of every port call, and keep no reference to a store after the call returns, because another instance may replace the scratch store between calls (`inst-mr-rebuild`). - `inst-rs-hold-pair`
10. [x] - `p1` - **RETURN** the pair. It lives as long as the realm: nothing disposes it, counts its holders or evicts its entries. - `inst-rs-return`

### Canonical Form of Content

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-canonical-form`

**Input**: A content value: a schema, an instance, or a built-in entity.

**Output**: The value's canonical form, or the verdict that the value is not representable as JSON.

**Steps**:
1. [x] - `p1` - A string, a boolean, null, or a finite number stands for itself. - `inst-cf-scalar`
2. [x] - `p1` - A plain object, whose prototype is the object prototype or null, becomes an object with the same properties in sorted key order. A property whose value is undefined is dropped. A string value under `$id`, `$$id`, `$ref`, `$$ref` or `x-gts-ref` loses a leading `gts://`, because the GTS library treats `gts://X` and `X` as one identifier. - `inst-cf-object`
3. [x] - `p1` - An array becomes an array of its elements in canonical form, in the same order. - `inst-cf-array`
4. [x] - `p1` - **IF** any value reached is not representable, **RETURN** that the content is not representable. These values are not representable: undefined at the top level or as an array element; a hole in a sparse array; NaN or an infinite number; a function, a symbol or a bigint; an object that is neither a plain object nor an array; and an object reached again along its own path, which is a cycle. - `inst-cf-unrepresentable`
5. [x] - `p1` - **RETURN** the canonical form. Two contents are the same when both are representable and their canonical forms serialize to the same text. A content that is not representable is the same as nothing. - `inst-cf-return`

### Schema Write

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-schema-write`

**Input**: A wrapped entity the GTS library classifies as a schema, delivered by `registerSchema` or by `register`; the store pair; and the caller copy's writer token.

**Output**: The pair holds the first definition registered under the identifier.

**Steps**:
1. [x] - `p1` - Refuse the definition before anything is written, with an error that names the identifier and the reason, when its content is not representable as JSON (`cpt-frontx-algo-gts-type-provider-canonical-form`) or its identifier is not a valid GTS type identifier ending in `~`. - `inst-sw-refuse`
2. [x] - `p1` - Look up the identifier in the store. The GTS library strips a leading `gts://` when it extracts an identifier, so `gts://X~` and `X~` find the same entry. - `inst-sw-lookup`
3. [x] - `p1` - **IF** the store holds nothing under the identifier: - `inst-sw-if-new`
   1. [x] - `p1` - Wrap a deep copy of the content, so a later change to the caller's object never reaches the stored definition. Register it in the store and in the scratch store, and record the caller's writer token for the identifier. - `inst-sw-register-both`
   2. [x] - `p1` - **RETURN**. - `inst-sw-return-new`
4. [x] - `p1` - **IF** the held content and the offered content are the same, **RETURN** without writing and without logging. Re-registering the built-in set at every construction takes this path. - `inst-sw-return-same`
5. [x] - `p1` - **IF** the pair has not yet reported a conflict for this identifier with this offered content, record it as reported and log one console warning. The warning names the identifier and the store key. It names, by ordinal, the copy that registered the kept definition and the copy that offered the refused one. It carries the kept content and the refused content. It says that a changed definition needs a new type identifier, and that in development a schema edited without a new identifier takes effect only after a full page reload. A conflict already reported stays silent, so a runtime that registers its schemas on every load does not repeat the warning. - `inst-sw-warn-conflict`
6. [x] - `p1` - **RETURN** without writing to either store and without throwing. - `inst-sw-return-conflict`

### Instance Write

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-instance-write`

**Input**: A wrapped entity the GTS library classifies as an instance; the store pair; and the caller copy's writer token.

**Output**: The store holds the instance under its identifier, validated; or an error is raised and the store is exactly as it was before the call.

**Steps**:
1. [x] - `p1` - Read the pair's current store and scratch store. - `inst-iw-read`
2. [x] - `p1` - **IF** the identifier, after a leading `gts://` is dropped, ends in `~`, or the store holds a schema under it, raise an error that names the identifier and the store key, and write neither store. Content without a `$schema` is an instance to the GTS library even under a type identifier, and writing it would replace a registered definition, which never changes. - `inst-iw-refuse-type`
3. [x] - `p1` - Register the candidate in the scratch store, as offered, and validate it there. Validate the object as the caller gave it, not a copy: a JSON copy drops a key whose value is undefined, and the closed action schemas must still reject an undeclared field set to undefined. This step runs even when the content equals what the store holds, because the canonical form treats undefined as absent. The scratch store mirrors the store, so schema resolution and any reference check see the store's current state without the candidate entering the store. A reference check therefore accepts an identifier that any runtime on this store registered. - `inst-iw-validate`
4. [x] - `p1` - **IF** the result is not ok or not valid: - `inst-iw-if-invalid`
   1. [x] - `p1` - Restore the mirror through the mirror restore (`cpt-frontx-algo-gts-type-provider-mirror-restore`). - `inst-iw-restore`
   2. [x] - `p1` - Raise an error that names the instance, the reason, the resolved schema and the store key. When the reason is a missing schema or a missing referenced identifier, the error also says that the identifier is not registered on this store yet. It may be registered later by another runtime, or it may have been registered by a runtime on a different store, which the warning of `inst-rs-warn-new-store` reports. - `inst-iw-raise`
5. [x] - `p1` - **IF** the identifier is not empty and the store holds the same content under it, put the held entity back in the scratch store, so the scratch store no longer holds the caller's object, and **RETURN** without writing. The writer map does not change. - `inst-iw-return-same`
6. [x] - `p1` - **IF** all of these hold, log one console warning, unless the pair already reported this identifier with this offered content: the identifier is not empty; the instance is not a shared-property value, whose identifier starts with `gts.frontx.mfes.comm.shared_property.v1~`; the store holds different content under the identifier; and the writer map records a different copy for it. The warning names the identifier and the store key, and names by ordinal the copy that wrote the replaced content and the copy replacing it. The pair records the identifier and the offered content as reported. - `inst-iw-warn-replace`
7. [x] - `p1` - Take a deep copy of the candidate and register the copy in both the store and the scratch store, replacing what they held under the identifier, so both hold the same entities and neither holds the caller's object. A later change to the caller's object never reaches a stored instance. Content that is not representable as JSON cannot be copied and is kept as given; it never compares equal to anything. **IF** the identifier is not empty, record the caller's writer token for it. - `inst-iw-commit`
8. [x] - `p1` - **RETURN**. - `inst-iw-return`

### Mirror Restore

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-mirror-restore`

**Input**: The identifier of a candidate instance that failed validation in the scratch store, and the store pair.

**Output**: Both stores of the pair hold the same entity under every identifier again.

**Steps**:
1. [x] - `p1` - **IF** the store holds an entity under the candidate's identifier, register that entity in the scratch store again. This restores exactly what the scratch store held before the candidate was written into it. - `inst-mr-restore-held`
2. [x] - `p1` - **ELSE** create a fresh scratch store with the pair's factory, register in it every entity the store holds, and put it in the pair in place of the old scratch store. A store has no removal call, so a rejected candidate under a new identifier can only be dropped by a rebuild. The factory belongs to the library copy that created the pair, so every store in the pair comes from one copy of the GTS library and of its validator. Every provider instance on the pair reads the new scratch store from its next call (`inst-rs-hold-pair`). - `inst-mr-rebuild`
3. [x] - `p1` - A rebuild touches every entity on the store. It **MUST** complete within the 50 ms p95 registration budget of `cpt-frontx-nfr-runtime-performance` for a store holding 500 type definitions and 500 instances, and a benchmark test confirms it. Only a rejected candidate under an identifier the store does not hold triggers a rebuild; the success path never does. - `inst-mr-budget`
4. [x] - `p1` - **RETURN** with the mirror restored, before the caller raises its error. - `inst-mr-return`

### Schema Validation

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-schema-validation`

**Input**: `instanceId` — the identifier of a previously registered GTS instance.

**Output**: Validation result — success with an empty error list, or failure with a non-empty error list describing the violation.

**Steps**:
1. [x] - `p1` - Request the GTS store to validate the registered instance identified by `instanceId` against its schema. - `inst-sv-01`
2. [x] - `p1` - **IF** the GTS store reports a successful and valid result: - `inst-sv-02`
   1. [x] - `p1` - **RETURN** a success result with an empty error list. - `inst-sv-02a`
3. [x] - `p1` - Compose a failure result containing the GTS store's reported error message. - `inst-sv-03`
4. [x] - `p1` - **RETURN** the failure result. - `inst-sv-04`

### Type-Of Hierarchy Resolution

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-typof-resolution`

**Input**: `typeId` — the type identifier to test; `baseTypeId` — the base type to test derivation against.

**Output**: Boolean — true when `typeId` is identical to or derives from `baseTypeId` in the GTS type hierarchy; false otherwise.

**Steps**:
1. [x] - `p1` - Apply the GTS prefix-matching derivation rule: in GTS a derived type identifier always starts with its base type identifier. - `inst-tr-01`
2. [x] - `p1` - **IF** `typeId` equals `baseTypeId` or `typeId` starts with `baseTypeId`: - `inst-tr-02`
   1. [x] - `p1` - **RETURN** true — the type is the same as or derives from the base type. - `inst-tr-02a`
3. [x] - `p1` - **RETURN** false — no derivation relationship exists. - `inst-tr-03`

Steps 4–10 stand apart from the hierarchy check above: they take neither `typeId` nor `baseTypeId` and return identifiers rather than the Boolean — each is an independent well-known-ID resolver the runtime calls directly.

4. [x] - `p1` - Resolve this plugin's own GTS action-type ID for the framework's well-known `load_ext` lifecycle action - `inst-tr-04`
5. [x] - `p1` - Resolve this plugin's own GTS action-type ID for the framework's well-known `mount_ext` lifecycle action - `inst-tr-05`
6. [x] - `p1` - Resolve this plugin's own GTS action-type ID for the framework's well-known `unmount_ext` lifecycle action - `inst-tr-06`
7. [x] - `p1` - Resolve this plugin's own GTS type ID for the framework's well-known `init` lifecycle stage - `inst-tr-07`
8. [x] - `p1` - Resolve this plugin's own GTS type ID for the framework's well-known `activated` lifecycle stage - `inst-tr-08`
9. [x] - `p1` - Resolve this plugin's own GTS type ID for the framework's well-known `deactivated` lifecycle stage - `inst-tr-09`
10. [x] - `p1` - Resolve this plugin's own GTS type ID for the framework's well-known `destroyed` lifecycle stage - `inst-tr-10`

### Runtime Registration Against the Store Pair

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-runtime-registration-v2`

**Input**: `schema` — a definition supplied at runtime through `registerSchema`; or `entity` — a schema or an instance supplied at runtime through `register`; or `typeId` — the identifier to retrieve through `getSchema`; or `instanceId` — the identifier to validate through `validateInstance`.

**Output**: For a schema, the pair holds the first definition registered under its identifier. For an instance, the pair holds it once it validates, in place of what it held under the identifier; on failure an error is raised and the store is unchanged. For a retrieval, the held content. For a validation request, a structured result.

**Steps**:
1. [x] - `p1` - `registerSchema`: wrap the supplied definition. **IF** the GTS library classifies it as an instance, because it declares no `$schema` naming a JSON Schema meta-schema, refuse it with an error saying that a schema must declare `$schema`. Nothing is written. - `inst-rrv2-schema-classify`
2. [x] - `p1` - `registerSchema`: write the definition through the schema write (`cpt-frontx-algo-gts-type-provider-schema-write`). - `inst-rrv2-schema-write`
3. [x] - `p1` - `register`: wrap the supplied entity. **IF** the GTS library classifies it as a schema, write it through the schema write and **RETURN**. A schema then follows one rule whichever method delivers it and whatever the store already holds, so the outcome never depends on load order. - `inst-rrv2-register-schema`
4. [x] - `p1` - `register`: write the instance through the instance write (`cpt-frontx-algo-gts-type-provider-instance-write`). - `inst-rrv2-register-instance`
5. [x] - `p1` - `getSchema`: look up the identifier in the pair's current store. **IF** the entity is a schema, return a deep copy of its content, so a caller's change never reaches the stored definition. **IF** it is an instance, return its content as before. Return undefined when nothing is held or the content is not an object. - `inst-rrv2-get-schema`
6. [x] - `p1` - `validateInstance`: validate against the pair's current store, as `cpt-frontx-algo-gts-type-provider-schema-validation` describes. **IF** the result fails because the instance, its schema or an identifier it refers to is not found, the first error message carries the store key and the same hint the instance write raises (`inst-iw-raise`): the identifier may be registered later, or may be on a different store. A call that validates an identifier another runtime registered is a direct reliance check, so it reports what it searched. - `inst-rrv2-validate`
7. [x] - `p1` - Perform every read and write of the stores in one port call synchronously, with no await and no callback between the first access and the last. Calls from provider instances that share the pair never interleave, and each call starts and ends with both stores holding the same entities. - `inst-rrv2-synchronous`

## 4. States (CDSL)

### Provider Initialization State Machine

- [x] `p1` - **ID**: `cpt-frontx-state-gts-type-provider-init`

**States**: UNINITIALIZED, INFRA_SCHEMAS_REGISTERED, READY

**Initial State**: UNINITIALIZED

**Transitions**:
1. [x] - `p1` - **FROM** UNINITIALIZED **TO** INFRA_SCHEMAS_REGISTERED **WHEN** all ecosystem infrastructure schemas and default lifecycle stage instances have been registered in the internal GTS store. - `inst-pi-01`
2. [x] - `p1` - **FROM** INFRA_SCHEMAS_REGISTERED **TO** READY **WHEN** every registered lifecycle stage instance has been validated against its schema without error. - `inst-pi-02`

## 5. Definitions of Done

### Infrastructure Schema Ownership

- [x] `p1` - **ID**: `cpt-frontx-dod-gts-type-provider-infra-schema-ownership`

The provider **MUST** register all ecosystem infrastructure schemas and default lifecycle stage instances in the internal GTS store at construction time, and **MUST** validate every lifecycle stage instance against its registered schema before the provider is considered ready. Construction **MUST** fail if any lifecycle stage instance does not satisfy its schema. No solution-specific schemas are registered by the provider at construction. Validating an action **MUST** check only its own leaf schema — the base action schema (`action.v1`) is consulted only when a concrete action schema's own `$ref` names it, never by a separate walk up a schema chain, and never through an `allOf` composition evaluated at validation time. Every concrete action schema the provider registers **MUST** be self-contained and closed, rejecting an undeclared field on itself or on its own `payload`; the base action schema stays open.

**Implements**:
- `cpt-frontx-algo-gts-type-provider-infra-registration-v2`
- `cpt-frontx-state-gts-type-provider-init`

**Constraints**: `cpt-frontx-constraint-gts-plugin-owns-infra-schemas`, `cpt-frontx-constraint-gts-plugin-excludes-solution-schemas`

**Touches**:
- Component: `cpt-frontx-component-type-system-plugin`
- Interface: `cpt-frontx-interface-type-system`
- Entities: `Schema`, `LifecycleStage`

### Type Validation and Hierarchy Resolution

- [x] `p1` - **ID**: `cpt-frontx-dod-gts-type-provider-type-validation`

The provider **MUST** validate registered instances against their schemas and resolve type hierarchy by GTS prefix-matching when invoked through the type-substrate port, returning a structured validation result for every call.

**Implements**:
- `cpt-frontx-flow-gts-type-provider-validate-extension-type`
- `cpt-frontx-algo-gts-type-provider-schema-validation`
- `cpt-frontx-algo-gts-type-provider-typof-resolution`
- `cpt-frontx-algo-gts-type-provider-runtime-registration-v2`

**Constraints**: `cpt-frontx-constraint-gts-plugin-owns-infra-schemas`, `cpt-frontx-constraint-gts-plugin-excludes-solution-schemas`

**Touches**:
- Component: `cpt-frontx-component-type-system-plugin`
- Interface: `cpt-frontx-interface-type-system`
- Entities: `Schema`, `LifecycleStage`

### Realm-Shared Type Store

- [x] `p1` - **ID**: `cpt-frontx-dod-gts-type-provider-realm-shared-store`

**Scope and key.** Every non-isolated provider instance in a JavaScript realm **MUST** use the one store pair whose key matches its store format, GTS library version and built-in hash (`cpt-frontx-algo-gts-type-provider-realm-store-rendezvous`). Copies that differ in any of the three **MUST NOT** share a pair. The package's own version **MUST NOT** be part of the key. The library version **MUST** be inlined at build time from the library's manifest. The built-in hash **MUST** be computed at construction from the built-in sets, once per evaluated copy. The store format **MUST** be bumped in the same change that alters the entry's shape or the meaning of the stored data.

**Diagnostics.** A copy that opens a key while the realm's key index holds other keys **MUST** log a warning that names the keys and the part that differs. The key index **MUST** hold key-name strings. A copy that meets an unrecognized entry **MUST** log a warning once per evaluated copy, **MUST** leave the entry unmutated, unreplaced and undeleted, and **MUST** work from a pair local to its evaluated copy and that key. A copy that adopts a pair another copy published **MUST** log its join at debug level, with its ordinal. The copy that publishes a pair, and every local or private pair, **MUST NOT** log a join.

**Reliance.** A runtime **MAY** rely on a type or an instance that another runtime registered on the same store before the relying call. When an instance, a schema or a referenced identifier is missing, the error that `register` raises and the first error message that `validateInstance` returns **MUST** name it and the store key, and **MUST** say that it may be registered later or may be on a different store.

**Types.** The first definition registered under a type identifier **MUST** stand, whichever method delivers a later one. `register` with a schema **MUST** behave exactly as `registerSchema`. A definition that is not representable as JSON, whose identifier is not a valid type identifier, or that the library classifies as an instance **MUST** be refused with an error before anything is written. The stored definition **MUST** be a deep copy of the offered content, and `getSchema` **MUST** return a deep copy of a stored schema. A later definition with the same canonical content **MUST** change neither store and **MUST NOT** log. A later definition with different content **MUST** change neither store, **MUST NOT** throw, and **MUST** log one warning per identifier and offered content for the life of the pair. That warning **MUST** carry the identifier, the store key, the ordinals of the kept and the refusing copy, both contents, and the rule that a changed definition needs a new identifier.

**Instances.** An instance **MUST** be validated, as the caller offered it, against the pair's current state before it is written, and validation **MUST NOT** be skipped for content equal to what is held. An identifier that ends in `~`, or under which the store holds a schema, **MUST** be refused on the instance path and **MUST NOT** replace a definition. For content that can be represented as JSON, the store **MUST** hold a deep copy of an instance, never the caller's object, in both stores. Other content cannot be copied and is kept as given. An instance that fails validation **MUST NOT** become visible to a lookup through any provider instance on the pair. An instance with the same content as the one held **MUST** be a no-op. Otherwise it **MUST** replace what the store held. Replacing different content that a different copy wrote **MUST** log one warning per identifier and offered content, except for the empty identifier and for shared-property values. Built-in lifecycle stage instances **MUST** be written through the same validated path.

**Mirror.** Both stores **MUST** hold the same entity under every identifier between any two port calls. A call **MUST** read the stores from the pair when it starts and **MUST NOT** keep a reference to either after it returns. A rejected candidate **MUST** leave the mirror restored before the error is raised. A rebuilt scratch store **MUST** be created with the pair's factory. A rebuild **MUST** stay within 50 ms for 500 type definitions and 500 instances. Every port call **MUST** complete all its store reads and writes synchronously.

**Lifetime and surface.** The pair **MUST** live as long as the realm, with no disposal, no holder count and no eviction. `new GtsPlugin({ isolated: true })` **MUST** give that instance a private pair with the same write rules, and **MUST NOT** touch the realm slot or the key index. The options type **MUST** be exported from the package entry point; it is the only addition to the public surface, and it ships in version 0.3.1. The default instance `gtsPlugin` **MUST NOT** be isolated. The port **MUST NOT** gain a method. The slot **MUST NOT** be presented as authenticating its publisher: it is trusted same-realm coordination state (`cpt-frontx-adr-realm-shared-gts-store`). The port's `version` field (`'1.0.0'`) is unrelated to the key and does not change.

**Tests.** Tests **MUST** be isolated from realm state.
- A test that needs a fresh store **MUST** construct the provider with `isolated: true`. `router-admission-gts-store.test.ts` (six tests that reuse identifiers and assert that `getSchema` returns undefined), `register-store-reuse.test.ts` and `action-schema-closure.test.ts` **MUST** switch to it. Consumers whose tests construct several provider instances and expect each to start empty switch to it too; the reference templates live in their own repository and change there.
- A test of sharing **MUST** delete the slot and the key index before it runs and after it ends.
- A test that needs two independently evaluated copies **MUST** reset the module registry and import the package again. That re-evaluates this package but not the externalized GTS library, so the test **MUST** also hand the adopting copy stores of a foreign class: either by inlining the library in the test runner's dependency settings, or by publishing an entry whose stores are plain objects that forward to library stores. A class-identity check then fails the test.
- Key tests **MUST** drive the key derivation with explicit inputs: two library versions, two built-in sets that differ in one schema, and two package versions with otherwise equal inputs, which must yield one key.
- An entry-contract test **MUST** pin the entry's field names and kinds, and state that changing them requires a format bump.
- The package's default instance binds to the slot it found when its module was evaluated, so a test **MUST NOT** assume that the default instance shares a store with an instance constructed after a reset.

**Accepted residuals.** A definition that is valid JSON but that the validator cannot compile is not detected before it is written, because the GTS library offers no compile check. It then holds its identifier for the realm, and every validation against it fails with the validator's error. The store's validator keeps a compiled validator for every validation call, a GTS library behaviour, so its memory grows with the number of validations rather than with the number of identifiers.

**Implements**:
- `cpt-frontx-algo-gts-type-provider-infra-registration-v2`
- `cpt-frontx-algo-gts-type-provider-realm-store-rendezvous`
- `cpt-frontx-algo-gts-type-provider-canonical-form`
- `cpt-frontx-algo-gts-type-provider-schema-write`
- `cpt-frontx-algo-gts-type-provider-instance-write`
- `cpt-frontx-algo-gts-type-provider-mirror-restore`
- `cpt-frontx-algo-gts-type-provider-runtime-registration-v2`

**Constraints**: `cpt-frontx-constraint-gts-plugin-realm-shared-store`

**Touches**:
- Component: `cpt-frontx-component-type-system-plugin`
- Interface: `cpt-frontx-interface-type-system`
- Entities: `Schema`, `LifecycleStage`, `Type store`

## 6. Acceptance Criteria

- [x] The GTS provider registers all ecosystem infrastructure schemas and default lifecycle stage instances at construction, making it ready to use immediately after instantiation.
- [x] Lifecycle stage instances that fail validation during construction cause the provider to abort construction with a descriptive error.
- [x] `isTypeOf` returns true when the declared type identifier equals or starts with the base type identifier, and false otherwise.
- [x] `validateInstance` returns a success result for a registered valid instance and a failure result with error details for an invalid or unrecognized instance.
- [x] The provider owns no solution-specific schemas at construction; application schemas registered at runtime through the port do not affect the infrastructure schema set.
- [x] The provider is injectable as the type-substrate port implementation in the MFE Registry factory without requiring any consumer-authored type configuration.
- [x] An instance of a closed concrete action schema (`mount_ext`, `unmount_ext`, `load_ext`) carrying a field undeclared by that schema, or by its own `payload`, is rejected.
- [x] An instance of `mount_ext` or `unmount_ext` carrying a `history` value outside `none`, `replace`, and `push` is rejected.
- [x] An instance of `mount_ext` or `unmount_ext` carrying a `history` value of `none`, `replace`, or `push`, or carrying no `history` at all, is accepted.
- [x] An instance of a concrete action schema derived from the base action schema (`action.v1`) still validates against its own, self-contained, closed leaf schema.
- [x] Two independently evaluated copies with the same store format, library version and built-in schemas adopt one store pair, even when the adopted stores are of a class foreign to the adopting copy. A schema registered through one copy validates an instance registered through the other.
- [x] Key derivation yields different keys for two library versions and for two built-in sets that differ in one schema, and the same key for two package versions with otherwise equal inputs.
- [x] A copy that opens a key while the realm holds another key logs a warning naming both keys and the part that differs.
- [x] A slot pre-occupied by an unrecognized entry is left exactly as it was; the copy logs a warning and works from a local store pair.
- [x] A runtime relies on an instance another runtime registered: an instance that references it validates without the relying runtime registering it.
- [x] A validation that fails on a missing schema or reference names the identifier and the store key, and says it may be registered later or on another store.
- [x] A second construction on a store, and any re-registration of the same canonical content, changes no stored entity and logs nothing, including when one copy writes `gts://X~` and the other `X~`.
- [x] A different definition under a held type identifier, through `registerSchema` or through `register`, leaves the first in force, does not throw, and logs one warning naming the identifier, the store key, both copies' ordinals and both contents. Offering it again logs nothing.
- [x] `register` and `registerSchema` give the same outcome for a schema in an empty store and in a populated one.
- [x] A definition with no `$schema`, a cyclic or non-JSON content, or an invalid type identifier is refused with an error, and nothing is written.
- [x] Changing the object passed to `registerSchema`, or the object `getSchema` returned for a schema, does not change the stored definition.
- [x] A later valid instance under a held identifier replaces the earlier one. It logs one warning only when another copy wrote the replaced content and the contents differ; an action payload and a shared-property value never log.
- [x] An invalid instance, a built-in lifecycle stage included, is never visible through any instance on the pair.
- [x] An instance carrying an undeclared field set to undefined is rejected by a closed schema, including when the rest of its content equals what is held.
- [x] An instance written under a type identifier, or under an identifier that holds a registered type, is refused with an error and neither store changes, so a registered definition is never replaced through `register`.
- [x] For content that can be represented as JSON, changing an object after registering it never changes the stored instance, and both stores hold the same copy, not the caller's object. Other content is kept as given.
- [x] After a rejected candidate, under a held identifier and under a new one, both stores hold the same entities as seen from every instance on the pair, and a rebuilt scratch store comes from the pair's factory.
- [x] A scratch rebuild over 500 type definitions and 500 instances completes within 50 ms.
- [x] `new GtsPlugin({ isolated: true })` starts from the built-in set alone, sees no realm registration, and leaves the realm slot and key index untouched.
- [x] The package entry point adds only the options type, the provider gains only the options argument, and the port gains no method.
