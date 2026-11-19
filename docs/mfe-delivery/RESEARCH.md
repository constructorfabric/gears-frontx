# FrontX build and context-selected MFE delivery research

Research date: 2026-11-13. This is source evidence and product analysis, not an
implementation or an approved technical design. The consumer example below
does not appear in the normative PRDs.

## Source freshness and scope

| Source | Identity and acquisition |
|---|---|
| Child branch HEAD/base | `cfc9e3758fbceab374fac9ae25d1f1db53f298ca`; not fresh upstream main. |
| FrontX upstream main | `51cac14845d318de18c450f1ad8065aa5b14cdbe`, commit time 2026-11-13T03:46:10Z; rechecked through `gh api repos/constructorfabric/gears-frontx/commits/main`. |
| External templates main | `764d14d3b21fc7089320dfb7a25b56f28952737c`, 2026-11-13T03:12:17Z; repository linked by FrontX's actual README, not inferred. |
| Example consumer remote main | `583cd4bbdf713f691762737e5172d43d57ea91ab`, 2026-11-13T15:09:14Z; read through authenticated Bitbucket CLI API. |
| Consumer checkout | `vhp-frontend/main-2`, clean at inspection; HEAD `ce6afb071635a816860d98ade76e89fa601107a8`, cached origin/main `8b528df59a929e87049149420832142e1d61c945`. Neither is presented as current main. AGENTS.md read. |
| Manifest producer dependency | `@module-federation/vite@1.20.5`, npm tarball integrity verified before reading source; package metadata gitHead `e8e951543ae07e47e85582be8143d627fa190008`. |
| Consumer producer dependency | `@module-federation/vite@1.15.5` with the consumer's checked-in patch; npm tarball integrity verified and patch read at the consumer SHA. |

Git remote access to FrontX returned `Repository not found`; authenticated
GitHub commit/tree/contents APIs succeeded. Research used SHA-pinned selective
snapshots, not a synthetic upstream commit. No parent or foreign refs/checkouts
were changed. The previously supplied temporary snapshot was not used as verified evidence. Local research inputs are under
`.cf-studio/.cache/research/`; [source-ledger.json](source-ledger.json) records
paths, commits, blob verification or content hashes. The consumer main moved
from `636e16f4e703f7464889fc8a817b8f09bd4b3e47` during research; all 15 selected
files were refreshed at `583cd4b` and were byte-identical. Findings are pinned
to the latter SHA, not to an unbounded claim of future freshness.

## Confirmed evidence

### Ownership and existing public surfaces

