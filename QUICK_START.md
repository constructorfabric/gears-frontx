# FrontX Quick Start Guide

## Install the CLI

This guide uses FrontX CLI **0.4.0**, Node.js 24.14.0 or later, and npm
10 or later. Until 0.4.0 is published, build it from the root of a Git clone at the
[0.4.0 source checkout](https://github.com/constructorfabric/gears-frontx/tree/98984ad88321add1da4126aa348219dffb1dc3c3).
The following commands put the built CLI on this shell's search path.

```sh
npm ci &&
  npm run build --workspace=@gears-frontx/cli &&
  npm rebuild --workspace=@gears-frontx/cli &&
  export PATH="$PWD/node_modules/.bin:$PATH" &&
  frontx version
```

Once the release is published, you can install it with
`npm install -g @gears-frontx/cli@0.4.0`. Continue when `frontx version`
prints `0.4.0`.

## Your first project

In the same shell, choose a parent directory for the project. Run the
whole block there. It creates `my-project` and stops if that name is
already in use. For a project with legacy provenance, follow the
[manual migration](#migrate-a-project-created-by-an-older-cli).

```sh
(
  set -e
  mkdir my-project
  cd my-project

  # 1. Create the template. Its manifest name identifies it to the CLI.
  mkdir -p vendor/my-template/src
  cat > vendor/my-template/frontx-template.json <<'JSON'
{
  "name": "@acme/my-template",
  "version": "1.0.0",
  "description": "A minimal local template",
  "excludedSubtrees": []
}
JSON
  echo "export const hello = 'world';" > vendor/my-template/src/index.ts

  # 2. Register the local origin inside the project to create .frontx/project.json.
  frontx validate vendor/my-template
  frontx register path:vendor/my-template

  # 3. Preview the target, apply the batch and check the generated file.
  frontx assemble --input '{"templates":{"@acme/my-template":["app"]}}'
  frontx apply --input '{"templates":{"@acme/my-template":["app"]}}'
  cat app/src/index.ts
  frontx validate --project
)
```

On success, the last two commands print the exported constant and `PASS`.
Run subsequent project commands from inside the new `my-project` directory.

`assemble` checks target ownership without writing to the project. It may fetch
a missing registered remote template into local inventory. `apply` rechecks the
batch and examines existing files. When a first application would replace an
existing AI bundle, use the [confirmation protocol](#confirmation-protocol).
Review all changes under `details.aiReplacements[].changes`, including additions
of files and directories. A file, symlink or special entry blocking the bundle
directory at or above `.frontx/ai/<name>` causes `CONTENT_CONFLICT`. Inspect
the named entry and move it aside before retrying.

## Use a published template

Replace the example repository, subtree and ref with a source you trust.
Check the publisher's available versions in the
[FrontX templates repository](https://github.com/constructorfabric/gears-frontx-templates).
This CLI accepts the [four-field manifest](packages/cli/architecture/features/template-manifest/FEATURE.md).
Legacy manifests with `schemaVersion` or `ownershipBoundaries` get `INVALID_MANIFEST`.

```sh
frontx install github:acme/templates//shell@v1.0.0
frontx list --json
frontx register github:acme/templates//shell@v1.0.0
```

`install` is optional before registration. Inventory entries sharing a name
must refer to the same repository and subtree. Installing a different ref at
that address replaces the local entry. In `list --json`, `data.installed`
only includes inventory names not registered to this project.

Registration records the full 40-hex commit stated by the GitHub archive.
An archive missing that commit gets `ORIGIN_UNAVAILABLE`. Older short pins
are not migrated. A local `path:` stays as given. Registering the same origin
again is a no-op. To switch origins, use `register --replace` before first
application or `upgrade` once targets exist.

`seed` accepts only the names in `data.defaults`. This CLI ships an empty
defaults set. Use `register` and `apply` to create a project.

## Migrate a project created by an older CLI

Legacy CLI commands and state are unsupported. When only
`.frontx/provenance.json` exists, commands that read project state return
`PROJECT_INVALID`. To establish a new baseline manually:

1. Make a complete, verified backup outside the project, including hidden
   files, untracked files and local edits. Work on a separate copy.
2. Obtain the exact payload originally applied, its manifest name, its original
   version and the original targets. Stop if you cannot establish the baseline.
   Place a copy of the original payload with a current four-field manifest
   inside the working project, for example at `vendor/my-template-v1`.
3. Move the working copy's legacy provenance file outside the project to a
   fresh location. Register it with
   `frontx register path:vendor/my-template-v1`. Restore edited
   template-owned files in the working copy to their original bytes.
4. Reserve existing paths that should stay project-owned with
   `frontx ownership add <path>`. To leave other non-payload files in place
   for this application, use `--adopt-existing`. That flag gives no ongoing
   protection against deleting the target and does not override a conflict
   with a payload file. For an original target at the project root:

   ```sh
   frontx apply --adopt-existing --input '{"templates":{"@acme/my-template":["."]}}'
   ```

5. After a successful apply, restore local edits from the backup, validate
   with `frontx validate --project`, and compare the result with the backup.
   Keep the baseline folder intact for future upgrades and restores. A later
   upgrade preserves a local edit when the candidate leaves that file alone.
   A conflicting edit gets `CONTENT_CONFLICT`.

To bring a reserved path back under the usual template ownership and conflict
rules, run `frontx ownership remove <path>`.

## Upgrade and recover

To upgrade the walkthrough project, prepare a second template folder with
the same name, its new version and payload, then run:

```sh
frontx upgrade @acme/my-template path:vendor/my-template-v2
```

Review the changes across all targets. Paths listed under `skipped` stay
unchanged even when the recorded version advances. Use
`frontx upgrade @acme/my-template --restore` to return to the previous
generation. Keep both local origin folders available at their recorded
versions. Only one previous generation is retained.

In JSON mode an upgrade at the candidate returns `ok: true` with
`outcome: "noop"`. Pending work can return `RECOVERY_REQUIRED`. A reviewable
change follows the [confirmation protocol](#confirmation-protocol).

**Recovery can change state on the first call.** Run
`frontx upgrade <name> --recover` when ready to reconcile an interruption.
It can return `no-pending`, cancel an operation with no effects
(`cancelled`), or release verified pre-commit writes in place
(`released`). After release, rerun the same upgrade. Recovery can also finish
a previously verified operation immediately. Pending post-commit work needs
review and can finish as `recovered` or be `declined`. Inspect any paths or
receipts named in a refusal. If a reservation survives but its project receipt
is missing, stop writers that share the inventory. Preserve the reservation and
a copy of the current project and inventory. Restore both from the same verified
backup to the reported original paths. If the restored pair contains a receipt,
run recovery from its recorded project with its recorded inventory. If no
consistent backup exists, keep the records for manual reconciliation. A pending
intent without its matching receipt also requires manual recovery. See the [upgrade and recovery contract](packages/cli/architecture/features/upgrade-changeset/FEATURE.md).

## Delete a target

```sh
frontx delete app --dry-run
```

Review what the CLI will delete and preserve, including nested targets,
`excludedSubtrees`, project-owned paths and local origins. A dry run issues
no digest. To request deletion use `frontx delete app` interactively, or the
[confirmation protocol](#confirmation-protocol) for JSON. Deleting the last
target also removes its AI bundle, including local edits there. Inspect the reviewed bundle tree. The digest binds its file paths, sizes,
hashes and recorded link targets. The review lists ordinary target files by
path without hashing their contents. Check the result for `aiBundleResidue` (`manifestName`, `path`, `message`) if cleanup
failed. A targetless registration can then be removed with
`frontx unregister @acme/my-template`. See the [delete and preservation rules](packages/cli/architecture/features/cli-scaffolding/FEATURE.md).

## Confirmation protocol

1. Run the requested operation with `--json`. Check the outcome. Only a
   `CONFIRMATION_REQUIRED` response containing a plan and `details.planDigest`
   can be confirmed. An ordinary apply or seed may succeed immediately.
2. Show the developer the entire plan, including target operations, preserved
   and skipped paths, and AI bundle effects. Wait for explicit approval of
   that exact plan. On decline, stop. For example, request the walkthrough
   project’s delete plan with `frontx delete app --json`.
3. Only after approval, repeat the same command and flags, adding
   `--yes --plan-digest="<approved digest>"`. If the CLI returns a changed
   plan, show it in full and obtain fresh approval. If the review was
   superseded without a new plan, stop. Handle other refusals as errors. For the delete example, the approved call
   is `frontx delete app --json --yes --plan-digest="$APPROVED_DIGEST"`, where
   the variable holds the digest the developer approved.

Expected JSON results use the [CLI envelope](architecture/ADR/0042-cli-machine-readable-output.md).
An unexpected internal exception can exit 2 with diagnostics only on stderr.
Check the exit status and stderr before parsing empty stdout.

## CLI command reference

| Command | Purpose |
| --- | --- |
| `frontx install <spec>` | Install a template into local inventory. |
| `frontx update-local <name> <spec>` | Refresh an installed template. |
| `frontx list [--json]` | Show defaults, registrations and remaining inventory. |
| `frontx register <origin> [--replace]` | Record a template origin. |
| `frontx assemble --input <batch-json>` | Preview target ownership. |
| `frontx apply --input <batch-json> [--adopt-existing]` | Apply registered templates. |
| `frontx seed <dir> --input <batch-json>` | Apply built-in defaults to a fresh project. |
| `frontx upgrade <name> <origin>` | Review a change of generation. |
| `frontx upgrade <name> --restore` | Return to the immediately preceding generation. |
| `frontx upgrade <name> --recover` | Reconcile an interrupted operation. |
| `frontx delete <target> [--dry-run]` | Review removal of an applied target. |
| `frontx unregister <name>` | Remove a targetless registration. |
| `frontx ownership add <path>` / `remove <path>` | Reserve or release a project-owned path. For add, it must exist and cannot equal or contain an applied target. |
| `frontx ownership list` | List project-owned paths. |
| `frontx validate <templateDir>` | Check the manifest and its excludedSubtrees. |
| `frontx validate --project` | Check state structure, origins, versions, target conflicts, target roots and pending work recorded in project state. Stops at the first finding. |
| `frontx version` / `-v` / `--version` | Show the CLI version. |
| `frontx help` | Show command usage. |

## The Core Framework

An application built on FrontX becomes **runtime-extensible by microfrontends**.
The Core Framework provides the substrate; a template wires it into a concrete
app. Its guarantees:

- **Registration & loading** — microfrontends register with the application and
  load on demand (`@gears-frontx/mfes`).
- **Extension domains** — named slots a microfrontend can occupy; a domain may
  allow one or multiple occupants.
- **Typed entities** — microfrontends and their extensions are validated against
  type definitions at registration; applications register their own type
  definitions at build time or at runtime (`@gears-frontx/gts-plugin`).
- **Host communication** — microfrontends communicate with the host and react to
  host state changes over a bridge.
- **API layer** — typed API protocols and a service registry (`@gears-frontx/api`).
- **UI-framework-agnostic** — the framework never constrains your UI choice; UI
  libraries, styling, layout, and state management are the template's concern.

You consume these packages from within a template/application; the ecosystem
ships no application, host, or UI of its own.

## AI tooling

### Install the kit

```bash
# Install the FrontX AI Tooling kit into a project (via Constructor Studio, not the frontx CLI).
# The kit lives inside this monorepo, so install it from the repository subdirectory:
cfs kit install git/https://github.com/constructorfabric/gears-frontx//packages/cyber-pilot-kit-frontx

# ...or from a local checkout of this repository:
cfs kit install path/packages/cyber-pilot-kit-frontx

# Update it later to a newer version
cfs kit update cyber-pilot-kit-frontx
```

The installed kit provides request routing and intent-driven project scaffolding.
Follow its [routing skill](packages/cyber-pilot-kit-frontx/SKILL.md) to select a
template or extend a project through the applied template's own skills.

Register a template and apply it to its first target to materialize its AI
bundle under `.frontx/ai/<name>/`. Installing into inventory alone does not
activate extensions. Hosts can integrate extension discovery and upgrade
orchestration through the npm package's [TypeScript APIs](packages/cyber-pilot-kit-frontx/src/index.ts).

## Contributor reference

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository setup and validation.
The root `build:packages` and `type-check` aggregates omit the AI kit. To
check that package, run its scripts explicitly:

```sh
npm run build --workspace=@gears-frontx/cyber-pilot-kit-frontx
npm run type-check --workspace=@gears-frontx/cyber-pilot-kit-frontx
```
