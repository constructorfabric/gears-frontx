---
version: 3
description: Specifies the GTS default type-system provider that implements the runtime's type-substrate port with infrastructure schemas, schema validation, and type-of hierarchy resolution.
---

# Feature: GTS Default Type-System Provider


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Validate MFE Extension Type at Registration](#validate-mfe-extension-type-at-registration)
  - [Register an Application Schema or Instance](#register-an-application-schema-or-instance)
  - [Construct the Provider](#construct-the-provider)
  - [Read a Schema or Validate an Instance](#read-a-schema-or-validate-an-instance)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Infrastructure Registration Into a Shared or Private Store Pair](#infrastructure-registration-into-a-shared-or-private-store-pair)
  - [Final-Type Closure](#final-type-closure)
  - [Manifest and MFE Entry Types](#manifest-and-mfe-entry-types)
  - [Realm Store Rendezvous](#realm-store-rendezvous)
  - [Canonical Form of Content](#canonical-form-of-content)
  - [Schema Write](#schema-write)
  - [Instance Write](#instance-write)
  - [Mirror Restore](#mirror-restore)
  - [Schema Validation](#schema-validation)
  - [Type-Of Hierarchy Resolution](#type-of-hierarchy-resolution)
  - [Well-Known Identifier Resolution](#well-known-identifier-resolution)
  - [Runtime Registration Against the Store Pair](#runtime-registration-against-the-store-pair)
- [4. States (CDSL)](#4-states-cdsl)
  - [Provider Initialization State Machine](#provider-initialization-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Infrastructure Schema Ownership](#infrastructure-schema-ownership)
  - [Type Validation and Hierarchy Resolution](#type-validation-and-hierarchy-resolution)
  - [Realm-Shared Type Store](#realm-shared-type-store)
  - [Closed Final Types and the Manifest and MFE Entry Contract](#closed-final-types-and-the-manifest-and-mfe-entry-contract)
  - [Public Surface](#public-surface)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-gts-type-provider`
## 1. Feature Context

- [x] `p2` - `cpt-frontx-feature-gts-type-provider`

### 1.1 Overview

The GTS Default Type-System Provider (`@gears-frontx/gts-plugin`) implements the MFE Runtime's opaque type-substrate port over the Global Type System (GTS) specification, owning the ecosystem's infrastructure schemas and default lifecycle instances, and supplying schema validation and type-of hierarchy resolution ready to use immediately after construction.

Provider instances share what they know across a JavaScript realm. A composed application evaluates a copy of the provider in each runtime that imports it. Copies with the same store format, the same compatible line of the GTS library and the same built-in set, meaning the built-in schemas and default lifecycle-stage instances, open one shared store pair, so a runtime can rely on the types and instances another runtime registered there. The first definition registered under a type identifier stands. A caller may construct an instance with the `isolated` option instead: it keeps a private store pair that never touches the realm slot, for a runtime or a build-time validator that must keep type knowledge of its own. The default instance always shares.

The provider gives the runtime's closed manifest and MFE entry contracts their GTS form. Every final type closes against properties it and its base types do not list, while every abstract base type stays open for derivation.

### 1.2 Purpose

This feature makes the MFE Runtime ready to validate microfrontends and extensions without requiring every consumer to author a type system. It confines the concrete type-definition specification to a single injectable component, keeping every other published-libraries concern agnostic of the schema format.

**Requirements**: `cpt-frontx-fr-mfe-type-validation`, `cpt-frontx-fr-application-type-definitions`, `cpt-frontx-fr-gts-realm-shared-type-store`, `cpt-frontx-fr-gts-type-validation`, `cpt-frontx-fr-gts-type-of-resolution`, `cpt-frontx-fr-gts-default-infrastructure-types`, `cpt-frontx-nfr-runtime-performance`

**Principles**: `cpt-frontx-principle-opaque-type-substrate`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Wires the provider into the registry factory and registers application type definitions at runtime through the type-substrate port |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md); for `cpt-frontx-fr-mfe-type-validation` and `cpt-frontx-nfr-runtime-performance`, the [MFE runtime PRD](../../../../mfes/architecture/PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADRs**: `cpt-frontx-adr-default-type-substrate-provider`, `cpt-frontx-gts-plugin-adr-type-store-scope`, `cpt-frontx-adr-mfe-asset-discovery`
- **Dependencies**: `cpt-frontx-feature-type-substrate-port`

**Checklist applicability**:
- PERF — Addressed in §3 (Mirror Restore), which addresses `cpt-frontx-nfr-runtime-performance`: a rejected candidate restores one scratch-store entry, so its cost is its validation and its error.
- SEC — Not applicable because this feature handles no credentials or user data; the realm slot is trusted same-realm coordination state (`cpt-frontx-gts-plugin-adr-type-store-scope`).
- REL — Addressed in §3 (Instance Write; Realm Store Rendezvous) and §4: a rejected instance leaves both stores as they were, an unrecognized slot entry is left untouched and the copy works from a local pair, and a failed construction aborts with nothing held.
- DATA — Addressed in §3 (Canonical Form of Content; Schema Write; Instance Write): content has one canonical form, the first definition of a type stands, and an instance is validated before it is written.
- INT — Addressed in §3 (Manifest and MFE Entry Types; Runtime Registration Against the Store Pair): the provider conforms to the type-substrate port and delegates every reading of GTS identifiers and entities to the GTS library.
- OPS — Addressed in §3 (Realm Store Rendezvous): the realm-store diagnostics are console warnings for a new key beside other keys, an unrecognized entry and a definition conflict, and a debug-level join message.
- MAINT — Addressed in §5 (Public Surface): the package exports a fixed minimal set of symbols and every other symbol stays internal.
- TEST — Addressed in §5 (Realm-Shared Type Store, Tests) and §6: the isolation and key-derivation requirements on tests and the acceptance criteria an implementation is tested against.
- COMPL — Not applicable because this feature handles no regulated or personal data.
- UX — Not applicable because this feature renders no user interface.
- BIZ — Not applicable because this is an internal library feature; its requirements are cited by ID in §1.2.

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
3. [x] - `p1` - Provider applies the GTS prefix-matching rule to determine whether the declared type derives from the base type. This is a known gap under `cpt-frontx-constraint-gts-plugin-delegates-gts-interpretation`, tracked in https://github.com/constructorfabric/gears-frontx/issues/671. - `inst-vt-03`
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

### Register an Application Schema or Instance

- [x] `p1` - **ID**: `cpt-frontx-flow-gts-type-provider-register-application-type`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- A schema registered through `registerSchema` or `register` is held under its identifier, first definition standing, and every provider instance on the pair reads it.
- An instance registered through `register` validates and is held under its identifier, visible to every provider instance on the pair.

**Error Scenarios**:
- A definition that is not representable as JSON, whose identifier the library does not read as a valid type identifier, or that the library classifies as an instance (through `registerSchema`) is refused with an error and nothing is written.
- An instance that fails validation raises an error and both stores are as they were; an instance offered under a type identifier or over a registered type is refused.

**Steps**:
1. [x] - `p1` - Actor offers a schema through `registerSchema`, or a schema or an instance through `register`, at runtime through the type-substrate port. - `inst-ras-offer`
2. [x] - `p1` - Provider handles the offer through `cpt-frontx-algo-gts-type-provider-runtime-registration-v2`, which writes a schema through `cpt-frontx-algo-gts-type-provider-schema-write` and an instance through `cpt-frontx-algo-gts-type-provider-instance-write`. - `inst-ras-register`
3. [x] - `p1` - **IF** the write refuses the offer or the instance fails validation, the provider raises the error those algorithms describe and the actor's registration is rejected. - `inst-ras-reject`
4. [x] - `p1` - **RETURN** the registration complete; the schema or instance is on the store pair every compatible provider instance in the realm reads. - `inst-ras-return`

### Construct the Provider

- [x] `p1` - **ID**: `cpt-frontx-flow-gts-type-provider-construct-provider`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- `new GtsPlugin()` returns a ready provider on the realm's shared store pair, and `new GtsPlugin({ isolated: true })` returns a ready provider on a private store pair.

**Error Scenarios**:
- A built-in schema is refused or a built-in lifecycle stage instance is rejected; construction raises an error and no provider is returned.

**Steps**:
1. [x] - `p1` - Actor constructs the provider, with `isolated: true` when it asks for a private store pair. - `inst-cp-construct`
2. [x] - `p1` - Provider obtains its store pair and writes the built-in schemas and lifecycle stage instances through `cpt-frontx-algo-gts-type-provider-infra-registration-v2`. - `inst-cp-register`
3. [x] - `p1` - **IF** the registration aborts, the actor receives the error and no provider. - `inst-cp-abort`
4. [x] - `p1` - **RETURN** the ready provider, injectable into the registry factory. - `inst-cp-return`

### Read a Schema or Validate an Instance

- [x] `p1` - **ID**: `cpt-frontx-flow-gts-type-provider-read-and-validate`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- `getSchema` returns a copy of the held content, and `validateInstance` returns a success result for a registered valid instance.

**Error Scenarios**:
- `getSchema` finds nothing held, or the content is not an object, and returns undefined.
- `validateInstance` returns a failure result whose first error message carries the store key.

**Steps**:
1. [x] - `p1` - Actor calls `getSchema` with a type identifier or `validateInstance` with an instance identifier through the type-substrate port. - `inst-rv-call`
2. [x] - `p1` - Provider handles the call through `cpt-frontx-algo-gts-type-provider-runtime-registration-v2` (`inst-rrv2-get-schema`, `inst-rrv2-validate`). - `inst-rv-handle`
3. [x] - `p1` - **RETURN** the copy of the held content, or undefined, for `getSchema`; the structured validation result for `validateInstance`. - `inst-rv-return`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. Examples: database layer operations, authorization logic, middleware, validation routines, library functions, background jobs. These are reusable building blocks called by Actor Flows or other processes.

### Infrastructure Registration Into a Shared or Private Store Pair

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-infra-registration-v2`

**Input**: The construction argument. Its `isolated` property is `true` when the caller asks for a private store pair; absent or `false`, the instance shares.

**Output**: The provider's store pair holds the built-in schemas and the validated built-in lifecycle stage instances and the provider is in READY state; or construction aborts with an error and no provider is returned.

**Steps**:
1. [x] - `p1` - Load the full set of ecosystem infrastructure schema definitions from the declared schema sources and the set of default lifecycle stage instances (`init`, `activated`, `deactivated`, `destroyed`) from the declared instance sources. Each concrete action schema (`mount_ext`, `unmount_ext`, `load_ext`) is self-contained — it re-declares every property the base action schema (`action.v1`) would otherwise provide — and closed: it is a final type and closes as `cpt-frontx-algo-gts-type-provider-type-closure` describes, and its own `payload` is closed too, so an undeclared field on either is rejected at validation. The base action schema (`action.v1`) stays open, and checks `type` against the action family (`gts.frontx.mfes.comm.action.v1~*`), not against `/$id`: it also checks the action of every lifecycle hook's actions chain, inside a domain or an extension, and the GTS library resolves `/$id` to the type of the instance being validated at any depth, which there is the domain or extension type. Each concrete action schema checks its own `type` with `/$id`. `mount_ext` and `unmount_ext` each declare an optional `history` property — a strictly typed enum of `none`, `replace`, and `push` — rejected when present with any other value. - `inst-irv2-load`
2. [x] - `p1` - **IF** the provider is constructed with `isolated: true`, create a private store pair for this provider instance. A private pair holds the same fields a realm entry holds. It touches no realm slot and no key index, and logs no join. - `inst-irv2-private`
3. [x] - `p1` - **ELSE** obtain the store pair through the realm store rendezvous (`cpt-frontx-algo-gts-type-provider-realm-store-rendezvous`), passing it the loaded built-in sets. - `inst-irv2-shared`
4. [x] - `p1` - **FOR EACH** built-in schema, write it through the schema write (`cpt-frontx-algo-gts-type-provider-schema-write`). When the pair already holds the same content, the write changes nothing and logs nothing, so every construction after the first on a store is a silent no-op: - `inst-irv2-schemas`
   1. [x] - `p1` - **IF** the schema write refuses the schema, abort construction with the error of `inst-sw-refuse`. No provider is returned. - `inst-irv2-schema-refuse`
5. [x] - `p1` - **FOR EACH** built-in lifecycle stage instance, write it through the instance write (`cpt-frontx-algo-gts-type-provider-instance-write`), which validates it before it becomes visible: - `inst-irv2-stages`
   1. [x] - `p1` - **IF** the instance write rejects it, abort construction with an error that names the instance and the reported reason. Nothing invalid is left in either store. - `inst-irv2-stage-reject`
6. [x] - `p1` - **RETURN** the provider, ready, with its store pair. - `inst-irv2-return`

### Final-Type Closure

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-type-closure`

**Input**: An instance validated against a built-in type: a final type, from which no type derives, or an abstract base type, from which other types derive.

**Output**: The GTS library's verdict, closed for a final type and open for an abstract base type.

**Steps**:
1. [x] - `p1` - Treat as final types — those from which no type derives — the domain (`domain.v1`), actions chain (`actions_chain.v1`), lifecycle hook (`hook.v1`), lifecycle stage (`stage.v1`), manifest (`gts.frontx.mfes.mfe.mf_manifest.v1~`), MFE entry (`gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~`) and the three concrete action types (`load_ext`, `mount_ext`, `unmount_ext`). Treat as abstract base types — those from which other types derive — the base action (`action.v1`), the base MFE entry (`gts.frontx.mfes.mfe.entry.v1~`), the extension (`extension.v1`) and the shared property (`shared_property.v1`). - `inst-tc-kinds`
2. [x] - `p1` - Close every final type at its own top level with `unevaluatedProperties: false`. The GTS library's validator then rejects a property that neither the final type nor any of its base types lists, accepts every property a base type lists, and enforces the `required` fields of every base type. The provider adds no check of its own to any of them (`cpt-frontx-constraint-gts-plugin-delegates-gts-interpretation`). - `inst-tc-final-closed`
3. [x] - `p1` - Close every object a final type declares inline. An object with named properties rejects any property it does not name (`additionalProperties: false`): the manifest's `metaData`, each element of its `shared` array, the MFE entry's `exposeAssets` with its `js` and `css`, and the `payload` of `load_ext`, `mount_ext` and `unmount_ext`. An object keyed by name, the manifest's `entryLists`, accepts any key and only values of its declared shape, each of them closed in turn. A nested object that references a final type through `$ref` is closed by that type's own closure: a domain's `lifecycle` item by the lifecycle hook type, a hook's `actions_chain` and a chain's `next` and `fallback` by the actions chain type. A nested object that references an abstract base type through `$ref`, such as the `action` of an actions chain, stays open inside the chain type; each concrete action is validated against its own closed type when it is admitted for dispatch (`cpt-frontx-flow-mfe-host-communication-dispatch-chain`, `inst-admit-action`). - `inst-tc-nested-closed`
4. [x] - `p1` - Leave every abstract base type open: it carries neither `unevaluatedProperties: false` nor `additionalProperties: false` at its own top level, so a derived type can add properties. Its `required` fields still apply to every type derived from it. - `inst-tc-abstract-open`
5. [x] - `p1` - **RETURN** the library's verdict. A rejection reaches the caller as every validation failure does (`inst-iw-raise`). - `inst-tc-return`

### Manifest and MFE Entry Types

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-manifest-entry-types`

**Input**: A manifest instance or an MFE entry instance offered through the type-substrate port.

**Output**: Acceptance when the instance carries exactly the fields of the closed manifest or MFE entry contract that `cpt-frontx-adr-mfe-asset-discovery` fixes, with every required field present and every value in its format; rejection otherwise. The two stylesheet lists of `exposeAssets.css` are named `sync` and `async`.

**Steps**:
1. [x] - `p1` - Realize the runtime's closed manifest and MFE entry contracts as the final manifest type and the final MFE entry type, closed as `cpt-frontx-algo-gts-type-provider-type-closure` describes. Each lists the fields the runtime reads and the GTS identity and reference fields, and nothing else. - `inst-me-final`
2. [x] - `p1` - The manifest type lists: `id`, the manifest's GTS instance identity, required; `metaData`, required, an object with `publicPath`, a required string, and `sharedBase`, an optional string; `entryLists`, optional, an object keyed by exposed module whose every value is an object with `location`, a required string, and `contentHash`, required; and `shared`, required, an array whose every element is an object with `name`, `version` and `chunkPath`, each a required non-empty string, and `contentHash`, optional. - `inst-me-manifest-fields`
3. [x] - `p1` - The MFE entry type derives from the base MFE entry type and inherits its fields: `id`, the entry's GTS instance identity, required; `requiredProperties`, required; `optionalProperties`, optional; `actions`, required; and `domainActions`, required. It adds: `manifest`, required; `exposedModule`, a required non-empty string; and `exposeAssets`, required, an object with `js`, a required object with `sync`, a required array of strings with at least one element, and `css`, a required object holding the contract's two stylesheet lists, the synchronous one and the asynchronous one, each a required array of strings. - `inst-me-entry-fields`
4. [x] - `p1` - `manifest` is a GTS instance reference to the manifest type (`x-gts-instance-ref`): its value is the identifier of a registered manifest instance, and the reference check of `inst-iw-validate` accepts it only when the store holds an entity under that identifier. - `inst-me-manifest-ref`
5. [x] - `p1` - Enforce the contract's value formats in the types: every `shared[].name` contains no `:`; every `shared[].version` contains neither `:` nor `@`; and every `contentHash`, in a `shared` element and in an `entryLists` value, is exactly 64 lowercase hexadecimal characters (`^[0-9a-f]{64}$`). - `inst-me-formats`
6. [x] - `p1` - **IF** the instance carries a property outside its type's fields at any level, lacks a required field, has an empty `exposeAssets.js.sync`, or holds a `name`, `version` or `contentHash` outside its format: - `inst-me-if-invalid`
   1. [x] - `p1` - **RETURN** the library's rejection, raised or reported as every validation failure is (`inst-iw-raise`, `inst-rrv2-validate`). - `inst-me-reject`
7. [x] - `p1` - **RETURN** acceptance. - `inst-me-return`

### Realm Store Rendezvous

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-realm-store-rendezvous`

**Input**: The realm's global object; the built-in schemas and lifecycle stage instances this copy loaded; and the compatible line of the GTS library this copy was built against.

**Output**: The store pair this provider instance uses for its lifetime. It is shared with every compatible copy in the realm, or it is local to this evaluated copy when the realm entry cannot be understood.

**Steps**:
1. [x] - `p1` - Compute the built-in hash once per evaluated copy. Put every built-in schema and lifecycle stage instance in canonical form (`cpt-frontx-algo-gts-type-provider-canonical-form`), sort them by identifier, and join their serializations. Hash the result with the 53-bit cyrb53 hash algorithm and write it as lowercase hexadecimal. The hash algorithm is part of the store format. Every provider instance of the copy reuses the result. - `inst-rs-hash`
2. [x] - `p1` - Take the compatible line of the GTS library from the `version` field of the library's own package manifest: `0.<minor>` while the library is in 0.x, and the major from 1.0 on (`cpt-frontx-gts-plugin-adr-type-store-scope`). The build inlines that value into this package's output, which holds no import of a JSON file. The tests read the same manifest, so tests and builds agree without a second source. A consumer that overrides this package's exact pin on the library runs a version outside the line the key names, which is unsupported and not detected. - `inst-rs-library-version`
3. [x] - `p1` - Derive the slot key `Symbol.for('@gears-frontx/gts-plugin:gts-store:2:<library line>:<built-in hash>')`, where `2` is the store format. The format is bumped in the same change that alters the shape of the slot entry or the meaning of the data the stores hold. The package's own version is not part of the key, so a release that changes neither the library line nor the built-in sets keeps sharing with earlier releases. - `inst-rs-derive-key`
4. [x] - `p1` - Read the slot through an internal accessor that takes the global object and the key inputs as arguments. The accessor and the key live in a module the package entry point does not export. - `inst-rs-read-slot`
5. [x] - `p1` - **IF** the slot holds nothing: - `inst-rs-if-empty`
   1. [x] - `p1` - Create the pair with this copy's GTS library and publish the entry before returning. The entry holds the format, the library line and the built-in hash; the store and the scratch store, both created with this copy's GTS library; the writer map, from identifier to the token of the copy that wrote what the store holds under it; the set of warnings already reported; and the count of copies that joined. Construction is synchronous, so two copies can never each publish an entry for one key. - `inst-rs-publish`
   2. [x] - `p1` - Append the key's name, the string the slot symbol is created from, to the realm's key index: the array held at `Symbol.for('@gears-frontx/gts-plugin:gts-store-keys')`, created when it is absent. Every store format appends key-name strings to this one index, so any format can read what another wrote. A reader that meets an element that is not a string uses its text form. A value there that is not an array is left alone, and the next step is skipped. - `inst-rs-index`
   3. [x] - `p1` - **IF** the index already held other keys, log a console warning. It names this key and the other keys, and says which part differs: the store format, the GTS library line or the built-in hash. It states that types and instances registered under the other keys are not visible to runtimes on this key. - `inst-rs-warn-new-store`
6. [x] - `p1` - **ELSE IF** the entry is recognized: it is a non-null object; its format, library line and built-in hash equal this copy's; its store and its scratch store each expose `register`, `unregister`, `get`, `getAll`, `validateInstance` and `validateTransientInstance` as callable members; its writer map exposes `get` and `set`; its reported set exposes `has` and `add`; and its copy count is a number: - `inst-rs-if-recognized`
   1. [x] - `p1` - Adopt the entry. Recognize every part by the operations this copy calls on it, never by class identity. Each copy evaluates its own GTS library, so a store another copy created is an instance of a class this copy does not share. - `inst-rs-adopt`
   2. [x] - `p1` - Adopt a recognized entry whichever same-realm code published it. The slot is trusted same-realm coordination state, so recognition guards against accidental incompatibility and does not establish who published the entry (`cpt-frontx-gts-plugin-adr-type-store-scope`). - `inst-rs-trusted-coordination`
7. [x] - `p1` - **ELSE** the entry is malformed, or holds values this copy does not recognize: - `inst-rs-else-unrecognized`
   1. [x] - `p1` - Log a console warning that names the slot and says this copy works from a local store pair, so registrations other runtimes make are not visible to it. Log it once per evaluated copy, when the copy creates its local pair: the copy's key and situation do not change between constructions, so repeating it adds only noise. Read the entry no further than the recognition check, and never mutate, replace or delete it. - `inst-rs-leave-unrecognized`
   2. [x] - `p1` - Use the pair local to this evaluated copy for this key, creating it on first use with the fields an entry holds. Local pairs are held by key name, so the accessor returns the right pair for whatever key inputs it is given. Every provider instance of this copy constructed without `isolated` shares that local pair. - `inst-rs-fallback-local`
8. [x] - `p1` - When this evaluated copy first obtains the pair, increase the pair's copy count and give the copy a writer token that carries the new count as its ordinal. Every provider instance of the copy uses that token. **IF** the copy adopted a pair that another copy published, so its ordinal is 2 or more, log at debug level that copy number N joined the store under its key, so a developer can match the ordinals in later warnings to load order. The copy that publishes a pair is always number 1 and logs nothing, so importing the package in a single-copy setting, such as Node, tests or server rendering, prints nothing. A local or private pair logs no join. - `inst-rs-join`
9. [x] - `p1` - Hold the pair object for the provider instance's lifetime, and reach both stores through it on every port call. Because compatible copies in the realm converge on this one pair, a schema a child registers through its own provider copy is on the store the action's target reads — the child's self-registration is visible exactly where the action is validated and dispatched (`cpt-frontx-gts-plugin-adr-type-store-scope`). - `inst-rs-hold-pair`
   1. [x] - `p1` - Serve a child's schema registration like any other write on the shared pair: the child registers its own schemas through its own copy of the type-system plugin at runtime, and realm convergence of compatible copies makes that registration visible to the runtime that hosts the action's target — no copy needs a registration forwarded to it (`cpt-frontx-gts-plugin-adr-type-store-scope`). - `inst-rs-child-schema-visibility`
10. [x] - `p1` - **RETURN** the pair. It lives as long as the realm: nothing disposes it, counts its holders or evicts its entries. - `inst-rs-return`

### Canonical Form of Content

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-canonical-form`

**Input**: A content value: a schema, an instance, or a built-in entity.

**Output**: The value's canonical form, or the verdict that the value is not representable as JSON.

**Steps**:
1. [x] - `p1` - A string, a boolean, null, or a finite number stands for itself. - `inst-cf-scalar`
2. [x] - `p1` - A plain object, whose prototype is the object prototype or null, becomes an object with the same properties in sorted key order. A property whose value is undefined is dropped. Nothing in the form is GTS-aware (`cpt-frontx-constraint-gts-plugin-delegates-gts-interpretation`), so `gts://X` and `X` are different content: two copies that spell an identifier differently log the conflict warning of `inst-sw-warn-conflict`, and the first definition stands. - `inst-cf-object`
3. [x] - `p1` - An array becomes an array of its elements in canonical form, in the same order. - `inst-cf-array`
4. [x] - `p1` - **IF** any value reached is not representable, **RETURN** that the content is not representable. These values are not representable: undefined at the top level or as an array element; a hole in a sparse array; NaN or an infinite number; a callable value, a symbol or a bigint; an object that is neither a plain object nor an array; and an object reached again along its own path, which is a cycle. - `inst-cf-unrepresentable`
5. [x] - `p1` - **RETURN** the canonical form. Two contents are the same when both are representable and their canonical forms serialize to the same text. A content that is not representable is the same as nothing. - `inst-cf-return`

### Schema Write

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-schema-write`

**Input**: A wrapped entity the GTS library classifies as a schema, delivered by `registerSchema` or by `register`; the store pair; and the caller copy's writer token.

**Output**: The pair holds the first definition registered under the identifier.

**Steps**:
1. [x] - `p1` - Refuse the definition before anything is written, with an error that names the identifier and the reason, when its content is not representable as JSON (`cpt-frontx-algo-gts-type-provider-canonical-form`) or the GTS library does not read its identifier as a type identifier (`Gts.isType`), or the library finds it invalid, in which case the error carries the library's own reason (`Gts.validateGtsID`). - `inst-sw-refuse`
2. [x] - `p1` - Look up the identifier in the store. The identifier is the one the library extracted from the entity; this package does no normalization of its own. - `inst-sw-lookup`
3. [x] - `p1` - **IF** the store holds nothing under the identifier: - `inst-sw-if-new`
   1. [x] - `p1` - Wrap a deep copy of the content, so a later change to the caller's object never reaches the stored definition. Register it in the store and in the scratch store, and record the caller's writer token for the identifier. - `inst-sw-register-both`
   2. [x] - `p1` - **RETURN**. - `inst-sw-return-new`
4. [x] - `p1` - **IF** the held content and the offered content are the same, **RETURN** without writing and without logging. Re-registering the built-in set at every construction takes this path. - `inst-sw-return-same`
5. [x] - `p1` - **IF** the pair has not yet reported a conflict for this identifier with this offered content, record it as reported and log one console warning. The warning names the identifier and the store key. It names, by ordinal, the copy that registered the kept definition and the copy that offered the refused one. It carries the kept content and the refused content. It says that a changed definition needs a new type identifier, and that in development a schema edited without a new identifier takes effect only after a full page reload. A conflict already reported stays silent, so a runtime that registers its schemas on every load does not repeat the warning. - `inst-sw-warn-conflict`
6. [x] - `p1` - **RETURN** without writing to either store and without throwing. - `inst-sw-return-conflict`

### Instance Write

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-instance-write`

**Input**: A wrapped entity the GTS library classifies as an instance; the store pair; and the caller copy's writer token.

**Output**: The store holds the instance under its identifier, validated; or an error is raised and the store is exactly as it was before the call. An anonymous instance is validated and never stored.

**Steps**:
1. [x] - `p1` - Read the pair's current store and scratch store. - `inst-iw-read`
2. [x] - `p1` - **IF** the GTS library reads the identifier as a type identifier (`Gts.isType`), or the store holds a schema under it, raise an error that names the identifier and the store key, and write neither store. Content without a `$schema` is an instance to the GTS library even under a type identifier, and writing it would replace a registered definition, which never changes. - `inst-iw-refuse-type`
3. [x] - `p1` - **IF** the identifier is empty, the instance is anonymous, such as an action payload, and the library resolves its schema from its `type` field. Validate the content as offered against the store, without writing it (`GtsStore.validateTransientInstance`), with the reference check of `inst-iw-validate`. When the library finds no type identifier in the content, the error says so, and the library's validation is not called. The library stores no instance without an identifier, and nothing reads an anonymous instance back. **IF** the result is not ok, raise the error of `inst-iw-raise`; otherwise **RETURN**. Either way, neither store and no writer token changes. - `inst-iw-anonymous`
4. [x] - `p1` - Register the candidate in the scratch store, as offered, and validate it there. Validate the object as the caller gave it. This step runs even when the content equals what the store holds, so the verdict always comes from the library, never from an earlier call. The scratch store mirrors the store, so schema resolution and any reference check see the store's current state without the candidate entering the store, and a reference check accepts an identifier that any runtime on this store registered. Every validation in this package asks the library to check only that a referenced entity is on the store, not that it is valid (`GtsRefValidationMode.AnyPresent`). An instance of a type the library rejects still fails, because the library always validates an instance's own type. - `inst-iw-validate`
5. [x] - `p1` - **IF** the result is not ok or not valid: - `inst-iw-if-invalid`
   1. [x] - `p1` - Restore the mirror through the mirror restore (`cpt-frontx-algo-gts-type-provider-mirror-restore`). - `inst-iw-restore`
   2. [x] - `p1` - Raise an error that names the instance, the reason, the resolved schema and the store key. Every such error also says, in conditional words, that if the failure refers to something not registered on this store, that may be registered later or by a runtime on a different store, which the warning of `inst-rs-warn-new-store` reports. The hint never depends on finding something missing: only the library's validator reads the reference keywords (`x-gts-type-ref`, `x-gts-instance-ref`), so the package cannot tell which references a schema checks. When structural checks do find something missing, the error also names it. That is decided from library facts and what the store holds, never from the library's message text: the entity itself when the store holds none under its identifier, and, for an entity offered for writing, the schema it names and the references the library found in it (`JsonEntity.references`), keeping only candidates the library reads as valid, non-wildcard identifiers (`Gts.validateGtsID`), so a wildcard pattern is never listed. The package reads nothing in the content itself. - `inst-iw-raise`
6. [x] - `p1` - **IF** the store holds the same content under the identifier, put the held entity back in the scratch store, so the scratch store no longer holds the caller's object, and **RETURN** without writing. The writer map does not change. - `inst-iw-return-same`
7. [x] - `p1` - **IF** all of these hold, log one console warning, unless the pair already reported this identifier with this offered content: the instance is not a shared-property value, which the library's pattern match decides against `gts.frontx.mfes.comm.shared_property.v1~*` (the pattern lives with the package's other GTS literals); the store holds different content under the identifier; and the writer map records a different copy for it. The warning names the identifier and the store key, and names by ordinal the copy that wrote the replaced content and the copy replacing it. The pair records the identifier and the offered content as reported. - `inst-iw-warn-replace`
8. [x] - `p1` - Take a deep copy of the candidate and register the copy in both the store and the scratch store, replacing what they held under the identifier, so both hold the same entities and neither holds the caller's object. A later change to the caller's object never reaches a stored instance. Content that is not representable as JSON cannot be copied by the package and is passed on as given; it never compares equal to anything. Record the caller's writer token for the identifier. - `inst-iw-commit`
9. [x] - `p1` - **RETURN**. - `inst-iw-return`

### Mirror Restore

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-mirror-restore`

**Input**: The identifier of a candidate instance that failed validation in the scratch store, and the store pair.

**Output**: Both stores of the pair hold the same entity under every identifier again.

**Steps**:
1. [x] - `p1` - **IF** the store holds an entity under the candidate's identifier, register that entity in the scratch store again. This restores exactly what the scratch store held before the candidate was written into it. - `inst-mr-restore-held`
2. [x] - `p1` - **ELSE** remove the candidate from the scratch store (`GtsStore.unregister`). The store holds nothing under the identifier, so the scratch store mirrors it again. Both stores stay the ones the pair was created with. - `inst-mr-remove`
3. [x] - `p1` - Restoring touches one entry, however many entities the store holds, so a rejected candidate costs its validation and its error. The whole rejected call **MUST** complete within the registration latency threshold of `cpt-frontx-nfr-runtime-performance`, and a benchmark test confirms it. - `inst-mr-budget`
4. [x] - `p1` - **RETURN** with the mirror restored, before the caller raises its error. - `inst-mr-return`

### Schema Validation

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-schema-validation`

**Input**: `instanceId` — the identifier of a previously registered GTS instance.

**Output**: Validation result — success with an empty error list, or failure with a non-empty error list describing the violation.

**Steps**:
1. [x] - `p1` - Request the GTS store to validate the registered instance identified by `instanceId` against its schema, with the reference check the instance write describes (`inst-iw-validate`), so `validateInstance` and `register` reach the same verdict. - `inst-sv-01`
2. [x] - `p1` - **IF** the GTS store reports a successful and valid result: - `inst-sv-02`
   1. [x] - `p1` - **RETURN** a success result with an empty error list. - `inst-sv-02a`
3. [x] - `p1` - Compose a failure result containing the GTS store's reported error message. - `inst-sv-03`
4. [x] - `p1` - **RETURN** the failure result. - `inst-sv-04`

### Type-Of Hierarchy Resolution

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-typof-resolution`

**Input**: `typeId` — the type identifier to test; `baseTypeId` — the base type to test derivation against.

**Output**: Boolean — true when `typeId` is identical to or derives from `baseTypeId` in the GTS type hierarchy; false otherwise.

**Steps**:
1. [x] - `p1` - Apply the GTS prefix-matching derivation rule: in GTS a derived type identifier always starts with its base type identifier. This is a known gap under `cpt-frontx-constraint-gts-plugin-delegates-gts-interpretation`, tracked in https://github.com/constructorfabric/gears-frontx/issues/671. - `inst-tr-01`
2. [x] - `p1` - **IF** `typeId` equals `baseTypeId` or `typeId` starts with `baseTypeId`: - `inst-tr-02`
   1. [x] - `p1` - **RETURN** true — the type is the same as or derives from the base type. - `inst-tr-02a`
3. [x] - `p1` - **RETURN** false — no derivation relationship exists. - `inst-tr-03`

### Well-Known Identifier Resolution

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-well-known-ids`

**Input**: None; each resolver takes no argument.

**Output**: The provider's own GTS identifier for a framework well-known lifecycle action type or lifecycle stage type.

**Steps**:
1. [x] - `p1` - Resolve this plugin's own GTS action-type ID for the framework's well-known `load_ext` lifecycle action - `inst-tr-04`
2. [x] - `p1` - Resolve this plugin's own GTS action-type ID for the framework's well-known `mount_ext` lifecycle action - `inst-tr-05`
3. [x] - `p1` - Resolve this plugin's own GTS action-type ID for the framework's well-known `unmount_ext` lifecycle action - `inst-tr-06`
4. [x] - `p1` - Resolve this plugin's own GTS type ID for the framework's well-known `init` lifecycle stage - `inst-tr-07`
5. [x] - `p1` - Resolve this plugin's own GTS type ID for the framework's well-known `activated` lifecycle stage - `inst-tr-08`
6. [x] - `p1` - Resolve this plugin's own GTS type ID for the framework's well-known `deactivated` lifecycle stage - `inst-tr-09`
7. [x] - `p1` - Resolve this plugin's own GTS type ID for the framework's well-known `destroyed` lifecycle stage - `inst-tr-10`
8. [x] - `p1` - **RETURN** the identifier the called resolver resolves. - `inst-tr-11`

### Runtime Registration Against the Store Pair

- [x] `p1` - **ID**: `cpt-frontx-algo-gts-type-provider-runtime-registration-v2`

**Input**: `schema` — a definition supplied at runtime through `registerSchema`; or `entity` — a schema or an instance supplied at runtime through `register`; or `typeId` — the identifier to retrieve through `getSchema`; or `instanceId` — the identifier to validate through `validateInstance`.

**Output**: For a schema, the pair holds the first definition registered under its identifier. For an instance, the pair holds it once it validates, in place of what it held under the identifier; on failure an error is raised and the store is unchanged. For a retrieval, the held content. For a validation request, a structured result.

**Steps**:
1. [x] - `p1` - `registerSchema`: wrap the supplied definition. **IF** the GTS library classifies it as an instance, refuse it with an error saying that the library reads it as an instance, not a schema. The package does not restate the library's rule for what makes content a schema. Nothing is written. - `inst-rrv2-schema-classify`
2. [x] - `p1` - `registerSchema`: write the definition through the schema write (`cpt-frontx-algo-gts-type-provider-schema-write`). - `inst-rrv2-schema-write`
3. [x] - `p1` - `register`: wrap the supplied entity. **IF** the GTS library classifies it as a schema, write it through the schema write and **RETURN**. A schema then follows one rule whichever method delivers it and whatever the store already holds, so the outcome never depends on load order. - `inst-rrv2-register-schema`
4. [x] - `p1` - `register`: write the instance through the instance write (`cpt-frontx-algo-gts-type-provider-instance-write`). - `inst-rrv2-register-instance`
5. [x] - `p1` - `getSchema`: look up the identifier in the pair's current store. Return a deep copy of its content, for a schema and for an instance alike, so a caller's change never reaches a stored entity that other runtimes on the pair read. Content that is not representable as JSON cannot be copied by the package and is returned as the store gives it. The library itself hands out a fresh copy on every read, and passes a value JSON cannot represent, such as a callback, through unchanged. Return undefined when nothing is held or the content is not an object. - `inst-rrv2-get-schema`
6. [x] - `p1` - `validateInstance`: validate against the pair's current store, as `cpt-frontx-algo-gts-type-provider-schema-validation` describes. **IF** the result fails, the first error message carries the store key and the same conditional hint the instance write raises (`inst-iw-raise`). A call that validates an identifier another runtime registered is a direct reliance check, so it reports what it searched. - `inst-rrv2-validate`
7. [x] - `p1` - Perform every read and write of the stores in one port call synchronously, with no await and no callback between the first access and the last. Calls from provider instances that share the pair never interleave, and each call starts and ends with both stores holding the same entities. - `inst-rrv2-synchronous`

## 4. States (CDSL)

### Provider Initialization State Machine

- [x] `p1` - **ID**: `cpt-frontx-state-gts-type-provider-init`

**States**: UNINITIALIZED, INFRA_SCHEMAS_REGISTERED, READY, ABORTED

**Initial State**: UNINITIALIZED

**Transitions**:
1. [x] - `p1` - **FROM** UNINITIALIZED **TO** INFRA_SCHEMAS_REGISTERED **WHEN** every ecosystem infrastructure schema has been written to the store pair. - `inst-pi-01`
2. [x] - `p1` - **FROM** INFRA_SCHEMAS_REGISTERED **TO** READY **WHEN** every default lifecycle stage instance has been written, each validated against its schema before it became visible. - `inst-pi-02`
3. [x] - `p1` - **FROM** UNINITIALIZED **TO** ABORTED **WHEN** the schema write refuses a built-in schema (`inst-irv2-schema-refuse`). Construction raises the error of `inst-sw-refuse` and no provider is returned. - `inst-pi-03`
4. [x] - `p1` - **FROM** INFRA_SCHEMAS_REGISTERED **TO** ABORTED **WHEN** the instance write rejects a lifecycle stage instance. Construction raises an error that names the instance and the reported reason (`inst-irv2-stage-reject`), no provider is returned, and nothing invalid is left in either store. - `inst-pi-04`

READY and ABORTED are final: a provider that reached READY stays ready for its lifetime, and construction that reached ABORTED holds no provider.

## 5. Definitions of Done

### Infrastructure Schema Ownership

- [x] `p1` - **ID**: `cpt-frontx-dod-gts-type-provider-infra-schema-ownership`

The provider **MUST** register all ecosystem infrastructure schemas and default lifecycle stage instances in the internal GTS store at construction time, and **MUST** validate every lifecycle stage instance against its registered schema before the provider is considered ready. Construction **MUST** fail if any lifecycle stage instance does not satisfy its schema. No solution-specific schemas are registered by the provider at construction. Validating an action **MUST** check its own leaf schema alone: the base action schema (`action.v1`) is consulted only when a concrete action schema's own `$ref` names it. Every concrete action schema the provider registers **MUST** be self-contained and closed, rejecting an undeclared field on itself or on its own `payload`; the base action schema stays open.

**Implements**:
- `cpt-frontx-flow-gts-type-provider-construct-provider`
- `cpt-frontx-algo-gts-type-provider-infra-registration-v2`
- `cpt-frontx-state-gts-type-provider-init`

**Covers (PRD)**: `cpt-frontx-fr-gts-default-infrastructure-types`

**Constraints**: `cpt-frontx-constraint-gts-plugin-owns-infra-schemas`, `cpt-frontx-constraint-gts-plugin-excludes-solution-schemas`

**Touches**:
- Component: `cpt-frontx-component-type-system-plugin`
- Interface: `cpt-frontx-interface-type-system`
- Entities: `Schema`, `LifecycleStage`

### Type Validation and Hierarchy Resolution

- [x] `p1` - **ID**: `cpt-frontx-dod-gts-type-provider-type-validation`

The provider **MUST** validate registered instances against their schemas and resolve type hierarchy by GTS prefix-matching when invoked through the type-substrate port, returning a structured validation result for every call. The prefix check is a known gap under `cpt-frontx-constraint-gts-plugin-delegates-gts-interpretation`, tracked in https://github.com/constructorfabric/gears-frontx/issues/671.

**Implements**:
- `cpt-frontx-flow-gts-type-provider-validate-extension-type`
- `cpt-frontx-flow-gts-type-provider-register-application-type`
- `cpt-frontx-flow-gts-type-provider-read-and-validate`
- `cpt-frontx-algo-gts-type-provider-schema-validation`
- `cpt-frontx-algo-gts-type-provider-typof-resolution`
- `cpt-frontx-algo-gts-type-provider-well-known-ids`
- `cpt-frontx-algo-gts-type-provider-runtime-registration-v2`

**Covers (PRD)**: `cpt-frontx-fr-mfe-type-validation`, `cpt-frontx-fr-application-type-definitions`, `cpt-frontx-fr-gts-type-validation`, `cpt-frontx-fr-gts-type-of-resolution`

**Constraints**: `cpt-frontx-constraint-gts-plugin-delegates-gts-interpretation`, `cpt-frontx-constraint-gts-plugin-owns-infra-schemas`, `cpt-frontx-constraint-gts-plugin-excludes-solution-schemas`

**Touches**:
- Component: `cpt-frontx-component-type-system-plugin`
- Interface: `cpt-frontx-interface-type-system`
- Entities: `Schema`, `LifecycleStage`

### Realm-Shared Type Store

- [x] `p1` - **ID**: `cpt-frontx-dod-gts-type-provider-realm-shared-store`

**Scope and key.** Every provider instance in a JavaScript realm constructed without `isolated` **MUST** use the one store pair whose key matches its store format, GTS library line and built-in hash (`cpt-frontx-algo-gts-type-provider-realm-store-rendezvous`). Copies that differ in any of the three **MUST NOT** share a pair. The package's own version **MUST NOT** be part of the key. The library line **MUST** be derived at build time from the library's manifest, which is inlined. The built-in hash **MUST** be computed at construction from the built-in sets, once per evaluated copy. The store format **MUST** be bumped in the same change that alters the entry's shape or the meaning of the stored data.

**Diagnostics.** A copy that opens a key while the realm's key index holds other keys **MUST** log a warning that names the keys and the part that differs. The key index **MUST** hold key-name strings. A copy that meets an unrecognized entry **MUST** log a warning once per evaluated copy, **MUST** leave the entry unmutated, unreplaced and undeleted, and **MUST** work from a pair local to its evaluated copy and that key. A copy that adopts a pair another copy published **MUST** log its join at debug level, with its ordinal. The copy that publishes a pair, and every local or private pair, **MUST NOT** log a join.

**Reliance.** A runtime **MAY** rely on a type or an instance that another runtime registered on the same store before the relying call. Realm convergence **MUST** therefore make a child's self-registered schemas visible where the action's target lives: a child registers its own schemas through its own copy of the type-system plugin, and every compatible copy on the same store reads them (`cpt-frontx-gts-plugin-adr-type-store-scope`). Every validation failure, in the error that `register` raises and in the first error message that `validateInstance` returns, **MUST** name the store key and **MUST** say, conditionally, that something it refers to may be registered later or may be on a different store. The hint **MUST NOT** depend on the package finding something missing. When the library's facts and the store show something missing (the entity, its schema, or the references the library found), the error **MUST** name it. The package **MUST NOT** parse the library's message text.

**Types.** The first definition registered under a type identifier **MUST** stand, whichever method delivers a later one. `register` with a schema **MUST** behave exactly as `registerSchema`. A definition that is not representable as JSON, whose identifier the library does not read as a valid type identifier, or that the library classifies as an instance **MUST** be refused with an error before anything is written. The stored definition **MUST** be a deep copy of the offered content, and `getSchema` **MUST** return a deep copy of what it reads, schema or instance. Content that cannot be represented as JSON is returned as the store gives it. A later definition with the same canonical content (plain structural equality, with no GTS-aware normalization) **MUST** change neither store and **MUST NOT** log. A later definition with different content **MUST** change neither store, **MUST NOT** throw, and **MUST** log one warning per identifier and offered content for the life of the pair. That warning **MUST** carry the identifier, the store key, the ordinals of the kept and the refusing copy, both contents, and the rule that a changed definition needs a new identifier.

**Delegation.** Every reading of GTS identifiers and entities **MUST** be delegated to the GTS library: whether content is a schema or an instance, which identifier and schema it names, whether an identifier is a type identifier or is valid (and why not), whether an identifier matches a pattern, and the validation verdict. The package **MUST NOT** restate the identifier grammar, strip or normalize identifier spellings, or classify failures from the library's message text. The package adds only its own write rules on top of the library's classification: the first definition of a type stands, content that is not representable as JSON is refused as a schema, a schema must declare `$schema`, and an instance cannot be written under a type identifier or over a registered type. The `register` documentation **MUST** say so. The prefix check in `isTypeOf` is the one exception, the known gap tracked in https://github.com/constructorfabric/gears-frontx/issues/671.

**Instances.** An instance **MUST** be validated, as the caller offered it, against the pair's current state before it is written, and validation **MUST NOT** be skipped for content equal to what is held. An identifier that ends in `~`, or under which the store holds a schema, **MUST** be refused on the instance path and **MUST NOT** replace a definition. For content that can be represented as JSON, the store **MUST** hold a deep copy of an instance, never the caller's object, in both stores. Other content cannot be copied by the package and is passed to the store as given. An instance that fails validation **MUST NOT** become visible to a lookup through any provider instance on the pair. An instance with the same content as the one held **MUST** be a no-op. Otherwise it **MUST** replace what the store held. Replacing different content that a different copy wrote **MUST** log one warning per identifier and offered content, except for shared-property values. An anonymous instance, which has no identifier, **MUST** be validated against the store and **MUST NOT** be written to either store. Built-in lifecycle stage instances **MUST** be written through the same validated path.

**Mirror.** Both stores **MUST** hold the same entity under every identifier between any two port calls. Neither store of a pair is ever replaced. A rejected candidate **MUST** leave the mirror restored before the error is raised, and **MUST** be refused within the registration latency threshold of `cpt-frontx-nfr-runtime-performance`. Every port call **MUST** complete all its store reads and writes synchronously.

**Lifetime and private store pair.** The pair **MUST** live as long as the realm, with no disposal, no holder count and no eviction. `new GtsPlugin({ isolated: true })` **MUST** give that instance a private pair that starts from the built-in set and follows the same write rules, and **MUST NOT** touch the realm slot or the key index. The default instance `gtsPlugin` **MUST** always share. The port **MUST NOT** gain a method. The slot **MUST NOT** be presented as authenticating its publisher: it is trusted same-realm coordination state (`cpt-frontx-gts-plugin-adr-type-store-scope`). The port's `version` field is not part of the key.

**Tests.** Tests **MUST** be isolated from realm state, and they **MUST** cover these requirements:
- A test of sharing starts and ends with no realm slot and no key index.
- A test with two independently evaluated copies has the adopting copy adopt stores of a class foreign to it, so recognition by class identity fails the test.
- Key tests drive the key derivation with explicit inputs: two library lines, two built-in sets that differ in one schema, two library versions on one line, and two package versions with otherwise equal inputs, which yield one key.
- An entry-contract test pins the entry's field names and kinds and states that changing them requires a format bump.
- A test of the default instance's sharing accounts for the slot the default instance bound when its module was evaluated.

**Accepted residuals.** A definition that is valid JSON but that the validator cannot compile is not detected before it is written, because the GTS library offers no compile check. It then holds its identifier for the realm, and every validation against it fails with the validator's error. The store's validator keeps a compiled validator for every validation call, a GTS library behaviour, so its memory grows with the number of validations rather than with the number of identifiers.

**Implements**:
- `cpt-frontx-algo-gts-type-provider-infra-registration-v2`
- `cpt-frontx-algo-gts-type-provider-realm-store-rendezvous`
- `cpt-frontx-algo-gts-type-provider-canonical-form`
- `cpt-frontx-algo-gts-type-provider-schema-write`
- `cpt-frontx-algo-gts-type-provider-instance-write`
- `cpt-frontx-algo-gts-type-provider-mirror-restore`
- `cpt-frontx-algo-gts-type-provider-runtime-registration-v2`

**Covers (PRD)**: `cpt-frontx-fr-gts-realm-shared-type-store`, `cpt-frontx-nfr-runtime-performance`

**Constraints**: `cpt-frontx-constraint-gts-plugin-delegates-gts-interpretation`, `cpt-frontx-constraint-gts-plugin-realm-shared-store`

**Touches**:
- Component: `cpt-frontx-component-type-system-plugin`
- Interface: `cpt-frontx-interface-type-system`
- Entities: `Schema`, `LifecycleStage`, `Type store`

### Closed Final Types and the Manifest and MFE Entry Contract

- [x] `p1` - **ID**: `cpt-frontx-dod-gts-type-provider-closed-types`

The final built-in types — domain, actions chain, lifecycle hook, lifecycle stage, manifest, MFE entry and the `load_ext`, `mount_ext` and `unmount_ext` actions — and the abstract base types — base action, base MFE entry, extension and shared property — are fixed by `cpt-frontx-algo-gts-type-provider-type-closure`. Every final built-in type **MUST** close at its top level with `unevaluatedProperties: false`, and every object it declares inline **MUST** be closed too, so validation rejects a property that neither the type nor its base types list in any inline object. A nested object that references a final type is closed by that type's own closure, and one that references an abstract base type stays open inside the referencing type. A concrete action in it is validated against its own closed type when it is admitted for dispatch (`cpt-frontx-flow-mfe-host-communication-dispatch-chain`, `inst-admit-action`). Validation of an instance of a final type **MUST** accept every property its base types list and **MUST** enforce their `required` fields. Every abstract base type **MUST** stay open for derivation. The provider **MUST** leave all three outcomes to the GTS library's validator.

The manifest type and the MFE entry type **MUST** be final, **MUST** list exactly the fields of the closed manifest and MFE entry contracts that `cpt-frontx-adr-mfe-asset-discovery` fixes, the GTS identity and reference fields among them, with the same required flags, and **MUST** enforce the value formats: no `:` in a `shared[].name`, neither `:` nor `@` in a `shared[].version`, and 64 lowercase hexadecimal characters in every `contentHash`. An MFE entry's `manifest` **MUST** be a GTS instance reference to a registered manifest instance. The manifest and MFE entry types **MUST** equal the runtime's `MfManifest` type and `MfeEntryMF` type, the latter with the `MfeEntry` fields it extends: the same fields at every level, each with the same required flag. A parity check **MUST** fail whenever they differ in a field or in a required flag.

**Implements**:
- `cpt-frontx-algo-gts-type-provider-type-closure`
- `cpt-frontx-algo-gts-type-provider-manifest-entry-types`

**Covers (PRD)**: `cpt-frontx-fr-mfe-type-validation`, `cpt-frontx-fr-gts-type-validation`, `cpt-frontx-fr-gts-default-infrastructure-types`

**Constraints**: `cpt-frontx-constraint-gts-plugin-owns-infra-schemas`, `cpt-frontx-constraint-gts-plugin-delegates-gts-interpretation`

**Touches**:
- Component: `cpt-frontx-component-type-system-plugin`
- Interface: `cpt-frontx-interface-type-system`
- Entities: `Schema`, `Manifest and MFE entry types`

### Public Surface

- [x] `p1` - **ID**: `cpt-frontx-dod-gts-type-provider-public-surface`

The package entry point **MUST** export exactly these, each because consumers outside the package use it in production:
- `GtsPlugin` and its default instance `gtsPlugin`, the object injected at registry construction. The constructor takes one optional argument whose one property is `isolated`. A runtime or a build-time validator that must keep type knowledge of its own constructs its instance with `isolated: true`, and the default instance always shares.
- `JSONSchema`, the schema type the provider accepts at registration.
- `FRONTX_ACTION_LOAD_EXT`, `FRONTX_ACTION_MOUNT_EXT` and `FRONTX_ACTION_UNMOUNT_EXT`, the GTS identifiers of the runtime's extension load, mount and unmount actions, which hosts and microfrontends name when they dispatch or handle those actions.
- `loadLifecycleStages`, which returns the default lifecycle-stage instances, for a runtime that loads them itself.

Every other symbol of the package, the built-in schema loader `loadSchemas` and the type of the construction argument included, **MUST** stay internal. The port's methods are the runtime's contract, which `@gears-frontx/mfes` declares and the provider conforms to.

**Implements**:
- `cpt-frontx-algo-gts-type-provider-infra-registration-v2`
- `cpt-frontx-algo-gts-type-provider-typof-resolution`
- `cpt-frontx-algo-gts-type-provider-well-known-ids`

**Covers (PRD)**: `cpt-frontx-fr-gts-type-of-resolution`, `cpt-frontx-fr-gts-realm-shared-type-store`

**Constraints**: `cpt-frontx-constraint-gts-plugin-realm-shared-store`

**Touches**:
- Component: `cpt-frontx-component-type-system-plugin`
- Interface: `cpt-frontx-gts-plugin-interface-package-entry`
- Entities: `Schema`, `LifecycleStage`

## 6. Acceptance Criteria

- [x] The GTS provider registers all ecosystem infrastructure schemas and default lifecycle stage instances at construction, making it ready to use immediately after instantiation.
- [x] Lifecycle stage instances that fail validation during construction cause the provider to abort construction with a descriptive error; no provider is returned and nothing invalid is left in either store.
- [x] `isTypeOf` returns true when the declared type identifier equals or starts with the base type identifier, and false otherwise.
- [x] `validateInstance` returns a success result for a registered valid instance and a failure result with error details for an invalid or unrecognized instance.
- [x] The provider owns no solution-specific schemas at construction; application schemas registered at runtime through the port do not affect the infrastructure schema set.
- [x] The provider is injectable as the type-substrate port implementation in the MFE Registry factory without requiring any consumer-authored type configuration.
- [x] An instance of a closed concrete action schema (`mount_ext`, `unmount_ext`, `load_ext`) carrying a field undeclared by that schema, or by its own `payload`, is rejected.
- [x] An instance of `mount_ext` or `unmount_ext` carrying a `history` value outside `none`, `replace`, and `push` is rejected.
- [x] An instance of `mount_ext` or `unmount_ext` carrying a `history` value of `none`, `replace`, or `push`, or carrying no `history` at all, is accepted.
- [x] An instance of a concrete action schema derived from the base action schema (`action.v1`) still validates against its own, self-contained, closed leaf schema.
- [x] A domain or an extension whose lifecycle hooks dispatch registered action types registers, and a hook whose action `type` is a registered type outside the action family is rejected.
- [x] Two independently evaluated copies with the same store format, library line and built-in set adopt one store pair, even when the adopted stores are of a class foreign to the adopting copy. A schema registered through one copy validates an instance registered through the other.
- [x] Each decision about an identifier or an entity in the write path is made by a library call (`Gts.isType`, `Gts.validateGtsID`, `Gts.matchIDPattern`, `createJsonEntity`), and the error for an invalid identifier carries the library's reason.
- [x] Key derivation yields different keys for two library lines and for two built-in sets that differ in one schema, and the same key for two library versions on one compatible line and for two package versions with otherwise equal inputs.
- [x] A copy that opens a key while the realm holds another key logs a warning naming both keys and the part that differs.
- [x] A slot pre-occupied by an unrecognized entry is left exactly as it was; the copy logs a warning and works from a local store pair.
- [x] A runtime relies on an instance another runtime registered: an instance that references it validates without the relying runtime registering it.
- [x] A reference only has to name an entity on the store: an instance that lists a type the library rejects is accepted through `register`, through `validateInstance` and as an action payload, while an instance of that type and a reference to an entity not on the store are rejected.
- [x] Every validation failure, through `register` or through `validateInstance`, names the store key and says that something it refers to may be registered later or on another store, including when an extension's `x-gts-instance-ref` domain is not registered. A missing schema, object or `$ref` target that the library's facts and the store show is named too.
- [x] A second construction on a store, and any re-registration of the same canonical content, changes no stored entity and logs nothing. A different spelling of an identifier is different content: it logs the conflict warning and the first definition stands.
- [x] A different definition under a held type identifier, through `registerSchema` or through `register`, leaves the first in force, does not throw, and logs one warning naming the identifier, the store key, both copies' ordinals and both contents. Offering it again logs nothing.
- [x] `register` and `registerSchema` give the same outcome for a schema in an empty store and in a populated one.
- [x] A definition with no `$schema`, a cyclic or non-JSON content, or an invalid type identifier is refused with an error, and nothing is written.
- [x] Changing the object passed to `registerSchema`, or the object `getSchema` returned for a schema, does not change the stored definition.
- [x] A later valid instance under a held identifier replaces the earlier one. It logs one warning only when another copy wrote the replaced content and the contents differ; an action payload and a shared-property value never log.
- [x] An invalid instance, a built-in lifecycle stage included, is never visible through any instance on the pair.
- [x] An anonymous instance, such as an action payload, is validated against the store and written to neither store, whether it is valid or not.
- [x] A re-registration whose content equals what is held is validated again, and writes nothing.
- [x] An instance written under a type identifier, or under an identifier that holds a registered type, is refused with an error and neither store changes, so a registered definition is never replaced through `register`.
- [x] `getSchema` returns a copy of an instance as well as of a schema, so a read cannot change an entity the realm shares. Non-JSON content is returned as given.
- [x] For content that can be represented as JSON, changing an object after registering it never changes the stored instance, and both stores hold the same copy, not the caller's object. Other content is kept as given.
- [x] After a rejected candidate, under a held identifier and under a new one, both stores hold the same entities as seen from every instance on the pair, and the pair keeps the scratch store it was created with.
- [x] A rejected candidate under a new identifier is refused within the registration latency threshold of `cpt-frontx-nfr-runtime-performance`.
- [x] `new GtsPlugin({ isolated: true })` starts from the built-in set alone, sees no realm registration, and leaves the realm slot and key index untouched.
- [x] The default instance `gtsPlugin` shares the realm store pair, and the port gains no method.
- [x] The package entry point exports exactly `GtsPlugin`, `gtsPlugin`, `JSONSchema`, `FRONTX_ACTION_LOAD_EXT`, `FRONTX_ACTION_MOUNT_EXT`, `FRONTX_ACTION_UNMOUNT_EXT` and `loadLifecycleStages`, and the provider's constructor takes one optional argument whose one property is `isolated`.
- [x] For each final type (the domain, actions chain, lifecycle hook, lifecycle stage, manifest and MFE entry types, and the `mount_ext`, `unmount_ext` and `load_ext` action types), an instance that carries a property the type and its base types do not list is rejected.
- [x] An instance of the domain type carrying an unknown property at its top level is rejected, and so is one whose `lifecycle` item, a reference to the final lifecycle hook type, carries a property the hook type does not list.
- [x] An instance of the actions chain type carrying an unknown property at its top level is rejected, and so is one whose `next` or `fallback`, a reference to the actions chain type, carries a property the chain type does not list.
- [x] A concrete action carrying a property its concrete type does not declare is accepted inside the `action`, `next` or `fallback` of an actions chain, because the `action` object references the open base action type and the chain type does not close it. The same action is rejected when registered as an instance of its concrete type, which is how the runtime admits it for dispatch (`cpt-frontx-flow-mfe-host-communication-dispatch-chain`, `inst-admit-action`).
- [x] An instance of the lifecycle hook type carrying an unknown property at its top level is rejected, and so is one whose `actions_chain`, a reference to the final actions chain type, carries a property the chain type does not list.
- [x] An instance of the lifecycle stage type carrying an unknown property at its top level is rejected.
- [x] An MFE entry that carries the fields it inherits from the base MFE entry type is accepted, and one that lacks a field the base type requires is rejected.
- [x] An abstract base type (the base action, base MFE entry, extension and shared property types) does not reject a property a derived type adds.
- [x] A manifest and an MFE entry that carry every contract field, the optional ones included, are accepted. A manifest or MFE entry that carries any other property at any level, lacks a required field, has an empty `exposeAssets.js.sync`, or holds a `shared[].name` with `:`, a `shared[].version` with `:` or `@`, or a `contentHash` that is not 64 lowercase hexadecimal characters is rejected.
- [x] A manifest whose `metaData`, an `entryLists` value or a `shared[]` element carries a property that object does not list is rejected.
- [x] An MFE entry whose `exposeAssets`, `exposeAssets.js` or `exposeAssets.css` carries a property that object does not list is rejected.
- [x] A `load_ext`, `mount_ext` or `unmount_ext` instance whose `payload` carries a property the payload does not declare is rejected.
- [x] An MFE entry whose `manifest` names an identifier under which the store holds no entity is rejected, and one that names a registered manifest instance is accepted.
- [x] The parity check passes when the manifest and MFE entry types and the runtime's `MfManifest` and `MfeEntryMF` types list the same fields with the same required flags, and fails when a field or a required flag differs.
