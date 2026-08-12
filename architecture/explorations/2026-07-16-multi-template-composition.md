# Exploration: Template Composition Model — Fixed Two-Kind vs. Kindless Multi-Template Assembly

> **Superseded (2026-08-12).** This exploration's recommended option — Option C, ownership-bounded composition via exclusive subtrees, shared-file regions with a declared merge, transitive preset reference resolution, and one provenance record per applied template — was adopted as `cpt-frontx-adr-template-ownership-boundary-declaration` (ADR 0031), `cpt-frontx-adr-assembly-conflict-prevention` (ADR 0032), `cpt-frontx-adr-composed-template-resolution` (ADR 0020), and `cpt-frontx-adr-project-provenance-record` (ADR 0019). All four are now themselves superseded by a second redesign wave: `cpt-frontx-adr-whole-target-ownership` (ADR 0037), `cpt-frontx-adr-nesting-aware-conflict-prevention` (ADR 0039), `cpt-frontx-adr-explicit-batch-application` (ADR 0038), and `cpt-frontx-adr-single-project-state-file` (ADR 0036) respectively. The kindless, multi-template premise this document argued for still holds; the ownership, composition, and provenance mechanics below no longer reflect the accepted design. Kept for historical record only — do not implement from this document.

<!-- toc -->