Fresh [root DESIGN:137–152](https://github.com/constructorfabric/gears-frontx/blob/51cac14845d318de18c450f1ad8065aa5b14cdbe/architecture/DESIGN.md#L137-L152)
classifies projects orchestration by acting on a project's lifecycle, and
published libraries by being consumed without driving that lifecycle. Unpublished
build internals are a separate exemption. Therefore a reusable public build API
does not become a browser/runtime library or an unpublished internal simply
because it is distributed as an npm package. Root owns cross-layer contracts;
members own their PRD/DESIGN/FEATURE chains with independent versioning.

The existing projects-orchestration owner is documented in
[CLI PRD:43–49](https://github.com/constructorfabric/gears-frontx/blob/51cac14845d318de18c450f1ad8065aa5b14cdbe/packages/cli/architecture/PRD.md#L43-L49).
Its [exported API](https://github.com/constructorfabric/gears-frontx/blob/51cac14845d318de18c450f1ad8065aa5b14cdbe/packages/cli/src/index.ts#L1-L100)
already includes programmatic source resolution, validation and composed
scaffolding. This establishes reusable lifecycle mechanisms, not an existing
general host/MFE compilation and delivery API. The runtime owner is separately
described by [MFEs PRD:41–51](https://github.com/constructorfabric/gears-frontx/blob/51cac14845d318de18c450f1ad8065aa5b14cdbe/packages/mfes/architecture/PRD.md#L41-L51).

### A runtime loader manifest is not a complete published build

FrontX's [MfManifest:135–153](https://github.com/constructorfabric/gears-frontx/blob/51cac14845d318de18c450f1ad8065aa5b14cdbe/packages/mfes/src/manifest/mf-manifest.ts#L135-L153)
contains loader metadata and shared dependencies; entry-level exposed resources
are deliberately held separately. Its
[resource types:15–73](https://github.com/constructorfabric/gears-frontx/blob/51cac14845d318de18c450f1ad8065aa5b14cdbe/packages/mfes/src/manifest/mf-manifest.ts#L15-L73)
include synchronous/asynchronous JavaScript and CSS, shared chunk locations,
versions and optional content hashes.

[MfeEntryMF:8–29](https://github.com/constructorfabric/gears-frontx/blob/51cac14845d318de18c450f1ad8065aa5b14cdbe/packages/mfes/src/types/mfe-entry-mf.ts#L8-L29)
permits an inline loader manifest or a string. The actual
[resolver:1228–1267](https://github.com/constructorfabric/gears-frontx/blob/51cac14845d318de18c450f1ad8065aa5b14cdbe/packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts#L1228-L1267)
uses a string as a cache/type-system lookup key, not as a URL fetch instruction.
A new published-manifest reference must have an explicit resolution/admission
boundary; passing a URL into this existing string field is not established behavior.

The external template's
[enrichment:199–218](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-shell/src/build/mf-gts.ts#L199-L218)
preserves MFE metadata including extensions/schemas and produces loader metadata
plus enriched entries. Its
[expose mapping:279–299](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-shell/src/build/mf-gts.ts#L279-L299)
requires matching exposed modules and attaches expose resources to entries.
Thus the complete producer output, not only nested `manifest`, is the relevant
input to a project-independent publication contract.

### Build version producer semantics

Both template and consumer enrichment copy federation `metaData.buildInfo`:
[template:221–228](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-shell/src/build/mf-gts.ts#L221-L228),
[consumer:230–242](https://bitbucket.org/virtuozzocore/vhp-frontend/src/583cd4bbdf713f691762737e5172d43d57ea91ab/packages/tooling/src/vite/mf-gts.ts#lines-230:242).
The template pins federation plugin 1.20.5 in
[package.json](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-shell/package.json#L110-L125).
The integrity-verified producer source
[lib/index.js:7304–7315](https://unpkg.com/@module-federation/vite@1.20.5/lib/index.js)
implements `getBuildVersion()` as environment `MF_BUILD_VERSION` with fallback
`1.0.0`; manifest generation uses it at lines 7442 and 7643. No assignment to
that environment variable was found in the inspected template/consumer build
configuration and scripts. External CI environment configuration was not audited.

The consumer uses a different producer version:
[lockfile:69–71,323–325](https://bitbucket.org/virtuozzocore/vhp-frontend/src/583cd4bbdf713f691762737e5172d43d57ea91ab/pnpm-lock.yaml#lines-69:325)
pins 1.15.5 and a local patch. Its integrity-verified
[lib/index.mjs:3089–3099](https://unpkg.com/@module-federation/vite@1.15.5/lib/index.mjs)
has the same environment/fallback rule. The
[checked-in patch](https://bitbucket.org/virtuozzocore/vhp-frontend/src/583cd4bbdf713f691762737e5172d43d57ea91ab/patches/@module-federation__vite@1.15.5.patch)
changes proxy/import processing, not this version producer. This conclusion
comes from the consumer's actual dependency, not extrapolation from 1.20.5.

Consequently, the inspected code does **not** prove meaningful unique build
versions are populated. Application package version, GTS type version,
federation build-version label, delivery/image revision and immutable artifact
identity must remain distinct. Per-shared-file content hashes are useful evidence
but do not identify the whole published resource closure. Proposal: keep the
MFE version producer-owned in its manifest; require an immutable reference or
verified identity covering manifest plus resources. Record resolved composition
without mandating a duplicate MFE version in every profile. No new exact schema
or hashing algorithm is prescribed by the PRD.

### Actual external template build pipeline and distinct hosts

The [shell scripts and build export:19–55](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-shell/package.json#L19-L55)
expose a build plugin and run MFE builds, manifest generation, host Vite build
and distribution layout. The [MFE builder](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-shell/scripts/build-mfes.ts#L1-L60)
uses [discovery/build helpers:201–220,321–345](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-shell/scripts/lib/mfe-tools.ts#L201-L345).
Defaults assume template-specific package locations. The
[manifest generator](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-shell/scripts/generate-mfe-manifests.ts#L1-L45)
aggregates enriched outputs, while
[layout-dist:6–14,113–181](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-shell/scripts/layout-dist.ts#L6-L181)
copies MFE outputs and rewrites both manifest and inline-entry paths for deployment.
These are real producer capabilities and reuse candidates, but currently delivered
as template content rather than the requested generic build/delivery API.

The [blank MFE Vite configuration:3–55](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-mfe/src-app/mfe_packages/_blank-mfe/vite.config.ts#L3-L55)
imports the shell's build plugin, invokes federation and enrichment, declares
its exposed lifecycle module and external shared dependencies, and enables CSS
splitting. FrontX must supply the reusable equivalent of this supported producer
contract, including its coupling to host resolution, rather than leaving it to
each consumer to re-create. The PRD requires the outcome without freezing Vite
or the template's directory conventions into the generic public contract.

The repository also has distinct dashboard `host/index.html` and
`preview/index.html` entrypoints, with
[separate commands:1–18](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-dashboard/package.json#L1-L18).
However, [host config:6–12](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-dashboard/host/vite.config.ts#L6-L12)
explicitly describes a development-only plain React harness serving widget
bundles, and [preview config:1–9](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-dashboard/preview/vite.config.ts#L1-L9)
is also development-only. They establish actual separate entrypoints, **not**
proof of two supported production FrontX host deliveries with distinct published
MFE compositions. The shell is the production-oriented host pipeline investigated;
generalized multi-host assembly remains a requirement gap.

Template [publication manifest](https://github.com/constructorfabric/gears-frontx-templates/blob/764d14d3b21fc7089320dfb7a25b56f28952737c/template-shell/frontx-template.json#L1-L50)
declares identity, version, description and ownership boundaries. Fresh
[CLI manifest contract:35–57](https://github.com/constructorfabric/gears-frontx/blob/51cac14845d318de18c450f1ad8065aa5b14cdbe/packages/cli/src/manifest/types.ts#L35-L57)
permits these declarations; `schemaVersion` is not evidence of a legacy contract
failure. No template acquisition/install or clean template build was executed,
so conformance beyond the inspected declarations is not claimed.

### Consumer evidence: vhp-frontend

The [consumer aggregate generator:72–78,216–291](https://bitbucket.org/virtuozzocore/vhp-frontend/src/583cd4bbdf713f691762737e5172d43d57ea91ab/apps/platform/lib/mfe-manifests-generator.ts#lines-72:291)
retains `manifest`, `entries`, `extensions` and optional `schemas`, checks exposed
assets and writes the canonical manifest type ID into entries. Its
[discovery:294–340](https://bitbucket.org/virtuozzocore/vhp-frontend/src/583cd4bbdf713f691762737e5172d43d57ea91ab/apps/platform/lib/mfe-manifests-generator.ts#lines-294:340)
scans built directories, skipping absent manifests; this is not an explicit
concrete-build profile for multiple hosts.

The [shared Vite MFE configuration:723–794](https://bitbucket.org/virtuozzocore/vhp-frontend/src/583cd4bbdf713f691762737e5172d43d57ea91ab/packages/tooling/src/vite/config.ts#lines-723:794)
invokes federation plus a local enrichment plugin, configures output and shared
externals, demonstrating a real consumer-owned producer pipeline.
[Host tasks](https://bitbucket.org/virtuozzocore/vhp-frontend/src/583cd4bbdf713f691762737e5172d43d57ea91ab/apps/platform/project.json#lines-1:120)
prepare manifests and assemble the platform with fixed implicit MFE dependencies;
[package scripts:15–25](https://bitbucket.org/virtuozzocore/vhp-frontend/src/583cd4bbdf713f691762737e5172d43d57ea91ab/package.json#lines-15:25)
delegate to Nx. CI separately invokes image build scripts; these project choices
must not become FrontX requirements.

The [host bootstrap](https://bitbucket.org/virtuozzocore/vhp-frontend/src/583cd4bbdf713f691762737e5172d43d57ea91ab/apps/platform/src/app/mfe/bootstrap.ts#lines-130:265)
fetches/caches the generated aggregate, then
[registers packages with failure isolation:1052–1126](https://bitbucket.org/virtuozzocore/vhp-frontend/src/583cd4bbdf713f691762737e5172d43d57ea91ab/apps/platform/src/app/mfe/bootstrap.ts#lines-1052:1126).
The [context component:69–110](https://bitbucket.org/virtuozzocore/vhp-frontend/src/583cd4bbdf713f691762737e5172d43d57ea91ab/apps/platform/src/app/mfe/MfeBootstrapContext.tsx#lines-69:110)
documents one-shot bootstrap with attempt protection. These paths do not
establish a BFF-selected multi-version, no-reload lifecycle. Per-package rollback
and retry machinery are relevant reuse evidence, not proof of context switching.

## Evidence versus proposed responsibility

| Concern | Existing evidence | Required outcome and owner |
|---|---|---|
| Supported source compilation | External template scripts and plugins; consumer-local counterpart | FrontX projects orchestration supplies reusable build invocation and producer contracts. Consumer supplies source, profiles, dependencies and publication policy. |
| Multiple hosts | Shell host plus separate development harness entrypoints | CLI member requirements cover independently built production hosts with different entrypoints and admitted sets; not merely filtering one fixed shell. |
| Publication format | Enriched producer output is richer than MfManifest | Cross-layer FrontX contract plus producer requirements; do not discard registration metadata. |
| Artifact identity | buildVersion may default; optional shared hashes | Immutable/verified full build identity; manifest-owned version; recorded resolved composition. |
| BFF selection | Not established by inspected runtime/bootstrap paths | Consumer BFF owns backend mapping; runtime consumes selection and enforces host permission/contract bounds. |
| No-reload context changes | Registration/loading exists; reviewed paths do not prove replacement lifecycle | MFEs member requirements cover both directions, stale-result rejection, outgoing lifecycle, shared/CSS integrity and recoverable failure. |
| Historical support | No audited retention guarantee | Consumer/publisher retains required manifests/resources across declared support lifetime; FrontX never silently selects a replacement. |

The existing CLI member is the least speculative requirements owner for project
build/delivery orchestration, consistent with fresh DESIGN. This is requirements
placement and reuse analysis, not a finalized physical package split. A new npm
name, exact API, bundler abstraction, manifest schema or lifecycle mechanism is
not selected here. Public build API distribution must preserve independent
versioning and existing member dependency boundaries; build work stays outside
the browser runtime. No new member PRD is needed merely to introduce this scope.
The runtime's separate new requirements belong to its existing member PRD;
root receives only the cross-layer interoperability requirement.

## Remaining technical decisions and evidence limits

- Producer/runtime maintainers must define the published-build identity and
  compatibility representation, accepted contract versions and migration rules
  before implementation. A manifest's version label alone is insufficient.
- Consumer BFF wire representation (full body versus reference/envelope), access
  integration and transition mechanics remain DESIGN-level choices. Product
  direction is settled: runtime BFF selection and context switching without reload.
- Shared/type-contract coexistence, outgoing cleanup and old/new resource
  isolation require implementation evidence. No requirement claims arbitrary
  malicious same-realm code can be safely revoked.
- Static contract validation cannot prove backend behavioral compatibility;
  the consumer must supply integration evidence for its supported backend matrix.
- Research is selective source inspection, not repository-wide proof of absence.
  No template/consumer build, browser transition, backend call or CI run was
  performed. Native independent research/review agents could not launch because
  their configured models were unavailable; no independent verdict is claimed.