- [Decision under study](#decision-under-study)
- [Scope & status](#scope--status)
- [The reframe (north star)](#the-reframe-north-star)
- [Current model and its coupling points](#current-model-and-its-coupling-points)
- [Prior art (evidence base)](#prior-art-evidence-base)
- [The three options](#the-three-options)
  - [Option A — Single-origin, two fixed kinds (today)](#option-a--single-origin-two-fixed-kinds-today)
  - [Option B — Unbounded multi-template assembly](#option-b--unbounded-multi-template-assembly)
  - [Option C — Ownership-bounded composition](#option-c--ownership-bounded-composition)
- [Proposed template contract shape (Option C, illustrative)](#proposed-template-contract-shape-option-c-illustrative)
- [The CLI pre-flight intersection check](#the-cli-pre-flight-intersection-check)
- [Cascade / blast-radius map](#cascade--blast-radius-map)
- [Assessment & recommendation](#assessment--recommendation)
- [Open questions / decisions needed](#open-questions--decisions-needed)
- [Sources](#sources)

<!-- /toc -->

Date: 2026-07-16

## Decision under study

Should FrontX keep its **single-origin, two-kind** template model (a project is scaffolded from exactly one originating template, which may *nest* microfrontend templates by reference; the CLI exposes a `project` and a `microfrontend` namespace), or move to a **kindless, multi-template assembly** model (a repository is assembled from N independently-applied templates — shell, mfes, libs, configs — each tracked and independently upgradeable), and if the latter, how are template **ownership boundaries** declared and **intersections** detected?

This is a **PRD-altitude** question, not a CLI-organization one: the answer reopens the top of the signed-off spec chain.

## Scope & status

- **In scope:** the composition/origin model, the template manifest contract shape in the new vision, the CLI intersection-check mechanism, and the full cascade across PRD/ADR/DESIGN/FEATURE/code.
- **Out of scope this pass:** runtime/MFE-loading concerns (unchanged), and any implementation.
- **Status:** decision-support exploration, upstream of the spec chain. **Not** a validated SDLC artifact and **not** a decision. Nothing in PRD/DESIGN/ADR has been changed on the basis of this document. It exists to let the overseer choose a direction before the spec chain is reopened.

## The reframe (north star)

The guiding principle the overseer stated: **FrontX imposes no project ontology.** The platform's job is to *not restrict* the shape of a project; the specifics of any given project are delegated to templates. Templates are the reason the platform exists — so the platform should stay as thin and unopinionated about "what a project is" as possible.

Consequences of taking that principle literally:

- A template is just **"a generator of some part,"** not a member of a fixed `{project, microfrontend}` set. Kind becomes **descriptive/open**, not a closed enum the platform enforces.
- A repository is an **assembly of applied templates**, possibly across multiple repos (a shell repo + several mfe repos) or within one (monorepo shell + mfes). Repo topology is decoupled from template topology.
- The "project template" is **demoted** from "the single origin" to an optional **preset**: a template that references and arranges other templates. (Worth naming: this is the old project template reborn as a manifest-of-references rather than a scaffold — the concept does not disappear, it changes role.)

This principle is, notably, **consistent with the ecosystem's own headline** — `per-concern independent versioning`. The current single-origin model couples the shell and its nested mfes to one upgrade baseline; the multi-template model gives each part its own cadence, which is what the ecosystem already claims to stand for elsewhere.

## Current model and its coupling points

The single-origin assumption is not localized — it is baked into several signed-off decisions at once:

| Where | What assumes single-origin / two-kind |
|---|---|
| PRD | `cpt-frontx-fr-cli-two-namespace-commands`; the `kind` field; use cases *publish-composed-project-template*, *scaffold-composed-project*, *add-microfrontend-to-project* |
| ADR-0018 | manifest declares `kind` ∈ {project, microfrontend} |
| ADR-0019 | provenance = **exactly one** originating template + version |
| ADR-0020 | composition is **nested** (project template composes mfe templates), one-shot collision rule |
| ADR-0021 | upgrade diffs against the **single** origin baseline |
| ADR-0022 | two fixed command namespaces |
| ADR-0031 | canonical two-kind literal set (`project-template`/`microfrontend-template`) |
| DESIGN §3.1 | invariant: *"every scaffolded project carries exactly one ProjectProvenance naming a single originating Template version"* |
| DESIGN §3.2 | CLI sub-components (scaffolder, provenance-recorder, change-set-engine) all shaped around one origin |

## Prior art (evidence base)

Surveyed: Copier, cruft/Cookiecutter, Nx generators, Angular/Nx schematics, Yeoman, Backstage software templates, Terraform modules; plus Plop, Hygen, degit, create-*. Full findings and sources at the end. The load-bearing facts:

1. **Every surveyed system is open-kind.** None imposes a fixed "project vs microfrontend" scaffolding taxonomy. FrontX's two-kind ontology is idiosyncratic; the reframe is the industry-normal position.
2. **Ownership is implicit almost everywhere.** No file-scaffolder lets a template *declare the destination paths it owns* for cross-template arbitration. The only declared interfaces found are Copier's **source** scoping (`_subdirectory`/`_exclude`) and Terraform's typed `variable`/`output` (an interface contract, not file-path ownership). → **The overseer's "declare boundaries in the manifest" idea has no direct precedent in file scaffolders — it is novel design.**
3. **No cross-template pre-flight intersection check exists in any surveyed system.** Collision detection is always *within one run's staged tree* (the `Tree`/mem-fs primitive shared by Angular schematics, Nx, Yeoman — Angular even has an explicit `MergeStrategy` enum + `MergeConflictException`) or deferred to git/provider at write time. → **The CLI intersection-check idea is also novel — but the staged-tree primitive is the well-proven mechanism that would make it feasible.**
4. **Copier is the one designed multi-lineage model:** per-template **namespaced answers files** (`.copier-answers.<template>.yml`), each an independent lineage, each independently updatable via a **git 3-way merge**. cruft gives single-lineage provenance via `.cruft.json` (template URL + **commit hash** + context). → **Strong precedent for multi-template provenance as a *set* of per-template records + per-record update.**
5. **Graceful shared-file handling comes from owning *keys/regions*, not files.** Nx (`updateJson`, `addDependenciesToPackageJson`), Yeoman (`extendJSON`/`packageJson.merge`), Hygen (`inject` anchored regions) all let many contributors coexist in `package.json`/`tsconfig`/CI by owning **keys or anchored regions**. The pure diff/merge tools (Copier, cruft) treat `package.json` as plain text and inherit git line-level conflicts. → **Answers my earlier open sub-question: file/subtree ownership alone is insufficient; the shared-file case needs key/region-level ownership.**
6. **Two upgrade philosophies:** declarative diff/3-way-merge (Copier, cruft) vs. imperative versioned code-transform migrations (Nx `nx migrate` + `migrations.json`). FrontX's current change-set engine (ADR-0021) is diff/merge-flavored — it aligns with the Copier lineage.

## The three options

### Option A — Single-origin, two fixed kinds (today)

The signed-off model. One originating template per project; nested mfe composition; single provenance; single-baseline upgrade; two namespaces.

- **Pros:** simplest provenance/upgrade (one record, one diff — matches ADR-0019/0021 as written); a project template can encode *curated wholeness* (shell+routing+DI+CI designed to cohere); bounded, one-shot collision problem (ADR-0020); already fully specified and validated.
- **Cons:** imposes a project ontology (violates the north star); the two-kind binary is arbitrary and already flagged for revisiting in ADR-0022's own review cadence; material added *after* scaffold is second-class (only mfes are trackable, via the mfe namespace; libs/configs/second shells are untracked); couples shell + nested mfes to one upgrade cadence — **in tension with the ecosystem's own per-concern-versioning banner**; assumes shell and mfes are resolved together, awkward for polyrepo mfes.

### Option B — Unbounded multi-template assembly

Kindless templates; a repo accretes from any number of applied templates over time; provenance is a set; no declared boundaries — collisions handled reactively (overwrite / prompt / git-merge), as Copier/Yeoman do.

- **Pros:** maximal fidelity to the north star; matches how real repos actually grow; per-part upgrade cadence; well-precedented mechanics (Copier multi-answers + 3-way merge; Yeoman `composeWith`).
- **Cons:** the **multi-writer problem is unmanaged** — independently authored templates silently fight over `package.json`, routing, CI config; every surveyed unbounded system reports this as its top failure mode (spurious conflicts, silent clobbering, corrupted merge state); no *design-time* guarantee that two templates compose cleanly — you find out at write/merge time; loses any notion of "these parts are designed to cohere."

### Option C — Ownership-bounded composition

Kindless templates **that declare their ownership boundaries in the manifest**; a repo is assembled from N templates; the CLI runs a **pre-flight intersection check** and refuses (or requires a declared merge) when two templates claim the same ground; provenance is a set of per-template records; per-template upgrade via the diff/merge engine. This is the overseer's proposal, plus the key/region refinement from finding #5.

- **Pros:** keeps the north-star wins of B (kindless, multi-template, per-part cadence) **while containing B's fatal flaw** — the multi-writer problem becomes a *declared, reviewable, design-time* concern instead of a runtime surprise; the shared-file case is solved by key/region ownership (finding #5) rather than blunt "no intersections"; a preset can still express curated coherence by pinning a validated set of templates.
- **Cons — and these are real:** the boundary-declaration + cross-template intersection check are **novel** (finding #2, #3) — no prior art to copy, so FrontX would be building and proving this itself; it adds an **authoring obligation** (every template must declare `owns`, correctly) and an enforcement surface (the check, plus key/region merge for shared files) — more complexity than either A or B; requires a **staged-tree** execution primitive to do the pre-flight check well; the "preset = project template reborn" means the curation concern doesn't vanish, it just moves; and mis-declared ownership (a template that writes outside its declared boundary) needs its own guard or the check is only as good as the declarations.

## Proposed template contract shape (Option C, illustrative)

**Non-normative** — concrete field-level schema would be owned by the template-manifest FEATURE per the Stage A schema-ownership rule (`cpt-frontx-adr-contract-schema-ownership`). This shows *shape and categories* only, to make the vision concrete.

```yaml
# frontx-template manifest (illustrative)
id: acme/react-shell
version: 2.3.0

# OPEN kind — descriptive tag for humans/filtering, NOT a platform-enforced enum.
kind: shell

# What parts this template contributes (declared outputs / roles).
provides:
  - role: shell

# Where it may be applied — replaces the fixed namespace gate.
appliesTo:
  seedsRepo: true          # can bootstrap an empty repo
  addsIntoRepo: true       # can be layered into an existing assembly

# Declared dependencies on roles other templates provide (optional).
requires:
  - role: []               # e.g. an mfe template may require role: shell present

# OWNERSHIP BOUNDARIES — the crux of Option C.
owns:
  # Exclusive: only this template may create/update these paths. Another applied
  # template whose exclusive set intersects → pre-flight intersection ERROR.
  exclusive:
    - "src/shell/**"
    - "src/router/**"
    - "app.config.ts"
  # Shared: files many templates legitimately contribute to. Ownership is at
  # KEY / REGION level (finding #5), arbitrated by a declared merge strategy —
  # NOT exclusive. Two templates owning the SAME key/region → intersection error.
  shared:
    - path: "package.json"
      merge: json-deep
      owns-keys: ["dependencies.@acme/shell-*", "scripts.shell:*"]
    - path: "tsconfig.json"
      merge: json-deep
      owns-keys: ["references"]
    - path: ".github/workflows/ci.yml"
      merge: region
      owns-region: "shell"      # an anchored, named region

# Preset composition — a template may reference & arrange other templates.
# (This is the old "project template" role: a manifest of references.)
compositions:
  - ref: "acme/mfe-orders@^1"
    at: "src/mfes/orders"
```

Per-template **provenance** becomes a *set* (one record per applied template — the Copier/cruft lineage model, finding #4):

```json
// .frontx/provenance/acme__react-shell.json  (one file per applied template)
{
  "template": "acme/react-shell",
  "source": "github:acme/react-shell#v2.3.0",
  "version": "2.3.0",
  "appliedAt": "src/shell",
  "answers": { "...": "..." },
  "ownedSnapshot": { "exclusive": ["src/shell/**"], "shared": ["package.json#..."] }
}
```

Per-template **upgrade** then runs the existing change-set engine once *per provenance record*, diffing that template's old version against a newer one and 3-way-merging — each part on its own cadence, without a single global baseline.

## The CLI pre-flight intersection check

Before writing anything, given the set of templates to apply:

1. **Stage** each template's declared `owns.exclusive` globs and `owns.shared` key/region claims (no disk writes — a staged tree, as Angular/Nx/Yeoman do).
2. **Exclusive check:** if any two templates' exclusive path-sets intersect → **error**, naming both templates and the conflicting path. No prompt, no silent overwrite.
3. **Shared check:** if two templates claim the **same key/region** of a shared file → **error**; otherwise apply the declared `merge` (json-deep / region) so each contributes only its owned keys.
4. **Boundary-honesty guard (needed because declarations are only as good as their authors):** after materialization, assert each template wrote only within its declared boundary; a write outside it fails the run. This closes the "mis-declared ownership" gap that pure declaration leaves open.

Feasible, but note explicitly: **steps 2–4 are novel** (no surveyed system does cross-template pre-flight). The staged-tree primitive (proven) is what makes them buildable.

## Cascade / blast-radius map

Choosing C (or B) reopens, roughly:

- **PRD:** drop/reframe `cpt-frontx-fr-cli-two-namespace-commands`; reframe the `kind` field to open/descriptive; add requirements for *ownership-boundary declaration*, *pre-flight intersection check*, and *multi-template provenance + per-template upgrade*; rework the three composition/scaffold use cases; **the Stage A PRD addition (template-AI-extension contract) is unaffected**.
- **ADRs:** 0016/0017 (acquisition, source-spec) **survive**. 0018 (manifest) **changes** — open kind + `owns`/`provides`/`shared`. 0019 (provenance) **major rework** — single→set; the single-origin invariant dies. 0020 (composed resolution) **reframed** — nested composition → generic preset refs + intersection arbitration supersedes the one-shot collision rule. 0021 (upgrade) **reframed** — per-template update. 0022 (namespaces) **superseded** — verb-first, kindless. 0031 (kind-literal set) **moot/superseded**. **New ADRs:** platform-imposes-no-ontology principle; ownership-boundary contract; pre-flight intersection check; multi-template provenance model.
- **DESIGN:** §3.1 single-origin invariant removed; Template/TemplateManifest/ProjectProvenance entities reshaped + an ownership entity added; §3.2 CLI sub-components reworked (scaffolder→assembler; provenance-recorder→multi-record; change-set-engine→per-template; **add an intersection-checker component**) — **the Stage A CLI decomposition partly survives but needs revision**; §3.3 interface (namespaces→verbs, new contracts); §3.6 sequences reworked.
- **FEATUREs:** `cli-scaffolding` (kindless + intersection check), `template-manifest` (add `owns`/`provides`), `composed-provenance` (multi-record + per-template upgrade), `template-resolution`, `upgrade-changeset` (per-template).
- **Code:** `packages/cli` manifest types (open kind, `owns`) and provenance (multi-record). Already out-of-conformance per Stage A; this enlarges that later-stage conformance work.

## Assessment & recommendation

Judging the options against the north star **and** the evidence, without privileging the proposal:

- **On principle, the reframe is well-founded.** Open-kind is universal in prior art; single-origin/two-kind is idiosyncratic and already self-flagged for revision; and multi-template + per-part cadence is what the ecosystem's own per-concern-versioning banner implies. Option A is the weakest fit for FrontX's stated identity.
- **Option B is the wrong way to get there** — its multi-writer problem is the #1 documented failure of every unbounded system.
- **Option C is the strongest fit** — it keeps B's wins and converts the multi-writer problem into a declared, design-time, reviewable concern. **But its two signature mechanisms (declared path-ownership, cross-template pre-flight check) are novel**, so C is a *build-and-prove* path, not a copy-an-existing-tool path. De-risk it with the two proven ingredients from prior art: the **staged-tree** primitive (for the check) and **key/region-level ownership + structured merge** for shared files (so `package.json` doesn't become a conflict magnet). Keep the **preset** concept for curated coherence — and accept that it is the project template in a new role, not its elimination.

Net: **C is my recommendation, with the key/region refinement and a prototype of the intersection check before committing the spec chain** — precisely because the check is unprecedented and its cost/feasibility should be observed, not assumed. This lines up with the overseer's stated lean (no namespaces + multiple templates + boundaries in the manifest + CLI intersection check); the research adds the shared-file key/region nuance and the honest flag that the boundary/check machinery is greenfield.

## Open questions / decisions needed

1. **Go/no-go on the reframe** (A → C). This is the gating decision; everything else follows.
2. **Ownership granularity:** confirm the two-tier model (exclusive subtrees + shared key/region merge). Alternative: files-only ownership (simpler, but re-creates the `package.json` problem).
3. **Upgrade philosophy:** diff/3-way-merge per template (Copier lineage, aligns with current ADR-0021) vs. imperative migrations (Nx lineage). Recommend the former for continuity.
4. **Preset semantics:** is a preset itself an applied template with provenance, or a pure resolve-time expansion? (Affects whether "upgrade the preset" is a thing.)
5. **Prototype scope:** should we spike the pre-flight intersection check + key/region merge on a shell + 2-mfe assembly before rewriting the PRD, given both are novel?
6. **Stage A disposition:** if we proceed, ADR-0031 (kind literals) and ADR-0022 (namespaces) are superseded and the Stage A CLI decomposition needs revision. Decide whether to (a) pause Stage A gating now, (b) formally supersede those ADRs as part of this reframe, or (c) keep Stage A as a record and layer the reframe on top.

## Sources

Prior-art findings are drawn from a dedicated research pass; primary sources:

- Copier — [Configuring](https://copier.readthedocs.io/en/stable/configuring/), [Updating](https://copier.readthedocs.io/en/stable/updating/), [multi-template Discussion #855](https://github.com/orgs/copier-org/discussions/855)
- cruft — [docs](https://cruft.github.io/cruft/), [GitHub](https://github.com/cruft/cruft) (`.cruft.json`: URL + commit hash + context)
- Nx — [Automate Updating Dependencies](https://nx.dev/docs/features/automate-updating-dependencies), [Migration Generators](https://nx.dev/recipes/advanced-plugins/migration-generators)
- Angular/Nx schematics — [angular-cli #11337](https://github.com/angular/angular-cli/issues/11337), [devkit #1010](https://github.com/angular/devkit/issues/1010) (`MergeStrategy`, `MergeConflictException`)
- Yeoman — [file system / conflict resolver](https://yeoman.io/authoring/file-system), [#1239](https://github.com/yeoman/generator/issues/1239)
- Backstage — [Writing Templates](https://backstage.io/docs/features/software-templates/writing-templates/) (`spec.parameters/steps/output`)
- Terraform — [Outputs](https://developer.hashicorp.com/terraform/language/values/outputs), [Modules syntax](https://developer.hashicorp.com/terraform/language/modules/syntax), [duplicate-resource #22104](https://github.com/hashicorp/terraform/issues/22104)
- Plop, Hygen (frontmatter `inject`/`skip_if`), degit, create-*/npm-init — standard documented behavior
